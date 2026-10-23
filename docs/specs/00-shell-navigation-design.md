# 00 — Shell applicatif, navigation & design system

> Spec de reconstruction (fonctionnalités + ergonomie) de l'application web de référence (Angular, build FE 2.23.6)
> vers **Next.js 16 App Router + shadcn/ui (style `radix-nova`) + Tailwind v4 + Supabase + next-intl 4**.
> On reproduit le comportement et le rendu, **pas** le code, ni les logos, ni les marques (le nom produit est remplacé par `{{APP_NAME}}`).

## 0. Conventions de lecture

- **[OBS]** = observé dans les sources, avec la référence (fichier/chunk du bundle, clé i18n, enum).
- **[INF]** = inféré / proposition de reconstruction (à valider).
- Sources : `docs/reverse/ROUTES.md`, `docs/reverse/i18n-fr.json` (12 186 clés), `docs/reverse/enums-*.txt`,
  bundle `exhibit_2026-10-22_1552/` (`main-J76XDDLA.js`, `chunk-*.js`, `styles-ZSW73VC6.css`).
- Les chunks clés cités :
  `chunk-GWTCRW3U` (constantes de chemins), `chunk-AF7OC744` (MainModule : navbar, breadcrumb, popovers),
  `chunk-QMYM3GHR` (menu latéral), `chunk-DVXVX5EG` (menu + routes « dashboard » d'une entité),
  `chunk-7Y2TUQYG` (Bibliothèque), `chunk-MPV2TTLQ` (Collaborateurs), `chunk-Q6NZOZAJ` (Paramètres),
  `chunk-VPITBZFE` (Profil), `chunk-NHPL6VSQ` (routeur des modales), `chunk-HCYDDSAJ` (enums, libellés de menu,
  icônes, matrice de permissions, toaster), `chunk-NUIOR7UD` (tâches de fond), `chunk-SRCKSSLY` (bouton).

---

## 1. Architecture générale du shell

### 1.1 Structure visuelle [OBS `chunk-AF7OC744` styles `sfx-main`]

```
┌────┬───────────────┬──────────────────────────────────────────────┐
│ N  │  Menu latéral │  Fil d'Ariane (fond blanc, padding 0 2rem)   │
│ A  │  du module    ├──────────────────────────────────────────────┤
│ V  │  (250px,      │                                              │
│    │  repliable,   │  Contenu routé (padding 0 2rem, scroll Y)    │
│ R  │  redim.)      │                                              │
│ A  │  #f4f5f7      │                                              │
│ I  │               │                                              │
│ L  │               │                                              │
│4rem│               │   (page-wrapper : box-shadow 0 3px 6px #0003)│
└────┴───────────────┴──────────────────────────────────────────────┘
```

- `html, body { height:100%; min-width:990px; overflow:hidden }` [OBS `index.html`] : application desktop, pas de responsive mobile.
  [INF] Garder `min-w-[990px]` sur le shell ; pas d'effort mobile en V1.
- **Rail de navigation** (navbar) vertical à gauche, `max-width:4rem`, fond `#0d4e8a`, texte blanc, padding `1rem .5rem`.
- **Menu latéral du module** (`sfx-navigation-menu`) : présent pour Bibliothèque, Collaborateurs, Paramètres, Profil et
  le tableau de bord d'une entité. **Absent** de la liste des entités (`/explore/projects`) [OBS : `ProjectsModule` ne monte pas de menu].
- Zone de page : fil d'Ariane (`sfx-breadcrumb`) puis `main-router-container` (classe `no-padding` possible pour les vues plein cadre :
  plan, diagramme, carte).
- Une seule modale-route à la fois, rendue par-dessus via l'outlet nommé `modals` [OBS `main-J76XDDLA.js` : `{path:"dialog", loadChildren:SfxDialogModule, outlet:"modals"}`].
- Un second outlet nommé `side` sert aux menus latéraux du contenu d'un flow (content-menu / sequence-menu) [OBS `chunk-IVAHRSRS`, `chunk-EPTV3DVS`].

### 1.2 Services globaux démarrés par le shell [OBS `sfx-main` `ngOnInit`]

- Sonde des tâches de fond (`backgroundTaskProbeStore.startProbe()`), avec découverte toutes les **60 s** [OBS `chunk-NUIOR7UD` `xe=6e4`].
- Chargement du centre d'aide si `helpCenter.active` (config d'environnement).
- Widget « nouveautés » tiers si le flag `JIMO_ANALYTICS` est actif. [INF] À remplacer par un widget « Nouveautés » interne (clés `profile.menu.news`, `profile.menu.unreadNews`).
- Analytics (Matomo) avec contexte : hôte du tenant, applicabilité, autorité, langue, version. [INF] Optionnel.
- Toast d'alerte si la licence de l'éditeur riche expire dans ≤30 j. [INF] Hors périmètre.

---

## 2. Arborescence des routes

### 2.1 Carte des URLs d'origine [OBS `chunk-GWTCRW3U` namespaces `*Paths`, `main-J76XDDLA.js`, modules]

```
/                         (garde d'auth) → enfants :
  /explore                MainModule (shell)            routeId Main
    ""                    → redirect projects
    /projects             Liste des entités             routeId Projects
    /projects/:projectUuid → DashboardModule
        ""                → redirect dashboard
        /dashboard        ProjectDashboard (menu entité)
            ""            → redirect flow-management
            /flow-management   → "" redirect vue-list
                /vue-list | /vue-plan | /vue-map | /vue-diagram | /vue-kanban
            /flow-referential  → /vue-list | /vue-diagram
            /documents  /forms  /lists  /schedule-tasks  /collaborators  /tablets
            /metrics  /signatures (/vue-list/…, /vue-list/:elementUuid, /vue-temporal)
            /fields-feedback  /closing-folder  /information  /categories
            /**           → redirect flow-management
        /flow/:flowUuid   FlowContent (content-view | sequence-view, + outlet side)
    /folder/:folderUuid   Dossier référentiel           routeId ProjectFolder
    /library              → "" redirect forms
        /risks /equipments /documents /forms /object-management(/list-vue) /tags
    /collaborators        → "" redirect users
        /users /operators /external-users /tablets /authorized-devices /external-api(/v1|/v2)
    /settings             → "" redirect account ; /** → account
        /account /clients /companies /families /categories /statuses /files-models /files-cells
        /references /custom-fields /sections /trash /general-account /general-organization
        /trams /wording-configuration /backups /logsPushPath (sic) /kpi /background-tasks
    /profile              → "" redirect user-info ; /** → user-info
        /user-info /reset-password /tablet
    /**                   → redirect projects
  /form/:formUuid         Éditeur de formulaire plein écran (hors shell explore)  routeId Form
/share/:shareUuid/…       Partage externe (EntryModule) : login, init-form, init-document, contributor-info, finish/:id …
/auth  /reset-password  /sign-up/<clé>  /reset/finish  /onboarding/finish  /activate
/callback                 Retour OAuth/SSO (ADFS)
/404                      NotFoundComponent ;  /** → /404
(modals:dialog/…)         Outlet auxiliaire des modales (voir §2.4)
```

### 2.2 Proposition Next.js App Router [INF]

```
src/app/
  layout.tsx                         # <html lang>, NextIntlClientProvider, Toaster, fonts
  not-found.tsx                      # page 404 plein écran (§5.10)
  404/page.tsx                       # alias explicite (liens existants)
  callback/route.ts                  # échange code OAuth → session Supabase
  (auth)/layout.tsx                  # layout centré sans shell
    auth/page.tsx                    # connexion (login.*)
    reset-password/page.tsx          # mot de passe oublié (login.resetPwd.*)
    reset/finish/page.tsx            # nouveau mot de passe (login.resetFinish.*)
    sign-up/[key]/page.tsx           # inscription entreprise (signUp.*)
    activate/page.tsx
    onboarding/finish/page.tsx       # onboarding 4 étapes (onboarding.*)
  (public)/share/[shareUuid]/…       # partage externe (spec dédiée)
  (app)/layout.tsx                   # garde d'auth serveur (getUser), charge user + droits + flags
    page.tsx                         # redirect('/explore')
    form/[formUuid]/…                # éditeur de formulaire plein écran (spec dédiée)
    explore/
      layout.tsx                     # AppShell = NavRail + PageWrapper(Breadcrumb) + <ModalHost/>
      page.tsx                       # redirect('/explore/projects')
      projects/page.tsx              # liste des entités (pas de menu latéral)
      projects/[projectUuid]/
        page.tsx                     # redirect → dashboard/flow-management/vue-list
        dashboard/
          layout.tsx                 # charge l'entité, garde de rôle projet, <ModuleNav menu={entityMenu}>
          page.tsx                   # redirect → flow-management/vue-list
          flow-management/layout.tsx # barre de vues / filtres communs
          flow-management/{vue-list,vue-plan,vue-map,vue-diagram,vue-kanban}/page.tsx
          flow-referential/{vue-list,vue-diagram}/page.tsx
          {documents,forms,lists,schedule-tasks,collaborators,tablets,metrics,
           fields-feedback,closing-folder,information,categories}/page.tsx
          signatures/{vue-list/[[...element]],vue-temporal}/page.tsx
          [...rest]/page.tsx         # redirect → flow-management (parité "**")
        flow/[flowUuid]/{content-view,sequence-view}/page.tsx
      folder/[folderUuid]/page.tsx
      library/layout.tsx             # <ModuleNav menu={libraryMenu}>
      library/{risks,equipments,documents,forms,tags}/page.tsx
      library/object-management/list-vue/page.tsx
      collaborators/layout.tsx       # <ModuleNav menu={contributorsMenu}>
      collaborators/{users,operators,external-users,tablets,authorized-devices}/page.tsx
      collaborators/external-api/{v1,v2}/page.tsx
      settings/layout.tsx            # <ModuleNav menu={settingsMenu}>
      settings/{account,clients,companies,families,categories,statuses,files-models,files-cells,
                references,custom-fields,sections,trash,background-tasks,general-account,
                general-organization,trams,wording-configuration,backups,logs-push,kpi}/page.tsx
      profile/layout.tsx             # <ModuleNav menu={profileMenu}>
      profile/{user-info,reset-password,tablet}/page.tsx
      [...rest]/page.tsx             # redirect('/explore/projects')
```

