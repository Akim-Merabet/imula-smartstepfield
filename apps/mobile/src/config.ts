import Constants from "expo-constants";

// Variables publiques injectées au build (EXPO_PUBLIC_*) ; voir .env.example.
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

export const config = {
  supabaseUrl: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  powersyncUrl: required("EXPO_PUBLIC_POWERSYNC_URL", process.env.EXPO_PUBLIC_POWERSYNC_URL),
  appVersion: Constants.expoConfig?.version ?? "0.0.0",
};
