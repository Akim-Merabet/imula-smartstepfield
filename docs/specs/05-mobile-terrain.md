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