Règles :
- Les **segments d'URL sont conservés** (parité des liens, query params, favoris) ; seul `logsPushPath` (bug d'origine) devient `logs-push`
  avec redirection de l'ancien segment dans `next.config.ts` (`redirects`).
- Chaque `layout.tsx` de module appelle `requireRouteAccess(routeId)` côté serveur (§3.4) ; échec → `redirect('/explore/projects')` + toast
  « Droit et Rôle » (clé `global.permission.alert.*`) [OBS : toast Warning `dataCy:"security"`].
- Les redirections par défaut (`""` et `**`) sont reproduites par `page.tsx` + `[...rest]/page.tsx` qui appellent `redirect()`.
- Next 16 : `params` et `searchParams` sont des **Promises** dans les pages ; les layouts ne reçoivent pas `searchParams`.

### 2.3 Écrans : titre, fil d'Ariane, permission

Abréviations des autorités (enum `UserAuthority` [OBS `enums-numeric`]) : **ASF** AdminSiteFlow(1), **AAG** AdminAppGlobal(2),
**AA** AdminApp(3), **UA** UserAdvanced(4), **NU** NormalUser(5), **UC** UserContractor(14), **UMD** UserManageDiffusion(13).
`*` = tout utilisateur connecté. « + rôle projet » = permission `{uuidEntityContext: ProjectUuidEntity, Read}` vérifiée sur les rôles
de l'utilisateur dans l'entité. Les droits « Read » proviennent de la matrice statique `allPermissions` [OBS `chunk-HCYDDSAJ`].
Le titre = libellé de menu ; le fil d'Ariane = clés `breadcrumb.*` [OBS map `aq.label`].

