import type { PowerSyncDatabase } from "@powersync/react-native";
import { PowerSyncContext } from "@powersync/react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import { SupabaseConnector } from "@/powersync/connector";
import { openProfileDatabase } from "@/powersync/database";

import {
  forgetSession, getActiveProfileId, getOfflineMode, listProfiles, loadSession, type Profile, saveProfile,
  setActiveProfileId, setOfflineMode, storeSession,
} from "./profiles";
import { type SignInError, signInWithCredentials } from "./sign-in";

type Active = { profile: Profile; db: PowerSyncDatabase; connector: SupabaseConnector };

type SessionState = {
  status: "starting" | "signedOut" | "ready";
  profile: Profile | null;
  /** Mode hors ligne choisi par l'utilisateur (indépendant de l'état du réseau). */
  offline: boolean;
  /** Accès retiré pendant un envoi (R-SES-2) : message à afficher, envoi suspendu. */
  forbidden: string | null;
  /** Nombre d'écritures refusées par le serveur depuis l'ouverture de la session. */
  rejected: number;
  signIn: (email: string, password: string, company: string) => Promise<SignInError | null>;
  /** Reprise d'un profil déjà connecté sur l'appareil (session mémorisée). */
  resume: (profile: Profile) => Promise<"SESSION_EXPIRED" | null>;
  signOut: () => Promise<void>;
  setOffline: (offline: boolean) => Promise<void>;
  dismissForbidden: () => void;
};

const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession hors de SessionProvider");
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionState["status"]>("starting");
  const [active, setActive] = useState<Active | null>(null);
  const [offline, setOfflineState] = useState(false);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [rejected, setRejected] = useState(0);
  // Copie synchrone de `active` pour les callbacks (mise à jour en même temps que l'état).
  const activeRef = useRef<Active | null>(null);

  // Ouvre la base du profil et lance la synchro, sauf si l'utilisateur a choisi le mode hors ligne.
  const activate = useCallback(async (profile: Profile) => {
    const previous = activeRef.current;
    if (previous) await previous.db.close();
    const db = await openProfileDatabase(profile.principalId);
    const connector = new SupabaseConnector(profile.authUserId, {
      onForbidden: (message) => {
        setForbidden(message);
        void setOfflineMode(profile.principalId, true);
        setOfflineState(true);
        void db.disconnect();
      },
      onRejected: (count) => setRejected((n) => n + count),
    });
    const wantsOffline = await getOfflineMode(profile.principalId);
    setOfflineState(wantsOffline);
    if (!wantsOffline) void db.connect(connector);
    await setActiveProfileId(profile.principalId);
    activeRef.current = { profile, db, connector };
    setActive(activeRef.current);
    setForbidden(null);
    setRejected(0);
    setStatus("ready");
  }, []);

  // Démarrage : le dernier profil actif est rouvert même sans réseau (lecture locale).
  useEffect(() => {
    (async () => {
      const id = await getActiveProfileId();
      const profile = id ? (await listProfiles()).find((p) => p.principalId === id) : undefined;
      if (profile) await activate(profile);
      else setStatus("signedOut");
    })().catch(() => setStatus("signedOut"));
  }, [activate]);

  // Les jetons rafraîchis sont recopiés dans la session mémorisée du profil actif.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const current = activeRef.current;
      if (session && current && session.user.id === current.profile.authUserId) {
        void storeSession(current.profile.principalId, session);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string, company: string) => {
    const result = await signInWithCredentials(email, password, company);
    if (!result.ok) return result.error;
    const { error } = await supabase.auth.setSession(result.session);
    if (error) return "UNKNOWN";
    await saveProfile(result.profile, result.session);
    await activate(result.profile);
    return null;
  }, [activate]);

  const resume = useCallback(async (profile: Profile) => {
    const stored = await loadSession(profile.principalId);
    if (!stored) return "SESSION_EXPIRED";
    const { data, error } = await supabase.auth.setSession(stored);
    if (error || !data.session || data.session.user.id !== profile.authUserId) return "SESSION_EXPIRED";
    const refreshed = { ...profile, lastConnectedAt: new Date().toISOString() };
    await saveProfile(refreshed, data.session);
    await activate(refreshed);
    return null;
  }, [activate]);

  // Déconnexion (en ligne uniquement, cf. §1.4) : la base du profil reste sur l'appareil.
  const signOut = useCallback(async () => {
    const current = activeRef.current;
    if (!current) return;
    await current.db.disconnect();
    await supabase.auth.signOut({ scope: "local" });
    await forgetSession(current.profile.principalId);
    await current.db.close();
    await setActiveProfileId(null);
    activeRef.current = null;
    setActive(null);
    setStatus("signedOut");
  }, []);

  const setOffline = useCallback(async (value: boolean) => {
    const current = activeRef.current;
    if (!current) return;
    await setOfflineMode(current.profile.principalId, value);
    setOfflineState(value);
    if (value) await current.db.disconnect();
    else {
      setForbidden(null);
      await current.db.connect(current.connector);
    }
  }, []);

  const value = useMemo<SessionState>(() => ({
    status, profile: active?.profile ?? null, offline, forbidden, rejected,
    signIn, resume, signOut, setOffline, dismissForbidden: () => setForbidden(null),
  }), [status, active, offline, forbidden, rejected, signIn, resume, signOut, setOffline]);

  return (
    <SessionContext.Provider value={value}>
      {active ? <PowerSyncContext.Provider value={active.db}>{children}</PowerSyncContext.Provider> : children}
    </SessionContext.Provider>
  );
}
