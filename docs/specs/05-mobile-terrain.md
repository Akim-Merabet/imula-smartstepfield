# Spec fonctionnelle 05 — Application mobile terrain (MobileApp)

> Reconstruction **fonctionnelle** de l'application mobile terrain (Android d'abord) à partir de l'APK d'origine (app Capacitor/Angular/Ionic + plugin natif de base locale Room), des notes de version et des specs 00–04. Cible : **React Native (Expo SDK 58) + PowerSync auto-hébergé** branché sur la base Supabase de la WebApp.
> Le code et la marque d'origine ne sont pas repris ; seuls écrans, comportements, données hors ligne et règles sont décrits.

## 0. Conventions

### 0.1 Légende des preuves

| Marque | Sens |
|---|---|
| **[O]** OBSERVÉ | lu dans l'APK : clé i18n (`fr.json`, citée `i18n:clé`), table/colonne Room (`room:table.colonne`, schéma `SiteflowDatabase/19.json`), code JS (`js:<chunk>` = préfixe du fichier `assets/public/<chunk>.*.js`, `main` = `main.*.js`), plugin natif (`capacitor.plugins.json`, `dex`) |
| **[HC]** | note de version / centre d'aide (`HC:RN92`…`RN110` = Product Release, `HC:R2.x` = notes 2025/2026) |
| **[I]** INFÉRÉ | déduction (comportement non lu directement) |
| **[P]** PROPOSÉ | choix de reconstruction (sections 9–10) |

### 0.2 Vocabulaire (aligné specs 00–04)

- **Entité** = projet (`projects`) ; sur mobile l'onglet principal s'appelle « Projets » [O] `i18n:layout.Projects`, le second « Référentiels et Modèles » [O] `i18n:layout.ReferentialAndModels` (libellé RN101 : « Référentiel et Modèle »).
- **Flow** → **Phases** → **Étapes** → **Blocs** (spec 02). Types de bloc mobiles [O] `room:step.{pr,multiPr,emm,adr,dsi,rhp,txt,form,blocObject}` : Instructions (PR), Instructions multiples (MULTI_PR), Moyens (EMM), Risques (ADR), **Contrôles** (DSI, bloc signatures), Équipe (RHP), Texte (TXT), Formulaires (FORM), Objets (OBJECT).
- **Checkout** = téléchargement d'un flow (et de ses dépendances) sur l'appareil ; **Push** = envoi des modifications locales vers le serveur. Libellés UI : « Téléchargement » / « Envoi » [O] `i18n:flows.download`, `i18n:flows.upload`.
- **Profil tablette** = compte de connexion d'une tablette partagée (nature utilisateur `DEVICE` / `DEVICE_EXT`, spec 01 §4.8) par opposition au **profil utilisateur** (collaborateur nominatif).
- **Mode en ligne / hors ligne** : choix **explicite** de l'utilisateur (bouton), pas une simple détection réseau (§3.3).

### 0.3 Architecture d'origine (résumé) [O]

- App web embarquée (Capacitor) ; 111 chunks JS ; i18n `fr/en/de/it`.
- Plugins natifs : caméra, géolocalisation, scanner code-barres/QR (ML Kit), système de fichiers, file-transfer, partage, ouverture de fichiers, préférences, orientation, haptique, clavier, barre d'état, appareil (`@capacitor/device`) ; plugins maison **`SfsDatabase`** (base Room, toutes les requêtes métier hors ligne), **`BackupManager`** (dumps, snapshots, export SD/stockage interne, envoi au support), **`Failsafe`** (journal de secours des saisies), **`SfsFileHelper`** (fichiers), **NewRelic** (télémétrie) [O] `capacitor.plugins.json`, `js:main` `registerPlugin`.
- Base locale **Room v19, 64 tables**, chiffrée **SQLCipher** (classes `net/zetetic` dans les dex) [O] ; migration TypeORM → Room annoncée en RN97 [HC:RN97].
- Double chemin de données : **en ligne**, l'UI appelle directement l'API REST (`/mobile/api/2.0/...`) ; **hors ligne**, chaque service bascule sur le dépôt Room correspondant (`accountStateService.isOffline ? sfsXRepository… : http…`) [O] `js:main` (ex. `getFlowTree`, `getFlowByUuid`, `markStepAsChecked`, `updateCustomStatus`).

> Conséquence pour la reconstruction : avec PowerSync, la base locale devient **la seule source de lecture** dans les deux modes ; le « mode hors ligne » devient un réglage d'UX (empêcher les opérations nécessitant le serveur), voir §9.1.

---

## 1. Connexion, session et appareil

### 1.1 Écran de connexion (`/login`) [O] `js:6014`, `i18n:login.*`

