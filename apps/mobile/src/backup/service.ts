// Sauvegardes de la base du profil (spec 05 §6.1, §9.9) : chiffrées pour l'organisation, gardées sur l'appareil
// (5 dernières) et envoyées au support (bucket mobile-backups + ligne mobile_backups, page « Backups » de la WebApp).
import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";

import { config } from "@/config";
import { buildBackupContent, sealBackup } from "@/data/backup";
import { getDeviceId } from "@/lib/device";
import { supabase } from "@/lib/supabase";
import { AppSchema } from "@/powersync/schema";
import type { Profile } from "@/session/profiles";

export type BackupTrigger = "manual" | "support" | "auto" | "database_error";

const KEEP_LOCAL = 5;
const keyCache = (organizationId: string) => `imula.backup-key.${organizationId}`;
const randomBytes = (n: number) => Crypto.getRandomBytes(n);

/** Clé publique de l'organisation : demandée en ligne (fonction Edge), puis gardée pour les sauvegardes hors ligne. */
export async function backupPublicKey(organizationId: string): Promise<string | null> {
  const cached = await AsyncStorage.getItem(keyCache(organizationId)).catch(() => null);
  if (cached) return cached;
  const { data, error } = await supabase.functions.invoke<{ public_key?: string }>("mobile-backup-key", { method: "POST" });
  if (error || !data?.public_key) return null;
  await AsyncStorage.setItem(keyCache(organizationId), data.public_key).catch(() => {});
  return data.public_key;
}

export async function makeBackup(db: AbstractPowerSyncDatabase, profile: Profile, trigger: BackupTrigger) {
  const publicKey = await backupPublicKey(profile.organizationId);
  if (!publicKey) throw new Error("KEY_UNAVAILABLE");
  const deviceId = await getDeviceId().catch(() => null);
  const tables = AppSchema.tables.filter((t) => !t.insertOnly).map((t) => t.name);
  const content = await buildBackupContent(db, tables, {
    trigger, principalId: profile.principalId, deviceId, appVersion: config.appVersion,
  });
  const stamp = content.createdAt.replace(/[:.]/g, "-");
  return { bytes: sealBackup(content, publicKey, randomBytes), name: `${stamp}-${Crypto.randomUUID()}.imb`, deviceId };
}

const backupDir = () => new Directory(Paths.document, "backups");

/** « Sauvegarder les données locales » : fichier chiffré dans le stockage interne de l'application. */
export async function saveLocalBackup(db: AbstractPowerSyncDatabase, profile: Profile, trigger: BackupTrigger) {
  const backup = await makeBackup(db, profile, trigger);
  const dir = backupDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `${profile.principalId}-${backup.name}`);
  file.create();
  await file.write(backup.bytes);
  const mine = dir.list().filter((f): f is File => f instanceof File && f.name.startsWith(profile.principalId))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const old of mine.slice(0, Math.max(0, mine.length - KEEP_LOCAL))) old.delete();
  await AsyncStorage.setItem(lastBackupKey(profile.principalId), new Date().toISOString()).catch(() => {});
}

/** « Envoyer une sauvegarde au support » (en ligne). */
export async function sendBackupToSupport(db: AbstractPowerSyncDatabase, profile: Profile, trigger: BackupTrigger) {
  const backup = await makeBackup(db, profile, trigger);
  const path = `${profile.organizationId}/${profile.principalId}/${backup.name}`;
  const { error } = await supabase.storage.from("mobile-backups").upload(path, backup.bytes.buffer as ArrayBuffer, {
    contentType: "application/octet-stream", upsert: false,
  });
  if (error) throw error;
  const { error: rowError } = await supabase.from("mobile_backups").insert({
    organization_id: profile.organizationId, principal_id: profile.principalId, device_id: backup.deviceId,
    storage_path: path, size: backup.bytes.length, trigger, app_version: config.appVersion,
  });
  if (rowError) throw rowError;
}

// ---------- Sauvegarde automatique (intervalle réglable, défaut 4 h ; spec 05 §1.5) ----------

export const BACKUP_INTERVALS = [5, 15, 30, 60, 240] as const;
const intervalKey = (principalId: string) => `imula.backup-interval.${principalId}`;
const lastBackupKey = (principalId: string) => `imula.backup-last.${principalId}`;

export async function getBackupInterval(principalId: string): Promise<number> {
  const v = Number(await AsyncStorage.getItem(intervalKey(principalId)).catch(() => null));
  return (BACKUP_INTERVALS as readonly number[]).includes(v) ? v : 240;
}

export async function setBackupInterval(principalId: string, minutes: number) {
  await AsyncStorage.setItem(intervalKey(principalId), String(minutes)).catch(() => {});
}

export async function getLastBackup(principalId: string): Promise<string | null> {
  return AsyncStorage.getItem(lastBackupKey(principalId)).catch(() => null);
}

/** Vérifie chaque minute si une sauvegarde locale est due ; aussi déclenchée au passage en ligne avec écritures. */
export class BackupScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private db: AbstractPowerSyncDatabase, private profile: Profile) {}

  start() {
    this.stop();
    this.timer = setInterval(() => void this.runIfDue(), 60_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runIfDue(force = false) {
    if (this.running) return;
    this.running = true;
    try {
      const minutes = await getBackupInterval(this.profile.principalId);
      const last = await getLastBackup(this.profile.principalId);
      if (force || !last || Date.now() - new Date(last).getTime() >= minutes * 60_000) {
        await saveLocalBackup(this.db, this.profile, "auto");
      }
    } catch {
      // clé indisponible (jamais connecté en ligne) ou stockage plein : nouvel essai au prochain passage
    } finally {
      this.running = false;
    }
  }
}
