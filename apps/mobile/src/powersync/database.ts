import { PowerSyncDatabase } from "@powersync/react-native";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { AppSchema } from "./schema";

// Une base SQLite chiffrée (SQLCipher) par profil connecté sur l'appareil (spec 05 §9.2) :
// changer de profil = fermer la base courante et ouvrir celle du profil.
const keyName = (principalId: string) => `imula.dbkey.${principalId}`;
const fileName = (principalId: string) => `imula-${principalId}.db`;

async function encryptionKey(principalId: string): Promise<string> {
  const existing = await SecureStore.getItemAsync(keyName(principalId));
  if (existing) return existing;
  const key = Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, "0")).join("");
  await SecureStore.setItemAsync(keyName(principalId), key);
  return key;
}

export async function openProfileDatabase(principalId: string): Promise<PowerSyncDatabase> {
  const db = new PowerSyncDatabase({
    schema: AppSchema,
    database: { dbFilename: fileName(principalId), sqliteOptions: { encryptionKey: await encryptionKey(principalId) } },
  });
  await db.init();
  return db;
}

/**
 * « Réinitialiser les données locales » : vide la base du profil (l'appelant vérifie que la file est vide).
 * La clé est conservée : le fichier chiffré existe toujours et sera rouvert avec elle.
 */
export async function clearProfileDatabase(db: PowerSyncDatabase): Promise<void> {
  await db.disconnectAndClear();
}