Contenu, de haut en bas :
- Titre « Bienvenue sur » + logo, sous-titre « Connectez-vous à votre compte » (`login.welcomeTo`, `login.signToAccount`).
- Bouton principal **« Scanner le QR Code »** (`login.scanQrCode`) puis séparateur « ou utilisez vos identifiants » (`login.orUseYourLoginCredentials`).
- Formulaire : **Adresse email** (requis, format email), **Mot de passe** (requis, ≥ 6 caractères), **Entreprise** (`login.company`, champ `baseUrl` = sous-domaine/hôte du tenant, requis). Les valeurs email et entreprise sont `trim()`ées.
- Bouton « Me connecter » / « Connexion » pendant l'appel (`login.login`, `login.loggingIn`).
- Pied : « Dernière connexion: {nom} » (`login.lastConnection`) — nom = « Prénom Nom » pour un profil utilisateur, `refExtern` pour un profil tablette [O] `getLastConnectedUser` ; « Version {x} » ; bouton **« Identifiant appareil »** ouvrant la modale « Identifiant de l'appareil / Numéro d'identifiant : {id} » (`login.deviceIdentifierModal.*`) ; lien « Politique de confidentialité » (`login.agreement`, `login.policyPrivacy`).
- **Options avancées** (`login.advancedOption.*`, accès caché/support) : « Importer les données » (restauration d'un dump), « Sauvegarder sur la carte SD », « Synchroniser le schéma de la base de données », « Ré-exécuter les migrations de la base de données » ; toasts `importDumpSuccess|Fail`, `exportDumpSuccess|Fail`.

Validation (messages sous champ) : `login.emailAddressIsRequired`, `login.emailAddressIsInvalid`, `login.passwordIsRequired`, `login.passwordMustBeAtLeast6CharactersLong`.

Appel : identifiants + **informations appareil** envoyées avec la demande de jeton : `uuid` = identifiant unique de l'appareil (`Device.getId()`), `androidVersion`, `deviceModel`, `deviceScreenSize` (`largeur/hauteur`) [O] `js:6014 onSubmit`.

Erreurs [O] `js:6014` :

| Statut HTTP | Message | Clé |
|---|---|---|
| 400 | « Un autre appareil est déjà connecté avec ce compte. » | `login.anotherDeviceConnectedToThisProfile` |
| 401 (identifiants) | « Un ou plusieurs champs ne sont pas valides… » | `login.wrongEmailOrPassword` |
| 401 clé `DEVICE_UNAUTHORIZED` | snackbar « Cet appareil ne fait pas partie des équipements autorisés sur votre environnement » | `snackbarMessage.error.deviceUnauthorized` |
| 0 (réseau) avec Internet | « Un ou plusieurs champs ne sont pas valides… » (domaine invalide) | `login.errors.invalidDomain` |
| 0 sans Internet | « Impossible de se connecter. Vérifier votre connexion internet » | `login.errors.noInternetConnection` |

Règles :
- **R-LOG-1** [O] Un profil ne peut être connecté que sur **un seul appareil** à la fois (erreur 400). [I] Le serveur mémorise l'appareil associé au profil ; la WebApp offre « Dissocier l'appareil actuel » sur la fiche tablette / connexion rapide (spec 01 §4.8).
- **R-LOG-2** [O]+[HC:RN101] Si l'organisation a configuré des **Appareils autorisés** (WebApp > Collaborateurs et tablettes > Appareils autorisés, table `authorized_devices`), seul un appareil dont l'identifiant figure dans la liste peut se connecter (par identifiants ou QR). Sans configuration, tout appareil est accepté. L'identifiant à saisir côté WebApp est celui affiché par le bouton « Identifiant appareil ».
- **R-LOG-3** [O] Après succès : création/MAJ de l'utilisateur local (`room:user`) et d'une **session** (`room:session`, cf. §1.4), chargement de la langue du profil (`langKey` ∈ fr/en/it/de, défaut fr), puis récupération de la configuration applicative (§1.6) et des feature toggles (§1.7).

### 1.2 Connexion rapide par QR code [O] `js:6014 handleQrCodeData`, `i18n:login.errors.*`

- Le QR (généré sur la WebApp : « Connexion rapide » d'un **utilisateur actif non opérateur** ou d'une **tablette**, spec 01 §2.9/§4.8) encode un JSON `{ token, refreshToken, uuid? }`.
- Contrôles dans l'ordre :
  1. JSON sans `token`/`refreshToken` → toast « …le QR code ne correspond pas à un utilisateur Siteflow » (`login.errors.invalidQRCode`).
  2. `uuid` présent et différent de l'identifiant de l'appareil → « …le QR code est déjà associé » (`login.errors.AssociatedDevice`). [I] Un QR est lié à l'appareil qui l'a scanné en premier.
  3. Appel du compte courant avec le jeton : 401 (hors `DEVICE_UNAUTHORIZED`) → « …le QR code est expiré » (`login.errors.expiredQRCode`) ; pas de réseau → « …pas de connexion internet » (`login.errors.connectionIssues`).
- Succès : même traitement que R-LOG-3 (session avec le jeton du QR).
- Le profil tablette s'identifie ensuite par son **nom/référence** (« Informations profil tablette » : Nom, Famille, Commentaire, Compte — `sharedModule.settings.informationProfile.deviceInformation.*`) au lieu des informations personnelles (« Informations profil utilisateur.trice » : Prénom, Nom, Trigramme, Email, Fonction, Complément, Groupe, Administratif, Type de contrat, Matricule, Compte).

### 1.3 Sécurité de l'appareil [O] `i18n:deviceUnsecureAlert.*`, `i18n:sharedModule.requestGeoLocation.*`

- **R-SEC-1** Au démarrage, si l'appareil **n'a pas de verrouillage d'écran** (code/schéma/biométrie), écran bloquant « Blocage de sécurité » : « Votre appareil n'est pas protégé par un mot de passe… Veuillez paramétrer un mode de passe… » avec un unique bouton « Fermer l'application ».
- **R-SEC-2** Demande d'autorisation de localisation avec explication : « Siteflow collecte les données de localisation pour géolocaliser les tablettes lors des interventions terrain lorsque l'application est active. Souhaitez vous autoriser le partage des données ? ». Refus toléré (la position n'est alors pas remontée).
- **R-SEC-3** Base locale **chiffrée** (SQLCipher) ; une « migration de chiffrement » peut s'exécuter au lancement (« La mise à jour est en cours, veuillez patienter / Veuillez ne pas fermer l'application », `encryptionMigration.*`) [O] `SfsDatabase.needsEncryptionMigration/migrateEncryptionDatabase`. Migration de schéma : « Migration de la base de données en cours » / succès / échec avec invitation à envoyer une sauvegarde au support (`databaseMigration.*`).

### 1.4 Sessions multiples et tablette partagée [O] `room:session`, `js:main` (`initSession`, `logout`, `deactivateSession`)

Table `session` (une ligne **par profil** ayant déjà ouvert une session sur l'appareil) : `token`, `refreshToken`, `active`, `offline`, `protocol`, `host`, préférences (`saveToGallery`, `allowAddStandardFlow`, `backupTimer`, `backupLocation`), état des modales (`isOfflineModalShown`, `isOnlineModalShown`), configuration serveur recopiée (`timeFormat`, `dateTimeFormat`, `dateFormat`, `externalSignatureDateTimeFormat`, `autoSignatory`, `disableEditResponse`, `numberFormatEnum`, `dumpUploadApi`), sauvegardes (`lastBackupDate`, `lastSnapshotDate`, `encryptionPublicKey`), `checkoutInProgress`, `userId`.

Comportement :
- Valeurs par défaut d'une première session [O] : `offline=false`, `saveToGallery=true`, `allowAddStandardFlow=false`, `backupTimer=14 400 000 ms (4 h)`, `backupLocation="internalStorage"`.
- Reconnexion d'un profil connu : la session existante est réactivée (jetons remplacés), préférences conservées.
- **Déconnexion** (« Se déconnecter », `sharedModule.settings.settingsMenu.signOut`) : désactive la session locale et appelle `/account/logout` (échec toléré, journalisé). **Les données téléchargées restent sur l'appareil.** Impossible hors ligne : « Impossible de se déconnecter lorsque vous êtes hors ligne » (`settingsMenu.offlineTextInfo`).
- **Une seule base locale par appareil** (pas de cloisonnement par profil) [O] : les flows téléchargés par un profil X restent présents quand un profil Y se connecte.
- **R-SES-1 (blocage RN 2.8)** [HC:R2.8]+[O] `i18n:checkout.forbiddenModal.*`, `push.forbiddenModal.*` : si Y tente un téléchargement alors que la base contient des données d'un projet P1 auquel Y n'a pas accès, le serveur répond 403 ; modale **« Téléchargement bloqué »** : « Vous ne pouvez pas télécharger le flow {nom} (+n autres) » / « Le téléchargement inclut des données du projet {P1} auquel vous n'avez pas accès. » / explication « Ce problème peut parfois survenir lorsqu'un autre utilisateur s'est connecté et a téléchargé des flows avec votre appareil. » / « Contactez votre administrateur pour vérifier si votre appareil est assigné à ce projet. » / encadré « Si le problème persiste, il faudra réinitialiser les données de la tablette via les paramètres. Attention : la suppression des données est définitive. » / bouton « J'ai compris ». Résolutions documentées : (a) ajouter le profil tablette Y au projet P1 sur la WebApp ; (b) se reconnecter avec X, vérifier l'envoi des données de P1, supprimer les données locales, se reconnecter avec Y.
- **R-SES-2** Même logique à l'**envoi** (403) : passage forcé hors ligne + modale « Envoi des données impossible » : « Votre envoi de données contient des données du projet {P} auquel vous n'avez pas accès. Ce problème survient lorsque votre profil a été supprimé du projet. » / « Une fois votre tablette assignée au projet, repassez en ligne pour procéder à l'envoi de vos données. » [O] `js:main handleForbiddenPushError`.
- **R-SES-3** [O] `i18n:checkout.message.crossOrganizationFlowError` : on ne peut pas télécharger un flow d'une **autre organisation** que celle des flows déjà présents : « …Veuillez synchroniser toutes vos données puis supprimer les flows déjà téléchargés… ».
- **R-SES-4** [O] Rafraîchissement du jeton (`/mobile/api/1.2/authenticate/refresh-token`) ; le jeton est mis à jour dans la session active.

### 1.5 Paramètres (menu latéral / écran Paramètres) [O] `js:4536` `app-general-settings`, `app-settings-menu`, `i18n:sharedModule.settings.*`

Menu (`settingsMenu`) : Profession, « Informations du profil », « Informations de l'appareil », « Sous-domaine {subdomain} », « Centre d'aide », « En savoir plus… », « Se déconnecter ».

Écran **Paramètres > Général** :
| Réglage | Valeurs | Défaut | Notes |
|---|---|---|---|
| Langue | Français / Anglais / Italien / Allemand | langue du profil ; à défaut langue de l'appareil [HC:RN92] | met à jour `user.langKey` localement (`UPDATE USER LANGKEY`) |
| Enregistrer les photos vers la galerie | bool | vrai | copie des photos prises dans la galerie Android |
| Autoriser l'ajout de flows | « Permettre l'ajout de flows au projet à partir de la liste des flows référentiels » | faux | active « Ajouter un flow depuis un référentiel » (en ligne, §2.2) |
| Sauvegarde > Emplacement | Stockage interne / Carte MicroSD (si présente) | interne | |
| Intervalle entre les sauvegardes | 5 min, 15 min, 30 min, 1 h, 4 h | 4 h | désactivé hors ligne [O] |
| Sauvegarder les données locales vers le stockage interne / la carte microSD | action | | toasts `common.internSaveSuccess|Error`, `common.sdcardSaveSuccess|Error` |
| Support > Envoyer une sauvegarde au support | action | | nécessite `dumpUploadApi` (config serveur) sinon « L'envoi ne peut pas être effectué car l'URL de destination n'a pas été définie. Veuillez contacter votre administrateur… » ; succès « La sauvegarde a bien été envoyée au support…» |
| Réinitialiser la base de données locale | action destructive | | voir §5.6 |

Tous les réglages sont désactivés pendant un blocage UX (`uxBlocked`, sauvegarde en cours).

### 1.6 Configuration applicative récupérée du serveur [O] `js:main updateAppConfig` (`/account/app-config`)

| Champ serveur | Stockage local | Effet mobile |
|---|---|---|
| `displayConfig.dateFormat / dateTimeFormat / timeFormat` | `session.*Format` | formats d'affichage (défauts `dd/MM/yyyy`, `dd/MM/yyyy - HH:mm`) |
| `displayConfig.externalSignatureDateTimeFormat` | idem | format de date des signatures **externes** |
| `autoSignatory` | `session.autoSignatory` | date de signature **non modifiable** (pré-remplie à maintenant) dans les modales de signature de formulaire [O] `js:620` (`disabled: viewModel.autoSignatory`) [I] |
| `blockFormResponseEdition` | `session.disableEditResponse` | réglage organisation « Les réponses à l'état terminé ne peuvent pas être modifiées sur la MobileApp » (WebApp, `organizations.block_form_response_edition`) : masque « Modifier » sur une réponse terminée (§4.6) |
| `numberFormatEnum` (`fr`/`en`) | `session.numberFormatEnum` | séparateurs décimaux/milliers (`fr-FR` vs `en-US`) |
| `dumpUploadApi` | `session.dumpUploadApi` | URL d'envoi des sauvegardes au support |

Le paramètre d'organisation « Nombre de réponses terminées téléchargées par défaut sur la MobileApp » (`organizations.allowed_download_response`, WebApp `generalSettings.organizationConfig.allowedDownloadResponse.*`) **n'apparaît pas** dans le code mobile : il est appliqué **par le serveur** dans les réponses de checkout [I].

### 1.7 Feature toggles [O] `room:feature_toggle(name, activated, type)`, `js:main` enum

Chargés en ligne (`/properties/feature-toggles`), **persistés en base au passage hors ligne** pour rester valables : `sfp-15085-diagram-access` (accès diagrammes), `sfp-16808-checkout-only-modified-flows` (ne re-télécharger que les flows modifiés), `sfp-16861-checkout-generic-forms-projects-once` et `sfp-17371-checkout-forms-once` (dédoublonnage des ressources communes au checkout, cf. RN 2.8 « optimisation des téléchargements »), `es-92-single-response-mode` (modes de réponse unique). Types : RELEASE, EXPERIMENT, OPS, PERMISSION.

### 1.8 Remontée d'informations appareil [O] `js:main updateDeviceInfos` (`/account/update-device-infos`)

Après chaque envoi réussi (et seulement en ligne) : version de l'app, niveau de batterie (%), identifiant unique, version Android, modèle, position GPS (si autorisée, haute précision), date du dernier envoi réussi. Ces données alimentent la fiche tablette WebApp (spec 01 §4.8 : `tablets.app_version`, `battery_level`, `last_push_at`, `last_latitude/longitude`…).

---

## 2. Navigation et écrans de liste

### 2.1 Structure de navigation [O] routes `js:main`/chunks (`path:`), composants `app-*`

Routes observées : `login`, `projects-tab` > `projects` (liste des entités) ; `:projectUuid/flows` ; `:projectUuid/flow-details/:flowUuid` ; `:projectUuid/execution/:flowUuid/phase/:phaseUuid/step/:stepUuid` (+ `?readonly=true|false`) ; `:projectUuid/form/:formUuid` > `rubric/:rubricOrder` ; `:projectUuid/project-forms` ; `:projectUuid/project-documents` ; `:projectUuid/map` ; `:projectUuid/non-compliant-data` ; `:projectUuid/exec-non-compliant-data` ; `:projectUuid/select-responses-to-verify/:flowUuidEntity` ; `quickAccess`.

Coque (`app-layout`, `app-header`, `app-side-menu`) :
- Barre d'onglets / rail : **Projets**, **Exécution** (flow ouvert courant ; « Aucun flow ouvert » sinon, `common.noOpenFlow`, `app-no-flow-open`), **Accès rapide** (`layout.quickAccess`), Paramètres.
- En-tête : bouton **En ligne / Hors ligne** (`app-online-offline`, §3.3), barre de progression de téléchargement (`app-checkout-progress-bar`), d'envoi (`app-push-progress-bar`), de sauvegarde (`app-backup-progress-bar`).
- Snackbars haut/bas (`app-top-snackbar`, `app-bottom-snackbar`) pour les erreurs et confirmations.
- Le dernier écran d'exécution ouvert est mémorisé (`lastExecutionUrl`) ; s'il pointe vers un flow absent de la base au passage hors ligne, il est remplacé par « aucun flow ouvert » [O] `toggleOffline`.

### 2.2 Liste des entités (onglet « Projets ») [O] `js:1672`

- Recherche texte (« Rechercher », debounce 300 ms, pagination « Chargement de plus de données… » `common.spinnerLoading`), **bouton scan QR** (icône code-barres) à droite de la recherche, *pull-to-refresh*.
- Segment **« Projets » / « Référentiels et Modèles »** (`layout.Projects`, `layout.ReferentialAndModels`) : le second segment liste les entités Référentiel/Modèle pour **consulter le rendu terrain** des flows modèles (remplace la « Vue MobileApp » de l'éditeur WebApp, [HC:RN101]) — **en ligne uniquement** : au passage hors ligne sur ce segment, retour à « Projets » + snackbar « Les référentiels et modèles sont uniquement consultables en ligne » (`snackbarMessage.warning.referentialPageOffline`). [I] Ouverture en **mode lecture** systématique pour ce segment.
- Carte entité : nom/désignation, client (`projects.client`), famille/couleur, statut [I : mêmes champs que `room:project`].
- **Hors ligne** : seules les entités présentes en base sont listées (`getProjectsByUuidOrganization`) ; un projet non téléchargé : « Le projet est indisponible hors ligne » (`flows.message.projectNotAvailable`).
- **Scan QR d'un flow** [O] `handleQrCodeData`, [HC:RN92] : QR imprimable généré sur la WebApp (option de flow) contenant `{ flowRef, projectRef }` ; fonctionne en ligne **et** hors ligne. Ouvre directement le flow (§2.5) en reprenant la dernière étape consultée, sinon la première étape non vide. Échec (flow inconnu localement, statut non téléchargeable, pas de droit) → modale « Impossible d'accéder au flow — Veuillez vérifier que vous avez l'autorisation de l'ouvrir, ou qu'il a bien été téléchargé si vous êtes hors-ligne » (`openFlowQrCodeModal.*`). Journalisation `SCAN_QRCODE_FLOW_SUCCESS|FAIL`.
- Fiche entité (`app-project-info`, `projects.projectInfo.*`) : segments **Général** (nom, type, client, famille, chrono/référence, catégorie, localisation, description, statut, dates prévues/planifiées), **Contrats** (n° de contrat, n° de commande interne/externe, n° de marché, affaire technique, mots clés, domaine métier, programme national), **Attributs** (attributs personnalisés par type : texte, texte long, titre, entier, décimal, vrai/faux, date, date-heure, choix unique/multiple, pièce jointe, image, lien), **Options** (surveillance interne/externe 1–3), **Historique** (« X a changé le statut De … à … », « a créé le flow … avec le statut … »). Contenu vide : « Ajoutez des éléments sur la WebApp ».

### 2.3 Liste des flows d'une entité (`:projectUuid/flows`) [O] `js:2392`, `i18n:flows.*`

En-tête : « LISTE DES FLOWS DU PROJET » (`flows.listProjectFlow`), bouton **Informations** de l'entité, menu « ⋮ » :
- « Ajouter un flow depuis un référentiel » (`flows.addFlowFromReferential`) — visible si réglage `allowAddStandardFlow` **et en ligne** [O]. Assistant en 3 temps (`flows.standardFlow.*`) : « Commencez par sélectionner le flow référentiel source » → « Puis renseignez les informations générales » → « Choisissez d'affecter ce flow à des tablettes (optionnel) » ; succès « Le flow sélectionné a bien été ajouté à la liste ». (= exécution d'un flow référentiel, WebApp spec 02, RPC `execute_referential_flow`.)
- « Supprimer les données téléchargées » (`flows.deleteDownloadedData`) — visible si des données de l'entité existent localement (§5.6).

Segments : **« Mes flows »** / **« Tous les flows »** / **« Diagrammes »** (si feature `sfp-15085-diagram-access` et diagrammes définis) [O] enum `MY_FLOWS="my-flows" | ALL_FLOWS="all-flows" | DIAGRAMS="diagrams"`.
- « Mes flows » [I] = flows où le profil connecté est collaborateur (`room:flow_collaborator`), responsable (`room:flow_assignee`, [HC:R2.1] « lorsqu'un utilisateur est assigné à un flow en tant que responsable, il voit le flow dans sa liste de flows et peut signer sans avoir à être assigné dans le champ collaborateurs »), tablette 1/2/3 (`room:flow.actor1..3UuidEntity`) ou présent dans `room:flow_user`.
- Compteurs séparés pour la case « Tout sélectionner » selon le segment (`flowsAssignedToMeCount` vs `flowsCount`).

Recherche (nom/référence) + **Filtrer** (`app-filter-flows-modal`, `flows.filterFlowsModal.*`) : Famille, Catégorie (« Sans catégorie »), Type, Collaborateur (« Sans groupe »), Flow, Statut, **Locale** (= téléchargé sur l'appareil) ; « {n} filtre(s) sélectionné(s) », Tout (dé)sélectionner. Pagination par 20.

**Carte de flow** (champs observés) : case de sélection ; pictogramme/type (« Flow spécifique / générique / intervention / chapeau / référentiel… », `common.flowTypes.fullName.*`) ; **Nom** ; **Référence** ; **Nom du client** ; **Localisation** ; famille (couleur) ; statut personnalisé (pastille couleur) ; **Début planifié / Fin planifiée** ; **Tablette 1 / 2 / 3** (« Aucune tablette ») ; attributs personnalisés marqués « afficher sur la carte du flow » (`custom_field.displayInFlowCard`) ; indicateur « téléchargé » [I]. Boutons **« Ouvrir »** et **« Mode lecture »** (toujours visibles, même flow ouvert [HC:RN92]), « Détails », « Documents », « Formulaires ».

Sélection et téléchargement [O] :
- Case **« Tout sélectionner » / « Tout désélectionner »** dans la barre (`flows.selectAll`, nouveau style RN92) ; état indéterminé si sélection partielle.
- Bouton **« Téléchargement »** (`flows.download`) : désactivé si aucune sélection, chargement, checkout déjà en cours, ou **mode lecture** ; libellé « Téléchargement en cours » pendant le checkout (§5.2).
- Bouton **« Envoi »** (`flows.upload`) : déclenche un push manuel (§5.4) ; succès « Toutes vos données ont bien été envoyées sur la webapp » (`flows.message.pushSuccessfully`).
- **Flow indisponible** (non assigné, statut non opérationnel, non téléchargé hors ligne) : carte/élément grisé, ouverture refusée avec avertissement [O] `showUnavailableFlowWarning`, [HC:RN110].
- Erreurs de chargement en ligne : « Le chargement prend plus de temps que prévu en raison d'une connexion lente. Veuillez réessayer. » / « Erreur de chargement. Veuillez réessayer. ». Correctif [HC:R2.10] : tous les flows sont affichés même au-delà de 200 par projet.

### 2.4 Détail d'un flow (`flow-details/:flowUuid`) [O] `i18n:flowDetails.*`, `flows.flowInfo.*`

- En-tête : « Type de flow », nom, statut (« Statut du flow »), dates **prévues** et **planifiées** (Début/Fin), boutons **« Remplir/exécuter »** et **« Mode lecture »**, « Aller au flow ouvert » si déjà ouvert.
- Bloc synchronisation : **« Dernier téléchargement le: … »** (dernier `checkout_log` réussi), **« Dernier envoi le: … »** (`flow.lastPushDate`), actions **« Re-télécharger flow »** et **« Supprimer de la tablette »**.
- « Vue d'ensemble » / « ÉLÉMENTS LIÉS AU FLOW » : **Documents**, **Formulaires** (« Voir toutes les réponses »), **Affectations** (Collaborateurs avec filtre Famille/Groupe/Fonction/Compétence « Sans compétence(s) »), **Moyens** (CONSOMMABLE), **Risques** (RISQUE MAJEUR), Tablette 1/2/3.
- Fiches détail : moyen (`flowDetails.emmInfo.*` : Nom, Famille, Référence, Commentaire, Fournisseur, Quantité/Unité, Date de validité), risque (`adrInfo.*` : Nom, Source, Référence, Famille, parades génériques/spécifiques), document (`documentInfo.*` : Nom, Famille, Réf. interne/externe et compléments, Indice, Catégorie, État PREL/BPO/BPE/BPE*/BPA/Sans état), collaborateur (`collaboratorInfo.*` : Prénom, Nom, Trigramme, Email, Fonction, Complément, Groupe, Administratif, Type de contrat, Matricule, Compétences « Du … jusqu'au … »).
- **Informations du flow** (`flows.flowInfo.segment.*`) : Général (type, nom, famille, référence, description, catégorie, statut, dates), Localisation (Site, Tranche, Local, Système élémentaire, Repère fonctionnel, Objet), Attributs, **Historique** (« X a changé le statut De … à … sur le flow, Commentaire »), **Données locales** (« Réponses de formulaire : n réponse(s) », « n signature(s) » non encore envoyées) [O] `getFlowStatsByUuid`, Compétences, Flow lié, Détails ; **PGAC** pour les entités PGAC (`flows.pgacInfo.*` : intitulé d'activité, référence dossier, précision du besoin, dates d'intervention, contact client, valideur, repère fonctionnel, local, discipline — table `room:epsilon_out`).
- **Changement de statut** (`flows.changeStatus.*`) : « Le statut actuel est … », liste des statuts, commentaire, « Changer le statut » ; variante « Changer le statut et signer » [I : statut lié à une signature]. Hors ligne : enregistré localement (`flow.customStatusUuidEntity`, `localCustomStatusComment`, `entityStatus=UPDATED`) puis poussé (§5.4).
- Document consultable seulement en ligne : « Ce document n'est visionnable qu'en mode en ligne » ; gros fichiers : « Les documents volumineux ne peuvent pas être visualisés depuis l'application mobile. » ; non téléchargé : « Le document n'a pas été téléchargé. Veuillez-vous connecter afin de visualiser le document. »

### 2.5 Ouverture d'un flow : mode ouvert vs mode lecture [O] `js:1672 openFlow`, `js:9079`, [HC:RN92]

- **Condition** : le statut personnalisé du flow doit être **téléchargeable** (`custom_status.downloadable`, état « En opération » côté WebApp [HC:RN97]) ; sinon refus.
- **Point d'entrée** : dernière étape consultée par l'utilisateur sur ce flow (`room:flow_execution`), sinon la première étape (non vide) (`/flows/{id}/first-step` en ligne, `getFirstNotEmptyStepByFlow` hors ligne).
- **Mode ouvert (« Remplir/exécuter », « Ouvrir »)** : saisie autorisée selon les règles d'étape (§3).
- **Mode lecture (`readonly=true`)** : navigation libre, aucune saisie/signature ; boutons de pied « Passer à l'étape suivante » / « Terminer le flow » au lieu de « Valider et… » (`execution.steps.nextOnly`, `finishOnly`) ; le téléchargement est désactivé ; [HC:R2.20] pré-remplissage des réponses visible ; [HC:R2.14] réponses visibles même s'il y en a moins de 3.
- Un flow ouvert apparaît dans **Accès rapide** ; fermer un flow qui a des réponses de formulaire ouvertes affiche « Attention, ce flow contient des réponses de formulaires ouvertes — En fermant ce flow, les réponses… seront aussi fermées de l'accès rapide. Êtes-vous sûr.e de vouloir fermer ces cartes ? » [Fermer le flow / Garder le flow ouvert] (`sharedModule.alertModal.closeFlow.*`).

### 2.6 Accès rapide (`quickAccess`) [O] `i18n:flows.quickAccess.*`, `room:flow_execution`, `room:form_execution`

- Liste des **flows ouverts** (« n flow(s) ouvert(s) ») et des **réponses de formulaire ouvertes** (« n réponse(s) ouverte(s) ») ; pour chaque réponse : « Dernière ouverture depuis l'étape P{n} E{m} {nom} ».
- Vues « Vue empilée » / « Vue classique » (`layout.stackedView`, `classicView`) ; vide : « Il semblerait qu'aucun flow ne soit ouvert ».
- Persistance : `flow_execution(lastAccessDate, projectUuidEntity, flowUuidEntity, phaseUuidEntity, phaseNodeOrder, stepUuidEntity, stepNodeOrder, customNodeOrder, stepName, userId)` et `form_execution(lastAccessDate, phase/step, formBusinessLinkUuidEntity, formResponseUuidEntity, formNature, formName, reference, indice, referenceResponse, rubricOrder, flowExecutionId)` — **par utilisateur**, locales (jamais poussées) [O]. Historiques `step_access_history` / `flow_access_history` (locaux).

### 2.7 Diagrammes [O] `i18n:flows.diagram.*`, `js:2392`, [HC:RN110, R2.5]

- Segment « Diagrammes » de la liste des flows : « Sélectionnez un diagramme » (diagrammes du projet, `/projects/{id}/diagrams`, rendu GoJS).
- Montre la structure du projet et l'avancement des flows/phases/étapes ; clic → ouverture du flow / de la phase (« La phase ne contient aucune étape ») ; éléments non disponibles **grisés** (« Ce flow n'est pas disponible sur votre tablette ») ; phases/étapes désactivées **barrées** [HC:R2.5].
- L'état (diagramme affiché, zoom, position) est conservé en revenant par l'onglet Projets [HC:R2.5]. Lecture seule sur mobile [I] (les libellés d'édition `flows.diagram.label.*` existent mais sont partagés avec la WebApp).

### 2.8 Carte du projet (`:projectUuid/map`) [O] `js:4376`, `i18n:map.*`, `room:geometry`, `room:geometry_coordinate`, `room:map_config`

- « Carte du projet » plein écran / mode fenêtre, « Position actuelle », recherche d'adresse ou de coordonnées (Latitude, Longitude, Zoom).
- **Ajouter une géométrie** : point / ligne (« Ajouter une ligne ») / polygone / cercle (rayon) ; lier à un flow (optionnel), libellé (optionnel), icône (Défaut, Camion, Machine, Entrepôt, Stock, Casque, Outils, Fusée, Caravane, Sans icône), altitude. Détail d'une géométrie : nom du flow, référence, catégorie, statut.
- **Téléchargement de la carte hors ligne** : « Sélectionnez les paramètres du téléchargement » (Rayon, Zone actuelle, Précision) → « Téléchargement en cours… n éléments » [Annuler] → « La carte a été bien téléchargée » (tuiles mises en cache) [O].
- `map_config(subscriptionKey, urlTemplate, zoom, lat, lng)` : fournisseur de tuiles configuré côté serveur (`/map/config`).
- Création/modification/suppression hors ligne (`saveGeometryTransaction`, `deleteGeometryTransaction`, `geometry.entityStatus`) poussées par `/map/push-geometries`.

### 2.9 Formulaires et documents d'entité [O] routes `project-forms`, `project-documents`, `i18n:projects.projectInfo.form|documents.*`

- « Liste des formulaires du projet » (« n élément(s) dans la liste ») : formulaires **génériques** visibles sur mobile (statut « Visible depuis la MobileApp », spec 03 §2.2) → répondre au niveau projet (réponse de contexte `project`). Un formulaire lié à un objet ne peut pas être répondu au niveau projet : « Veuillez vous rendre dans un flow afin de répondre à un formulaire lié à un objet. » (`execution.respondToForm.responseNotAllowedFromProject`).
- « Liste des documents du projet » : REF.INT, REF.EXT, compléments, Indice ; filtres (`app-filter-project-documents-modal`).

---

## 3. Modes en ligne / hors ligne

### 3.1 Principe [O]

L'utilisateur bascule **manuellement** via le bouton En ligne/Hors ligne de l'en-tête. L'état est persistant (`session.offline`).
- **En ligne** : lecture et écriture directement via l'API ; les écrans comme la recherche de flows, les référentiels, les objets, la vérification des non-conformités, la génération de documents, l'ajout de flow depuis un référentiel sont disponibles.
- **Hors ligne** : uniquement les données téléchargées (Room) ; chaque écriture marque l'entité (`entityStatus`) et lève le drapeau `push_status.uncommittedChanges`.

### 3.2 Fonctions indisponibles hors ligne [O]

| Fonction | Preuve |
|---|---|
| Onglet Référentiels et Modèles | `snackbarMessage.warning.referentialPageOffline` |
| Bloc **Objets** (affiché seulement en ligne ; RN92 « uniquement en mode en ligne pour le moment ») | `js:9079` `step.blocObject && !isOffline`, `getBlocObjectByStepUuidEntity` → `null` hors ligne |
| Vérifier les données non-conformes | `js:8468` `ngIf: !isOffline` |
| Ajouter un flow depuis un référentiel | `js:2392` `allowAddStandardFlow && !isOffline` |
| Consultation de documents non téléchargés / volumineux | `flowDetails.readableOnlineOnly` |
| Déconnexion | `settingsMenu.offlineTextInfo` |
| Modification de l'intervalle de sauvegarde | `js:4536` disabled si offline |
| Lecture des dates de modification serveur (checkout différentiel) | `getFlowModificationDates` lève « Cannot get flow modification dates offline » |

### 3.3 Bascule et modales [O] `js:main toggleOffline`, `showNetworkStatusToast`, `i18n:sharedModule.alertModal.offlineOnline.*`, `offlineModeAlert.*`

- Première bascule dans chaque sens : modale de confirmation « Attention, vous êtes actuellement en mode en ligne — Souhaitez-vous passer au mode hors ligne ? [Passer hors ligne] [Rester en ligne] » (et l'inverse) ; mémorisée par `session.isOfflineModalShown` / `isOnlineModalShown` (ne s'affiche qu'une fois) [I sur l'unicité, O sur les drapeaux].
- Toasts : hors ligne « Vous êtes maintenant hors ligne. Vos données seront sauvegardées sur la tablette jusqu'à votre prochaine connexion » ; en ligne « Vous êtes maintenant en ligne et pouvez à nouveau télécharger. Vos données vont être automatiquement envoyées sur la WebApp. » (`sharedModule.onlineOfflineBtn.*`).
- **Passage hors ligne** : sauvegarde des feature toggles en base ; vérification du dernier flow ouvert.
- **Passage en ligne** : **push automatique** des modifications (§5.4) puis, s'il y avait des modifications, création d'un **dump chiffré** (§6.1) et envoi des journaux ; rechargement des feature toggles et de la licence de diagramme.
- **Fin de téléchargement** : modale « Téléchargement terminé — Vos flows ont bien été téléchargés sur votre tablette, souhaitez-vous passer hors ligne ? [Passer hors ligne] [Rester en ligne] » (`offlineModeAlert.*`).
- **Interdit pendant un téléchargement** : snackbar « Il est impossible de passer hors ligne lorsqu'un téléchargement est en cours… » avec action « Passer hors-ligne » → confirmation « Cette action annulera le téléchargement en cours et forcera le passage hors ligne. Êtes-vous sûrs… ? » ; annulation : « Annulation du téléchargement … » (`checkout.message.*`, `common.cancellingCheckout`).
- Hors connexion réelle pendant une action réseau : modale « Vous n'êtes pas connecté à internet — Veuillez enlever le mode avion… [Je suis maintenant connecté à internet] » (`sharedModule.alertModal.connectionError.*`, `app-no-internet-connection-modal`).

---

## 4. Exécution d'un flow (`execution/:flowUuid/phase/:phaseUuid/step/:stepUuid`)

### 4.1 Mise en page [O] `js:9079` (`app-execution`), `i18n:execution.*`

- **Bandeau de flow** : type (« Flow spécifique… »), nom, référence, statut, attributs « afficher dans le bandeau » / « afficher à l'ouverture » (`custom_field.displayInFlowBanner`, `displayOnFlowOpenning`) [O] `room:custom_field`.
- **Navigation phases/étapes** (arbre ou ruban, `app-accordion`) : « Phase {n} » / « P{n} », « Étape {n} », « ÉTAPE », « Étape en cours », « Voir l'étape » ; numérotation affichée = rang parmi les éléments non exclus de la numérotation (`excludeNumbering`), sinon numéro personnalisé (`customNodeOrder`) [O] `stepNodeOrderToDisplay`. Étapes/phases désactivées barrées (« Étape désactivée »).
- **Pastilles** (puces de couleur) par étape et par phase (§4.2), indicateur de signatures en attente sur la phase (`hasPendingSignatures`).
- **Contenu de l'étape** : blocs dans l'ordre Équipe (RHP), Moyens (EMM), Texte (TXT), Instructions (PR), Objets (en ligne), Instructions multiples, Formulaires, Documents liés, **Contrôles** (DSI ; masqué pour un flow GENERIC) [O] ordre des `ngIf` du gabarit.
- **Résumé des attributs d'étape** (`app-step-attributes-summary`) : attributs du flow, de la phase et de l'étape (compteur total) [O] `mapStepExtraAttributesSummaryDtoToModel`.
- **Pied d'étape** : « Valider et passer à l'étape suivante » / « Passer à l'étape suivante » (si lecture ou étape déjà validée) ; sur la **dernière étape visible** « Valider et terminer le flow » / « Terminer le flow » (lecture) ; boutons de **redirection** (§4.5). [I] Pas de validation d'étape pour un flow GENERIC ou sans phase (condition `phaseCount > 0 && typeFlow !== GENERIC` observée sur un élément du pied d'étape).
- **Changement de phase** : modale « Changement de phase » avec « Informations à destination des collaborateurs », « Signatures sur la phase : n signature(s) », « Contenu de la phase », [Fermer] [Accéder à la phase] (`execution.phaseChangeModal.*`).
- **Étape désactivée** : modale « Cette étape est désactivée — Vous pourrez visualiser l'étape mais aucune action ne sera possible », commentaire de désactivation (`room:step.disabledComment`), [Visualiser l'étape] (`sharedModule.alertModal.disabledStep.*`).
- **Étape « à remplir sur la WebApp uniquement »** (`readOnlyOnMobileApp` sur phase ou étape, [HC:RN92] « mode lecture » des phases/étapes) : visible, non signable, non remplissable sur mobile.
- Bloc TXT de visibilité « document » (`room:bloc.internalTxt`) : non affiché ; une étape ne contenant que cela est **vide** et ignorée pour la navigation et pour le bouton « terminer le flow » [O] `isEmpty`, [HC:R2.10].

### 4.2 Pastilles d'avancement [O] pipes `stepChipColor`, `phaseChipColor` (`js:main`), [HC:RN105]

Étape (ordre d'évaluation) :
1. `readOnlyOnMobileApp` → **transparent** (pas de pastille) ;
2. `disabled` → **gris** ;
3. `checked` (validée par le bouton) → **vert** ;
4. compteurs `doneSignatureCount`, `mandatoryFormWithResponseCount`, `multiPrStatusDoneCount`, `pendingSignatureCount` tous à 0 → **bleu** ;
5. sinon → **orange** (même si tous les obligatoires sont faits).

Phase : transparent si `readOnlyOnMobileApp`, gris si désactivée ou sans étape colorée ; sinon la couleur commune de ses étapes actives si toutes identiques, **orange** si mélange.

Écart à noter : la note RN105 définit « gris = étape pas encore ouverte, bleu = ouverte sans élément réalisé ». Le code observé ne distingue pas ouverte/non ouverte (bleu par défaut). [P, tranché le 2026-10-24] Suivre la note de version (gris tant que `steps.first_opened_at` est nul — colonne déjà présente, RPC `mark_step_opened`) et réserver le gris barré aux étapes désactivées.

Compteurs par étape (`getStepProgressMapData`) : `expectedSignatureCount`, `doneSignatureCount`, `pendingSignatureCount` (signatures « en attente »), `multiPrStatusDoneCount`, `mandatoryFormCount`, `mandatoryFormWithResponseCount`.

### 4.3 Validation d'étape [O] `js:9079 verifyStepValidation/getStepValidationMessage`, `markStepAsChecked`, [HC:RN105, R2.2, R2.10]

- « Valider et passer à l'étape suivante » contrôle les **éléments obligatoires** de l'étape ; messages (snackbar 3 s) par priorité :
  1. statuts obligatoires du bloc Instructions multiples manquants → « Veuillez ajouter les statuts obligatoires » (`execution.requiredStatusesMsg`) ;
  2. formulaires **et** signatures → « Veuillez remplir tous les formulaires et effectuer toutes les signatures obligatoires » ;
  3. formulaires obligatoires (`form_business_link.requiredResponse`) sans réponse → « Veuillez répondre à tous les formulaires obligatoires » ;
  4. signatures obligatoires du bloc Contrôles (réceptacles `mandatory`) → « Veuillez effectuer toutes les signatures obligatoires » ;
  5. attributs d'objet obligatoires → « Veuillez remplir tous les attributs d'objet obligatoires ».
- Le bouton est accessible **quel que soit l'état de validation interne** des blocs (rédaction/vérification/approbation, [HC:R2.2]) ; un bloc non validé en interne affiche « Ce bloc n'a pas été validé en interne » (`execution.StatusBlockDone`).
- Succès : `step.checked = true` (pastille verte), **déverrouillage séquentiel** des étapes suivantes (§4.4), navigation vers l'étape suivante (non vide, visible). Hors ligne : `markStepAsCheckedTransaction` + `entityStatus=UPDATED` ; poussé par `/steps/push` (`{stepUuidEntity, checked}`) ; en ligne : `POST /steps/{id}/mark-as-checked`.
- Sur la dernière étape visible : « Valider et terminer le flow » ferme l'exécution (retour liste) [O] `closeExecution`.
- [I] Pas de « dévalidation » sur mobile (action WebApp uniquement, spec 02 §4.6).

### 4.4 Séquencement et déverrouillage [O] `js:main unlockNextSteps/unlockFlowSequence/unlockPhaseStepsIfPossible/getPhasePendingState`, `room:flow_sequence`, `room:phase.{sequenceIdentifier,stepsExecutionMode,mandatory}`, `room:step.locked`, [HC:RN110, R2.10]

Modèle : un flow est découpé en **séquences** ordonnées (`flow_sequence.nodeOrder`, `phasesExecutionMode` LINEAR|PARALLEL) ; chaque phase appartient à une séquence et a un mode d'exécution de ses étapes (`stepsExecutionMode` LINEAR|PARALLEL, défaut PARALLEL côté mobile) et un caractère obligatoire. Chaque étape porte `locked` (calculé par le serveur au checkout, puis maintenu localement).

- **R-SEQ-1** Une étape `locked` est **visible en lecture seule** (icône cadenas) : pas de saisie, signature ni formulaire.
- **R-SEQ-2** Après validation d'une étape (si sa phase est séquencée), l'app calcule l'**état en attente** de la phase :
  - `COMPLETE` (toutes les étapes validées et aucune verrouillée) → passer aux phases suivantes de la séquence ;
  - `BLOCKED_BY_READONLY_STEP` (la première étape non validée est « WebApp uniquement ») → on s'arrête (la suite attend la WebApp) ;
  - `HAS_UNLOCKED_UNCHECKED` (il reste une étape déverrouillée non validée) → rien à déverrouiller ;
  - `HAS_LOCKED_STEPS` → déverrouiller **la première** étape verrouillée (phase LINEAR) ou **toutes** (phase PARALLEL).
- **R-SEQ-3** Propagation inter-phases : on parcourt les séquences à partir de la séquence courante ; dans chaque séquence, on tente de déverrouiller chaque phase ; en séquence LINEAR on s'arrête à la première phase **obligatoire** déverrouillée ; on s'arrête à la première séquence où une phase obligatoire a été déverrouillée. Les phases **optionnelles** (`mandatory=false`) ne bloquent pas [I conforme spec 02 R-SEQ-4].
- **R-SEQ-4 Déverrouiller le flow** (« chef de chantier », [HC:RN110]) : action « Déverrouiller le flow » (`execution.unlockFlow`), accessible depuis le bouton « Déclarer un aléa » du bloc Formulaires (popover : « Déverrouiller le flow » / « Ouvrir un formulaire ») [O] `declareHazard`. Ouvre la modale de signature en mode `SKIP_FILL_RESTRICTIONS` : titre « Déverrouiller le flow », texte « En déverrouillant le flow vous pourrez compléter toutes les étapes, sans avoir à réaliser les phases et étapes précédentes. », **case obligatoire** « Cette action est irréversible, je confirme prendre la décision de déverrouiller le flow. », **commentaire obligatoire**, signature (collaborateur de la liste ou authentification forte QR) — c'est l'« authentification » requise. Effet : `flow.skipFillRestrictions = true` (toutes les étapes saisissables), enregistrement d'un **signataire de déverrouillage** `room:flow_skip_fill_restriction_signatory(uuidEntity, flowUuidEntity, userRef, typeSignatory, imageSignature, commentSignature, signatureDate, signWithQrCode, entityStatus)` poussé par `/flows/skip-fill-restriction-signatories/push` (en tête de push, §5.4). Traçabilité WebApp : action `SKIP_FILL_RESTRICTION` (spec 02 R-SEQ-3).
  - Écart : la WebApp de reconstruction trace un déverrouillage **par étape** (`step_fill_unlocks`, RPC `unlock_step_fill`) alors que la MobileApp observée déverrouille **le flow entier**. [P] §9.3.
  - Quand le flow est déjà déverrouillé ou est de type intervention (FLOW_FORM), « Déclarer un aléa » ouvre directement l'ajout de formulaire (§4.7.8).

### 4.5 Redirections d'étape [O] `js:9079` (`app-step-redirection-modal`, enum `NAVIGATE|EXIT|SKIP`), `room:navigation_flow`, `i18n:execution.stepRedirection.*`

- Une étape peut porter des **redirections** (configurées sur la WebApp, spec 02 §4.4) : description, style (`natureStyle` : défaut/info/avertissement/erreur/réussite → couleur et icône), cible « Phase X – Étape Y ».
- Affichage : boutons/cartes de redirection en bas d'étape. Au choix d'une redirection : zone « Inscrivez votre commentaire ici », [Annuler] [Naviguer] ; la redirection choisie est **enregistrée** (`navigationDate`, `navigationComment`, `uuideUser`, `entityStatus=UPDATED`) puis l'app ouvre l'étape cible.
- Modale « Redirection vers une autre étape » (redirection active rencontrée lors de la navigation) : « {Utilisateur} a changé le statut … » [I : redirection déclenchée par un statut], choix **« Revenir à l'étape en cours »** (EXIT) / **« Passer outre la redirection »** (SKIP) / naviguer (NAVIGATE).
- Mode lecture : navigation par redirection possible sans enregistrement (`readonlyNavigation`).
- Push : `/navigation-flows` (`pushNavigationFlows`). Correctif [HC:R2.10] : une étape avec redirection peut être validée.

### 4.6 Blocs non signés

**Instructions (PR)** [O] `/steps/{id}/instructions-bloc`, `room:bloc.content` : contenu riche (HTML, images téléchargées au checkout, zoom photo [HC:R2.14]), référence, indice/révision ; badge « INSTRUCTION ».

**Instructions multiples (MULTI_PR)** [O] `room:element_pr`, `i18n:execution.multiInstructionsBlock`, `selectMultiPrElementsModal.*` :
- Liste de **sous-instructions** (titre masquable `multiPrTitleHidden`, contenu riche), « Ouvrir/Fermer toutes les sous-instructions ».
- Par sous-instruction : **statut personnalisé** (« Ajouter un statut », statuts `custom_status` de nature multi-PR), **observation** (« Ajouter une observation » / « 1 observation » / « Voir l'observation »), **une signature** (signataire unique `room:signatory.elementPrUuidEntity`).
- Exigences du bloc : `requirementStatus` (« Les statuts sont obligatoires »), `requirementSignatory` (« Les signatures sont obligatoires »), les deux (« Les statuts et les signatures sont obligatoires »).
- Actions de masse : « Changement de statut multiple » (« Attention les statuts précédemment appliqués seront écrasés », « Changer le statut sur les {n} sous-instructions sélectionnées » → « Les statuts sont changés ») ; « Signature multiple » (« Signer les {n} sous-instructions sélectionnées » → « Les signatures sont effectuées »). Sélection avec case « tout » (éléments désactivés exclus).
- Hors ligne : `updateElementPrCustomStatusTransaction`, `updateElementPrObservationTransaction`, `saveMultiPrSignaturesTransaction` ; push `/element-prs/push` **une requête par sous-instruction** `{uuidEntity, observation, customStatusUuidEntity, signatory}` ; erreurs partielles possibles (§5.5).

**Moyens (EMM)**, **Risques (ADR)**, **Équipe (RHP)** [O] `room:element_emm|element_adr|parade|element_rhp|element_rhp_label_family_skills` : listes en lecture avec modales détail navigables (« Moyen précédent/suivant », « Risque précédent/suivant ») : moyens (nom, famille, référence, fournisseur, quantité, unité, consommable, soumis à vérification, organisme, date de validité, certificat/fichier référence) ; risques (risque, source, majeur « Risque Majeur », pictogramme, parades génériques/spécifiques) ; équipe (fonction, nombre, observation, compétences, « autres »).

**Texte (TXT)** : contenu riche visible MobileApp (`txt_visibility = mobile_app`).

**Documents liés** [O] `room:bloc_document_flow`, `document_flow`, `version_document_flow` : « Documents liés », « Indice », « Voir le PDF », « Tout afficher / Réduire » ; PDF téléchargés au checkout (§5.2) ; version **figée** au moment de la signature du bloc Contrôles [HC:RN97] (le push DSI renvoie les versions liées, §5.4).

**Objets** (en ligne uniquement) [O] `/steps/{id}/object-bloc`, `objectDetailsModal.*`, [HC:RN92, RN105] :
- Liste des objets techniques liés, « Afficher / Masquer toutes les informations » ; fiche : Nom, Famille, Applicabilité, Description, Référence externe, Code article, Numéro d'identification, Statut, Certificat de conformité, Nature (Technique/Localisation), **attributs** (types texte… image, `app-technical-object-attribute-item` ; « Ouvrir le fichier », « Visualiser l'image »).
- Édition des attributs : [Sauvegarder et fermer] [Sauvegarder et passer à l'objet suivant] ; « Certains attributs obligatoires ne sont pas renseignés! » ; « Modification.s enregistrée.s avec succès » ; fermeture avec modifications : « Modifications non sauvegardées » (`app-close-edit-object-alert`). Bouton d'accès au **document objets** [HC:RN105].

### 4.7 Bloc Formulaires [O] `js:9079`, `js:8468`, `js:620`, `i18n:execution.*`, `form.*`, spec 03 §6

#### 4.7.1 Liste des formulaires de l'étape
- Titre « Formulaires » ; par lien bloc↔formulaire (`room:form_business_link`) : nom, référence, indice, « *OBLIGATOIRE » si `requiredResponse`, compteur « n réponse(s) », états des réponses (« en cours » / « terminé »).
- Actions par formulaire : **Répondre** (`execution.answer`), **Reprendre** (`execution.resume`), **Voir la réponse** / **Voir toutes les réponses**, **Aperçu**, **Modifier** (`execution.edit`, réponse terminée — masqué si l'organisation bloque l'édition des réponses terminées), **Générer un document** (en ligne), **Vérifier les données non-conformes** (en ligne).
- Encadré « Vous souhaitez remonter un problème, du REX ou autre chose? » + « Ajouter un formulaire » / « Déclarer un aléa » (§4.7.8).

#### 4.7.2 Réponse unique et modes [O] `room:form_business_link.{uniqueResponse, uniqueResponseMode}`, `js:9079 canResumeAnswer`, feature `es-92-single-response-mode`
- `uniqueResponse=true` : une seule réponse (en cours ou terminée) par lien ; « Répondre » remplacé par « Reprendre »/« Voir ».
- `uniqueResponseMode` (si feature active) : `NEW_OR_RESUME` (nouvelle réponse et reprise autorisées), `NEW_RESPONSE` (nouvelle uniquement : pas de reprise), `RESUME_RESPONSE` (reprise uniquement : pas de nouvelle s'il existe déjà une réponse).
- Modale « Répondre à un formulaire » (`app-respond-to-form-modal`) : « Créer une nouvelle réponse » avec **Référence réponse** (« Veuillez entrer votre référence dans cet encart ») ou « Reprendre une réponse » → « Sélectionnez la réponse que vous souhaitez reprendre » (P{n} E{m}) ; « Reprise d'une réponse existante » ; « Editer la référence de réponse » [HC:R2.12 : modifiable sur mobile].
- Conflit au push : une réponse unique déjà créée ailleurs → snackbar « Votre réponse n'a pas été synchronisée : une réponse existe déjà pour ce formulaire. » (`push.uniqueResponseAlreadyExists`, erreur serveur `form.uniqueResponseAlreadyExists`) ; la réponse locale est marquée synchronisée (abandonnée) [O] `executePushFormResponsesAndHandleError`.

#### 4.7.3 Écran de réponse (`form/:formUuid/rubric/:rubricOrder`) [O] `app-form`, `app-form-rubric`, `app-question`, `app-table-form`
- Navigation par **rubrique** (menu latéral « Rubrique Question », « Rubrique tableau par lignes/colonnes ») ; rubriques masquées sur mobile (`rubric.hiddenInMobile`) non affichées ; « Retour à l'étape ».
- **Rubriques autorisées** [O] `room:form_business_link_rubric_permission(readonly, rubricUuidEntity)`, `uuidTypeInitRubric` : ouverture sur la rubrique initiale du lien ; rubriques non autorisées en lecture seule : « Cette rubrique ne peut être complétée à cette étape. » (`form.formValidation.inaccessibleRubric`) ; feature d'organisation « restriction de navigation » (spec 03 §6.7).
- **Toutes natures de question** (17, spec 03 §3.3.1) : réponse courte/longue/multiple, choix unique/multiple, case à cocher, listes de choix unique/multiple, date, date-heure (rétro-datage contrôlé `backdatingAllowed`), durée, valeur et unité, **prise de photo**, fichier, **collaborateur et signature**, localisation (« Me localiser »), formule (« Calculer » ; « Une ou des valeurs présentes dans la formule ne sont pas encore renseignées »), éditeur de texte. Observation par question (`withObservation`).
- **Tableaux** par lignes / par colonnes : navigation « Ligne/Colonne suivante/précédente », **ajout de ligne/colonne** si autorisé (`allowAddOption`, `allowAddQuestion`, « Ajouter une ligne/colonne », « Nom de la ligne/colonne ») [O] `addRubricQuestionTransaction`, `addRubricOptionsTransaction` ; **remplissage en masse** (« Remplissage en masse », « n cellule(s) impactée(s) par la modification », « Les champs déjà remplis ne seront pas modifiés. », refus : listes de choix différentes, nature non prise en charge, déjà toutes remplies) ; signature en masse (« Signature en masse », « Valider les changements en masse »).
- **Photos** [O] `sharedModule.formDetails.questionOptions.showAction.*`, `imageEditor.*` : « Ajouter une photo » → « Prendre une nouvelle photo » / « Choisir depuis la galerie » ; éditeur d'image (annotation) « Éditeur d'image » ; « Voir les photos » / galerie (« Galerie d'images ») ; suppression avec confirmation ; copie en galerie selon réglage ; refus caméra « Autorisation caméra refusée… ».
- **Signatures de formulaire** (question « Collaborateur et signature », `room:option_signatory`) : modale de signature (§7.3) ; signataires désactivables (`disableSignature`) ; date figée si `autoSignatory`.
- **Validation des données / alertes** [O] `room:option.{checkedValidation,natureValidation,valueOne,valueTwo,checkedBlockingControl,validationAlertText,checkedAlert,natureAlert,alertText}` : « Évaluer » / « Valeur attendue : … » (supérieure à, entre…, avant le… — `questionOptions.nature.*`), « La valeur saisie n'est pas comprise dans la plage de données attendue » ; contrôle bloquant vs alerte.
- **Redirection de question/rubrique** (`checkedNextQuestion`, `uuidTypeNextRubric`, `uuidTypeNextQuestion`) [HC:R2.15 : prise en compte à la reprise].
- **Questions verrouillables** (`question.lockable`, `option.locked`) [O] `lockNonEmptyOptionsByRubricUuidEntities`, `app-edit-locked-question-modal` : une valeur saisie est verrouillée à la sauvegarde de la rubrique ; la modifier ouvre « Modifications » avec **signature obligatoire** (collaborateur / non listé, date, commentaire) → nouvelle **version d'option** `room:version_option(optionUuidEntity, signatoryUuidEntity, nature, icon, color, responseProvenance)` (historique signé, = `form_response_value_history.change_signature` côté serveur) ; push `/version-rubric-option/push`.
- **Pré-remplissage** (variables dynamiques, valeurs évaluées `option.evaluatedValue`, `preEvaluationValue`, `preEvaluationEnums`) affiché y compris en lecture [HC:R2.20].
- Validation de fin : panneau « Questions requises ou invalides » (OBLIGATOIRE / Invalide / « Aller vers la question ») ; « Afin de sauvegarder cette rubrique, veuillez renseigner les informations ci-dessous : ».
- **Terminer** : « Terminer la réponse » → modale « Êtes-vous sûr.e de vouloir terminer votre réponse ? » [Terminer la réponse] [Sauvegarder et continuer plus tard] ; toasts « La réponse a bien été sauvegardée » / « …terminée ». Sortie avec saisie non sauvegardée : « Modifications non sauvegardées — Vos changements ne seront pas sauvegardés… [Continuer] [Annuler] ».
- **En ligne** : chaque champ est enregistré au serveur ; l'utilisateur **ne peut pas quitter** tant que la sauvegarde n'est pas confirmée (« La sauvegarde est en cours, veuillez attendre quelques secondes avant de sortir du formulaire. », `form.blockedUx`, [HC:RN97]) ; échec : « Champ non sauvegardé » / « Une erreur est survenue. Veuillez vérifier les champs du formulaire ».
- Réponse archivée côté serveur : « Cette réponse a été supprimée » (`archivedFormModal`).

#### 4.7.4 Modifier une réponse terminée [O] `js:8468`, `sharedModule.alertModal.editResponseAlert.*`
- « Attention, la réponse est à l'état “terminé”. Voulez-vous repasser cette réponse à l'état “en cours” et ainsi pouvoir la modifier à nouveau? » [Confirmer] [Annuler].
- Interdit si `session.disableEditResponse` (réglage organisation) ; les icônes d'édition des dates sont masquées pour une réponse `RESPONSE_DONE` [O] `js:1154`.

#### 4.7.5 Aléa sur non-conformité [HC:RN92], [O] `form.textInfo.reportNonCompliance`
- Quand une valeur est **non conforme** (validation de données), un bandeau « Vous souhaitez déclarer une non-conformité ? » propose de créer immédiatement une **réponse de formulaire générique** (formulaire d'aléa/NC) liée au contexte (§4.7.8).

#### 4.7.6 Vérification des données non conformes (en ligne) [O] `js:1154`, routes `non-compliant-data`, `exec-non-compliant-data`, `select-responses-to-verify`, `nonCompliantData.*`
- « Vérification des données non-conformes » : sélection des réponses à vérifier (filtres État de la réponse En cours/Terminé, Date de dernière modification : jour/semaine/mois en cours/personnalisé, « Filtrer par pré-remplissage ») → résultat « n donnée(s) non correcte(s) », « n formulaires impactés par la vérification », « Corriger » ; « Le traitement est terminé. Toutes les données sont conformes. » / « …Les données affichées ne sont pas conformes. » (API `/form-responses/invalid-options/search`, `/flows/{id}/form-responses-to-validate`).

#### 4.7.7 Générer un document (en ligne) [O] `execution.generateDocumentModal.*`
- « Génération de document » : Famille (obligatoire), Nom du document (obligatoire), Référence interne (obligatoire ou « Généré automatiquement ») → [Générer le document] / [Voir PDF] ; « La réponse n'est pas exportable » si interdit. (spec 04.)

#### 4.7.8 Ajouter un formulaire / déclarer un aléa [O] `app-add-fbl-modal`, `createFblTransaction`, `execution.addFbl.WorksiteFeedback`
- « Ajouter un formulaire » ouvre la liste des **formulaires génériques** de l'organisation applicables (`findGenericFormsByUuidOrganizationAndApplicability`, catégorie « Remontée d'informations ») ; le choix crée **localement** un nouveau lien bloc↔formulaire sur l'étape (`form_business_link` `entityStatus=ADDED`) puis une réponse. Possible hors ligne (formulaires génériques téléchargés au checkout).
- Flow intervention (FLOW_FORM) : le flow est essentiellement un conteneur de réponses ; même mécanisme.

### 4.8 Bloc Contrôles (signatures DSI) — vue terrain

Voir §7 pour le modèle de données. Écran [O] `js:9079`, `js:620`, `i18n:execution.sign.*`, `execution.signatureSetting.*`, `sharedModule.settings.signatureModal.*` :
- Titre « CONTRÔLE » / « Signatures », mentions « AIP – Activité importante pour la protection » (badge « ETAPE AIP »), « Prérequis », « Référence Doc externe », observation, « Détail Contrôle Technique », « n signature(s) obligatoire(s) » (si `signatoriesStatus = REQUIRED`).
- Sections : « SIGNATURES A FAIRE » / « Déjà réalisées » ; colonnes/lignes par nature : **R** Réalisation, **CT** Contrôle technique, **PA** points d'arrêt internes/externes 1–3, **PC** points de convocation internes/externes 1–3 (badges `execution.sign.badge.{R,TC,HP,WP}`), nom du surveillant concerné (flow `internal/externalSupervisorName1..3`).
- Chaque case : « Signature à réaliser », « Signature obligatoire », signée (« X a signé pour Y » en procuration, date au format interne/externe, commentaire), « Non applicable », « Reprendre » (signature en attente), « Authentification forte » (QR).
- **Mode simplifié** (`flow.simplifiedSignatureMode`) : la section PA/PC n'est affichée que si des signatures PA/PC existent déjà ; sinon seules R (et CT) [O] gabarit `!simplifiedSignatureMode || pa/pc.length>0`.
- **Paramètres des signatures** (`app-signatures-settings-modal`) : ajouter des **points d'arrêt** internes/externes additionnels sur le contrôle ; « Une fois rajoutées, les signatures additionnelles ne pourront plus être supprimées » ; désactivé si le bloc a un document généré en cours [O] `editSignatureSettingsDisabled`.
- « Aller au tableau des signatures » / « Tableau des signatures » (`app-signatures-tables`) : vue de toutes les signatures du flow par étape.
- Désactivé pour un flow GENERIC ; non signable si étape verrouillée, en lecture, « WebApp uniquement » ou bloc de flow intervention non validé [O].

---

## 5. Données hors ligne et synchronisation (comportement d'origine)

### 5.1 Ce qui est stocké localement [O] `room:*` (64 tables)

| Groupe | Tables Room | Portée |
|---|---|---|
| Session / profil | `session`, `user`, `push_status`, `feature_toggle`, `external_signatory_cache`, `map_config` | appareil (multi-profils) |
| Référentiels | `label_family`, `label_applicability`, `application` (société/applicabilité), `custom_status`, `assigned_user` (collaborateurs, opérateurs **et tablettes** : `natureUser`, `deviceStatus`), `skill`, `team_role` (rôle dans le projet) | par projet téléchargé |
| Entité | `project`, `custom_field` (+ `custom_field_image`), `document_flow`, `version_document_flow`, `geometry`, `geometry_coordinate` | par projet |
| Flow | `flow`, `flow_user`, `flow_collaborator`, `flow_assignee`, `application_event` (historique des statuts), `epsilon_out` (PGAC), `flow_sequence`, `phase`, `step`, `navigation_flow`, `flow_skip_fill_restriction_signatory` | par flow |
| Blocs | `bloc`, `bloc_document_flow`, `element_pr`, `element_dsi`, `element_emm`, `element_adr`, `parade`, `element_rhp`, `element_rhp_label_family_skills` | par flow |
| Signatures | `signatory` (modèle historique : DSI, sous-instructions), `receptacle`, `receptacle_control_block`, `signature`, `signature_event` (nouveau modèle, §7) | par flow |
| Formulaires | `form` (gabarits **et** réponses, cf. `typeForm`), `form_business_link`, `form_business_link_rubric_permission`, `form_response`, `rubric`, `question`, `option`, `option_signatory`, `version_option`, `option_string_value`, `option_unit_value`, `option_localisation_value`, `option_enum_value`, `application_file` | par flow / projet / organisation (génériques) |
| Exécution locale | `flow_execution`, `form_execution`, `flow_access_history`, `step_access_history`, `checkout_log` | locale, jamais poussée |

Particularités du modèle formulaire d'origine [O] :
- `form.typeForm ∈ {FORM, RESPONSE, RESPONSE_DONE, AUTRE}` : une **réponse est une copie complète** de l'arbre du formulaire (rubriques/questions/options clonées, `cloneRubricsTransaction`), rattachée au gabarit par `formParentUuidEntity` ; les valeurs saisies sont portées par les **options** (`option.nature` + tables `option_*_value`) et les signataires de question par `option_signatory`.
- `form_response(formUuidEntity, formBusinessLinkUuidEntity)` relie une réponse à son lien bloc↔formulaire.
- `form.responseProvenance` et `version_option.responseProvenance` : WEB / MOBILE.
- Fichiers : `application_file(path local, extention, hash, deleted, createDate, rubric|question|option)`.

### 5.2 Téléchargement (checkout) [O] `js:main` services checkout (offsets ~199k–238k), `room:checkout_log`

**Déclenchement** : sélection de flows dans la liste (§2.3) puis « Téléchargement », ou « Re-télécharger flow » (détail), toujours **en ligne**.

**Pré-conditions** (dans l'ordre) :
1. Aucune sauvegarde en cours, sinon « Veuillez attendre la fin de sauvegarde avant de procéder à un nouveau téléchargement. » (`sharedModule.alertModal.backupInProgress`).
2. **Aucune modification locale non envoyée** (`push_status.uncommittedChanges = false`), sinon « Veuillez envoyer toutes vos données avant de procéder à un nouveau téléchargement. » (`sharedModule.alertModal.desynchronizedData`). ⇒ *Règle structurante : on pousse toujours avant de re-télécharger.*
3. Calcul des couples (flow, projet) à télécharger ; contrôle d'organisation (R-SES-3).
4. **Snapshot de secours** de la base (`BackupManager.createCheckoutSnapshot`) ; en cas d'échec : modale « Attention — Un problème est survenu lors de la sauvegarde de secours… Code d'erreur : {code} — Que voulez-vous faire ? [Réessayer] [Ignorer] » (`snapshotFailModal.*`), contrôle d'intégrité (« La vérification de l'intégrité de la sauvegarde temporaire a échoué », `execution.snapshot.*`).

**Préparation** : `session.checkoutInProgress = true` ; **sans** la feature `sfp-16808-checkout-only-modified-flows`, la base métier est **vidée** (`clearDatabaseForCheckout`) : le jeu de flows sélectionné **remplace** le contenu local. Avec la feature, seuls les flows modifiés depuis le dernier checkout sont re-téléchargés [I] (`/flows/modificationDates` comparé aux `checkout_log`).

**Séquence** :
1. (feature *once*) `POST /checkout/generic-forms {projectIds}` puis `POST /checkout/projects {projectIds}` → familles (+ parents), applicabilités, applications, projets, fichiers, attributs de projet, utilisateurs du projet, rôles d'équipe, compétences.
2. Pour chaque flow (progression par flow, plafonnée à 98 %) : création d'un `checkout_log(startDate, status=STARTED, flowUuidEntity, projectUuidEntity)` puis :
   - élément flow (`/checkout/flow` ou `/checkout/flow/light`), formulaires génériques (ancienne voie), cartes du projet et du flow (`/checkout/project-geometries`, `/checkout/flow-geometries`), séquences (`/checkout/flow-sequences`), phases (`/checkout/phases`) ;
   - **étapes** une par une (`POST /checkout/steps/{stepId}`, 50 en parallèle) : attributs phase/étape, redirections, blocs, documents (+ versions + liens bloc), statuts, sous-instructions, signataires, **réceptacles / signatures / événements** (services dédiés), moyens/risques/équipe ;
   - **flows liés** (étape liée à un flow enfant, flow chapeau) : téléchargés récursivement (dédoublonnés) ;
   - formulaires : liste `GET /checkout/flow/{id}/formsUuidEntities` puis `POST /checkout/forms` par lots de 50 (dédoublonnés entre flows) ; liens bloc↔formulaire et réponses (`/checkout/form-business-links`, ou `/{fbl}/light` par lien) + permissions de rubrique ; **contrôle de cohérence** du type de réponse vs formulaire (journal `UUID_TYPE_CONSISTENCY_KO`).
   - fin : `checkout_log.status = SUCCESS|FAILURE`, `endDate` ; ajout de l'utilisateur courant au flow (`flow_user`).
3. Après succès de tous les flows : **fichiers** (`application_file`) — téléchargement des fichiers manquants, suppression des fichiers orphelins (hors journaux) ; images des contenus riches ; **PDF des versions de documents** par lots de 20.
4. Suppression du snapshot, `checkoutInProgress=false`, modale « Téléchargement terminé… passer hors ligne ? ».

**Échecs** :
| Cas | Comportement | Message |
|---|---|---|
| Annulation utilisateur | rollback du snapshot | `common.cancellingCheckout` |
| 403 sur un flow/projet | rollback + modale « Téléchargement bloqué » | `checkout.forbiddenModal.*` (R-SES-1) |
| 404 projet | rollback | « Un des projets disponibles hors ligne a été supprimé. » |
| Réseau (statut 0) | rollback | « L'envoi de données a été interrompu : veuillez vérifier votre connexion internet » (`checkout.message.connectionIssue`) |
| Autre | rollback | « Une erreur est survenue lors du téléchargement des flows. » |

**Ce que le serveur filtre** [I] : seuls les flows dont le statut est téléchargeable (« En opération ») et auxquels le profil a accès (membre du projet ou tablette du projet) ; le nombre de **réponses terminées** téléchargées par lien est limité par `organizations.allowed_download_response` (les réponses en cours sont toutes téléchargées).

### 5.3 Marquage des modifications locales [O] enum `EntityStatus`, `room:*.entityStatus`, `room:push_status`

- `entityStatus ∈ {ADDED, UPDATED, DELETED, SYNCHRONIZED}` sur : `flow`, `step`, `navigation_flow`, `bloc`, `element_pr`, `element_dsi`, `signatory`, `form`, `form_business_link`, `rubric`, `question`, `option`, `option_signatory`, `version_option`, `application_file`, `geometry`, `flow_skip_fill_restriction_signatory`, `receptacle`, `signature`, `signature_event`.
- Tout ce qui vient du checkout est `SYNCHRONIZED` ; une création locale est `ADDED` ; une modification d'un élément synchronisé le passe à `UPDATED` (jamais d'`ADDED` vers `UPDATED`) [O] `setEntityStatusToUpdated`.
- `push_status` (une ligne) : `uncommittedChanges` (vrai dès la première écriture locale, `addChanges()`), `pushFailure`, `lastPushDate`, `lastModificationDate`. Chaque transaction locale renvoie le `push_status` à jour (`updatePushStatusAndExtract`).
- Après un push : `uncommittedChanges = (il reste des entités non SYNCHRONIZED) || (des fichiers non synchronisés)` ; `pushFailure=false` ; `flow.lastPushDate` mis à jour pour les flows de l'organisation. Sur échec : `pushFailure=true`.
- Compteur « données locales » du flow (§2.4) = réponses et signatures non synchronisées.

### 5.4 Envoi (push) [O] `js:main` `PushService.push` (offset ~412k), `pushData`

**Déclencheurs** : passage en ligne (automatique), bouton « Envoi » (liste des flows), « Forcer l'envoi » (modales), avant suppression de données (exigé). Un verrou empêche deux envois simultanés. Barre de progression (10 étapes).

**Ordre des étapes** (chacune ne pousse que les entités non `SYNCHRONIZED`, puis les marque `SYNCHRONIZED`) :
1. **Formulaires et réponses** (`processLocalFormsToPush`) : fichiers d'abord (`POST /application-files/{uuid}/push-file`, multipart ; suppression `…/mark-as-deleted`), puis squelettes de formulaires locaux (`/skeleton-forms/push`), réponses de niveau projet (`/project-form-responses/push/light`), réponses de flow par étape (`/steps/{id}/flow-form-responses/push/light` avec le lien bloc↔formulaire et l'étape) ; seules les branches modifiées de l'arbre (rubrique → question → option/signataire/fichier) sont envoyées.
2. **Signataires de déverrouillage de flow** (`/flows/skip-fill-restriction-signatories/push`).
3. **Étapes validées** (`/steps/push` : `[{stepUuidEntity, checked}]`).
4. **Contrôles (DSI)** (`/element-dsis/push`, une requête par élément) : signataires ajoutés/modifiés + **versions de documents liés** au bloc au moment de la signature ; la réponse indique par signataire `persisted` et les versions `missing` / `appearedSinceSigning` → envoi **partiel** journalisé (`PUSH_DSI_PARTIAL`) ; seuls les signataires persistés passent `SYNCHRONIZED`.
5. **Sous-instructions** (`/element-prs/push`, une requête par élément).
6. **Redirections** (`/navigation-flows`).
7. **Statuts de flow** (`/flows/custom-status`, avec commentaire local).
8. **Arbre de formulaire** (finalisation des statuts).
9. **Géométries** (`/map/push-geometries`).
10. **Versions d'options** (`/version-rubric-option/push`).

Fin : toast « Les données ont bien été envoyées vers la WebApp. » ; mise à jour des infos appareil (§1.8) ; si l'envoi faisait suite à un passage en ligne avec modifications : **dump chiffré** + envoi des journaux.

### 5.5 Erreurs et conflits [O]

| Cas | Détection | Effet | Message |
|---|---|---|---|
| Réseau coupé | statut 0 | arrêt, `pushFailure=true`, données conservées | « L'envoi de données a été interrompu : veuillez vérifier votre connexion internet. » + [Réessayer] |
| Erreur serveur | autre statut | idem | « Une erreur est survenue lors de l'envoi de données. Veuillez vérifier la présence des données envoyées sur la WebApp avant de contacter le support… » + [Réessayer] |
| Accès retiré au projet | 403 `error.http.403` | passage hors ligne forcé + modale | R-SES-2 |
| Réponse unique déjà existante | `form.uniqueResponseAlreadyExists` | la réponse locale est **abandonnée** (marquée synchronisée), avertissement | `push.uniqueResponseAlreadyExists` |
| Erreurs par élément (DSI/PR/réponses) | requêtes individuelles | les éléments en succès sont synchronisés, les autres restent en attente ; erreur agrégée levée (`PUSH_ELEMENT_DSI_ERROR`, `PUSH_ELEMENT_PR_ERROR`) | `push.otherError` |
| Envoi DSI partiel | `persisted=false`, versions manquantes | signataires non persistés restent en attente | journal seulement |
| Réponse terminée non modifiable | réglage `block_form_response_edition` | empêché **en amont** dans l'UI (bouton masqué) | — |

Pas de fusion fine côté mobile : le serveur fait foi pour l'arbitrage ; la règle « pousser avant de re-télécharger » évite l'écrasement de saisies locales.

### 5.6 Suppression des données locales et purge [O]

- **Supprimer de la tablette** (un flow, détail) : confirmation « Attention, vous êtes sur le point de supprimer un élément important — Une fois supprimées, les données du flow seront irrécupérables. Souhaitez-vous vraiment supprimer cet élément ? » ; refus si le flow est importé dans d'autres flows téléchargés : « Impossible d'effectuer la suppression car il est importé dans le(s) flow(s) : {flows} » ; suppression en base + fichiers associés (`deleteFlowAndReturnAppFilesToDeleteFromFileSystem`).
- **Supprimer les données téléchargées** (une entité) : même modale (`deleteProject.*`), « Suppression en cours... », retour à la liste des entités.
- **Garde-fou** : si des données locales non envoyées existent → « Attention, des données locales n'ont pas été envoyées — La tablette contient des données non envoyées sur la WebApp qui ne peuvent pas être supprimées. Veuillez forcer l'envoi et réessayer. [Forcer l'envoi des données] [Annuler] » (`sharedModule.alertModal.forceDataPush.*`).
- **Réinitialiser la base de données locale** (Paramètres) : « Attention, vous êtes sur le point de réinitialiser la base de données locale — Une fois la base de données réinitialisée, les données locales seront définitivement perdues. Êtes-vous sûr.e de vouloir réinitialiser ? » → `resetDatabase`, suppression des dossiers données/cache, du journal *failsafe*, réinitialisation des journaux, **déconnexion**.
- **Purge automatique** [HC:RN97] : un flow dont le statut n'est plus « En opération » (non téléchargeable) disparaît de l'appareil [I : au prochain checkout / rafraîchissement ; sans la feature *only-modified*, la purge est implicite car la base est vidée à chaque checkout].

---

## 6. Sauvegardes, chiffrement, journaux

### 6.1 Dumps chiffrés [O] `js:main BackupService`, plugin `BackupManager`, `room:session.{backupTimer,backupLocation,lastBackupDate,lastSnapshotDate,encryptionPublicKey}`

- **Clé** : le serveur fournit une **clé publique** de chiffrement (`/dump_encryption_key/public`, mise en cache dans `session.encryptionPublicKey`) ; la **clé privée** n'est demandée que pour **restaurer** (`/dump_encryption_key/private`). Échec : « Impossible de récupérer la clé de chiffrement » (`backup.retrievePublicKeyError`).
- **Dump automatique** : à chaque passage en ligne avec modifications, et périodiquement selon l'intervalle (5 min → 4 h) vers l'emplacement choisi (stockage interne / microSD), en tâche de fond ; « Sauvegarde en cours, ne pas quitter » (`common.backupInProgress`).
- **Dump manuel** : Paramètres > « Sauvegarder les données locales vers le stockage interne / la carte microSD ».
- **Envoi au support** : upload du dump vers `dumpUploadApi` (stockage objet, avec jeton, sous-domaine, utilisateur) ; côté WebApp : Paramètres > « Backups » (« Liste des backups MobileApp » : Date, Rapporteur, Action utilisateur, Télécharger) [O] `i18n` WebApp `backup.*`.
- **Restauration** : options avancées de l'écran de connexion « Importer les données ».
- Erreur : « Quelque chose s'est mal passé lors de la sauvegarde. Veuillez contacter le support Siteflow. » (`backup.error`).

### 6.2 Snapshots de checkout [O] §5.2 étape 4 : copie de la base avant téléchargement, restaurée (rollback) en cas d'échec/annulation, supprimée en cas de succès.

### 6.3 Base corrompue / erreur locale [O] `sharedModule.alertModal.databaseError.*`, `common.databaseCorrupted.*`
- « Une erreur est survenue sur la base de données locale — Afin de garantir l'intégrité des données, veuillez forcer l'envoi d'une sauvegarde. [Forcer l'envoi de la sauvegarde] » → « Veuillez garder l'application ouverte — Envoi de la sauvegarde en cours… ».
- « Contacter le support Siteflow immédiatement — … repasser en ligne dès que possible et envoyer les données manuellement au serveur depuis la page [Accéder aux paramètres] ».

### 6.4 Failsafe [O] plugin `Failsafe` (`FailsafeDataTypeEnum`: SIGNATORY, ELEMENT_PR, FORM, RUBRIC, OPTION, QUESTION, APPLICATION_FILE…, DAO `GarbageDao`), `saveSignatoriesToFailsafe`
- Journal **secondaire** (base séparée) où sont recopiées les saisies critiques (signatures, réponses) au moment de l'écriture ; sert de filet en cas de corruption de la base principale ; vidé à la réinitialisation. [I] Exploité par le support (dump).

### 6.5 Journaux [O] `logManagementService`, `push.logsNotPushed`, WebApp « Logs push »
- Journal applicatif fichier (actions : START/END_CHECKOUT, PUSH_*, SWITCH_TO_OFFLINE/ONLINE, CLICK_TO_SAVE_SIGNATURE, SCAN_QRCODE_FLOW_*, DUAL_WRITE_*, TOKEN_FAIL…) envoyé au serveur après chaque push réussi ; consultable sur la WebApp (Paramètres > « Logs push »). Échec : « Impossible d'envoyer les logs au serveur. » ; init : « Impossible d'initialiser les logs… ».
- Télémétrie NewRelic (hors périmètre).

---

## 7. Modèle de signature mobile

### 7.1 Deux modèles coexistants (« dual write ») [O] `js:9768` (adaptateurs), `js:main` (mappers, offsets ~213k, ~767k, ~850k)

L'app d'origine est en **migration** d'un modèle historique vers un nouveau modèle :
1. **Historique** — table `signatory` (une ligne = une case de signature d'un élément DSI ou d'une sous-instruction) : `uuidEntity, firstName, lastName, profession, email, companyName, optional, userRef, typeSignatory (INTERN|EXTERN|NO_LISTED_INTERN), signatureState (SIGNED|WAITING|FREE|SIGNATURE_NOT_POSSIBLE), imageSignature, hashSignature, commentSignature, signatureDate, signatureNature, appSource (WEB|MOBILE), mode (ONLINE|OFFLINE), latitude, longitude, flowUuidEntity, recoveryData, localCreateDate, uniqueDeviceId, signWithQrCode, proxied, signatureProxiedDate, entityStatus, elementPrUuidEntity | elementDsiUuidEntity`. **C'est ce modèle qui est poussé** (`/element-dsis/push`, `/element-prs/push`).
2. **Nouveau** — `receptacle` → `signature` → `signature_event` (+ `receptacle_control_block`) : modèle événementiel, écrit **en parallèle** (adaptateur `DualWrite` : écrit d'abord l'historique, puis le nouveau modèle ; un échec du nouveau modèle est seulement journalisé `DUAL_WRITE_SIGNATURE_FAIL` ; une complétion sans signature préalable dans le nouveau modèle est journalisée `DUAL_WRITE_SIGNATURE_MISSING`). Il est **téléchargé** au checkout (services `receptacleCheckout`, `signatureCheckout`, `signatureEventCheckout`) mais **aucun endpoint de push** n'a été observé [O] (recherche `/receptacles`, `/signatures`, `/signature-events` négative).

Seule famille d'hôte implémentée : `hostKind = "CONTROL_BLOCK"` (bloc Contrôles) ; tout autre hôte lève « Unsupported signature family » [O].

### 7.2 Nouveau modèle — tables [O] `room:*`

**`receptacle`** (= emplacement de signature attendu)
| Colonne | Sens |
|---|---|
| `id` (uuid client) | |
| `hostKind` | `CONTROL_BLOCK` |
| `mandatory` | vrai si nature **point d'arrêt** (PA) **ou** `element_dsi.signatoriesStatus = REQUIRED` [O] `O=(nature,status)=> kind==="BREAKPOINT" || status===REQUIRED` |
| `createdDate`, `entityStatus` | |

**`receptacle_control_block`** (`receptacleId` PK, `elementDsiId`, `signatureNature`) : rattache un réceptacle à un élément DSI et à une **nature**. Création locale [O] `createControlBlockReceptacles` : pour chaque nature activée sur l'élément DSI (drapeaux `element_dsi.signatureConvocationSupervisionIntern1..3`, `signatureBreakpointSupervisionIntern1..3`, `…Extern1..3`) **sans réceptacle existant**, un réceptacle est créé (`entityStatus=ADDED`). Correspondance : `signatureConvocationSupervision{Intern|Extern}{n}` → nature `SIGNATURE_CONVOCATION_SUPRV_{INT_PI|EXT}{n}` (kind CONVOCATION = PC) ; `signatureBreakpointSupervision{Intern|Extern}{n}` → `SIGNATURE_SUPRV_{INT_PI|EXT}{n}` (kind BREAKPOINT = PA). Pour R et CT, le réceptacle est résolu à la volée (réceptacle existant de même nature, sinon nouvel identifiant) [O] `resolveReceptacle`.

**`signature`** (= acte de signature dans un réceptacle)
| Colonne | Sens |
|---|---|
| `id` | = `uuidEntity` du signataire historique (même identifiant dans les deux modèles) |
| `receptacleId` | FK réceptacle |
| `nonApplicable` | vrai = « Signature non applicable » |
| `declaredDate` | date de signature **déclarée** par l'utilisateur |
| `signatory_firstName, _lastName, _profession, _email, _companyName` | identité (email = « référence » du signataire) |
| `signatory_userRef` | identifiant du collaborateur (si interne listé) |
| `signatory_provenance` | `FROM_LIST` (collaborateur choisi dans la liste) · `NOT_IN_LIST` (« Non présent.e dans la liste ») · `QR_CODE` (authentification forte) |
| `signatory_affiliation` | `INTERNAL` · `EXTERNAL` |
| `mandate_principalFirstName/LastName` | **mandant** (« La personne donnant procuration ») |
| `mandate_proxyHolderFirstName/LastName` | **mandataire** (« La personne qui bénéficie de la procuration (vous-même) ») |
| `mandate_procurationDate` | date de procuration |
| `entityStatus` | |

Le **dessin** et l'**état** ne sont pas des colonnes : ils vivent dans les événements.

**`signature_event`** (journal append-only)
| Colonne | Sens |
|---|---|
| `id` (uuid client), `signatureId` | |
| `eventSequence` | 0, 1, … (ordre par signature) |
| `type` | `CREATED`, `DRAWING_ADDED` (observés) |
| `fromState` → `toState` | `NONE`, `PENDING`, `ACTIVE` |
| `authorAccountRef` | profil connecté qui a saisi (utilisateur ou tablette) |
| `occurredAt` | horodatage (création : maintenant ; ajout de dessin : date déclarée) |
| `reason`, `comment` | commentaire de signature |
| `payload` | dessin de signature (image) |
| `entityStatus` | |

### 7.3 Machine à états [O] `js:9768` (fonctions de correspondance `E`, `h`), `creationEventFor`, `drawingAddedEventFor`

```
             CREATED (seq 0)                 DRAWING_ADDED (seq 1)
   NONE ───────────────────────► PENDING ────────────────────────────► ACTIVE
     │                                                                   ▲
     └──────────────── CREATED (seq 0, signature immédiate) ─────────────┘
                         (ACTIVE + nonApplicable=true ⇒ « non applicable »)
```

| État historique (`signatureState`) | État nouveau modèle | `nonApplicable` |
|---|---|---|
| `FREE` (non signé) | `NONE` | — |
| `WAITING` (« Signer plus tard » / signature en attente) | `PENDING` | faux |
| `SIGNED` | `ACTIVE` | faux |
| `SIGNATURE_NOT_POSSIBLE` (« Signature non applicable ») | `ACTIVE` | **vrai** |

- **Apposer** (`affix`) : crée la `signature` + événement `CREATED` (`NONE → état choisi`, payload = dessin éventuel). Pour un signataire **externe** sans procuration, l'identité est ajoutée au **cache des signataires externes** (`external_signatory_cache` : prénom, nom, fonction, société, email, `lastSignatoryDate`) pour proposer l'auto-complétion lors des signatures suivantes.
- **Compléter** (`complete`, reprise d'une signature en attente — bouton « Reprendre ») : ajoute `DRAWING_ADDED` (`PENDING → ACTIVE`, payload = dessin, `occurredAt` = date déclarée) ; côté historique : mise à jour de l'image et du commentaire (`updateSignatoryImageAndComment`).
- [I] Pas d'annulation/révocation sur mobile (aucun autre type d'événement observé ; la suppression/désactivation est une action WebApp, `signature_events.action` côté serveur).

### 7.4 Règles de saisie [O] `js:620` (`app-signature-modal`), `js:9079 openDsiSignatureModal`, fonction de complétude (`js:main` ~767k)

Modale de signature (sources : `SIGNATURE` (DSI), `MULTI_PR`, `FORM`, `SKIP_FILL_RESTRICTIONS`) :
- Titre selon la nature (« Point de convocation interne », « Point d'arrêt externe », « Réalisation », « Contrôle technique »…, `signatureModal.signatureTypeLabel.*`), surveillant concerné (non modifiable), « Détail Contrôle Technique », description de rubrique (formulaires) ; « Voir plus / Voir moins ».
- Choix du mode : **« Signer en personne »** / **« Signer par procuration »** / **« Signature non applicable »** (→ « Signer la non-applicabilité ») ; type de signataire : **Collaborateur** (liste) / **QR code** / **Non présent.e dans la liste** (case `collaboratorNotInList`) ; signataire **externe** pour les natures externes (Prénom, Nom, Email, Fonction, Société, avec placeholders `common.placeholder.*`).
- Liste des collaborateurs : collaborateurs du flow ; si une **liste restreinte** est définie dans l'affectation du flow (WebApp), seuls ceux-ci sont proposés, en ligne comme hors ligne [HC:RN101] ; responsables du flow autorisés à signer [HC:R2.1].
- **QR code (authentification forte)** : scan du « QR Code ID » du collaborateur ; erreurs « Code QR invalide! », « Le QR code n'est pas conforme », « Utilisateur non trouvé », « La plateforme n'est pas native » ; « Valider l'identification » → « L'identification à été correctement enregistrée, vous pouvez continuer » (`common.signatoryIdentificationSuccessMsg`). En identification QR, le dessin n'est pas exigé [O] (bouton actif si `isIdentificationFlag || dessin`). `signWithQrCode=true`, provenance `QR_CODE`.
- Champs communs : **Date** (`common.date`, défaut maintenant ; figée si `autoSignatory` pour les formulaires), **Heure**, **Commentaire** (optionnel, compteur « n / max caractères » ; **obligatoire** en déverrouillage de flow), **zone de dessin** « Veuillez signer dans cet encart » + « Effacer ».
- **Procuration** : Mandant (prénom, nom), Mandataire = soi, **Date de procuration** ; contrôle « Impossible de renseigner une date de signature antérieure à la date de procuration » (`common.signatureDateError`).
- Boutons : **Signer**, **Signer plus tard** (crée la case en `WAITING`/`PENDING` sans dessin), Annuler ; succès « La signature a bien été sauvegardée, vous pouvez continuer » ; échec « Échec de l'enregistrement de la signature ».
- **Complétude** d'une signature (avant enregistrement) [O] :
  - procuration : dessin (sauf signature désactivée) + date + date de procuration + prénom + nom ;
  - `INTERN` : dessin + date + `userRef` ;
  - `EXTERN` / `NO_LISTED_INTERN` : dessin + date + prénom + nom + fonction.
- **R-SIG-RCT** : un même collaborateur ne peut pas signer **la Réalisation et le Contrôle technique** d'un même élément : « Un.e même collaborateur.trice ne peut pas signer la réalisation de l'étape ainsi que le contrôle technique. » (contrôle sauf procuration, non-applicable ou signataire sans `userRef`) [O] `js:9079`.
- Effets de bord : figement des **versions de documents** liés au bloc au moment de la signature [HC:RN97] (renvoyées au push DSI) ; géolocalisation, mode (ONLINE/OFFLINE), identifiant d'appareil et date locale de création consignés dans le signataire historique.

### 7.5 Correspondance avec le schéma Supabase actuel

| Mobile d'origine | Supabase (`signatures`, `signature_events`) | Écart |
|---|---|---|
| `signatory.signatureState` / `signature`+événements | `signatures.state` (`signed, waiting, free, not_possible`) | équivalent (non-applicable = `not_possible`) |
| `typeSignatory` / `provenance`+`affiliation` | `signatures.contributor_type` (`intern, extern, not_listed_intern`) + `sign_with_qr_code` | équivalent |
| `signatureNature` | `signatures.nature` (`realisation, tech_control, breakpoint_int_1..3, convocation_int_1..3, breakpoint_ext_1..3, convocation_ext_1..3`) | équivalent |
| `mandate_*` | `proxied`, `proxy_principal_name`, `proxy_date` | **manque** séparation prénom/nom du mandant et identité du mandataire |
| `imageSignature` | `signature_path` (Storage) | équivalent (fichier) |
| `elementDsiUuidEntity` / réceptacle | `signatures.block_id` (+ `step_id`, `flow_id`) | **pas de notion de réceptacle** ni d'élément DSI ; obligatoire calculé depuis `block_dsi_configs` |
| `elementPrUuidEntity` (sous-instruction) | `block_multi_pr_signatures` (table distincte) | équivalent |
| `appSource` | `signatures.source` (`mobile`) | ok |
| `localCreateDate`, `uniqueDeviceId`, `mode`, `latitude/longitude`, `recoveryData` | — | **manquants** |
| `signature_event` (`eventSequence, type, fromState, toState, authorAccountRef, payload, reason`) | `signature_events(action create|update|delete|deactivate_nature, nature, supervisor_name, actor_id, source, occurred_at)` | **manquent** séquence, états, payload, auteur-profil tablette, identifiant client (bigint identity) |
| `flow_skip_fill_restriction_signatory` | `step_fill_unlocks` (par étape) | **manque** le déverrouillage de flow signé |
| `external_signatory_cache` | — | local uniquement (aucune table nécessaire) |
| `option_signatory`, `version_option` | valeurs `value_type = signature` dans `form_response_values` + `form_response_value_history.change_signature` | cf. spec 03 |

---

## 8. Correspondance tables Room → schéma Supabase

Légende : ✅ table existante adaptée · 🟡 existante avec colonnes à ajouter · ❌ à créer · 📱 locale uniquement (PowerSync `localOnly`, jamais synchronisée).

### 8.1 Session, profil, appareil

| Room | Supabase | Statut | Notes |
|---|---|---|---|
| `session` | — | 📱 | jetons gérés par supabase-js (SecureStore) ; préférences → table locale `app_settings` |
| `user` | `collaborators` / `tablets` | 🟡 | **les tablettes n'ont pas de compte d'authentification** (`tablets` sans `auth_user_id`) ; voir §9.2 |
| `assigned_user` | `collaborators` (+ `tablets`) | 🟡 | nature utilisateur (`NORMAL`, `EXTERN`, `DEVICE`, `DEVICE_EXT`, `OPERATOR`) ↔ `collaborators.kind` + `authority` ; tablettes à unifier (§9.2) |
| `push_status` | — | 📱 | remplacé par l'état de la file PowerSync (`currentStatus`, `getNextCrudTransaction`) |
| `feature_toggle` | `organizations.*` (drapeaux) | ✅ | `diagram_enabled`, etc. ; pas de toggles de checkout nécessaires |
| `external_signatory_cache` | — | 📱 | |
| `map_config` | — | ❌ | config fournisseur de tuiles (organisation) : colonne `organizations.map_config jsonb` [P] |
| `checkout_log` | — | 📱 | remplacé par l'état des abonnements PowerSync (`hasSynced`, `lastSyncedAt` par stream) |
| — | `authorized_devices` | ✅ | contrôle à la connexion (§9.2) |
| — | `tablets` (télémétrie) | ✅ | `unique_device_id, app_version, android_version, battery_level, device_model, screen_size, last_push_at, last_latitude/longitude` |

### 8.2 Référentiels et entité

| Room | Supabase | Statut |
|---|---|---|
| `label_family`, `label_applicability` | `label_families` (nature, parent) | ✅ |
| `application` | `companies` / `accounts` | ✅ (applicabilité = société/compte, spec 01) |
| `custom_status` | `custom_statuses` (`downloadable`, `category`) | ✅ |
| `skill`, `team_role` | `collaborator_skills`, `project_members.role` | ✅ |
| `project` | `projects` | ✅ |
| `custom_field`, `custom_field_image` | `custom_fields` + `custom_field_values` (`object_id`, `business_class`) | 🟡 `custom_field_values` sans `flow_id`/`project_id` → dénormaliser pour la synchro par flow |
| `document_flow`, `version_document_flow`, `bloc_document_flow` | `documents`, `document_versions`, `document_files`, `block_documents` | ✅ |
| `geometry`, `geometry_coordinate` | `flow_geometries` (`geojson`) | ✅ (coordonnées dans le GeoJSON) |
| `application_event` | `flow_status_history` | ✅ |
| `epsilon_out` (PGAC) | `projects.pgac_activities` / champs PGAC | 🟡 à confirmer (spec 01) |

### 8.3 Flow et contenu

| Room | Supabase | Statut | Notes |
|---|---|---|---|
| `flow` | `flows` | 🟡 | `skipFillRestrictions` → ❌ `flows.fill_restrictions_skipped` (ne pas confondre avec `flows.unlocked`, qui concerne le déverrouillage d'un flow référentiel exécuté, spec 02) ; `actor1..3` ↔ `tablet_1..3_id` ; `reporterUserUuidEntity` ↔ `reporter_id` ; `localCustomStatusComment` → `flow_status_history.comment` |
| `flow_user`, `flow_collaborator`, `flow_assignee` | `flow_collaborators`, `flow_assignees` | ✅ (`flow_user` local) |
| `flow_sequence` | `sequences` (`type`) | ✅ |
| `phase` | `phases` (`sequence_id`, `sequence_type` = mode des étapes, `mandatory`, `read_only_on_mobile_app`, `disabled`) | ✅ |
| `step` | `steps` (`validated_at/by/validation_source`, `first_opened_at`, `read_only_on_mobile_app`, `linked_flow_id`) | 🟡 | **`locked` n'existe pas** : calcul local (§9.5) ; drapeaux de type de bloc dérivés de `blocks` |
| `navigation_flow` | `step_navigations` | 🟡 + ❌ | configuration ✅ ; **utilisation** (date, commentaire, utilisateur) → ❌ `step_navigation_events` |
| `bloc` | `blocks` (`type`, `state`, `content_html/json`, `txt_visibility`, `multi_pr_*`) | ✅ |
| `element_dsi` | `block_dsi_configs` (1 par bloc) | ✅ |
| `element_pr` | `block_multi_pr_items` (`custom_status_id`, `observation`, `disabled`) | ✅ (+ `block_multi_pr_events` pour l'historique) |
| `element_emm`, `element_adr`+`parade`, `element_rhp`+skills | `block_emm_items`, `block_adr_items`+`library_risks/library_risk_parades`, `block_rhp_items`+`block_rhp_item_skills` | ✅ |
| — (objets, en ligne) | `block_object_items`, `technical_objects`, `custom_field_values` | ✅ (non synchronisés hors ligne, cf. §9.4) |
| `flow_skip_fill_restriction_signatory` | `step_fill_unlocks` | ❌ | créer `flow_fill_unlocks` (§9.3) |

### 8.4 Signatures

| Room | Supabase | Statut |
|---|---|---|
| `signatory` (DSI) | `signatures` | 🟡 colonnes §7.5 (`local_created_at`, `device_id`, `connection_mode`, `latitude`, `longitude`, `proxy_principal_first_name/last_name`, `proxy_holder_name`) |
| `signatory` (sous-instruction) | `block_multi_pr_signatures` | 🟡 mêmes compléments + `state`, `proxied`, `contributor_type` |
| `receptacle` + `receptacle_control_block` | — | **non repris** [P] : les emplacements attendus se déduisent de `block_dsi_configs` (natures activées, `signatories_status`) — une vue SQL `dsi_expected_signatures` suffit |
| `signature` | `signatures` | ✅ (une ligne par acte) |
| `signature_event` | `signature_events` | 🟡 ajouter `client_event_id uuid unique`, `event_sequence`, `from_state`, `to_state`, `payload_path`, `reason`, `actor_tablet_id`/principal |

### 8.5 Formulaires

| Room | Supabase | Statut | Notes |
|---|---|---|---|
| `form` (`typeForm=FORM`) + `rubric` + `question` + `option` | `forms` + `form_versions.structure` (instantané JSON) | ✅ | le mobile lit la **version épinglée** (`form_block_links.pinned_version_id` ou `forms.current_version_id`) ; inutile de synchroniser `form_rubrics/questions/options` |
| `form` (`typeForm=RESPONSE/RESPONSE_DONE`) | `form_responses` (`state in_progress/done`, `context`, `block_link_id`, `provenance`) | ✅ | plus de clonage de l'arbre |
| `option` valeurs + `option_*_value` | `form_response_values` (par option / cellule `coord`, `value_*`, `observation`, `locked`) | 🟡 | ajouter `flow_id`, `project_id` (synchro) |
| `option_signatory` | `form_response_values` (`value_type=signature`) | ✅ |
| `version_option` | `form_response_value_history` (`change_signature`) | ✅ |
| `form_business_link` | `form_block_links` (`mandatory`, `unique_response`, `unique_mode`, `initial_rubric_lineage_id`, `fillable_rubric_lineage_ids`) | ✅ | les permissions de rubrique sont portées par `fillable_rubric_lineage_ids` |
| `form_business_link_rubric_permission` | `form_block_links.fillable_rubric_lineage_ids` | ✅ |
| `form_response` | `form_responses.block_link_id` | ✅ |
| `application_file` | `form_response_values.value_json` (liste de fichiers) + Storage | ✅ |
| ajout de ligne/colonne | `form_response_dynamic_items` | ✅ |
| `form_execution`, `flow_execution`, `*_access_history` | — | 📱 |

---

## 9. Proposition React Native + PowerSync [P]

### 9.1 Principes

1. **Une seule source de lecture : SQLite local** (PowerSync, `@powersync/react-native` + `@op-engineering/op-sqlite`, déjà dans `apps/mobile/package.json`), en ligne comme hors ligne. Les écrans observent des requêtes (`useQuery`) et ne parlent jamais directement à l'API pour lire les données synchronisées.
2. **Écritures locales d'abord** dans les tables PowerSync ; la **file CRUD** de PowerSync remplace `entityStatus` + `push_status` ; le connecteur `uploadData` les transforme en appels **RPC Supabase** (validations métier côté serveur, RLS).
3. **« Télécharger » = s'abonner** à un stream paramétré par flow ; **« Supprimer de la tablette » = se désabonner** (après vidage de la file pour ce flow).
4. **Mode hors ligne = choix utilisateur conservé** (ergonomie d'origine) : bouton En ligne/Hors ligne → `powersync.disconnect()` / `powersync.connect(connector)`. Repasser en ligne déclenche naturellement l'envoi (= push automatique d'origine) puis la réception. Les fonctions « en ligne uniquement » (§3.2) sont grisées hors ligne **et** sans réseau.
5. **Plus besoin de vider la base avant un téléchargement** ni d'exiger « envoyer avant de re-télécharger » : PowerSync applique les données serveur sous les écritures locales en attente (cohérence par checkpoint). La règle d'origine est remplacée par : *ne pas se désabonner d'un flow qui a des écritures en attente* (§9.7).
6. Logique métier partagée avec la WebApp via `packages/forms-core` (moteur de réponse : validations, redirections, pré-remplissage), `packages/formula` (formules) et un nouveau module `packages/flow-rules` [P] (pastilles, validation d'étape, séquencement) exécuté côté mobile **et** dans les RPC (même algorithme, tests partagés).

### 9.2 Identité, profils tablette et appareils

**Problème** : le schéma actuel lie l'authentification aux seuls `collaborators.auth_user_id` ; `tablets` n'a pas de compte, et toutes les colonnes d'acteur (`validated_by`, `actor_id`, `created_by`, `signatory_id`…) référencent `collaborators`.

**Proposition** :
- ✅ Ajouter la valeur `device` à l'enum `collaborator_kind` et créer pour chaque tablette un **collaborateur fantôme** `kind='device'` (porteur de `auth_user_id`, `account_id`, `company_id`) ; ✅ `tablets.collaborator_id uuid unique references collaborators(id)`. Toutes les FK d'acteur restent valables ; le libellé affiché est le nom de la tablette.
- ✅ Collaborateur « appareil » créé/renommé automatiquement par déclencheur sur `tablets` ; `private.project_role` donne le rôle `operator` à une tablette sur les entités de `project_tablets` (RLS WebApp inchangée).
- **Pas de claims JWT personnalisés nécessaires** : les Sync Streams n'utilisent que `auth.user_id()` (rapproché de `collaborators.auth_user_id` et des tables d'accès mobiles). Un hook *custom access token* reste possible plus tard pour les RPC, sans impact sur la synchro.
- **Connexion identifiants** : Edge Function `mobile-sign-in` (email, mot de passe, sous-domaine, `device_id`, infos appareil) : vérifie l'organisation du sous-domaine, `authorized_devices` (si la liste n'est pas vide), l'**unicité d'appareil par profil** (✅ table `mobile_device_bindings(principal_id pk, device_id, bound_at, last_seen_at)`), puis ouvre la session (codes d'erreur alignés sur §1.1 : `ANOTHER_DEVICE`, `DEVICE_UNAUTHORIZED`, `INVALID_CREDENTIALS`).
- **Connexion QR** : ✅ `quick_connection_tokens(id, principal_id, token_hash, device_id null, expires_at, revoked_at)` (prévu spec 01) ; QR = `{v:1, host, token}` (seul le SHA-256 du jeton est stocké) ; ✅ Edge Function `mobile-qr-sign-in` : refuse expiré/révoqué (`EXPIRED_QR`), lié à un autre appareil (`QR_ALREADY_BOUND`), applique les mêmes contrôles que `mobile-sign-in` (statut, appareils autorisés, un appareil par profil), lie le jeton à l'appareil au premier usage, ouvre la session par lien magique généré côté serveur (jamais envoyé).
  - ✅ WebApp, modale « Connexion avec QR code » (`?dialog=quick-connection/user|tablet/<id>`) : utilisateur actif = saisie du **mot de passe du compte** (« Mot de passe incorrect ») puis « Voir le QR code » ; tablette = permission `ContributorTablets.edit`, indisponible si désactivée. QR valable **30 jours**. Générer un QR révoque les QR jamais utilisés ; ceux déjà liés à un appareil restent valables pour lui.
  - ✅ « Dissocier l'appareil actuel » = suppression du binding + révocation des QR déjà liés.
  - ✅ La tablette reçoit un compte d'authentification technique sans mot de passe (`tablet-<collaborator_id>@devices.imula.invalid`) à la première génération de QR. L'état de son collaborateur « appareil » suit `tablets.profile_status` (Activé/Désactivé) : une tablette désactivée ne peut plus se connecter (`INVALID_CREDENTIALS`).
  - ✅ RLS : le profil « appareil » ne voit pas tout son compte (`accessible_account_ids` l'exclut) mais seulement les entités de `project_tablets` (`is_project_member` / `project_role`) et les modèles publiés.
- **Tablette partagée / changement de profil** : **une base SQLite par profil** (`dbFilename: imula-<principal_id>.db`, clé SQLCipher distincte). Changer de profil = fermer la base courante, ouvrir celle du profil. Conséquences : plus d'erreur RN 2.8 (les données de X ne sont jamais envoyées avec le jeton de Y) ; si X a des écritures en attente au moment du changement, modale « Le profil X a n modifications non envoyées. Elles seront envoyées à sa prochaine connexion. [Passer en ligne et envoyer] [Continuer] ». Écran de connexion : liste des **profils déjà connectés** sur l'appareil (« Dernière connexion : … ») pour reprise rapide.
- Déconnexion : garde la base du profil (comme l'origine) ; « Réinitialiser les données locales » supprime la base du profil courant (avec garde-fou file non vide, §5.6).
- Sécurité appareil : `expo-local-authentication` (`getEnrolledLevelAsync`) → écran bloquant si aucun verrouillage (R-SEC-1) ; clé SQLCipher générée aléatoirement et stockée dans `expo-secure-store` (Keystore Android).

### 9.3 Compléments de schéma Supabase (récapitulatif)

✅ = livré (migrations `20261024115900`, `20261024120000`, `20261024121000`). Restent à faire avec leurs fonctionnalités : `mobile_backups`, `mobile_logs`.

| Objet | Type | Raison |
|---|---|---|
| ✅ `collaborator_kind += 'device'`, `tablets.collaborator_id` | colonne/enum | profils tablette authentifiables (§9.2) |
| ✅ `mobile_device_bindings`, `quick_connection_tokens` | tables | un appareil par profil, QR |
| ✅ `mobile_project_access(project_id, principal_id, auth_user_id)` et `mobile_flow_access(flow_id, principal_id, project_id, auth_user_id)` | tables maintenues par déclencheurs (`project_members`, `project_tablets`, `projects.type/archived/deleted_at`, `flows.custom_status_id/project_id/deleted_at`, `custom_statuses.downloadable`, `collaborators.auth_user_id/deleted_at`, `tablets.collaborator_id`) | filtre des Sync Streams. Entité visible = membre ou tablette affectée, type `project`, non archivée ; flow téléchargeable = entité visible + statut `downloadable`. Les droits d'écriture restent vérifiés par la RLS / les RPC |
| ✅ `form_response_values.flow_id`, `.project_id` ; `custom_field_values.flow_id`, `.project_id` | colonnes dénormalisées (trigger) | synchro par flow/projet |
| ✅ `form_responses.mobile_visible boolean` | colonne (trigger) | applique `organizations.allowed_download_response` : vrai pour toute réponse `in_progress` et pour les N dernières `done` par lien (contexte entité : par entité + lignée de formulaire ; `null` = toutes) |
| ✅ `signatures` : `local_created_at`, `device_id`, `connection_mode`, `latitude`, `longitude`, `proxy_principal_first_name`, `proxy_principal_last_name`, `proxy_holder_name` | colonnes | parité §7.5 |
| ✅ `signature_events` : `client_event_id uuid unique`, `event_sequence`, `from_state`, `to_state`, `payload_path`, `reason` | colonnes | journal d'événements idempotent |
| ✅ `flow_fill_unlocks(id, flow_id, unlocked_by, signature_path, comment, sign_with_qr_code, signed_at, source)` | table | déverrouillage de flow signé (R-SEQ-4) ; positionne `flows.fill_restrictions_skipped = true` (déclencheur) |
| ✅ `step_navigation_events(id, step_navigation_id, step_id, flow_id, action NAVIGATE/EXIT/SKIP, comment, actor_id, source, occurred_at)` | table | traçabilité des redirections |
| `mobile_backups(id, principal_id, device_id, storage_path, size, created_at, trigger)` + bucket `mobile-backups` | table + Storage | « Liste des backups MobileApp » WebApp |
| `mobile_logs(id, principal_id, device_id, storage_path, created_at)` | table + Storage | « Logs push » |
| ✅ `organizations.map_config jsonb` | colonne | tuiles de carte |

### 9.4 Sync Streams (`infra/powersync/config/sync-config.yaml`)

Streams **globaux** auto-souscrits (`me`, `organization`, `my_projects` : profil, organisation, référentiels, entités accessibles et liste légère de **tous** leurs flows, les non téléchargeables étant grisés) ; streams **paramétrés** souscrits à la demande : `project_offline(project_id)`, `flow_offline(flow_id)` (= checkout), `flow_forms(form_id)`. Le fichier de configuration fait foi ; il est validé (`POST /api/sync-rules/v1/validate`) et testé de bout en bout sur le service local (édition 3).

Contraintes vérifiées sur le service PowerSync (2026-10-24) :
- **Une ligne reçue par plusieurs streams n'est gardée qu'une fois** côté appareil : la version la plus récente remplace l'autre en entier, les colonnes qu'elle ne sélectionne pas passent à NULL (doc PowerSync « client architecture », `powersync-sqlite-core`). Toutes les requêtes d'une même table cliente sélectionnent donc les mêmes colonnes ; la liste légère des flows est renommée côté appareil (`FROM flows AS flow_summaries`). Le générateur de schéma (`gen:schema`) refuse une table cliente dont les colonnes diffèrent d'un stream à l'autre.
- **Chaque requête d'un stream paramétré revérifie l'accès** (`… AND flow_id IN my_flows`, bloc `with:` partagé). Sinon un client authentifié pourrait s'abonner à n'importe quel `flow_id` : la première proposition ne contrôlait que la ligne `flows`. Vérifié : un abonnement à un flow non téléchargeable ou à une entité non autorisée ne renvoie aucune donnée.
- **Colonne `id` obligatoire** dans chaque ligne synchronisée : `flow_id || ':' || collaborator_id AS id` pour `flow_assignees`, `flow_collaborators`, `project_members`, `custom_field_values` (`custom_field_id:object_id`) ; `block_id AS id` pour `block_dsi_configs` ; `client_event_id AS id` pour `signature_events` (l'id serveur est un `bigint`, inutilisable hors ligne). Le connecteur d'upload refait la correspondance.
- Un **alias de table** (`FROM collaborators c`) devient le nom de la table côté client : ne pas en utiliser.
- Sous-requêtes imbriquées sur deux niveaux acceptées ; le corps du message `/sync/stream` exige `override_priority` (peut valoir `null`) pour chaque abonnement.
- Pas de commentaire YAML en fin de ligne à l'intérieur d'une requête sur plusieurs lignes.

Notes :
- Les **référentiels de bibliothèque** utilisés par les blocs (risques, parades, moyens) sont ajoutés à `flow_offline` via leurs identifiants (sous-requête sur `block_adr_items.library_risk_id`) ou dénormalisés dans les items [P : dénormaliser nom/pictogramme dans `block_adr_items` pour éviter la sous-requête].
- **Flows liés** (chapeau/enfants, `steps.linked_flow_id`) : le client s'abonne récursivement à `flow_offline` pour chaque flow lié (comme le checkout d'origine).
- **Formulaires** : le client calcule les `form_id` nécessaires (liens du flow + génériques de l'entité) et s'abonne à `flow_forms` pour chacun (dédoublonnage naturel = optimisation RN 2.8).
- **Purge** : un flow qui sort de `mobile_access` (statut non téléchargeable, retrait d'affectation) disparaît automatiquement des buckets (= purge RN97) ; l'abonnement reste mais ne renvoie rien → l'UI propose de le retirer.
- Les abonnements sont persistants (`ttl` long) et listés dans une table locale `offline_selection(flow_id, project_id, subscribed_at)` pour l'UI « Locale ».
- **Bloc Objets** : non synchronisé (en ligne uniquement, comme l'origine) ; lecture/écriture par RPC `technical_object_write_attributes`.

### 9.5 Calculs locaux

- **Verrouillage d'étape** (`locked`) : non stocké ; calculé par `flow-rules.computeLocks(sequences, phases, steps, unlocked)` = algorithme §4.4 appliqué à l'état synchronisé (`steps.validated_at`) + écritures locales ; `flows.fill_restrictions_skipped` (posé par un `flow_fill_unlocks`) lève toutes les restrictions. Côté serveur, `step_sequence_blockers` doit implémenter le même algorithme.
- **Pastilles** (§4.2) et compteurs d'avancement : requêtes SQL locales agrégées (signatures attendues = natures activées de `block_dsi_configs` hors mode simplifié ; signées ; en attente ; statuts multi-PR ; formulaires obligatoires avec réponse).
- **Validation d'étape** : mêmes contrôles que §4.3, messages identiques.

### 9.6 Stratégie d'upload (connecteur `uploadData`)

- Lecture par **transaction** (`getNextCrudTransaction`) pour préserver l'atomicité des écritures groupées (ex. signature + événement + valeur).
- Table de routage (table locale → appel serveur) :

| Écriture locale | Appel | Contrôles serveur |
|---|---|---|
| `form_responses` INSERT / PATCH (référence, état, rubrique courante) | ✅ RPC `mobile_create_form_response(p jsonb)` (identifiant client, version épinglée ou courante, contexte dynamique calculé sur l'appareil) / `mobile_update_form_response(id, p jsonb)` | réponse unique et mode « reprise uniquement » (`UNIQUE_RESPONSE_EXISTS`), formulaire / lien actifs, repasser « en cours » interdit si `block_form_response_edition` (`RESPONSE_EDITION_BLOCKED`), droits |
| `form_response_values` PUT / PATCH | ✅ RPC `save_rubric_values` (existante), provenance `mobile`, état courant de la ligne locale relu à l'envoi (idempotent) | clé (`response_id`, `option_lineage_id`), réponse terminée refusée (`response_done`), valeur verrouillée sans signature refusée (`locked_value`) |
| `form_response_value_history` (modif. d'une valeur verrouillée) | inclus dans `save_rubric_values` (`change_signature`) | signature obligatoire |
| `form_response_dynamic_items` | RPC `mobile_upsert_dynamic_items` | `allow_add_row/column` |
| `signatures` INSERT | ✅ RPC `mobile_sign(p jsonb)` (identifiant généré par l'appareil, rejouable ; l'événement `create` est écrit par le serveur) | nature attendue, unicité par (bloc, nature), une signature par collaborateur et par étape (inclut R ≠ CT), liste restreinte, procuration (date), étape active / non verrouillée / saisissable sur l'application, dessin (sauf non applicable, en attente ou QR), commentaire si non applicable ; **figement des versions de documents** (déclencheur, aussi à la reprise) |
| `signatures` PATCH (compléter une signature en attente) | ✅ RPC `mobile_complete_signature(id, signature_path, signed_at, comment)` (événement `update` waiting → signed) | transition `waiting → signed` uniquement, date ≥ procuration |
| `block_multi_pr_items` PATCH (statut, observation) | ✅ RPC `mobile_update_multi_pr_item(id, p)` (événements `select_status` / `change_status` / `edit_observation`, source `mobile`) | statut `multi_pr` actif, sous-instruction active, étape saisissable sur l'application |
| `block_multi_pr_signatures` INSERT | ✅ RPC `mobile_sign_multi_pr(p)` (identifiant client, rejouable) | une signature par sous-instruction (`ALREADY_SIGNED`), étape saisissable |
| `steps` PATCH `validated_at` | ✅ RPC `mobile_validate_step(step_id, validated_at)` : source `mobile`, date locale bornée à maintenant, rejouable ; renvoie les manquants (`sequence`, `dsi`, `form`, `multi_pr`) → rejet `STEP_REQUIREMENTS_NOT_MET` | éléments obligatoires (re-vérifiés), séquence (le flow déverrouillé lève le séquencement, aussi côté serveur) |
| `steps` PATCH `first_opened_at` | ✅ RPC `mobile_mark_step_opened(step_id, opened_at)` | |
| `flow_fill_unlocks` INSERT | ✅ RPC `mobile_unlock_flow(p)` (+ `flow_events.skip_fill_restriction`) ; la copie locale du flow passe déverrouillée tout de suite | commentaire obligatoire, signature (ou QR), droit de signer sur le flow (pas de contrôle de rôle, comme l'outil d'origine) |
| `step_navigation_events` INSERT | ✅ insert direct (RLS), synchronisé avec le flow | |
| `flows` PATCH `custom_status_id` (+ commentaire) | ✅ table appareil « insertion seule » `flow_status_changes` → RPC `mobile_set_flow_status` (historique avec commentaire et source `mobile`) ; la modification de la copie locale du flow n'est pas envoyée | statut de flow actif de l'organisation (`INVALID_STATUS`) ; un statut non téléchargeable retire le flow de la tablette après l'envoi |
| `flow_geometries` PUT/PATCH/DELETE | upsert/delete direct (RLS) | |
| `form_block_links` INSERT (formulaire ajouté / aléa) | ✅ RPC `mobile_add_form_link(p)` : identifiant client, bloc Formulaires créé (identifiant client) si l'étape n'en a pas, autorisé aussi sur un flow issu d'un référentiel ; l'appareil réutilise un lien existant pour le même formulaire | formulaire **générique** actif de l'entité (`FORM_NOT_AVAILABLE`), étape saisissable |

- Tous les identifiants sont **générés côté client** (uuid v4/v7) → RPC idempotentes (`on conflict do nothing/update`), rejouables sans doublon.
- **Classement des erreurs** :
  - réseau / 5xx / 429 → lever l'exception : PowerSync réessaie (backoff) ; la file est conservée (= `pushFailure`) ; snackbar `push.statusError` + [Réessayer] ;
  - 401 → rafraîchir la session puis réessayer ;
  - 403 (accès retiré au projet) → **suspendre l'envoi** (le connecteur renvoie sans compléter), passer l'UI hors ligne et afficher la modale R-SES-2 ; reprise manuelle ;
  - 4xx **métier** (conflit, validation) → enregistrer l'opération dans la table locale `sync_rejections(id, table, row_id, op, payload, error_code, message, created_at)`, compléter la transaction (pour ne pas bloquer la file) et notifier (« n modification(s) refusée(s) », écran de détail). Cas particulier `UNIQUE_RESPONSE_EXISTS` : message `push.uniqueResponseAlreadyExists` (comportement d'origine).
- Après chaque vidage complet de la file en ligne : RPC `mobile_report_device(info)` (télémétrie §1.8) et envoi des journaux.

- ✅ Dessin de signature : PNG en data URL dans `signature_path`, comme la WebApp (signature_pad), produit en JavaScript pur (`src/lib/signature-png.ts`, sans module natif) ; tracé affiché avec `react-native-svg`.
- ✅ Écran « Modifications refusées par le serveur » (Paramètres) : motif en clair par code (`ALREADY_SIGNED`, `SIGN_TWICE`, `STEP_LOCKED`…).
- ✅ QR Code ID d'un collaborateur (authentification forte) : `{ v: 1, collaborator_id }` ; WebApp : « QR code d'identification » par collaborateur (refusé s'il est désactivé) et « Exporter les QR codes d'identification » (page imprimable des collaborateurs activés listés). ✅ QR imprimable d'un flow : `{ v: 1, flow_id, project_id }`, action « Générer le QR Code imprimable » de la liste des flows (téléchargement PNG, impression).
- ✅ Localisation (R-SEC-2) : demande d'autorisation unique avec le texte d'origine, refus toléré ; position jointe aux signatures du bloc Contrôles ; ✅ remontée d'informations de l'appareil après chaque envoi réussi (RPC `mobile_report_device` : version de l'app, Android, modèle, écran, identifiant, batterie, position, dernier envoi sur la fiche tablette ; dernière activité de l'appareil lié pour tout profil).

- ✅ Réponse aux formulaires (bloc Formulaires) : Répondre (référence par défaut modifiable), Reprendre, Voir, Modifier une réponse terminée ; écran par rubrique avec pré-remplissage, formules recalculées, validations de données et alertes, redirections, contrôle des obligatoires (« Questions requises ou invalides »), « Sauvegarder et continuer plus tard », « Terminer la réponse » ; rubriques non autorisées à l'étape en lecture seule. Natures saisissables : réponses courte / longue / multiple, choix unique / multiple, listes, date, date-heure, durée, valeur et unité, localisation (« Me localiser »), formule, **photo** (prise de vue ou galerie, vignettes, visionneuse, suppression) et **collaborateur et signature** (liste ou hors liste, procuration, identification sans dessin). Photos réduites (côté long ≤ 2560 px, JPEG 80 %). Restent à faire : éditeur d'image (annotation), copie en galerie, modification signée d'une valeur verrouillée, ajout de lignes / colonnes, remplissage en masse. ✅ « Ajouter un formulaire » et « Déclarer un aléa » (encadré en bas d'étape) : choix d'un formulaire générique de l'entité, lien sur l'étape et nouvelle réponse ouverte aussitôt. Le contrôle de fin de réponse est fait sur l'appareil (moteur partagé), comme la WebApp le fait côté serveur Next.js.

- ✅ Pièces jointes : file locale `attachment_queue` (`src/attachments/queue.ts`, sans dépendance native, testée sur le service local) plutôt que l'AttachmentQueue du SDK (expérimentale, chemins imposés). Fichier gardé dans `documents/attachments/`, chemin Storage de la WebApp (`form-files`, `responses/<réponse>/photos|signatures/<uuid>-<nom>`) référencé tout de suite par la valeur ; envoi retenté tant que la réponse n'existe pas côté serveur (RLS) ou hors réseau ; photos et signatures des réponses synchronisées téléchargées pour la consultation hors ligne (abandon après 5 échecs).

- ✅ Revue du lot 4 (2026-10-24), corrections : profil non actif retiré des accès de synchro ; déverrouillage du flow uniquement par RPC (signataire = profil connecté, ou collaborateur identifié par QR) ; auteur des redirections fixé par le serveur, envoi en insertion seule (un rejeu n'est plus pris pour un accès retiré) ; contrôle « étape saisissable » aussi à la validation, à la reprise d'une signature et à la création d'une réponse ; étapes déverrouillées une à une sur la WebApp synchronisées (`step_fill_unlocks`) ; valeurs des réponses de niveau entité synchronisées ; changement de profil : la base du profil précédent est fermée avant de changer de session, et le connecteur n'envoie jamais avec la session d'un autre profil ; suppression / changement de compte d'une tablette propagés à son collaborateur « appareil » (QR révoqués) ; WebApp : vérification de mot de passe sans session, « Dissocier l'appareil » soumis au droit de modification, compte technique de tablette retrouvé s'il existe ; fonctions Edge : liste d'appareils autorisés illisible = refus, première connexion concurrente gérée.

- ✅ Documents PDF : versions des documents liés aux flows et des documents d'entité synchronisées (métadonnées seules) ; PDF à afficher = pièce jointe du bloc, sinon version figée ou épinglée, sinon dernière version ayant un PDF ; PDF des documents liés aux flows téléchargés par la file des pièces jointes (bucket `documents`, jamais pour `is_large_file`) ; ouverture dans la visionneuse du système (`File.preview`), en ligne si non téléchargé, messages d'origine sinon ; liste « Documents du projet » (spec 05 §2.9). Limite : un document de bibliothèque lié directement à un bloc n'est lisible par une tablette que si une copie existe dans l'entité (règle Storage `library/…`).

- ✅ « Paramètres des signatures » : ajout de points d'arrêt internes / externes des surveillants applicables (jamais de retrait), RPC `mobile_add_dsi_breakpoints(block_id, natures)` (étape saisissable, mode simplifié refusé, événement `update`/`add_breakpoint`) ; « Tableau des signatures » du flow (par étape, natures attendues et état), depuis le bloc Contrôles et le détail du flow.

- ✅ Référentiels et Modèles (en ligne uniquement) : listes des entités Référentiel / Modèle et de leurs flows lues directement sur le serveur (RLS) ; un flow s'ouvre en **mode lecture** via le stream `referential_flow(flow_id)` souscrit 30 min (accès : référentiel, modèle ou dossier publié dans l'organisation, ou du compte du profil — hors profil « appareil »), ce qui réutilise l'écran d'exécution. Contraintes du service PowerSync rencontrées : pas de `OR` ni de liste littérale `IN (…)` dans une requête d'accès (`with:`) ; deux ensembles d'accès combinés par `OR` dans la requête de données sont acceptés. Hors ligne, le segment revient sur « Projets ».

### 9.7 Conflits

| Situation | Règle |
|---|---|
| Même valeur de formulaire modifiée sur WebApp et mobile | dernier écrit gagne **par valeur** (option/cellule), historique conservé (`form_response_value_history`, provenance) |
| Réponse unique créée en parallèle | la seconde est refusée (rejet listé) — message d'origine |
| Réponse terminée sur WebApp pendant saisie mobile | si `block_form_response_edition` : écritures mobiles refusées (rejet) ; sinon la réponse repasse « en cours » (comportement d'édition WebApp) [I] |
| Signature déjà apposée pour la même nature | refus de la seconde (rejet) sauf natures multiples [I] ; affichage de la signature serveur après synchro |
| Étape validée hors ligne alors que la WebApp a modifié le contenu | validation acceptée si les obligatoires restent satisfaits, sinon rejet `STEP_REQUIREMENTS_NOT_MET` |
| Flow retiré de l'affectation pendant le hors ligne | 403 → R-SES-2 |
| Désabonnement d'un flow avec écritures en attente | interdit : modale `forceDataPush` (« Forcer l'envoi des données ») |

### 9.8 Médias (photos, fichiers, dessins de signature)

- Capture via `expo-image-picker` / `expo-camera` ; annotation (éditeur d'image) ; compression (JPEG ~80 %, côté long ≤ 2560 px [P]) ; copie en galerie si réglage actif.
- Fichier écrit dans `FileSystem.documentDirectory/attachments/<uuid>.<ext>` ; ligne dans la table locale d'**attachments** (PowerSync Attachments : états `QUEUED_UPLOAD → SYNCED`, `QUEUED_DOWNLOAD`, `QUEUED_DELETE`).
- La donnée métier (valeur de question photo, `signature_path`, pièce jointe) référence immédiatement le **chemin Storage cible** (`<org_id>/flows/<flow_id>/<uuid>.jpg`, bucket `field-media` privé, RLS par `mobile_access`) ; le serveur tolère un fichier pas encore présent (vignette « en cours d'envoi » sur la WebApp).
- Téléchargement : PDF des documents liés, images des contenus riches et pièces jointes des réponses visibles sont mis en file `QUEUED_DOWNLOAD` à l'abonnement d'un flow ; gros fichiers (`is_large_file`) jamais téléchargés (« Les documents volumineux ne peuvent pas être visualisés… »).
- Limite d'import fichier dans une question : 40 Mo [HC:R2.1].

### 9.9 Sauvegardes et chiffrement (parité)

- Base SQLCipher (`op-sqlite` avec `sqlcipher: true`), clé dans SecureStore.
- **Dump** : copie de la base (VACUUM INTO) chiffrée par **enveloppe asymétrique** (clé publique de l'organisation obtenue par RPC, chiffrement libsodium *sealed box*) ; déclenchement : passage en ligne avec écritures, intervalle configurable (5 min → 4 h), manuel ; emplacement : stockage interne (SAF) ou carte SD ; envoi au support = upload dans `mobile-backups` + ligne `mobile_backups`.
- **Restauration** (support) : options avancées de l'écran de connexion, clé privée fournie par une Edge Function réservée.
- Le snapshot pré-checkout n'est plus nécessaire (pas de vidage de base).

### 9.10 Écrans React Native (expo-router)

| Route | Écran | Sources |
|---|---|---|
| `app/(auth)/sign-in.tsx` | Connexion (identifiants + QR + profils connus + identifiant appareil + options avancées) | §1.1–1.2 |
| `app/(auth)/device-locked.tsx` | Blocage de sécurité | §1.3 |
| `app/(app)/_layout.tsx` | Onglets Projets / Exécution / Accès rapide / Paramètres, en-tête En ligne/Hors ligne + barres de progression | §2.1 |
| `app/(app)/projects/index.tsx` | Entités (segments Projets / Référentiels et Modèles, recherche, scan QR flow) | §2.2 |
| `app/(app)/projects/[projectId]/info.tsx` | Fiche entité (segments) | §2.2 |
| `app/(app)/projects/[projectId]/flows.tsx` | Flows (Mes flows / Tous / Diagrammes, filtres, sélection, Télécharger / Envoyer) | §2.3 |
| `app/(app)/projects/[projectId]/flows/[flowId]/index.tsx` | Détail du flow (sync, éléments liés, infos, historique, données locales) | §2.4 |
| `app/(app)/execution/[flowId]/[phaseId]/[stepId].tsx` | Exécution (navigation, pastilles, blocs, pied d'étape, redirections) | §4 |
| `app/(app)/responses/[responseId]/[rubric].tsx` | Réponse de formulaire | §4.7.3 |
| `app/(app)/projects/[projectId]/forms.tsx`, `documents.tsx`, `map.tsx`, `diagram.tsx` | Formulaires / documents d'entité, carte, diagramme | §2.7–2.9 |
| `app/(app)/non-compliant/[projectId].tsx` | Vérification des non-conformités (en ligne) | §4.7.6 |
| `app/(app)/quick-access.tsx` | Accès rapide | §2.6 |
| `app/(app)/settings/*` | Paramètres, profil, appareil, sauvegardes, rejets de synchro, réinitialisation | §1.5, §6, §9.6 |
| Modales (`app/(modals)/…`) | signature, paramètres des signatures, tableau des signatures, déverrouillage du flow, répondre à un formulaire, ajout de formulaire/aléa, changement de statut, statut/signature multiple multi-PR, détails EMM/ADR/RHP/objet/document/collaborateur, redirection, changement de phase, étape désactivée, filtres, confirmations (suppression, reset, forcer l'envoi, en ligne/hors ligne, téléchargement bloqué, envoi impossible) | §2–7 |

Composants transverses : `SignaturePad` (Skia/`react-native-signature-canvas`), `QrScanner` (`expo-camera` code-barres), `RichTextView` (HTML), `PdfViewer`, `ImageEditor`, `MapView` (tuiles hors ligne), `StatusChip`, `StepChip`, `OfflineGuard` (désactive une action en ligne uniquement), `SyncStatusBar`.

### 9.11 Lots de réalisation suggérés

1. Socle : authentification (utilisateur puis tablette), base par profil, SQLCipher, mode En ligne/Hors ligne, streams globaux, liste des entités et des flows.
2. Abonnement par flow (téléchargement / suppression), détail du flow, exécution en lecture (navigation, pastilles, blocs d'affichage, documents).
3. Écritures : validation d'étape + séquencement + redirections ; bloc Contrôles (signatures, procuration, QR, non-applicable, signer plus tard) ; multi-PR.
4. Formulaires (moteur partagé), médias, réponse unique, verrouillage signé, aléa/ajout de formulaire, statut de flow.
5. Carte, diagramme, accès rapide, sauvegardes/dumps, journaux, télémétrie, rejets de synchro.

---

## 10. Règles transverses (récapitulatif)

| Id | Règle | Preuve |
|---|---|---|
| R-LOG-1 | un profil = un appareil connecté à la fois | [O] `login.anotherDeviceConnectedToThisProfile` |
| R-LOG-2 | liste d'appareils autorisés si configurée | [O] `deviceUnauthorized`, [HC:RN101] |
| R-SEC-1 | verrouillage d'écran obligatoire | [O] `deviceUnsecureAlert.*` |
| R-SES-1/2 | accès projet vérifié au téléchargement et à l'envoi (403 → modales) | [O], [HC:R2.8] |
| R-SES-3 | une seule organisation par appareil | [O] `crossOrganizationFlowError` |
| R-OFF-1 | bascule en ligne/hors ligne manuelle ; passage en ligne = envoi automatique | [O] `toggleOffline` |
| R-OFF-2 | pas de passage hors ligne pendant un téléchargement (sauf annulation forcée) | [O] `checkout.message.*` |
| R-CHK-1 | envoyer avant de re-télécharger ; pas de téléchargement pendant une sauvegarde | [O] `desynchronizedData`, `backupInProgress` |
| R-CHK-2 | flow téléchargeable seulement si statut « En opération » (`downloadable`) | [O] `openFlow`, [HC:RN97] |
| R-DEL-1 | suppression locale interdite tant que des données ne sont pas envoyées | [O] `forceDataPush.*` |
| R-EXE-1 | mode lecture : aucune saisie | [O], [HC:RN92] |
| R-EXE-2 | « WebApp uniquement » (`readOnlyOnMobileApp`) : visible, non saisissable, bloque le déverrouillage séquentiel | [O] `BLOCKED_BY_READONLY_STEP` |
| R-EXE-3 | validation d'étape = obligatoires remplis (statuts multi-PR, formulaires obligatoires, signatures obligatoires, attributs d'objet) ; indépendante de la validation interne des blocs | [O], [HC:RN105, R2.2] |
| R-SEQ-1..4 | séquencement, déverrouillage séquentiel, déverrouillage de flow signé | §4.4 |
| R-SIG-RCT | même personne ≠ R et CT | [O] `userCantSignRandCt` |
| R-SIG-PROXY | date de signature ≥ date de procuration | [O] `common.signatureDateError` |
| R-SIG-REQ | PA toujours obligatoires ; PC obligatoires si `signatoriesStatus = REQUIRED` | [O] receptacle `mandatory` |
| R-FRM-1 | réponse unique / modes de réponse | [O] §4.7.2 |
| R-FRM-2 | réponse terminée non modifiable si réglage d'organisation | [O] `disableEditResponse` |
| R-FRM-3 | en ligne, impossible de quitter une réponse avant confirmation de sauvegarde | [O] `form.blockedUx`, [HC:RN97] |
| R-FRM-4 | valeur verrouillée modifiable uniquement avec signature | [O] `editLockedQuestionModal`, `version_option` |
| R-FRM-5 | rubriques non autorisées à l'étape en lecture seule ; rubriques masquées mobile invisibles | [O] |

---

## 11. Incertitudes

1. **Pastille grise** : la note RN105 (gris = non ouverte) contredit le code observé (gris = désactivée, bleu par défaut). **Tranché (2026-10-24)** : suivre la note avec `first_opened_at` (§4.2).
2. **« Mes flows »** : critères exacts (collaborateurs, responsables, tablettes 1–3, rapporteur ?) non lus dans la requête locale ; déduits des tables et de R2.1.
3. **Qui peut déverrouiller un flow** (« chef de chantier ») : aucun contrôle de rôle observé côté mobile (la modale accepte un signataire collaborateur ou QR) ; le serveur filtre peut-être. Proposition : rôle projet `responsible`/`expert`.
4. **Déverrouillage par flow (mobile) vs par étape (WebApp reconstruite)** : à arbitrer ; **tranché (2026-10-24)** : `flow_fill_unlocks` + `flows.fill_restrictions_skipped` sont ajoutés, `step_fill_unlocks` est conservé.
5. **Redirection déclenchée par un statut** (« X a changé le statut ») : le déclencheur exact (statut de sous-instruction ? statut de flow ?) n'est pas établi ; seule la mécanique NAVIGATE/EXIT/SKIP + commentaire est observée.
6. **Modèle de signature événementiel** : aucun endpoint de push observé pour `receptacle/signature/signature_event` (migration en cours chez l'éditeur). Types d'événements autres que `CREATED`/`DRAWING_ADDED` (révocation…) inconnus.
7. **`allowed_download_response`** : appliqué côté serveur (non visible dans le JS) ; l'ordre (« N dernières réponses terminées » par lien ? par formulaire ?) est supposé. Implémenté : par lien bloc↔formulaire, par (entité, lignée de formulaire) pour le contexte entité, tri `done_at` décroissant.
8. **Checkout différentiel** (`sfp-16808`) : critère « flow modifié » supposé = `modificationDates` serveur > dernier `checkout_log` réussi.
9. **Purge automatique** (RN97) : moment exact (au checkout suivant, au démarrage ?) non observé.
10. **Modales en ligne/hors ligne** : affichées une seule fois par session/profil (drapeaux) — interprétation à confirmer.
11. **Objets hors ligne** : RN92 annonce « en ligne uniquement pour le moment » ; aucune trace d'évolution dans cet APK. Conserver en ligne seulement.
12. **Formules sur mobile** : bouton « Calculer » observé ; recalcul automatique ou non à la saisie inconnu (cf. spec 03 U5).
13. **Signature de formulaire avec `autoSignatory`** : effet supposé = date imposée (champ désactivé) ; peut aussi pré-sélectionner l'utilisateur connecté comme signataire.
14. **Profil tablette et signatures** : sur tablette partagée, l'opérateur signe via la liste ou son QR ; l'`authorAccountRef` est la tablette. Le schéma cible doit distinguer *auteur de la saisie* (tablette) et *signataire* (collaborateur) — prévu via `created_by` (collaborateur fantôme de la tablette) et `signatory_id`.
15. **Version de document figée à la signature** (RN97) : côté reconstruction, le figement doit se faire dans `mobile_sign` à partir de la version **connue de l'appareil** (envoyée dans la requête), comme l'origine (`linkedDocumentVersions`, cas `missing`/`appearedSinceSigning`).
16. **Syntaxe Sync Streams** : sous-requêtes `IN (SELECT …)` à plusieurs niveaux et `JOIN` à vérifier selon la version du service PowerSync ; le recours à la table `mobile_access` vise à n'utiliser qu'un niveau de sous-requête.
17. **Une base par profil** (§9.2) diverge volontairement de l'origine (base unique partagée) ; impact stockage si de nombreux profils utilisent la même tablette — prévoir une purge des profils inactifs.
18. **Annuaire des signataires** hors ligne : liste des collaborateurs du projet (+ restreints du flow) ; les opérateurs sans compte doivent être inclus (QR Code ID) — vérifier la RLS de `collaborators` pour un profil tablette.
19. **Carte hors ligne** : fournisseur de tuiles et conditions de licence de mise en cache à définir (`map_config` d'origine : clé d'abonnement + modèle d'URL).
20. **PGAC** (`epsilon_out`) : champs PGAC du flow non présents dans le schéma actuel (spec 01) — hors lot initial.
21. **Langue par défaut** : langue du profil (`langKey`) sinon langue de l'appareil (RN92) ; ordre de priorité exact supposé.

