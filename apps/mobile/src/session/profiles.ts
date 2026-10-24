import AsyncStorage from "@react-native-async-storage/async-storage";

import { getSecureItem, removeSecureItem, setSecureItem } from "@/lib/secure-storage";

// Profils ayant déjà ouvert une session sur l'appareil (spec 05 §1.4, §9.2) : liste de reprise rapide
// sur l'écran de connexion. Les sessions sont gardées dans le stockage sécurisé, une par profil.
export type Profile = {
  principalId: string;
  /** Compte d'authentification du profil : la session Supabase doit lui appartenir avant toute synchro. */
  authUserId: string;
  kind: "user" | "operator" | "device";
  displayName: string;
  organizationId: string;
  company: string;
  language: string;
  lastConnectedAt: string;
};

export type StoredSession = { access_token: string; refresh_token: string };

const PROFILES = "imula.profiles";
const ACTIVE = "imula.active-profile";
const offlineKey = (principalId: string) => `imula.offline.${principalId}`;
const sessionKey = (principalId: string) => `imula-session.${principalId}`;

export async function listProfiles(): Promise<Profile[]> {
  const raw = await AsyncStorage.getItem(PROFILES);
  const profiles: Profile[] = raw ? JSON.parse(raw) : [];
  return profiles.sort((a, b) => b.lastConnectedAt.localeCompare(a.lastConnectedAt));
}

export async function saveProfile(profile: Profile, session: StoredSession): Promise<void> {
  const others = (await listProfiles()).filter((p) => p.principalId !== profile.principalId);
  await AsyncStorage.setItem(PROFILES, JSON.stringify([profile, ...others]));
  await setSecureItem(sessionKey(profile.principalId), JSON.stringify(session));
}

/** Met à jour la session mémorisée d'un profil (jetons rafraîchis). */
export async function storeSession(principalId: string, session: StoredSession): Promise<void> {
  await setSecureItem(sessionKey(principalId), JSON.stringify(session));
}

export async function loadSession(principalId: string): Promise<StoredSession | null> {
  const raw = await getSecureItem(sessionKey(principalId));
  return raw ? JSON.parse(raw) : null;
}

/** Déconnexion : la base locale du profil est conservée (comportement d'origine), seule la session est oubliée. */
export async function forgetSession(principalId: string): Promise<void> {
  await removeSecureItem(sessionKey(principalId));
}

export async function getActiveProfileId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE);
}

export async function setActiveProfileId(principalId: string | null): Promise<void> {
  if (principalId) await AsyncStorage.setItem(ACTIVE, principalId);
  else await AsyncStorage.removeItem(ACTIVE);
}

/** Mode hors ligne choisi par l'utilisateur, conservé par profil (spec 05 §3, §9.1). */
export async function getOfflineMode(principalId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(offlineKey(principalId))) === "1";
}

export async function setOfflineMode(principalId: string, offline: boolean): Promise<void> {
  await AsyncStorage.setItem(offlineKey(principalId), offline ? "1" : "0");
}
