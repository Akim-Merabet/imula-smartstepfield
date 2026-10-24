import * as SecureStore from "expo-secure-store";

// SecureStore (Keystore Android / Keychain iOS) limite la taille d'une valeur (~2 Ko) :
// les valeurs longues (session Supabase) sont découpées en morceaux.
const CHUNK = 1800;
const countKey = (key: string) => `${key}.n`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

export async function getSecureItem(key: string): Promise<string | null> {
  const n = Number(await SecureStore.getItemAsync(countKey(key)));
  if (!n) return null;
  const parts = await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i))));
  return parts.some((p) => p === null) ? null : parts.join("");
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  await removeSecureItem(key);
  const n = Math.max(1, Math.ceil(value.length / CHUNK));
  for (let i = 0; i < n; i++) await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
  await SecureStore.setItemAsync(countKey(key), String(n));
}

export async function removeSecureItem(key: string): Promise<void> {
  const n = Number(await SecureStore.getItemAsync(countKey(key)));
  await SecureStore.deleteItemAsync(countKey(key));
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
}

/** Adaptateur de stockage pour supabase-js. */
export const secureStorageAdapter = {
  getItem: getSecureItem,
  setItem: setSecureItem,
  removeItem: removeSecureItem,
};
