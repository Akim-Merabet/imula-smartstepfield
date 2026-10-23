# Conventions de développement

Reconstruction fonctionnelle de l'application de référence (specs dans `docs/specs/`, sources de rétro-ingénierie dans `docs/reverse/`).
On reproduit **les fonctionnalités et l'ergonomie**, jamais le code, les logos, la marque ni les textes mot pour mot (les libellés sont réécrits dans `messages/`).

## Structure (monorepo pnpm)
- `apps/web` : WebApp Next.js (tous les chemins `src/...` ci-dessous sont relatifs à `apps/web`).
- `apps/mobile` : application terrain React Native (Expo) + PowerSync.
- `packages/db` (types Supabase générés), `packages/formula` (moteur de formules), `packages/forms-core` (modèle et moteur de valeurs des formulaires) : TypeScript source, partagés web/mobile. Dans le web, `@/lib/supabase/database.types`, `@/lib/formula/engine`, `@/features/forms/{types,meta}` réexportent ces paquets.
- `supabase/` (migrations, seed, config), `infra/powersync/` (service de synchronisation auto-hébergé), `scripts/`, `docs/` à la racine.
- Commandes à la racine : `pnpm dev`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm db:check`, `pnpm db:types`, `pnpm powersync:up`.

## Stack
- Next.js **16.4** App Router (lire `node_modules/next/dist/docs/` en cas de doute : `params`/`searchParams` sont des Promises, `proxy.ts` remplace `middleware.ts`, `PageProps<"/route">` / `LayoutProps<"/route">` sont des types globaux générés — lancer `npx next typegen` après création de route).
- `cacheComponents` **désactivé** : rendu dynamique par requête.
- shadcn/ui style `radix-nova` (composants dans `src/components/ui`, ne pas les modifier sauf nécessité), lucide-react, Tailwind v4.
  Règles shadcn : `FieldGroup`/`Field`/`FieldLabel` pour les formulaires, `gap-*` (jamais `space-y-*`), `size-*`, icônes de bouton avec `data-icon="inline-start"`, items de Select/Dropdown dans leur `*Group`, `Dialog` avec `DialogTitle`, couleurs sémantiques (tokens de `globals.css` : `bg-primary`, `text-muted-foreground`, `bg-row-focus`, `text-success`, `bg-entity-project-bg`…).
- Supabase local (API `http://127.0.0.1:55921`, DB `postgresql://postgres:postgres@127.0.0.1:55922/postgres`, Studio `:55923`). App sur `http://localhost:3030` (déjà lancée par `pnpm dev`, ne pas en lancer une deuxième).
- Démo : `admin@demo.local` / `Demo-Password-2026!` (global_admin, Responsable de l'entité « Maintenance site de Lyon » `00000000-0000-4000-8000-000000000100`).
- next-intl sans préfixe d'URL ; FR par défaut, EN. **Un fichier par namespace** : `messages/fr/<ns>.json` + `messages/en/<ns>.json` (le nom de fichier = namespace). Toujours créer FR **et** EN. Interpolation ICU `{var}`, pluriels ICU.

## Base de données
- Migrations dans `supabase/migrations/` (schéma lot 1 complet : tenancy, dictionnaires, collaborateurs, entités, bibliothèque, flows/contenu/blocs/signatures, formulaires/réponses). **Lire les migrations avant d'écrire du code.**
- Nouvelle migration : créer le fichier à la main `supabase/migrations/<YYYYMMDDHHMMSS>_<nom>.sql` (timestamp > au dernier existant), puis l'appliquer :
  `PGPASSWORD=postgres timeout 60 psql -h 127.0.0.1 -p 55922 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f <fichier>`
  et l'enregistrer : `... -c "insert into supabase_migrations.schema_migrations(version,name) values ('<ts>','<nom>')"`.
  **Ne jamais lancer `supabase db reset`** (d'autres agents travaillent en parallèle sur la même base). Toujours mettre `timeout` devant les commandes psql/supabase.
- Vérifier que les migrations rejouent depuis une base vide et sans dérive : `timeout 600 scripts/check-migrations.sh` (base jetable `migcheck`, sans toucher à la base de dev).
- Après modification de schéma : `pnpm db:types` (écrit `packages/db/src/database.types.ts`).
- RLS active partout ; fonctions d'autorisation dans le schéma `private` (`current_collaborator_id()`, `current_org_id()`, `accessible_account_ids()`, `is_admin()`, `can_read_project(id)`, `can_write_project(id, min_role)`, `can_read_flow(id)`, `can_write_flow(id, min_role)`, `can_sign_flow(id)`, `can_read_form(id)`, `can_write_form(id)`, `can_read_response(id)`, `can_write_response(id)`). Politiques séparées SELECT/INSERT/UPDATE/DELETE (pas de `FOR ALL`). Nouvelle table exposée : `enable row level security` + politiques ; les droits de table `authenticated` sont accordés par défaut.
- ⚠️ Une politique SELECT est réévaluée sur le `RETURNING` d'un INSERT : ne pas y appeler une fonction qui relit **la même table** par id (elle ne voit pas encore la ligne) — utiliser les colonnes de la ligne.
- Logique serveur nécessitant de contourner la RLS (ex. ajouter un membre) : trigger `security definer` dans `private` avec `set search_path = ''`, jamais une fonction `security definer` dans `public`.
- Soft delete via `deleted_at` (corbeille 30 j) pour entités, flows, formulaires, réponses ; suppression physique pour le reste (« pas de corbeille »).

## Code applicatif
- Organisation : `src/features/<domaine>/` (queries.ts serveur, actions.ts server actions, schema.ts zod, components/, dialogs/). Pages dans `src/app/(app)/explore/...` qui restent minces.
- Session : `requireSession()` / `getSession()` (`src/lib/auth/session.ts`) → `{ collaborator, organization, account }`.
- Contexte d'entité : `getProjectContext(projectId)` (`src/features/projects/project-context.ts`) → `{ project, role, can(routeId, action) }`.
- Permissions UI : `src/lib/permissions/{matrix,check,types}.ts` (`can(routeId, action, {authority, projectRole})`). Ajouter les routeIds manquants dans `matrix.ts` (règle : le rôle d'entité prime sur le droit global, cf. spec 01 §3.4). La RLS reste l'autorité.
- Server actions : `authorize(routeId, action, projectId?)`, `ok()`, `fail()`, `dbError()` de `src/lib/actions.ts` ; valider avec zod ; `revalidatePath` ; renvoyer `ActionResult`.
- Clients Supabase : `@/lib/supabase/server` (serveur), `@/lib/supabase/client` (navigateur, lectures dans les modales), `@/lib/supabase/admin` (service, à éviter).
- Modales = routes d'URL : `?dialog=<préfixe>/<action>/<id>/<onglet>` (`useDialog()` de `src/components/shell/use-dialog.ts`). Enregistrer le préfixe dans `src/components/dialogs/registry.ts` (`dynamic(() => import(...))`, composant `export default` recevant `{ segments, close }`). Gabarit visuel : `ModalShell` (`src/components/dialogs/modal-shell.tsx`, onglets, pied, précédent/suivant). Exemple complet : `src/features/projects/dialogs/`.
- Listes : `DataTable` (`src/components/data-table/data-table.tsx` : colonne Actions `meta: { sticky: true }`, colonnes verrouillées `meta: { locked: true }`, persistance des largeurs, surlignage du dernier élément ouvert), `ColumnsCustomizer`, filtres liés à l'URL (`SearchFilter`, `FacetFilter`, `ToggleFilter`, `ClearFiltersButton`, `FilterBar` dans `filter-bar.tsx`). Exemple : `src/features/projects/components/projects-table.tsx` + `src/app/(app)/explore/projects/page.tsx`.
- Communs : `PageHeader` (fil d'Ariane), `ModuleNav` + `ModuleNavHeader` (menu latéral de module), `EntityIcon`, `StatusBadge`, `FamilyChip`, `ConfirmDialog` (confirmation par saisie SUPPRIMER/REINITIALISER…), `notify.success/error/...`, `useRegisterPageAdd(fn)` (bouton « + » du rail), `CustomFieldsEditor` (attributs personnalisés) + `src/lib/custom-fields/server.ts`.
- Mise en page d'une page de module : `<main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6">` avec `PageHeader` puis contenu. Le layout du tableau de bord d'entité fournit déjà le menu et le conteneur.
- Accessibilité et i18n : aucun texte en dur dans les composants ; `useTranslations`/`getTranslations`.
- Vérification : `pnpm typecheck` à la racine (ne corriger que les erreurs de VOS fichiers ; d'autres agents travaillent en parallèle). Tester dans le navigateur (Playwright MCP) sur `http://localhost:3030`.
- Pas de `git commit`.

## Contrats inter-modules
- **Bloc Formulaire dans un flow** : le module Flows affiche le bloc `form` via le composant `FormBlock` exporté par `src/features/forms/block/form-block.tsx` (livré par le module Formulaires), props :
  `{ block: { id: string; state: Enums<"block_state"> }; flow: { id: string; projectId: string; name: string; ref_int: string | null }; step: { id: string; phaseId: string; phaseNumber: string; stepNumber: string; name: string }; canEdit: boolean }`.
  Tant que le fichier n'existe pas, le module Flows affiche un état vide pour ce bloc.
- **Réponse de formulaire** : page `src/app/(app)/explore/projects/[projectId]/responses/[responseId]/page.tsx` (module Formulaires).
- **Éditeur de formulaire plein écran** : `src/app/(app)/form/[formId]/page.tsx` (module Formulaires, hors shell `explore`).
