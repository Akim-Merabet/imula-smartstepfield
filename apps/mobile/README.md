# App mobile terrain (Expo + PowerSync)

Reconstruction de l'application terrain (spec `docs/specs/05-mobile-terrain.md`). Android d'abord.

## Architecture

- **Lecture** : uniquement dans la base SQLite locale (PowerSync), en ligne comme hors ligne.
- **Une base chiffrée (SQLCipher) par profil** connecté sur l'appareil : `src/powersync/database.ts`.
  La clé est générée à la première ouverture et gardée dans le Keystore (`expo-secure-store`).
- **Synchro** : Sync Streams définis dans `infra/powersync/config/sync-config.yaml`.
  Le schéma local `src/powersync/schema.generated.ts` en est dérivé :
  `pnpm --filter @imula/mobile gen:schema` (base locale démarrée) après toute modification des streams ou du schéma.
- **Envoi** : `src/powersync/connector.ts` vide la file transaction par transaction ; la table locale → appel
  serveur est dans `src/powersync/uploaders.ts` (stratégie d'erreurs : spec 05 §9.6).
- **Connexion** : fonction Edge `supabase/functions/mobile-sign-in` (entreprise, appareils autorisés,
  un appareil par profil). Profils déjà connectés : `src/session/profiles.ts`.

## Développement

1. Démarrer Supabase (`supabase start`), PowerSync (`pnpm powersync:up` à la racine) et les fonctions Edge
   (`supabase functions serve`).
2. Copier `.env.example` en `.env.local` et renseigner la clé anonyme (`supabase status`).
3. Construire l'app de développement (modules natifs : Expo Go ne suffit pas) :

   ```bash
   npx expo run:android
   ```

   Sur un appareil physique : `adb reverse tcp:55921 tcp:55921 && adb reverse tcp:55930 tcp:55930`.

Vérifications avant commit : `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`.