| URL (sous `/explore`) | routeId | Titre (fr) | Fil d'Ariane | Lecture |
|---|---|---|---|---|
| `/projects` | Projects | Entités | Entités | `*` |
| `/folder/:id` | ProjectFolder | (nom du dossier) | Entités › dossier | ASF,AA,AAG + rôle Responsable |
| `/projects/:id/dashboard/flow-management/vue-list` | FlowManagementList | Flows – Vue liste | Entités › {entité} › Flows - Vue liste | `*` + rôle projet |
| `…/vue-plan` | FlowManagementPlan | Vue plan | … › Flows - Vue plan | `*` + rôle projet |
| `…/vue-map` | FlowManagementMap | Vue map | … › Flows - Vue map | `*` + rôle projet |
| `…/vue-diagram` | FlowManagementDiagram | Vue diagramme | … › Flows - Vue diagramme | `*` + rôle projet |
| `…/vue-kanban` | FlowManagementKanban | Vue kanban | … › Flows - Vue kanban | `*` (route existante, **pas d'item de menu**) |
| `…/dashboard/flow-referential/vue-list` | DashboardFlowReferentialListView | Référentiels – Vue liste | … › Référentiels | `*` + rôle projet |
| `…/flow-referential/vue-diagram` | DashboardFlowReferentialDiagramView | Vue diagramme | … | `*` + rôle projet |
| `…/dashboard/documents` | DashboardDocuments | Documents | … › Documents | `*` + rôle |
| `…/dashboard/forms` | DashboardForms | Formulaires | … › Formulaires | `*` + rôle |
| `…/dashboard/lists` | DashboardLists | Listes | … › Listes | `*` + rôle |
| `…/dashboard/schedule-tasks` | DashboardScheduleTasks | Planification | … › Planification | `*` + rôle |
| `…/dashboard/collaborators` | DashboardContributors | Collaborateurs | … › Collaborateurs | `*` + rôle |
| `…/dashboard/tablets` | DashboardTablets | Tablettes | … › Tablettes | `*` + rôle |
| `…/dashboard/metrics` | DashboardMetrics | Avancement | … › Avancement | `*` + rôle |
| `…/dashboard/signatures/vue-list` | DashboardSignatureList | Signatures | … › Signatures - Vue liste | `*` + rôle |
| `…/dashboard/signatures/vue-temporal` | DashboardSignatureTemporal | Vue temporelle | … › Signatures - Vue temporelle | `*` + rôle |
| `…/dashboard/fields-feedback` | DashboardFieldFeedback | Remontées terrain | … › Remontées terrain | `*` + rôle |
| `…/dashboard/closing-folder` | DashboardClosingFolder | Dossier de clôture | … › Dossier de clôture | `*` + rôle |
| `…/dashboard/information` | DashboardInformation | Informations | … › Informations | `*` + rôle |
| `…/dashboard/categories` | DashboardCategories | Catégories | … › Catégories | `*` + rôle |
| `/projects/:id/flow/:flowId/…` | FlowContent | (nom du flow) | … › Flows › {flow} | `*` + rôle |
| `/library/risks` | LibraryRisks | Risques | Bibliothèques › Risques | ASF,AA,AAG,UA,NU |
| `/library/equipments` | LibraryEquipments | Moyens | Bibliothèques › Moyens | ASF,AA,AAG,UA,NU |
| `/library/documents` | LibraryDocuments | Documents | Bibliothèques › Documents | ASF,AA,AAG,UA,NU |
| `/library/forms` (défaut) | LibraryForms | Formulaires | Bibliothèques › Formulaires | ASF,AA,AAG,UA,NU,UC |
| `/library/object-management/list-vue` | LibraryObjectManagement | Objets | Bibliothèques › Objets | ASF,AA,AAG,UA,NU |
| `/library/tags` | LibraryTags | Etiquettes | Bibliothèques › Etiquettes | ASF,AA,AAG,UA,NU |
| `/collaborators/users` (défaut) | ContributorUsers | Utilisateurs | Collaborateurs et tablettes › Utilisateurs | ASF,AA,AAG,UA,NU |
| `/collaborators/operators` | ContributorOperators | Opérateurs | … › Opérateurs | ASF,AA,AAG,UA,NU |
| `/collaborators/external-users` | ContributorExternalUsers | Utilisateurs externes | … › Utilisateurs externes | ASF |
| `/collaborators/tablets` | ContributorTablets | Tablettes | … › Tablettes | ASF,AA,AAG,UA,NU |
| `/collaborators/authorized-devices` | ContributorAuthorizedDevices | Appareils autorisés | … › Appareils autorisés | ASF,AA,AAG,UA + flag (§3.3) |
| `/collaborators/external-api/v1` · `/v2` | ExternalAccessApiV1/V2 | Accès API V1 / V2 | … › Accès API › Accès API V1/V2 | ASF |
| `/settings/account` (défaut) | SettingsAccount | Compte | Paramètres › Compte | ASF,AA,AAG,UA |
| `/settings/clients` | SettingsClientBook | Carnet clients | Paramètres › Carnet clients | ASF,AA,AAG,UA |
| `/settings/companies` | SettingsCompanies | Sociétés | Paramètres › Sociétés | ASF,AAG |
| `/settings/families` | SettingsFamilies | Familles | Paramètres › Familles | ASF,AA,AAG,UA |
| `/settings/categories` | DefaultCategories | Catégories | Paramètres › Catégories | ASF,AA,AAG |
| `/settings/statuses?type=flow` | CustomStatus | Statuts | Paramètres › Statuts | ASF,AA,AAG |
| `/settings/references` | SettingsReferences | Références | Paramètres › Références | ASF,AA,AAG |
| `/settings/custom-fields` | SettingsCustomField | Attributs | Paramètres › Attributs | ASF,AA,AAG |
| `/settings/files-models` | SettingsCustomFile | Modèles | Paramètres › Fichiers - Modèles | ASF,AA,AAG,UA |
| `/settings/files-cells` | SettingsCustomCell | Cellules | Paramètres › Fichiers - Cellules | ASF,AA,AAG,UA |
| `/settings/sections` | SettingsSections | Dossiers | Paramètres › Dossiers | ASF,AA,AAG,UA |
| `/settings/trash` | SettingsTrash | Corbeille | Paramètres › Corbeille | ASF,AA,AAG,UA |
| `/settings/background-tasks` | SettingsBackgroundTasks | Tâches de fond | Paramètres › Tâches de fond | ASF,AAG |
| `/settings/general-account` | SettingsGeneralAccount | Général – Compte | Paramètres › Général - Compte | ASF |
| `/settings/general-organization` | SettingsGeneralOrganization | Organisation | Paramètres › Général - Organisation | ASF |
| `/settings/trams` | SettingsTrams | Trames | Paramètres › Trames | ASF |
| `/settings/wording-configuration` | SettingsWordingConfiguration | Suivi | Paramètres › Suivi | ASF |
| `/settings/backups` | SettingsBackups | Backups | Paramètres › Backups | ASF |
| `/settings/logs-push` | SettingsLogsPush | Logs push | Paramètres › Logs Push | ASF |
| `/settings/kpi?frequency=…&month=<unix>` | SettingsKpis | Usage | Paramètres › Usage | ASF |
| `/profile/user-info` (défaut) | ProfileInformation | Informations | Profil › Informations | `*` |
| `/profile/reset-password` | ProfileResetPassword | Mot de passe | Profil › Mot de passe | `*` |
| `/profile/tablet` | ProfileTablet | Tablette | Profil › Tablette | `*` |

Lecture du module lui-même [OBS] : Paramètres = ASF,AA,AAG,UA ; Bibliothèque = ASF,AA,AAG,UA,NU,UC ; Collaborateurs = ASF,AA,AAG,UA,NU ; Entités = `*`.
Le module Profil n'a pas de garde de permission.

Contraintes par **type d'entité** sur les routes du dashboard (`associatedProjectsType`, garde `p`) [OBS `chunk-DVXVX5EG`] :
documents/lists ⇒ Projet, Référentiel, PGAC ; flow-referential/schedule-tasks/tablets/signatures/fields-feedback/closing-folder ⇒ Projet, PGAC ;
forms/collaborators/metrics/information/categories ⇒ tous (Projet, Référentiel, Modèle, PGAC). [INF] Si type non autorisé : redirect vers `flow-management/vue-list`.

Titre de document HTML : statique « Siteflow Solution » [OBS `index.html`]. [INF] Utiliser `generateMetadata` → `"{titre écran} · {{APP_NAME}}"`.

### 2.4 Modales = routes auxiliaires → `ModalHost` piloté par l'URL [OBS + INF]

**Observé** (`chunk-NHPL6VSQ`, `chunk-HSX2J3IH`) : chaque modale est une route de l'outlet `modals`, ex.
`/explore/projects(modals:dialog/project/edit/<uuid>/general-tab)`. Chaque entrée déclare `modalId`, `relatedRouteId(s)` (page hôte
autorisée), `modalConfigs` (taille), éventuellement `permission`. Les onglets sont des sous-routes : `general-tab`, `attribute-tab`,
`options-tab`, `import-tab`, `content-tab`. Une modale survit au rechargement de la page (l'URL porte l'état) ; la fermeture
retire le segment auxiliaire ; un changement de page principale ferme la modale (`runGuardsAndResolvers` compare l'URL avant `(`).

Préfixes de modales (`DialogPaths`) : `project`, `flow`, `plan`, `flow-referential`, `object`, `collaborators`, `dashboard-tablets`, `category`,
`tablets`, `authorized-devices`, `default-category`, `custom-status`, `custom-field`, `access-api`, `access-api-v2`, `family`, `users`,
`client`, `dashboard-form`, `dashboard-field-feedback`, `operator`, `quick-connection/:id`, `list`, `risk`, `tag`, `form-lib`, `equipment`,
`library-document`, `references`, `flow-content`, `blocks`, `block-adr|emm|dsi|rhp|form|object|multi-pr`, `link-form/:id`,
`custom-files`, `custom-cells`, `folders`, `closing-folder`, `wordingConfiguration`, `tram`, `dashboard-documents`, `form`, `share`,
`external-user`, `company`, `unlock-flow/:id`, `prepareFolderDialog/:id`, `general-organization-applications`.
Actions communes (`CommonPaths`) : `add`, `import`, `upload`, `reorganize`, `customize-columns`, `view/:id`, `edit/:id`, `convert/:id`,
`details/:id`, `duplicate/:id`, `duplicateFolder/:id`, `edit-folder/:id`, `move/:id`, `schedule/:id`, `properties/:id`, `history/:id`,
`add/:id`, `skills/:id`, `verification/:id`, `collaborators/:id`, `team-role-affectation(-edit)/:flowId`.

Tailles observées : standard `min 60rem × 35rem` (38rem pour project/flow/plan/objets/collaborateurs ; 40rem companies ; 47rem client) ;
petites `50rem × 22rem` (risque, étiquette) ; connexion rapide `50rem × 27rem` ; propriétés `40rem × 34rem` (Échap autorisé) ;
duplication `60rem × 40rem`.

**Proposition Next.js** : ne PAS utiliser les intercepting routes `(.)` pour ces modales, car (1) au rechargement Next rend la page cible en
plein écran au lieu de la superposer — l'app d'origine garde la modale par-dessus la liste ; (2) une même modale (ex. `share`) est ouverte
depuis 4 pages différentes ; (3) la règle `relatedRouteId` est plus simple à contrôler côté client.
Retenir un **search param unique** qui reprend la syntaxe d'origine :

```
/explore/projects?dialog=project/edit/7f3…/general-tab
/explore/projects/123/dashboard/flow-management/vue-list?…filtres…&dialog=flow/add/general-tab
```

- `src/components/shell/modal-host.tsx` (client, dans `explore/layout.tsx`, sous `<Suspense>` car `useSearchParams`) parse `dialog`,
  le résout via un **registre** `modalRegistry: Record<prefix, {component (lazy via next/dynamic), relatedRouteIds, size, permission?}>`,
  vérifie que la page courante (`routeId` publié par la page via un contexte `RouteMetaProvider`) est autorisée, sinon retire le param.
- Ouverture : `router.push(withDialog(url, "flow/edit/<id>/general-tab"), {scroll:false})` en préservant les autres query params
  [OBS `queryParamsHandling:"preserve"`]. Fermeture : retrait du param (et `router.back()` si la modale a été ouverte par navigation interne).
- Onglets de modale = dernier segment du param (`…/general-tab`) ; changer d'onglet = `router.replace`.
- Composant visuel : shadcn `Dialog` (non-modal backdrop gris), contenu `ModalShell` (§5.4).
- Outlet `side` du contenu de flow → param `side=content-menu|sequence-menu` ou simple layout imbriqué (spec « contenu de flow »).

### 2.5 Query params transverses [OBS enum `y1` `chunk-HCYDDSAJ`]

`returnUrl`, `key`, `viewMode`, `responseViewMode`, `resetFlowContext`, dates (`typeDate`, `startDate`, `frequency`, `endDate`, `fieldDate`,
`date-state`, + variantes `second*`), tri/regroupement (`sortBy`, `direction`, `groupBy`), recherche (`textSearch`, `advancedSearch`),
filtres (`nature`, `accesslevel`, `type`, `type2`, `link`, `status`, `company`, `schedulings`, `family`, `secondFamily`, `category`,
`secondCategory`, `thirdCategory`, `category2`, `client`, `assignee`, `labelApplicability`, `applicability`, `secondApplicability`,
`function`, `legal`, `group`, `hierarchy`, `skill`, `contract`, `authority`, `roles`, `role`, `format`, `flowRef`, `provenance`, `flow`,
`secondFlow`, `form`, `block`, `extension`, `template`, `time`, `month`, `plan`, `state`, `states`, `priority`, `domain`, `question`, `locals`,
`landmarks`, `published`, `eventFlow`, `customWording`, `uuidEntities`, `collaborator`, `option`, `method`, `users`, `userType`, `userNatures`,
`teamRole`, …). Une variante préfixée `_` (`_sortBy`, `_textSearch`, `_currentTab`, …) existe pour l'état **interne aux modales** [OBS enum `y6`].
[INF] Centraliser dans `src/lib/url/query-keys.ts` + parseurs typés (ex. `nuqs` ou utilitaire maison). Listes multi-valeurs séparées par `,`,
champs par `;`, séparateur API `~` [OBS `chunk-BKHSN4IO` : `listSeparator=, paramsFieldSeparator=; restApiFieldSeparator=~`].

---

## 3. Menus

### 3.1 Rail de navigation (menu principal) [OBS `chunk-AF7OC744` `sfx-navbar`]

Ordre de haut en bas :

| Zone | Item | Icône d'origine (FA5) | lucide-react [INF] | Tooltip (clé) | Condition |
|---|---|---|---|---|---|
| En-tête | Logo (petit logo CDN) → `/explore/projects` | image | logo neutre `{{APP_NAME}}` | `navbar.tooltip.backToEntity` « Revenir à la liste des entités » | toujours |
| En-tête | **Ajouter** | `plus` | `Plus` | `navbar.tooltip.addElement` | si la page courante n'indique pas `hideAddButton` ; déclenche l'action « ajouter » de la page (§3.1.1) |
| En-tête (alt.) | **Retour au menu de l'entité** | `arrow-circle-left` | `CircleArrowLeft` | `navbar.tooltip.backToMenu` | à la place du « + » quand `navigateBackData.hideAddButton` (ex. contenu d'un flow) ; lien vers `navigateBackData.segments` |
| (séparateur blanc 2px) | | | | | |
| Contenu | Badge **historique d'accès** (nombre) | pastille | `Badge` | `navbar.tooltip.accessHistory` | si historique non vide |
| Contenu | **Entités** → `/explore/projects` | `folder-open` | `FolderOpen` | `navbar.tooltip.entitiesPage` | droit Projects (tous) |
| Contenu | **Bibliothèques** → `/explore/library` | `shopping-basket` | `ShoppingBasket` | `navbar.tooltip.libraryPage` | droit Library |
| Contenu | **Collaborateurs** → `/explore/collaborators` | `users` | `Users` | `navbar.tooltip.contributorPage` | droit Contributors |
| Pied (aligné bas) | **Imports de documents** (badge n, « 9+ ») | `file-import` | `FileInput` | `navbar.tooltip.uploadingDocuments` | seulement si ≥1 import dans la session |
| Pied | **Cloche événements** (badge) | `bell` | `Bell` | `navbar.tooltip.lastDocuments` | toujours |
| Pied | **Paramètres** → `/explore/settings` | `cog` | `Settings` | `navbar.tooltip.settingPage` | droit Settings |
| Pied | **Compte** (ouvre menu compte) | `user-circle` | `CircleUser` | `navbar.tooltip.profilePage` | toujours |

- Les libellés textuels sous icône (`navbar.projects` « Projets », `navbar.library`, `navbar.contributors`) existent mais sont **masqués**
  (`menuItemTitleVisible=false`). [INF] Ne pas les afficher ; tooltips à droite.
- Item : 53×38 px, radius 4px, police 1rem, marge basse .5rem ; actif/hover fond `#80a1be` (transition 100 ms).
- Badge : cercle 1.5rem bordure blanche, `top:1.375rem; right:-.3rem`, fond `#0e4f8a` ; non-lu : `#ff6b64` (imports) / `#b10b0b` (cloche).
- Implémentation [INF] : composant serveur `NavRail` (liens filtrés par droits) + îlots client (popovers, badges temps réel). Ne pas utiliser
  shadcn `Sidebar` pour le rail (largeur fixe 64px) ; possible pour le menu module.

#### 3.1.1 Bouton « Ajouter un élément » [OBS `addEntity()` dispatch global] [INF]
L'action dépend de la page (store « navigateBack/add »). Reproduire par un contexte `PageActionsContext` où chaque page enregistre
`onAdd` (ex. liste des entités → `?dialog=project/add/general-tab` ; flows → `?dialog=flow/add/general-tab`). Sans action enregistrée : bouton masqué.

#### 3.1.2 Historique d'accès [OBS `sfx-access-history-popover`, clés `navbar.tooltip.lastEntity`, `global.accessHistory`]
- 5 dernières entités ouvertes, **avec l'URL complète** (filtres du module Flows conservés). Item = icône d'entité colorée par type
  (+ pastille « œil » si archivée), nom cliquable (hover `#0d4e8a`), croix « Supprimer de l'historique ».
- Popover à droite du rail, `max-height:15rem`, `max-width:18.75rem`, en-tête gras séparé par `#c1c1c1`.
- Alimenté à chaque navigation dans un sous-module « cacheable » du dashboard (`id = <type>__<uuid>`, `entityName`, `entityType`, `status`, `url`).
- Persistance : clé localStorage préfixe `history_access_` [OBS enum `Za`]. [INF] Clé `history_access_<userId>` ; option Supabase table `user_access_history` si multi-poste.

### 3.2 Menu latéral de module (`ModuleNav`) [OBS `chunk-QMYM3GHR`]

Structure : `{ title?, titleIconName, titleIconClass, routeId, groups:[{ groupName?, checkPermission?, items:[{ id, routeId, iconName,
iconPrefix?, iconClassName?, title, segments, queryParams?, checkPermission?, isHidden(), subItems? }] }] }`.

- En-tête : icône d'entité (carré coloré 40px), titre (1rem `#17224d`, 1 ligne), sous-titre(s) `.875rem #6a768c`. Pour une entité :
  titre = désignation, sous-titre = type (« Projet », « Référentiel », …), couleur par type ; lien « retour au dossier » si l'entité
  appartient à un dossier référentiel (clés `projects.folderContent`, `projects.refSubFolder`).
- Groupes : libellé en capitales `.75rem #6a768c`, marge `1rem .5rem`, `padding-top:1rem`.
- Item : `.875rem`, padding `.5rem`, icône marge droite 1rem ; actif/hover fond `#bfd5e2`, radius `.25rem`.
- Item avec sous-items : repliable (chevron), sous-items indentés `padding-left:2rem` avec trait vertical 1px `#17224d` à `left:1rem`.
- `checkPermission:true` ⇒ item masqué si l'utilisateur n'a pas le droit Read de son `routeId`.
- Largeur : défaut **250px** (`main_menu_width`), min 250, redimensionnable par poignée ; repli → **1.85rem** ; replié + survol →
  s'ouvre en overlay à 15.62rem après 200 ms (contenu visible après 400 ms) ; état persistant `main_menu_collapsed`.
  [INF] shadcn `Sidebar` `collapsible="icon"` ne reproduit pas l'ouverture au survol : composant dédié + `resizable` (déjà installé).

#### 3.2.1 Menu d'une entité (dashboard) [OBS `chunk-DVXVX5EG` `Oe(project, orgConfig)`]

Types d'entité (enum `ProjectType`) : Projet=1, Référentiel=2, Modèle(Template)=3, PGAC=4, Dossier=5 (libellés `projects.modal.types.*`).

| # | Groupe | Item (clé `appMenu.dashboard.*`) | Icône FA → lucide | URL | Masqué si |
|---|---|---|---|---|---|
| 1 | — | **Flows** (`flows.title`) | `sitemap` rot. 270° → `Network` (`rotate-[270deg]`) | `flow-management/vue-list` | jamais |
| 1.1 | | Vue liste | `list` → `List` | `…/vue-list` | jamais |
| 1.2 | | Vue plan | `map` (far) → `Map` | `…/vue-plan?format=month` | type = Modèle |
| 1.3 | | Vue map | `map-marked-alt` → `MapPinned` | `…/vue-map` | type = Modèle **ou** `orgConfig.mapViewDisabled` |
| 1.4 | | Vue diagramme | `project-diagram` → `Workflow` | `…/vue-diagram` | `!orgConfig.diagramEnabled` ou type ∉ {Dossier, Référentiel, Projet, PGAC} |
| 2 | — | **Documents** | `file-invoice` → `FileText` | `documents` | type = Modèle |
| 3 | — | **Formulaires** | `list-alt` → `ClipboardList` | `forms` | jamais |
| 4 | — | **Référentiels** | `pencil-ruler` → `PencilRuler` | `flow-referential/vue-list` | type ∉ {Projet, PGAC} |
| 4.1 | | Vue liste | `list` → `List` | `flow-referential/vue-list` | jamais |
| 4.2 | | Vue diagramme | `project-diagram` → `Workflow` | `flow-referential/vue-diagram` | même règle que 1.4 |
| 5 | — | **Listes** | `file-alt` (far) → `File` | `lists` | type = Modèle |
| 6 | — | **Planification** | `calendar` (far) → `Calendar` | `schedule-tasks` | type ∉ {Projet, PGAC} |
| 7 | — | **Collaborateurs** | `user-friends` → `UsersRound` | `collaborators` | jamais |
| 8 | — | **Tablettes** | `tablet-alt` → `Tablet` | `tablets` | type ∈ {Modèle, Référentiel} |
| 9 | Suivi et clôture | **Avancement** | `chart-line` → `ChartLine` | `metrics` | jamais |
| 10 | | **Signatures** | `signature` → `Signature` | `signatures/vue-list/…` | type ∈ {Modèle, Référentiel} |
| 11 | | **Remontées terrain** | `comments` → `MessagesSquare` | `fields-feedback` | type ∈ {Modèle, Référentiel} |
| 12 | | **Dossier de clôture** | `archive` → `Archive` | `closing-folder` | type ∈ {Modèle, Référentiel} |
| 13 | Configuration | **Informations** | `id-card` → `IdCard` | `information` | jamais |
| 14 | | **Catégories** | `tag` → `Tag` | `categories` | jamais |

Notes : aucun item n'a `checkPermission` (droit vérifié par la garde de route + rôle projet). La vue kanban existe sans entrée de menu.
Les vues Signatures (liste / temporelle `clock`→`Clock`, tableau `table`→`Table`) sont basculées dans la page, pas dans le menu.
`orgConfig` = configuration d'organisation chargée au démarrage (`organizationConfig` dans le store) [INF : table Supabase `organization_config`].

#### 3.2.2 Menu Bibliothèque [OBS `chunk-7Y2TUQYG`] — titre « Bibliothèques », icône `shopping-basket`, classe couleur `library`

Ordre : Risques (`exclamation-triangle`→`TriangleAlert`) · Moyens (`tools`→`Wrench`) · Documents (`file-invoice`→`FileText`) ·
Formulaires (`list-alt`→`ClipboardList`) · Objets (`object-group`→`Group`, URL `object-management/list-vue`) · Etiquettes (`barcode`→`Barcode`).
Tous `checkPermission:true`. Redirection par défaut : **Formulaires**.

#### 3.2.3 Menu Collaborateurs et tablettes [OBS `chunk-MPV2TTLQ`] — icône `users`, classe `contributors`

Ordre : Utilisateurs (`user-tie`→`UserRound`) · Opérateurs (`user-astronaut`→`HardHat`) · Utilisateurs externes (`user-secret`→`VenetianMask`, check) ·
Tablettes (`tablet-alt`→`Tablet`, check) · **Appareils autorisés** (`circle-check`→`CircleCheck`, check — inséré **avant API** seulement si
`permission.authorizedMobileDevicesAccess || release.enrollMobileAuthorizedDevices`, cf. flags SFP_12172 / SFP_12350) ·
API (`key`→`KeyRound`, check) avec sous-items Accès API V1, Accès API V2. Défaut : Utilisateurs.

#### 3.2.4 Menu Paramètres [OBS `chunk-Q6NZOZAJ`] — titre « Paramètres », icône `cog`, classe `settings`

Groupe 1 (sans titre) : Compte (`building` far→`Building2`) · Carnet clients (`address-book`→`BookUser`) · Sociétés (`people-arrows`→`ArrowLeftRight`) ·
Familles (`tag`→`Tag`) · Catégories (`tags`→`Tags`) · Statuts (`flag`→`Flag`, `?type=flow`) · Références (`toolbox`→`Toolbox`) ·
Attributs (`project-diagram`→`Workflow`) · **Fichiers** (`file-code`→`FileCode`) ▸ Modèles (`sticky-note`→`StickyNote`), Cellules (`border-all`→`Grid3x3`) ·
Dossiers (`archive`→`Archive`) · Corbeille (`trash-alt`→`Trash2`) · Tâches de fond (`spinner`→`Loader`).
Groupe 2 « **Admin siteflow** » (libellé codé en dur, `checkPermission` sur `SettingsGeneralAccount` ⇒ ASF uniquement) [INF : renommer « Administration plateforme »] :
Général (`sliders-h`→`SlidersHorizontal`) ▸ Compte (`building`), Organisation (`border-all`) · Trames (`file-code`) · Suivi (`file-signature`→`FileSignature`) ·
Backups (`database`→`Database`) · Logs push (`database`) · Usage (`chart-bar`→`ChartColumn`, `?frequency=<défaut>&month=<unix maintenant>`).
Tous les items du groupe 1 ont `checkPermission` sauf Corbeille. Défaut : Compte.

#### 3.2.5 Menu Profil [OBS `chunk-VPITBZFE`] — icône `user-circle`, classe `user-account`, titre = nom de l'utilisateur [INF]
Informations (`passport`→`ContactRound`) · Mot de passe (`unlock-alt`→`LockKeyholeOpen`) · Tablette (`tablet-alt`→`Tablet`). Pas de contrôle de droit.

### 3.3 Feature flags & configuration [OBS `enums-string` `chunk-AYG77KKO`, `chunk-NUIOR7UD`]

| Flag | Effet shell observé / inféré |
|---|---|
| `sfp-9623-user-sessions-fix-enabled` | gestion des sessions utilisateur (événements de session, `nextUserSessionEventTimestamp`) [INF] |
| `sfp-12172-enable-ma-authorized-devices-access`, `sfp-12350-enroll-new-ma-authorized-devices` | affichage de « Appareils autorisés » [INF lien avec `release.enrollMobileAuthorizedDevices`] |
| `jimo-analytics` | widget nouveautés tiers [OBS] → widget interne [INF] |
| `sfp-19671-async-doc-gen` | API « moderne » des tâches de fond / génération documentaire asynchrone (cloche) [OBS `release.asyncDocumentGeneration`] |
| `sfp-20661-upload-document-template-new-way` | nouveau flux d'import de modèles (panneau imports) [INF] |
| `sfp-20978-zendesk-sync` | synchronisation centre d'aide [INF] |
| `sfp-15844-persist-table-selection` | persistance de la sélection de lignes (`SelectedFlows`) [INF] |
| `sfp-19962-validate-and-parse-formulas`, `sfp-21185-backend-formula-validation` | formules (hors shell) |
| `es-108-operation-comment`, `es-92-single-response-mode` | hors shell |

Configuration d'organisation consommée par le shell : `mapViewDisabled`, `diagramEnabled`, `webAppDisplayConfig` (formats de date), `numberFormatEnum`,
`helpCenter.active`, URL LMS, affichage Zendesk. [INF] `src/lib/flags.ts` : `isEnabled(flag, ctx)` lisant une table Supabase `feature_flags`
(+ override env), exposé via un provider client.

### 3.4 Modèle de permissions [OBS `chunk-HCYDDSAJ` `PermissionService`, `allPermissions`]

- **Autorités** utilisateur (globales) : enum ci-dessus (16 valeurs).
- **Rôles projet** : ReadOnly=1, Operator=2, Writer=3, Expert=4, Responsible=5 (portés par `currentUserRoles` de l'entité).
- **Actions** : Read, Edit, Delete, Duplicate, Archive, Export, Download, Publish, Share, Add, Unlock, Unlink, Restore, View, EditStatus,
  ControlDiffusion, … (selon l'écran).
- **Matrice** `routeId → action → { rights?: Authority[], roles?: ProjectRole[], forbidden?: Authority[] }` (≈180 entrées).
- `checkUserRight(routeId, action=Read)` : refus si intersection avec `forbidden` ; sinon accès si `rights` vide/absent ou intersecte les autorités.
- `checkUserRole(routeId, projectUuid, action)` : refus si `forbidden` ; si `roles` défini **et** l'utilisateur a des rôles sur ce projet ⇒
  décision sur les rôles uniquement ; sinon décision sur `rights` ; sinon refus.
- Directive `sfxUserRight` = rendu conditionnel ; action non autorisée ⇒ toast Warning « Droit et Rôle ».

[INF] Port TypeScript : `src/lib/permissions/{matrix.ts,check.ts}` (matrice générée à partir de `docs/reverse` puis maintenue à la main),
`<Can routeId action projectId?>` (client) et `requireRouteAccess()` (serveur). **La sécurité réelle reste côté Supabase (RLS)** ;
la matrice ne sert qu'à l'UI.

---

## 4. Fil d'Ariane [OBS `sfx-breadcrumb` + map `aq`]

- Construit depuis la chaîne des routes ayant `data.breadCrumb:true` ; libellé = `breadcrumb.*` par `routeId` (défaut « Unknown »),
  ou sélecteur dynamique (nom de l'entité, du flow) ; icône = carré d'entité 22px (`--font-size:.75rem`) coloré par classe (`entities`,
  `library`, `contributors`, `settings`, `user-account`, type d'entité).
- Style : `display:flex; padding:1rem 0; font-size:.875rem` ; libellé `#6a768c`, hover souligné `#8690a3` ; dernier élément non cliquable ;
  séparateur avec padding `0 .5rem` ; chaque crumb `max-width:20rem` tronqué.
- Exceptions : `ProjectFolder` sans breadcrumb propre ; masqué en « vue séquence » du contenu de flow.
- [INF] Implémentation : chaque `layout.tsx`/`page.tsx` exporte un `routeId` ; `RouteMetaProvider` (client) empile `{routeId, label?, href, iconClass}`
  via `useSelectedLayoutSegments()` + registre `routeMeta.ts` (libellé/icône/permission par routeId). Rendu avec shadcn `Breadcrumb`.

---

## 5. Composants transverses

### 5.1 Listes / tableaux (`DataTable`) [OBS `chunk-GKGICMNZ`, `chunk-3HWGCDDP`, styles globaux, clés `global.table.*`, `customizeColumns.*`]

| Aspect | Comportement observé | Reconstruction [INF] |
|---|---|---|
| Moteur | CDK table (`display:table`), en-tête sticky `top:0 z-200` | TanStack Table v8 + shadcn `Table` |
| Densité | cellule `height:4rem`, padding `.25rem 1rem` ; colonnes sélection/collapse 2rem, padding `.25rem .5rem` | idem (`h-16`) |
| En-tête | `.9rem`, gras 600, `#6a768c`, fond blanc, bordure basse 2px `#eaecf0`, nowrap | |
| Cellule | texte `#17224d`, bordure basse 1px `#f7f8f9` ; coins de ligne arrondis `.3125rem` | |
| Survol | ligne `#f7f8f9` | `hover:bg-row-hover` |
| **Dernier élément ouvert** | classe `focus` → fond `#d9e7ef` (ex. `focusedFlow` après fermeture d'une modale/retour) | stocker `lastFocusedId` par `tableId` (state + sessionStorage) et l'appliquer |
| Lien principal | hover souligné (cellule désignation) | |
| **Colonne Actions figée** | `.sticky-cell{position:sticky; right:0; z-index:200; background:#fff}` largeur 6.75rem, alignée à droite ; si scroll horizontal (`has-horizontal-scroll`) pseudo-élément gauche 8px `linear-gradient(to right, transparent, rgba(0,0,0,.16))` | idem via `ResizeObserver` (scrollWidth > clientWidth) |
| Actions de ligne | icônes `#162b4d` 1rem espacées .75rem ; menu « … » | `DropdownMenu` |
| Redimensionnement | directive `sfxResizeTableColumn` + `sfx-resize-handler` (1px, `#c5c5c5`) ; largeurs persistées `table_column_widths` (par `tableId`) ; colonne date repliable (`collapseDateColumn`, `dateColumnWidth`) | `columnResizeMode:"onChange"` + localStorage |
| Personnalisation colonnes | modale-route `customize-columns` : afficher/masquer/réordonner, **max 30 colonnes**, confirmation « vos paramètres seront enregistrés dans le cache de navigateur », Réinitialiser ; clés `columns_configurations` (flows), `project_columns_configurations` (entités) | modale + localStorage (try/catch) ; option : table `user_preferences` |
| Tri | query params `sortBy` + `direction` | URL-state |
| Arborescence | lignes enfants indentées 1.25rem/niveau (jusqu'à 40), caret, « Charger plus d'éléments » (`suitcase-rolling`) | `getSubRows` + lazy children |
| Réorganisation | drag & drop (`cdk-drag`, cellule poignée `cursor:move`) dans une modale « reorganize » | dnd-kit |
| Sélection | case 2rem ; « Sélectionner tout » (visibles) / sélection **totale** (visibles + non visibles) / « Effacer la sélection » ; limite `Sélection limitée à {limit} éléments` ; compteur `{count} élément(s) sélectionné(s)` ; toasts quand la recherche annule une sélection en masse | idem ; persistance optionnelle (flag 15844) |
| Pagination | API `…/lazy` (page, `totalCount`, `totalCountFiltered`) ; chargement incrémental au scroll (rowHeight 64) ; sous-titre `{current} élément(s) / {total} au total` | `useInfiniteQuery` + `IntersectionObserver` ; RPC Supabase `range()` + `count:'exact'` |
| Chargement | squelettes shimmer (`#eee → #ddd`, 1 s), placeholders `#dadde0` h 4rem ; voile `#bababa42` | shadcn `Skeleton` |
| Vide | `sfx-empty-content` (§5.9) | shadcn `Empty` |

Barre de filtres (au-dessus de la liste) : champ de recherche (`textSearch`, placeholder `global.filter.searchPlaceholder` « Rechercher »,
icône à gauche ; bordure primaire quand filtre actif `filter-active`), filtres à facettes (Famille, Statut, Applicabilité, Type, Etat
Actif/Inactif…), filtre par date (`global.dateFilter.*` : choix du champ date, intervalle, préremplissages Journée/Semaine/Mois en cours,
suivant(e), dernier mois…), boutons « Effacer le(s) filtre(s) » / « … et le(s) tri(s) » / « … et la sélection ». Filtres en query params
(partageables, conservés dans l'historique d'accès) + clé localStorage `filters`.

### 5.2 Recherche avancée [OBS `chunk-Q5VOPTOB`, `chunk-BKHSN4IO`, clés `advancedSearch.*`, enum champs flows]

- Panneau « Recherche avancée » : lignes **Champ / Action / Valeur(s)**, « Ajouter un autre critère de recherche », valeurs multiples liées par
  « ou » (« Ajouter une valeur possible »), boutons Réinitialiser / Fermer / Rechercher ; champ requis.
- Opérateurs : `CONTAINS` Contient, `STARTS_WITH` Commence par, `EQUALS` Égal, `NOT_EQUALS` Différent de, `GREATER_THAN_OR_EQUALS` Supérieur ou égal à,
  `LESS_THAN_OR_EQUALS` Inférieur ou égal à, `BETWEEN` Compris entre, `NOT_BETWEEN` Non compris entre, `EMPTY` Est vide, `NOT_EMPTY` N'est pas vide,
  `SEARCH`, `INTERSECT` / `NOT_INTERSECT` (listes : Égal / Différent de) ; dates : `CurrentDay`, `CurrentWeek`, `CurrentMonth`.
- Champs (flows) : Type de flow, Nom, Référence (chrono), Description, Famille, Catégorie, Statut, Rapporteur, Responsable, Collaborateur(s),
  Tablettes 1-3, dates prévues/planifiées/réalisées/modification, surveillants internes/externes 1-3, Site, Tranche, Local, Système élémentaire,
  Repère fonctionnel, Objet, attributs personnalisés (texte, nombre, booléen Vrai/Faux, date, liste, multi-liste, lien), Référence dossier,
  Planification, Référentiel, Affectation, Etiquette.
- Sérialisée dans `advancedSearch` (URL) ; endpoint dédié + compteur.
- [INF] Composant générique `AdvancedSearch<TField>` paramétré par un descripteur de champs (type → opérateurs autorisés) ; traduction en filtres
  PostgREST côté serveur (`ilike`, `gte/lte`, `is null`, `cs/ov` pour les listes).

### 5.3 Toasts [OBS `sfx-toaster` `chunk-HCYDDSAJ`]

- Types : `default`, `success`, `error`, `info`, `warning`, `bug` (enum Info=1, Warning=2, Error=3, Note=4, Success=5 ; libellés `toaster.types.*`).
- Position **haut-droite**, 16px du bord, empilés verticalement (marge 1rem) ; largeur min 25rem ; **durée 5 s** ; fondu entrée 300 ms / sortie 500 ms.
- Carte : hauteur min 84px ; barre gauche 7px (radius 4px 0 0 4px) ; fond blanc, bordure `#e6eaf1`, ombre `0 3px 6px #00000029` ; pastille icône ronde 40px ;
  titre gras 1rem ; sous-titre `.875rem #596d86` (peut contenir HTML) ; croix de fermeture `#17224d` 1.375rem.

| Type | Barre & pastille (fond) | Texte/icône |
|---|---|---|
| default | `#dcdfe4` | `#162b4d` |
| success | `#cce6ce` | `#008109` |
| error / bug | `#eececd` | `#ac0907` |
| info | `#d0dae5` | `#1f5086` |
| warning | `#f7e2d0` | `#d76e13` |

[INF] shadcn `sonner` (déjà installé) avec `position="top-right"`, `duration={5000}`, `toast.custom()` rendant `<AppToast type title subtitle/>`.
Helper `notify.success(t('global.toaster.success'))`. Erreur générique : « Oups ! Une erreur est survenue ! » (`global.errorToaster.error.Title`).

### 5.4 Modales à onglets (`ModalShell`) [OBS `sfx-modal`, `sfx-header-modal`, `sfx-tab-set`]

- Conteneur : fond blanc, radius `.313rem`, bordure `#eaecf0`, hauteur 100 % de la taille de config.
- **En-tête** (padding `1rem 2rem`) : icône d'entité 24px (couleur par contexte), titre 1.25rem `#17224d`, sous-titre `.875rem #afb9c5` positionné
  sous le titre (+ icône info optionnelle), icône d'aide « ? » `#6a768c` (`showHelpIcon`, défaut vrai) ; à droite : flèches **précédent/suivant**
  (navigation entre éléments de la liste sans fermer, tooltips dédiés) et fermeture ; slot d'en-tête secondaire 2.75rem.
- **Onglets** : `padding:1rem 2rem`, `.875rem` gras, `#81a2bf` ; actif `#0e4f8a` + soulignement 2px ; contenu `padding:.5rem 2rem`, scroll Y.
  Onglets = segments d'URL (`general-tab`, `attribute-tab`, `options-tab`, `import-tab`, `content-tab`) ; certains n'existent qu'en édition
  (ex. entité : création = Général seul ; édition = Général, Attributs, Options).
- Pied : boutons Annuler / Sauvegarder (`global.action.*`). [INF] boutons alignés à droite.
- Garde « modifications non sauvegardées » (`canDeactivate` sur modales et pages) → boîte de confirmation (`ChangesConfirmationDialog`). [INF] `beforeunload` + interception des liens internes.
- Confirmations destructives **par saisie** : « Ecrire « SUPPRIMER » pour confirmer » (variantes DESACTIVER, EDITER, METTRE A JOUR, REMPLACER, REINITIALISER, REVENIR — `global.alert.*.confirm.*`). [INF] `TypeToConfirmDialog` sur `AlertDialog`.

### 5.5 Cloche d'événements (tâches de fond / génération documentaire) [OBS `sfx-background-task-bell`, `chunk-NUIOR7UD`]

- Badge = tâches en cours + non lues (`9+` au-delà de 9) ; rouge `#b10b0b` s'il y a des non-lus.
- Popover haut-droite, min-height 30rem, titre « Evénement » (`documentEvent.title`) ; vide : « Aucun document généré sur la session en cours ».
- Item (`sfx-document-event-item`, hauteur 5.5rem) : titre 1 ligne (tooltip), sous-titre avec icône dossier (entité), **statut** (carré coloré 1rem + libellé)
  et date ; non-lu surligné ; actions (téléchargement) dans un slot ; squelettes pendant le chargement.
- Statuts : Acknowledged → « En attente », InProgress (+`TO_RETRY`) → « En cours », Done → « Terminé », Error → « Erreur » (`global.status.*`).
- Polling : découverte des tâches en cours toutes les 60 s ; puis sondage rapide des statuts des tâches récentes et lent pour les anciennes
  (fenêtre « fast »/intervalle « slow » configurables) ; à la fermeture du popover, les éléments listés passent « lus ». Liste suivie persistée `background_tasks_poll_items`.
- [INF] Table Supabase `background_tasks` + **Realtime** (canal `postgres_changes` filtré sur `user_id`) à la place du polling ; garder le
  polling 60 s en repli. Téléchargement via URL signée Storage.

### 5.6 Panneau « Import de documents » [OBS navbar `navbar-upload-event`, `sfx-document-upload-events-popover`]

- Item visible seulement si au moins un import a eu lieu dans la session ; badge = nombre (9+) ; rouge `#ff6b64` si un import terminé/échoué non lu.
- Popover haut-droite, min-height 30rem, titre « Import de documents » ; ouverture = tout marquer lu ; se ferme automatiquement si la liste se vide.
- Items identiques à §5.5 (titre fichier, entité, statut, date). Tooltip de fichier en cours : « Fichier en cours d'import ».
- Limite : PDF 20 Mo (`global.errorToaster.error.uploadSize`), logos 2 Mo.
- [INF] Store client (zustand ou contexte) alimenté par les uploads Supabase Storage (`upload` avec suivi de progression via `XMLHttpRequest`/tus).

### 5.7 Menu compte (popover) [OBS `sfx-account-menu`]

Ouvert depuis l'icône compte du rail, position haut-droite, sans flèche. Contenu :
1. Bloc utilisateur : icône `user-account` (orange), « Prénom Nom », nom de la société (1 ligne).
2. Séparateur. **Profil** (`user`→`User`) → `/explore/profile`.
3. **Connexion rapide** (`qrcode`→`QrCode`) → modale `quick-connection/<userUuid>` (QR code pour lier une tablette).
4. Si centre d'aide actif : **Centre d'aide** (`book`→`BookOpen`), **Discutez avec nous** (`comment-alt`→`MessageSquare`, chat support).
5. Si URL LMS configurée : **Formation LMS** (`user-graduate`→`GraduationCap`, nouvel onglet).
6. Séparateur. **Conditions et politiques** (lien traduit `profile.menu.term.link`, nouvel onglet) ; ligne grisée « {{APP_NAME}} WebApp {version} ».
7. Séparateur. **Déconnexion** (`sign-out-alt`→`LogOut`) : mémorise la dernière page puis redirige vers `/auth`.

Clés présentes mais non rendues ici : `profile.menu.news` « Nouveautés », `profile.menu.unreadNews` « {{unread}} non lu(s) », `profile.menu.videos`
« Tutoriel vidéo » [INF : à ajouter si un widget de nouveautés/vidéos est réalisé]. [INF] shadcn `Popover` (ou `DropdownMenu`) `side="right" align="end"`.

### 5.8 Langue & sélecteur de compte

- **Langue** : pas de popover de langue observé dans le shell. La langue est un champ du profil (`profile.language`, Informations) ;
  langues utilisateur supportées en/fr/de/it (`SupportedLanguage`), traductions UI livrées : fr et en. Langue initiale du store `en`, puis celle du profil.
  [INF] Select de langue dans Profil › Informations (écrit `profiles.language` + cookie `NEXT_LOCALE` puis `router.refresh()`) ;
  petit popover de langue (icône `Languages`) **uniquement sur les pages `(auth)`** si souhaité.
- **Applicabilité** (sous-compte / organisation) : pas de sélecteur global dans le shell. C'est un attribut des données (utilisateurs, documents,
  moyens, étiquettes, accès API…) avec filtre « Applicabilité » dans les listes et une modale « Déplacer » (`contributors.modals.moveApplicability.*`).
  L'utilisateur est rattaché à une applicabilité (`userData.applicability.name`, transmise à l'analytics). [INF] Composant `ApplicabilitySelect`
  (arbre) réutilisable dans les filtres/formulaires ; pas de switcher global en V1.

### 5.9 États vides [OBS `sfx-empty-content` `chunk-JZ564SF2`]

Centré, illustration 16×14rem, commentaire (« Aucun élément dans la liste ») + sous-commentaire (« Créez un élément ou revoyez vos filtres »,
variantes import/réorganisation/bloc/sélecteur : `global.empty*`, `global.sfxSelect.*`, `global.select-v2.*`), slot d'actions (boutons).
Version compacte dans les popovers (image 8rem, sans commentaire). [INF] shadcn `Empty` + illustrations SVG neutres maison.

### 5.10 Page 404 [OBS `chunk-G6JYDKCX`]

Plein écran (sans shell), fond primaire `#0d4e8a` + image de fond (CDN), contenu aligné en bas au centre, bouton « Back to the homepage »
(texte codé en dur en anglais) → `/explore/projects`. Toute route inconnue → `/404` ; dans un module, route inconnue → page par défaut du module ;
entité introuvable (HTTP 404) → `/404` ; 403/400 → toast « projects.loadFail » puis retour à la liste.
[INF] `app/not-found.tsx` + clé i18n `global.notFound.back` (à créer), illustration neutre.

### 5.11 Centre d'aide [OBS `chunk-H4ASUGZY`, clés `global.help*`, `global.videoTutorial.*`]

- Lien externe vers une base d'articles + widget de chat ; icône « ? » dans les en-têtes de modale ; tooltips vidéo par écran
  (`global.videoTutorial.<écran>.<sujet>`) ; repli « Aucun article de visible pour le moment, nous travaillons dessus ! ».
- [INF] Route interne `/explore/help` (ou panneau `Sheet` latéral) alimentée par `docs/reverse/helpcenter/*` réécrits (23 articles), avec
  recherche ; `HelpButton` contextualisé par `routeId`. Aucune marque/URL tierce.

### 5.12 Divers

- **Tooltip** : fond noir, texte `#f8f8f2`, `.875rem`, padding `.1875rem .5rem`, radius `.25rem`, max-width 25vw ; position préférée à droite dans le rail.
- **Popover** générique : bordure `#c1c1c1`, sans ombre pour les popovers du rail, fermeture clic extérieur/Échap.
- **Menu contextuel texte** (`customMenu.*`) : Copier/Couper/Coller + **caractères spéciaux** (α β Δ Φ ≠ ≤ ≥ ± × ÷ ½ ¼ ¾ µ Ω π ρ σ ∑ ² ³ flèches).
  [INF] shadcn `ContextMenu` sur les champs texte riches.
- **Statut** (`sfx-status`) : carré 1rem radius 2px coloré + libellé. **Chips** colorées (§6.3).

---

## 6. Design tokens

### 6.1 Couleurs observées (fréquence dans le bundle + rôle)

| Rôle | Valeur | Source |
|---|---|---|
| Primaire (rail, boutons pleins, focus, liens actifs) | `#0d4e8a` (var. `#0e4f8a`, `#0f4f8a`) | navbar, `sfx-button.solid`, inputs focus, Material tokens |
| Primaire foncé / hover bouton plein / texte principal | `#17224d` | boutons, cellules, titres |
| Texte secondaire bleu nuit | `#162b4d` | actions de ligne, toast default |
| Texte atténué | `#6a768c` | en-têtes de table, breadcrumb, groupes de menu |
| Texte tertiaire / désactivé / placeholder | `#afb9c5` | inputs, sous-titres de modale |
| Texte gris-bleu | `#596d86` | sous-titres de toast |
| Fond de menu latéral / muted | `#f4f5f7` | navigation menu, disabled bg |
| Fond secondaire (bouton « outlined », input) | `#f1f2f3` (hover `#f1f3f6`, actif `#e6eaf1`) | bouton, input |
| Bordures | `#eaecf0` (tables, modales), `#e6eaf1` (inputs), `#c1c1c1` (popovers), `#d3d4d9` (input blanc) | |
| Survol de ligne | `#f7f8f9` | tables |
| Ligne focus / dernier sélectionné | `#d9e7ef` | tables |
| Item de menu actif/hover | `#bfd5e2` | navigation menu |
| Hover rail | `#80a1be` | navbar |
| Onglet inactif | `#81a2bf` | tab-set |
| Danger | `#b10b0b` (liens `#810808`) | inputs error, badge |
| Succès | `#326202` (toast `#008109`, état « terminé » `#04cb00`) | inputs success |
| Avertissement | `#ffac49` (toast `#d76e13`, « en cours » `#ff862e`) | inputs warning |
| Info | `#1f5086` | toasts, liens |
| Squelette | `#dadde0`, shimmer `#eee/#ddd` | |

Couleurs **par type d'entité / module** (icône : texte sur fond) [OBS `sfx-entity-icon`] :
Projet `#e46c0b / #fbcca7` · Référentiel & dossier `#b171c9 / #dabbe5` · Modèle `#36b37e / #b3e8d2` · PGAC `#ffaa01 / #ffe6b4` ·
Entités/défaut `#fff / #0d4e8a` · Bibliothèque `#db7663 / #eebfb6` · Paramètres `#4dbeff / #b3e3ff` · Collaborateurs `#8976ff / #e1dcff` ·
Compte utilisateur `#ffac49 / #ffdbaf` · Signature `#fff / #162b4d` · Révision `#fff / #fe8c25` · Documents d'entité `#ff6b63 / #ffccc9` · Danger `#fff / #b10b0b`.
Chips supplémentaires : blue-pigment `#3b3b98/#a8a8dd`, sage `#bdc581/#e2e5c7`, blue-clair `#81a2bf/#c5d4e1`, primary `#0d4e8a/#a0cdf6`,
light-blue `#4dbeff/#b3e3ff`, error `#b10b0b/#f77878`, light-grey `#afb9c5/#eaedf0`, form-model `#7f9bd7/#cdd8ef`, form-local `#bdc980/#e2e7c8`,
form-generic `#ee965d/#f8d2b9`, provenance-library `#ff6b63/#ffccc9`.

### 6.2 Typographie, rayons, densité [OBS]

- Police : **Roboto** (Regular majoritaire ; Medium/Bold ponctuels) ; corps 1rem / line-height 1.5 ; UI dense en **.875rem** (taille la plus fréquente) ;
  en-têtes de table .9rem/600 ; titres de modale 1.25rem ; libellés de groupe .75rem uppercase ; `h2` 18px ; icônes FA 1rem.
  [INF] `next/font/google` `Roboto({ subsets:['latin'], weight:['300','400','500','700'], variable:'--font-sans' })` en remplacement de Geist.
- Rayons : boutons `.375rem` (6px), inputs 5px, items de menu/badges 4px (`.25rem`), modales `.313rem`, cartes de toast 4px ; fréquents `.5rem`.
- Hauteurs : bouton 2.125rem (34px), petit 1.875rem ; input 34px ; ligne de table 4rem ; rail 4rem ; menu 250px.
- Boutons (`sfx-button`) : variantes `solid` (primaire), `outlined` (fond `#f1f2f3`), `outline` (bord primaire, hover plein), `ghost`, `radio-button`
  (sélectionné `#bfd5e2` bord `#416f99`), liens `sfx-link-primary|danger`, ghosts colorés par type d'entité ; texte `.875rem`, padding `0 .5rem`.
- Ombres : page `0 3px 6px #00000029` ; menus déroulants Material `0 5px 5px -3px #0003, 0 8px 10px 1px #00000024, 0 3px 14px 2px #0000001f`.
- Pas de mode sombre observé.

### 6.3 Thème shadcn proposé [INF] (`src/app/globals.css`)

```css
:root {
  --radius: 0.375rem;                     /* 6px : boutons ; sm=4px, md=5px (inputs) */
  --background: #ffffff;
  --foreground: #17224d;
  --card: #ffffff;            --card-foreground: #17224d;
  --popover: #ffffff;         --popover-foreground: #17224d;
  --primary: #0d4e8a;         --primary-foreground: #ffffff;
  --secondary: #f1f2f3;       --secondary-foreground: #17224d;
  --muted: #f4f5f7;           --muted-foreground: #6a768c;
  --accent: #bfd5e2;          --accent-foreground: #17224d;
  --destructive: #b10b0b;
  --border: #eaecf0;
  --input: #e6eaf1;
  --ring: #0d4e8a;
  --chart-1: #0d4e8a; --chart-2: #e46c0b; --chart-3: #36b37e; --chart-4: #ffaa01; --chart-5: #b171c9;
  /* menu latéral de module */
  --sidebar: #f4f5f7;         --sidebar-foreground: #17224d;
  --sidebar-primary: #0d4e8a; --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #bfd5e2;  --sidebar-accent-foreground: #17224d;
  --sidebar-border: #eaecf0;  --sidebar-ring: #0d4e8a;
  /* tokens applicatifs */
  --rail: #0d4e8a; --rail-foreground: #ffffff; --rail-hover: #80a1be;
  --primary-hover: #17224d;
  --text-subtle: #afb9c5; --text-muted-2: #596d86; --heading-navy: #162b4d;
  --input-bg: #f1f2f3; --input-bg-hover: #f2f3f7;
  --row-hover: #f7f8f9; --row-focus: #d9e7ef; --table-head: #6a768c;
  --skeleton: #dadde0; --popover-border: #c1c1c1;
  --success: #326202; --warning: #ffac49; --info: #1f5086;
  --toast-success-bg: #cce6ce; --toast-success-fg: #008109;
  --toast-error-bg: #eececd;   --toast-error-fg: #ac0907;
  --toast-info-bg: #d0dae5;    --toast-info-fg: #1f5086;
  --toast-warning-bg: #f7e2d0; --toast-warning-fg: #d76e13;
  --toast-default-bg: #dcdfe4; --toast-default-fg: #162b4d;
  --entity-project: #e46c0b;      --entity-project-bg: #fbcca7;
  --entity-referential: #b171c9;  --entity-referential-bg: #dabbe5;
  --entity-template: #36b37e;     --entity-template-bg: #b3e8d2;
  --entity-pgac: #ffaa01;         --entity-pgac-bg: #ffe6b4;
  --module-library: #db7663;      --module-library-bg: #eebfb6;
  --module-settings: #4dbeff;     --module-settings-bg: #b3e3ff;
  --module-contributors: #8976ff; --module-contributors-bg: #e1dcff;
  --module-account: #ffac49;      --module-account-bg: #ffdbaf;
}
@theme inline {
  --color-rail: var(--rail); --color-rail-foreground: var(--rail-foreground); --color-rail-hover: var(--rail-hover);
  --color-row-hover: var(--row-hover); --color-row-focus: var(--row-focus); --color-table-head: var(--table-head);
  --color-success: var(--success); --color-warning: var(--warning); --color-info: var(--info);
  --color-subtle: var(--text-subtle); --color-input-bg: var(--input-bg);
  --color-entity-project: var(--entity-project); --color-entity-project-bg: var(--entity-project-bg);
  /* … idem pour referential / template / pgac / module-* / toast-* */
  --text-ui: 0.875rem;            /* taille UI par défaut */
}
```

Ajustements de composants shadcn [INF] : `Button` default = primaire avec `hover:bg-[--primary-hover] hover:text-subtle`, `secondary` = « outlined »,
taille par défaut `h-[2.125rem] text-sm px-2`, `sm` = `h-[1.875rem]` ; `Input` = `bg-input-bg border-input h-[34px] rounded-[5px] text-sm`
focus `border-primary` sans ring large ; `Tabs` variante « line » (couleurs §5.4) ; `Table` densité §5.1 ; `Tooltip` noir.
Composant `EntityIcon({ kind, size })` (carré arrondi 4px, 40/24/22px) pour menus, breadcrumb, modales, historique.

---

## 7. Internationalisation

### 7.1 Observé
- Fichiers de traduction **plats** (`"clé.avec.points": "valeur"`), 12 186 clés, fr et en strictement alignés (1 526 valeurs identiques).
- Namespaces principaux : `flowApp` (2 464), `flows` (912), `global` (901), `blocks` (813), `document`, `flowContentNavigation`, `forms`,
  `riskLibrary`, `questions`, `projects`, `users`, … ; shell : `appMenu`, `navbar`, `breadcrumb`, `profile.menu`, `toaster`, `customMenu`,
  `customizeColumns`, `advancedSearch`, `documentEvent`, `documentUploadEvent`, `health` (page diagnostics, non routée).
- Interpolation ngx-translate `{{ var }}` (661 valeurs) ; **HTML** inline (`<strong>`, `<br>`, `<a>`) dans 296 valeurs ; pluriels écrits « (s) » (≈420) ;
  **139 conflits** clé-feuille/préfixe (ex. `global.dateFilter.fromTo` et `global.dateFilter.fromTo.placeholder`).
- Libellés codés en dur hors i18n : « Admin siteflow » (groupe de menu), « Back to the homepage » (404), « Siteflow WebApp {version} ».
- Langues utilisateur : en, fr, de, it ; langues d'export de documents (Langue 1/2…) distinctes de la langue UI.

### 7.2 Recommandations next-intl [INF]
- Déjà en place : `src/i18n/config.ts` (`fr` défaut, `en`), cookie `NEXT_LOCALE`, `timeZone: "Europe/Paris"`, **sans préfixe de locale dans l'URL**
  (cohérent avec l'original). Garder.
- Script `scripts/i18n/convert.ts` (lecture seule de `docs/reverse/i18n-*.json`) qui produit `messages/{fr,en}.json` **imbriqués** :
  1. dépliage des points ; 2. conflits feuille/préfixe → la feuille devient `<clé>._` (et l'appel `t('x._')`), liste versionnée ;
  3. `{{ var }}` → `{var}` ; 4. échappement ICU des `{`/`}` littéraux et des apostrophes ASCII précédant une accolade ;
  5. HTML → balises riches next-intl (`<strong>…</strong>` conservé, `<br>` → `<br></br>`, liens → `<link>…</link>`) et rendu via `t.rich`/`t.markup` ;
  6. remplacement des termes de marque par `{appName}` ; 7. ne migrer que les namespaces nécessaires à chaque lot (chargement par namespace).
- Pluriels : convertir progressivement « élément(s) » → `{count, plural, =0 {…} one {# élément} other {# éléments}}`.
- Typage : `declare module 'next-intl' { interface AppConfig { Messages: typeof fr } }` pour l'autocomplétion des clés.
- Libellés de menu : stocker la **clé** dans les définitions de menu (`appMenu.dashboard.flows.title`), traduire au rendu.

### 7.3 Formats [OBS clés localStorage `sfx_date_format`, `sfx_date-time-format`, `sfx_time_format`, `sfx_sensitive_date_time_format`,
`sfx_event_date_time_format`, `sfx_external_signature_date_time_format`, `number_format`]
- Défauts : date `DD/MM/YYYY`, date-heure `DD/MM/YYYY HH:mm`, heure `HH:mm` ; événements `DD/MM/YYYY [à] HH:mm` ; longs `dddd D MMMM YYYY`,
  `DD MMMM YYYY`, `MMMM YYYY` ; ISO pour l'API (`YYYY-MM-DDTHH:mm:ssZ`). Les formats viennent de la config d'organisation (`webAppDisplayConfig`)
  puis sont recopiés en localStorage.
- Nombres : réglage **organisation** FR `12 345,67` (séparateur décimal `,`) ou EN `12,345.67` (`.`), indépendant de la langue UI.
- [INF] `getRequestConfig` renvoie `formats` construits depuis la config d'organisation (`dateTime.short = {day:'2-digit',month:'2-digit',year:'numeric'}`,
  `dateTime.withTime`, `number.decimal`), et un helper `formatNumber(value, orgFormat)` qui force `fr-FR` ou `en-US` selon `numberFormat`
  (et non selon la locale UI). Dates : `useFormatter().dateTime(d, 'short')` ; pas de dayjs nécessaire hors parsing.

---

## 8. Persistance locale (localStorage) [OBS enum `Za`]

| Clé d'origine | Usage | Reprise [INF] |
|---|---|---|
| `main_menu_collapsed`, `main_menu_width` | menu de module replié / largeur | oui |
| `flow_menu_collapsed`, `flow_menu_width`, `form_menu_collapsed`, `form_menu_width`, `side_menu_view` | menus du contenu de flow / éditeur de formulaire | oui (specs dédiées) |
| `columns_configurations`, `project_columns_configurations`, `table_column_widths`, `collapseDateColumn`, `dateColumnWidth` | colonnes de tables | oui |
| `filters`, `SelectedFlowFilter`, `SelectedFlows` | filtres / sélection persistée | oui (flag 15844) |
| `history_access_*` | historique des 5 entités | oui |
| `step_*`, `flow_*` (LastBlockVisited/LastStepVisited) | reprise de navigation dans un flow | oui |
| `background_tasks_poll_items` | tâches suivies par la cloche | remplacé par Realtime |
| `currentLang` | langue | cookie `NEXT_LOCALE` |
| `authenticationToken`, `sessionAuthenticationToken`, `refresh-token`, `oauth2`, `auth-state-control` | session | **non** : cookies Supabase SSR |
| `sfx_*_format`, `number_format` | formats | dérivés de la config org côté serveur |
| `gojs_diagram`, `block_copy_paste`, `CopyPastePGAC` | diagramme / presse-papiers | specs dédiées |

Toujours encapsuler les accès dans `try/catch` (`src/lib/storage.ts`), préfixer par l'ID utilisateur pour les préférences.

---

## 9. Découpage d'implémentation [INF]

1. `globals.css` (tokens §6.3) + police Roboto + `EntityIcon`, `AppToast`.
2. `src/lib/permissions/*`, `src/lib/routes/route-meta.ts` (routeId → path, libellé, icône, permission), `src/lib/menus/*.ts` (définitions §3).
3. `(app)/explore/layout.tsx` : `NavRail`, `PageWrapper`, `Breadcrumb`, `ModalHost`, `PageActionsContext`.
4. `ModuleNav` (repli/survol/redimensionnement) + layouts de modules + redirections par défaut.
5. Popovers : historique, imports, cloche (Realtime), menu compte.
6. `DataTable` + barre de filtres + personnalisation de colonnes + recherche avancée.
7. `not-found.tsx`, états vides, script i18n.

---

## 10. Incertitudes

1. **Paramètre de modale** : la syntaxe `?dialog=…` est un choix de reconstruction ; à valider (impact deep-links existants `(modals:…)` — prévoir
   une réécriture de compatibilité dans `proxy.ts` si d'anciens liens circulent).
2. **Action du bouton « + » du rail** : le dispatch est global ; le comportement exact par page n'a pas été tracé (seule la liste des entités et les flows sont probables).
3. **Contenu de `navigateBackData`** (quand le « + » devient « retour au menu ») : observé pour le contenu de flow ; autres cas non vérifiés.
4. **Origine de `mapViewDisabled` / `diagramEnabled`** : second argument du menu d'entité, supposé = configuration d'organisation.
5. **Lien flags ↔ appareils autorisés** : la condition observée porte sur `permission.authorizedMobileDevicesAccess || release.enrollMobileAuthorizedDevices` ;
   le rattachement exact aux flags SFP_12172/12350 est inféré.
6. **Sémantique de `checkUserRole`** : lorsque l'utilisateur possède un rôle sur l'entité, les autorités globales (admins) ne semblent plus évaluées ;
   à confirmer par test fonctionnel avant de reproduire tel quel.
7. **Taille de page** des endpoints `lazy` et seuils de chargement incrémental non extraits (rowHeight 64 observé).
8. **Persistance de l'historique d'accès** : clé `history_access_` observée, suffixe (ID utilisateur ?) et éventuelle synchro serveur non confirmés.
9. **Libellé de breadcrumb du dashboard** (`breadcrumb.dashboard.title` = « Project détails ») probablement remplacé par la désignation de l'entité via sélecteur.
10. **Popover de langue et sélecteur de compte (applicabilité)** : non observés dans le shell ; propositions §5.8 à arbitrer.
11. **Contenu exact des popovers d'aide** (articles contextuels par écran) et du widget nouveautés : non tracé (dépendance tierce).
12. **Page « Diagnostics »** (`health.*`) et item « Modules » (`appMenu.settings.modules`) : libellés présents, aucune route/menu actifs observés.
13. **Kanban** : route + permission existent sans entrée de menu — accès possible par un sélecteur de vue dans la page Flows (non vérifié).
14. Les valeurs de couleurs proviennent des styles compilés ; certaines (Material `#1a1b1f`, `#343dff`, `#ba1a1a`) sont des valeurs par défaut de
    composants tiers peu visibles et ont été **écartées** du thème.
15. Le groupe « Admin siteflow » et le texte « WebApp {version} » portent le nom de marque : à neutraliser (`{{APP_NAME}}`).
