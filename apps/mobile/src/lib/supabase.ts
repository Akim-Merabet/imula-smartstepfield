import "react-native-url-polyfill/auto";

import type { Database } from "@imula/db";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { config } from "@/config";
import { secureStorageAdapter } from "@/lib/secure-storage";

// Une seule session Supabase active : celle du profil courant (les autres profils de l'appareil
// gardent leur session dans le registre des profils, cf. session/profiles.ts).
export const supabase = createClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    storage: secureStorageAdapter,
    storageKey: "imula-auth",
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Le rafraîchissement automatique du jeton ne tourne qu'au premier plan.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
