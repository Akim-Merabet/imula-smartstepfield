import type { PowerSyncDatabase } from "@powersync/react-native";
import { PowerSyncContext } from "@powersync/react";
import { createContext, Fragment, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import { SupabaseConnector } from "@/powersync/connector";
import { clearProfileDatabase, openProfileDatabase } from "@/powersync/database";
import { AttachmentSyncLoop } from "@/attachments/native";
import { BackupScheduler } from "@/backup/service";
import { bindLogger, logEvent } from "@/lib/app-log";
import { setFlowTerm } from "@/i18n/fr";
import { flushLogs } from "@/lib/app-log-flush";
import { reportDevice } from "@/lib/device-report";
import { OfflineSubscriptions } from "@/powersync/offline";

import {
  forgetSession, getActiveProfileId, getOfflineMode, listProfiles, loadSession, type Profile, saveProfile,
  setActiveProfileId, setOfflineMode, storeSession,
} from "./profiles";
import { type SignInError, type SignInResult, signInWithCredentials, signInWithQrCode } from "./sign-in";

type Active = {
  profile: Profile; db: PowerSyncDatabase; connector: SupabaseConnector; subscriptions: OfflineSubscriptions;
  attachments: AttachmentSyncLoop;
  backups: BackupScheduler;
  /** Arrête le suivi du vocabulaire de l'organisation (organizations.flow_term). */
  vocabulary: AbortController;
};

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
  /** Connexion rapide : contenu brut du QR code scanné. */
  signInWithQr: (raw: string) => Promise<SignInError | null>;
  /** Reprise d'un profil déjà connecté sur l'appareil (session mémorisée). */
  resume: (profile: Profile) => Promise<"SESSION_EXPIRED" | null>;
  signOut: () => Promise<void>;
  setOffline: (offline: boolean) => Promise<void>;
  /** « Réinitialiser la base de données locale » (spec 05 §5.6) : refusé tant que des écritures attendent l'envoi. */
  resetLocalData: () => Promise<"PENDING_WRITES" | null>;
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
  // Vocabulaire de l'organisation : sert de clé à l'arbre de l'app, remonté quand il change (libellés de t()).
  const [flowTerm, setFlowTermState] = useState<string | null>(null);
  // Copie synchrone de `active` pour les callbacks (mise à jour en même temps que l'état).
  const activeRef = useRef<Active | null>(null);

  // Arrête et ferme la base du profil ouvert. À faire AVANT de changer la session Supabase globale : sinon la file
  // d'envoi du profil précédent pourrait partir avec le jeton du suivant.
  const closeActive = useCallback(async () => {
    const previous = activeRef.current;
    if (!previous) return;
    previous.subscriptions.stop();
    previous.attachments.stop();
    previous.backups.stop();
    previous.vocabulary.abort();
    setFlowTerm(null);
    bindLogger(null);
    await previous.db.disconnect().catch(() => {});
    await previous.db.close();
    activeRef.current = null;
  }, []);

  // Ouvre la base du profil et lance la synchro, sauf si l'utilisateur a choisi le mode hors ligne.
  const activate = useCallback(async (profile: Profile) => {
    await closeActive();
    const db = await openProfileDatabase(profile.principalId);
    const connector = new SupabaseConnector(profile.authUserId, {
      onForbidden: (message) => {
        setForbidden(message);
        logEvent("PUSH_FORBIDDEN", { message });
        void setOfflineMode(profile.principalId, true);
        setOfflineState(true);
        activeRef.current?.attachments.stop();
        void db.disconnect();
      },
      onRejected: (count) => {
        setRejected((n) => n + count);
        logEvent("PUSH_REJECTED", { count });
      },
      onUploaded: () => {
        logEvent("PUSH_SUCCESS");
        void reportDevice().catch(() => {});
        void flushLogs(db, profile).catch(() => {});
      },
    });
    const subscriptions = new OfflineSubscriptions(db);
    subscriptions.start();
    const attachments = new AttachmentSyncLoop(db);
    const backups = new BackupScheduler(db, profile);
    bindLogger(db);
    backups.start();
    const wantsOffline = await getOfflineMode(profile.principalId);
    setOfflineState(wantsOffline);
    if (!wantsOffline) {
      void db.connect(connector);
      attachments.start();
    }
    await setActiveProfileId(profile.principalId);
    // Vocabulaire de l'organisation (« Flow » / « Procédure ») : lu avant le premier rendu, puis suivi.
    const applyTerm = (term: string | null | undefined) => {
      setFlowTerm(term);
      setFlowTermState(term ?? null);
    };
    applyTerm((await db.getOptional<{ flow_term: string | null }>("select flow_term from organizations limit 1"))?.flow_term);
    const vocabulary = new AbortController();
    db.watch("select flow_term from organizations limit 1", [], {
      onResult: (r) => applyTerm((r.rows?._array?.[0] as { flow_term?: string | null } | undefined)?.flow_term),
    }, { signal: vocabulary.signal });
    activeRef.current = { profile, db, connector, subscriptions, attachments, backups, vocabulary };
    setActive(activeRef.current);
    setForbidden(null);
    setRejected(0);
    setStatus("ready");
  }, [closeActive]);

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

  const complete = useCallback(async (result: SignInResult) => {
    if (!result.ok) return result.error;
    await closeActive();
    const { error } = await supabase.auth.setSession(result.session);
    if (error) return "UNKNOWN";
    await saveProfile(result.profile, result.session);
    await activate(result.profile);
    logEvent("SIGN_IN");
    return null;
  }, [activate, closeActive]);

  const signIn = useCallback(
    async (email: string, password: string, company: string) => complete(await signInWithCredentials(email, password, company)),
    [complete],
  );

  const signInWithQr = useCallback(async (raw: string) => complete(await signInWithQrCode(raw)), [complete]);

  const resume = useCallback(async (profile: Profile) => {
    const stored = await loadSession(profile.principalId);
    if (!stored) return "SESSION_EXPIRED";
    await closeActive();
    const { data, error } = await supabase.auth.setSession(stored);
    if (error || !data.session || data.session.user.id !== profile.authUserId) return "SESSION_EXPIRED";
    const refreshed = { ...profile, lastConnectedAt: new Date().toISOString() };
    await saveProfile(refreshed, data.session);
    await activate(refreshed);
    return null;
  }, [activate, closeActive]);

  // Déconnexion (en ligne uniquement, cf. §1.4) : la base du profil reste sur l'appareil.
  const signOut = useCallback(async () => {
    const current = activeRef.current;
    if (!current) return;
    await current.db.disconnect();
    await supabase.auth.signOut({ scope: "local" });
    await forgetSession(current.profile.principalId);
    logEvent("SIGN_OUT");
    current.subscriptions.stop();
    current.attachments.stop();
    current.backups.stop();
    bindLogger(null);
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
    logEvent(value ? "SWITCH_TO_OFFLINE" : "SWITCH_TO_ONLINE");
    if (value) {
      current.attachments.stop();
      await current.db.disconnect();
    } else {
      setForbidden(null);
      // Passage en ligne avec des écritures en attente : sauvegarde locale avant l'envoi (spec 05 §3.3).
      if ((await current.db.getUploadQueueStats()).count > 0) await current.backups.runIfDue(true);
      await current.db.connect(current.connector);
      current.attachments.start();
      void flushLogs(current.db, current.profile).catch(() => {});
    }
  }, []);

  const resetLocalData = useCallback(async () => {
    const current = activeRef.current;
    if (!current) return null;
    if ((await current.db.getUploadQueueStats()).count > 0) return "PENDING_WRITES";
    logEvent("RESET_LOCAL_DATA");
    current.subscriptions.stop();
    current.attachments.stop();
    await clearProfileDatabase(current.db);
    current.subscriptions.start();
    if (!(await getOfflineMode(current.profile.principalId))) {
      void current.db.connect(current.connector);
      current.attachments.start();
    }
    return null;
  }, []);

  const value = useMemo<SessionState>(() => ({
    status, profile: active?.profile ?? null, offline, forbidden, rejected,
    signIn, signInWithQr, resume, signOut, setOffline, resetLocalData, dismissForbidden: () => setForbidden(null),
  }), [status, active, offline, forbidden, rejected, signIn, signInWithQr, resume, signOut, setOffline, resetLocalData]);

  return (
    <SessionContext.Provider value={value}>
      {active
        ? <PowerSyncContext.Provider value={active.db}><Fragment key={flowTerm ?? "flow"}>{children}</Fragment></PowerSyncContext.Provider>
        : children}
    </SessionContext.Provider>
  );
}
