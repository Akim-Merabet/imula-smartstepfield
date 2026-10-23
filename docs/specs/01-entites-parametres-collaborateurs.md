# Spec fonctionnelle 01 — Entités, Paramètres, Collaborateurs & tablettes, Authentification

> Reconstruction fonctionnelle de Siteflow WebApp (build FE 2.23.6, bundle du 21-22 oct. 2026) vers Next.js + shadcn + Supabase.
> Ce document décrit des **comportements, champs, enums et règles**. Il ne reprend pas de code Siteflow.

## 0. Conventions

- **[OBS]** = observé dans une source : clé i18n (`projects.modal.name`), enum du bundle (`Ti Project=1…`), DTO/mapper du bundle (nom de champ API), doc helpcenter (`HC:<article>`), note de version (`RN:<version>`).
- **[INF]** = inféré (déduction raisonnable, à valider).
- Noms techniques proposés en `snake_case`. Entre parenthèses : nom API Siteflow observé quand il diffère.
- « Admin » = droit `ADMIN_APP` ; « Admin global » = `ADMIN_APP_GLOBAL` ; « Admin Siteflow » = `ADMIN` (super-admin éditeur).
- Libellés FR = valeurs de `i18n-fr.json`. Le genre inclusif (« collaborateur.trice ») est celui de l'app.
- Pas de corbeille pour la plupart des paramètres : message récurrent « Il n'y a pas de corbeille pour cet élément. Vous ne pourrez pas le restaurer par la suite. » [OBS `attributes.table.alert.deleteSubtitle`, `companies.delete.warning.subtitle`, `users.alert.delete.subtitle`…].
- Toutes les modales d'édition ont : navigation « élément précédent / suivant » (ex. `families.dialog.previousFamily/nextFamily`), case « Créer un autre … » en création (`*.dialog.addMore`), garde « Les modifications seront perdues si vous ne sauvegardez pas » (`*.saveChanges.title`). [OBS]
- Toutes les listes affichent un compteur « {{ current }} élément(s) / {{ total }} au total » [OBS `projects.subtitle`] et un état vide « Aucun élément dans la liste… / Votre recherche ne mène nulle part » [OBS `global.emptyListComment`].
- Validateurs génériques [OBS `global.validators.*`] : requis, longueur min/max, format date, nombre décimal (max 6 entiers + 4 décimales : `^[+-]?\d{1,6}(\.\d{0,4})?$`), lien, fichier ≤ 20 Mo (`global.validators.fileSizeExceeds`).

---

## 1. Modèle de tenancy : Organisation → Comptes (applicabilité)

[OBS HC:Organisation-and-account, HC:Configuration-data, HC:API-key-Scope]

- Une **organisation** regroupe un ou plusieurs **comptes**. Dans l'IHM, un compte est appelé **« Applicabilité »** (`projects.filters.applicability`, `accountSettings.fields.applicabilityName = Organisation`, `settingsKpi.filters.applicability = Comptes disponibles`).
- Toute donnée est créée dans un compte. Certaines données sont **partagées dans toute l'organisation** :

| Dictionnaire | Partagé organisation | S'applique à |
|---|---|---|
| Familles | OUI | entités, flows, documents, formulaires, risques, moyens, tablettes, objets, groupes/fonctions/compétences/contrats/administratif des collaborateurs, domaines d'activité |
| Catégories | NON (compte) | flows, documents, listes, hiérarchies de collaborateurs |
| Statuts | OUI pour formulaires, réponses, objets ; NON pour flows, blocs instructions multiples (et entités [INF]) | |
| Attributs personnalisés | NON (compte) | entités, flows, phases, étapes, documents, objets |
| Clients | NON (compte) | entités |

- Une entité est créée dans un compte et **peut être partagée** dans l'organisation (« Rendre publique / privée », `projects.table.actions.publish/private`, libellé « Publique - {{ applicabilityName }} » `projects.publicSharedProject`). [OBS]
- Un collaborateur appartient à un compte ; « Déplacer » (`MoveApplicability`) le change de compte — réservé Admin global / Admin Siteflow [OBS perm `moveApplicabilityModal`]. Champ `hasMultiApplicability` observé sur l'utilisateur courant [OBS DTO].
- La page Paramètres > Compte affiche l'« UUID de l'organisation » [OBS `accountSettings.fields.uuidEntity`].

---

## 2. Authentification, compte utilisateur, profil

### 2.1 Écrans et routes [OBS ROUTES.md]

| Route | Écran | routeId |
|---|---|---|
| `/auth` | Connexion | `Login` |
| `/reset-password` | Mot de passe oublié (saisie email) | `ResetPwd` |
| `/reset/finish?key=` | Choix du nouveau mot de passe | — |
| `/sign-up/<token>` | Création d'un compte entreprise | `SignUp` |
| `/activate?key=` | Activation du compte | `Activate` |
| `/onboarding/finish?key=` | Onboarding (premier accès d'un utilisateur invité) | `Onboarding` |
| `/callback` | Retour SSO (OAuth2/ADFS) | — |
| `/explore/profile/user-info`, `/reset-password`, `/tablet` | Profil | `ProfileInformation`, `ProfileResetPassword`, `ProfileTablet` |

### 2.2 Connexion [OBS chunk login : champs `email` (requis, email), `password` (requis)]

- Champs : Adresse email (`login.email.name`), Mot de passe, case « Garder la session ouverte » (`login.form.rememberme`).
- Liens : « Avez-vous oublié votre mot de passe? », « Vous souhaitez inscrire votre entreprise sur Siteflow? » (`login.signUp`), « Contactez-nous », bouton « Se connecter avec ADFS » (`login.loginWithAdfs`) si SSO actif.
- Erreurs : « Erreur d'authentification ! Veuillez vérifier vos identifiants » (`login.messages.error.authentication`), « Compte bloqué par sécurité, veuillez contacter Siteflow » (`login.blockedAccountToaster`) — l'utilisateur passe en statut `Blocked` [INF : après N échecs], « Vous êtes déjà connecté(e) » (`login.existingSession.title`), « Session expirée, veuillez vous reconnecter » (`login.title`).
- Mode d'authentification du compte [OBS enum `fD`] : `BASIC_AUTH`=1 (email/mot de passe), `SSO_AUTH`=2 (SSO seul), `BASIC_SSO_AUTH`=3 (les deux), `SSO_WEBAPP`=4 (SSO uniquement sur WebApp). Groupes : `ssoOnlyValues=[SsoAuth,SsoWebapp]`, `basicAuthValues=[BasicAuth,BasicSsoAuth]`.
- Tokens stockés : `authenticationToken` / `sessionAuthenticationToken` (selon « garder la session »), `refresh-token`, `oauth2` [OBS enum `Za`]. → Supabase Auth gère session + refresh ; « garder la session » = persistance locale vs session.
- Navigation post-login : `returnUrl` [OBS query param].

### 2.3 Mot de passe oublié / réinitialisation

- Étape 1 : email (requis, format email) → « Veuillez vérifier vos nouveaux emails et suivre les instructions » ; si inconnu « Ce compte n'existe pas » (`global.validators.validation.emailNotExist`). [OBS]
- Étape 2 (`/reset/finish`) : composant **création de mot de passe** (ci-dessous) → « Votre mot de passe a été changé avec succès » + lien « Aller à la page de connexion ».

### 2.4 Politique de mot de passe (ANSSI) [OBS RN:R.2.7.0 + composant bundle]

Appliquée à : création de compte, réinitialisation, changement depuis le profil, onboarding. « Les mots de passe existants ne sont pas impactés ».

| Exigence | Règle exacte observée | Libellé |
|---|---|---|
| Longueur | 12 ≤ longueur ≤ 128 | « Entre {{min}} et {{max}} caractères » |
| Lettre | `/[a-zA-Z]/` | « Une lettre » |
| Chiffre | `/\d/` | « Un chiffre » |
| Spécial | au moins un de ``!@#$%^&*()_+€£µ§?/\|{}[].,=-`` | « Un caractère spécial » |
| Pas de mots courants | ne contient pas (insensible casse) `password, motdepasse, qwerty, azerty, admin, welcome, login` ; pas 3 caractères identiques consécutifs `/(.)\1{2,}/` ; pas 3 caractères à codes consécutifs croissants (abc, 123) | « Pas de mots courants ou suites répétitives » |
| Confirmation | identique | « Les mots de passe ne correspondent pas » |

Jauge « Complexité » : entropie = log2(taille_alphabet^longueur), alphabet = 26 (minuscules) + 26 (majuscules) + 10 (chiffres) + nb spéciaux ; si entropie < 60 → *Insuffisant* ; sinon % exigences remplies : <40 *Faible*, <80 *Moyen*, sinon *Fort*. Le formulaire est valide si toutes les exigences sont vraies + confirmation égale.
Changement depuis le profil : champ « Ancien mot de passe » requis (`reset.oldPassword`), erreur « Le mot de passe est invalide » (`reset.toaster.failure`). Ancienne règle (legacy) : min 6 caractères (`onboarding.form.alert.minpasswidth`) ; le back renvoie `passwordMinLength` [OBS DTO].

### 2.5 Création de compte entreprise (Sign-up) [OBS chunk : `companyName` requis 3-100, `email` requis, `ssoIdentifier`, `subdomain`]

- Champs : Compte (`signUp.companyName.name`, placeholder « BU Produit », 3–100 car.), Adresse email (requis), Identifiant SSO (optionnel), Sous-domaine (`signUp.subdomain.name`, ex. « radium »), Organisation (`signUp.organization.name`, si la route porte un token d'organisation [INF]), mot de passe (politique 2.4).
- Erreurs [OBS `signUp.messages.error.*`] : email déjà utilisé ; utilisateur existe ; organisation inexistante ; identifiant SSO déjà utilisé ; sous-domaine déjà utilisé ; « L'organisation renseignée pointe sur un autre sous-domaine » ; email invalide ; échec générique.
- Succès : « Compte enregistré ! Merci de vérifier votre email de confirmation ».

### 2.6 Activation

- `/activate?key=` : succès « Votre compte a été activé avec succès » ; déjà activé « Votre compte a déjà été activé » ; erreur « Votre compte utilisateur n'a pas pu être activé » ; lien expiré « Votre email est expiré, veuillez contacter Siteflow ! » (`global.errorToaster.error.accountAlreadyValidated`). [OBS]

### 2.7 Onboarding (invitation d'un utilisateur créé par un admin) [OBS `onboarding.*`, chunk : firstName, lastName, trigram (requis, min 3), signature (requise)]

Assistant multi-étapes (enum `InfoStep=1, SignatureStep=2, PasswordStep=3, FinishStep=4` [OBS]) :
1. Vérification nom / prénom / trigramme (« Merci de vérifier l'exactitude des champs »), poste dans l'entreprise (« Par exemple Ingénieur méthode… »), avatar (jpeg/png, fond blanc ou transparent).
2. Signature électronique dessinée (« Ceci sera votre signature lors de l'exportation des documents »).
3. Mot de passe (politique 2.4).
4. Fin : case obligatoire « je reconnais avoir pris connaissance de la politique de confidentialité » (`onboarding.finish.privacyPolicy`) → « Commencer à utiliser SiteFlow ».
- Lien invalide « Key non valide » ; « Ce lien est expiré ou le compte a déjà été activé ! ». Statut utilisateur pendant l'invitation : `Onboarding` (libellé « En attente »). Un admin peut « Renvoyer un e-mail d'activation » (`users.table.inactiveTooltip`, action `ResendEmail`).

### 2.8 Profil (menu Profil) [OBS `profile.*`, chunk : firstName/lastName (requis), trigram (requis, max 10), signature (requise), email (lecture), ssoIdentifier (lecture), profession, family (=fonction), firstLanguage (=langue)]

| Champ | Type | Obl. | Libellé |
|---|---|---|---|
| first_name | text ≤50 | oui | Prénom |
| last_name | text ≤50 | oui | Nom |
| trigram | text (uppercased) | oui | Trigramme |
| email | email (lecture seule) | — | Email |
| sso_identifier | text (lecture seule) | — | Identifiant SSO |
| function_id | FK famille nature Fonction | non | Fonction |
| profession / complement | text | non | Complément (fonction) |
| language | enum `fr,en,de,it` | — | Langue |
| signature | image (jpeg/png) | oui | Signature |

- Onglets : Informations, Mot de passe, Tablette (lecture : UUID tablette, version MobileApp, version Android, niveau batterie, modèle, taille écran, IMEI, MAC, dernière synchronisation, position GPS + « Afficher la position sur la carte », « Backup sur carte microSD ») ; « Aucune tablette associée » sinon. [OBS `profile.tablet.*`]
- Menu profil : Profil, Connexion rapide (QR), Centre d'aide, Formation LMS, Nouveautés (compteur non lus), Tutoriel vidéo, « Discutez avec nous » (Zendesk), Conditions et politiques, Déconnexion. [OBS `profile.menu.*`]
- Langues UI supportées : `fr, en, de, it`, défaut `en` [OBS `Mn.supportedLanguages`].

### 2.9 Connexion rapide (QR) utilisateur

- Action « Connexion rapide » (`QuickConnection`) sur un utilisateur **actif** non opérateur [OBS `Yw.getActionMenu`] : modale « Connexion avec QR code », saisie du mot de passe (« Mot de passe incorrect » si erreur), « Voir le QR code », « Dissocier l'appareil actuel » (`login.quickConnection.unlinkTabletSuccess`). « Le QR Code permet une connexion rapide avec les tablettes ». [OBS]
- « QR Code ID » (`ViewQrCodeId`) : export PDF/image des QR d'identification des collaborateurs activés (`users.qrCodeFile = QR code - utilisateurs`, `contributors.qrCodeFile = QR Code - opérateurs`) ; erreur si collaborateur désactivé. [OBS]

---

## 3. Droits (authorities), droits complémentaires et rôles projet

### 3.1 Droit d'accès global d'un utilisateur [OBS enum `J`, HC:Library-and-resources]

| Code interne | Valeur API | Libellé FR (`users.filters.*`) | Sélectionnable dans la modale |
|---|---|---|---|
| SimpleUser=7 | `USER_BASIC` (API: SIMPLE) | Simple | oui |
| NormalUser=5 | `USER` (NORMAL) | Normal | oui |
| UserAdvanced=4 | `USER_ADVANCED` (ADVANCED) | Avancé | oui |
| AdminApp=3 | `ADMIN_APP` (ADMINISTRATOR) | Administrateur | oui (par admins) |
| AdminAppGlobal=2 | `ADMIN_APP_GLOBAL` (GLOBAL_ADMINISTRATOR) | Administrateur global | oui (par admins globaux) [INF] |
| AdminSiteFlow=1 | `ADMIN` (SITEFLOW_ADMINISTRATOR) | Administrateur Siteflow | non (éditeur) |
| UserContractor=14 | `CO_CONTRACTOR_USER` | Co-traitant | auto si société ≠ société principale |
| OperatorContractor=15 | `CO_CONTRACTOR_OPERATOR` | Co-traitant | auto (opérateur) |
| DeviceContractor=16 | `CO_CONTRACTOR_DEVICE` | Co-traitant | auto (tablette) |
| UserOperator=6, UserMobile=9, Anonymous=8, UserExternApiAccess=10 | techniques | — | non |

- Groupes [OBS] : `rolesAsAdmins=[ADMIN, ADMIN_APP, ADMIN_APP_GLOBAL]` ; `rolesAsAdminsAndAdvanced` (+ADVANCED) ; `contractors` ; `noReorganizedRoles` (admins + co-traitants ne peuvent pas être « réorganisés » en masse).
- Règle co-traitant [OBS `users.modals.edit.company.alert`] : « Un seul droit est disponible car vous venez de préciser que le collaborateur sera un cotraitant de la société déjà sélectionnée » → si la société choisie n'est pas la société principale, le droit est forcé à Co-traitant.
- Le filtre par droit propose seulement les droits ≥ au plus bas sélectionné (`itemsResolverFilter`). [OBS]

### 3.2 Droits complémentaires (onglet « Droit complémentaire » de la modale utilisateur) [OBS `users.modals.tabs.*`, enum `A1 QHSE=1 UserModelForm=2 ManageDiffusion=3`]

| Clé | Libellé | Effet |
|---|---|---|
| `generic_form` (QHSE) | Autoriser la création et l'édition de formulaire générique depuis la bibliothèque | droits Add/Edit `libraryFormModal` |
| `model_form` (USER_MODEL_FORM) | Autoriser la création et l'édition de formulaire modèle depuis la bibliothèque | idem |
| `manage_diffusion` (MANAGE_DIFFUSION) | Autoriser le déverrouillage du suivi des documents | action `ControlDiffusion` (documents, dossier de clôture) |

- Disponible seulement si droit ∈ {Administrateur, Administrateur global, Avancé, Co-traitant utilisateur} [OBS `rolesWhereAdditionalRoleCanBeManaged`]. À la **création**, les 3 sont envoyés activés pour ces droits ; en édition selon les cases [OBS mapper] (une note RN indique qu'un droit complémentaire plus récent « reste désactivé par défaut » [OBS RN, droit non identifié]).

### 3.3 Rôle dans une entité (team role) [OBS enum `Ye`, `flowApp.ChoixTeamRole.*`, `contributors.table.role.*`]

| Code | API | Libellé |
|---|---|---|
| ReadOnly=1 | `ROLE_READONLY` | Invité |
| Operator=2 | `ROLE_OPERATOR` | Opérateur (réservé aux opérateurs, non modifiable) |
| Writer=3 | `ROLE_NORMAL` | Rédacteur |
| Expert=4 | `ROLE_ADVANCED` | Expert |
| Responsible=5 | `ROLE_ADMIN_PROJECT` | Responsable |

- Rôle par défaut à l'import dans l'entité, choisi en pied de modale « Rôle par défaut (sauf pour les administrateurs) » ; les Admin / Admin global importés reçoivent **Responsable** [OBS `contributors.modal.footer.role`, RN « Droits et rôles »].
- Un opérateur a toujours le rôle Opérateur ; on ne peut changer un rôle que vers un rôle autorisé (`canChangeRole`) [OBS].
- L'API renvoie pour chaque entité `currentUserRoles` (rôles de l'utilisateur courant) [OBS].

### 3.4 Évaluation des permissions [OBS service de permissions]

Chaque écran/modale déclare, par action (`read, add, edit, duplicate, delete, publish, export, import, upload, download, restore, unlock, editStatus, editRef, executeFlowRef, unlink, link, controlDiffusion, multiPr, Pr, deleteSignature, view, share, archive, generateDocument, editFlowContributors, deactivate, navigate, guide, reset, diagramImportFlow, validateStep, devalidateStep`), une règle `{rights?: Authority[], roles?: TeamRole[], forbidden?: Authority[]}` :
1. Si l'utilisateur a un droit listé dans `forbidden` → refusé (utilisé pour exclure les co-traitants).
2. Dans un contexte d'entité : si la règle a des `roles` **et** l'utilisateur a un rôle sur l'entité → autorisé ssi son rôle ∈ `roles` (le droit global est alors ignoré).
3. Sinon, si `rights` défini → autorisé ssi `rights` vide ou droit ∈ `rights`.
4. Liste vide = tout le monde.
Message de refus : « Vous n'avez pas le niveau de droit ou rôle suffisant pour effectuer cette action » (`global.permission.alert.subtitle`) ; accès page : « Vous n'avez pas les droits pour accéder à cette page, contactez votre administrateur SiteFlow ». [OBS]

### 3.5 Matrice de permissions (domaine de ce document) [OBS `li.*`]

Abréviations : SFA = Admin Siteflow, GA = Admin global, A = Admin, AV = Avancé, N = Normal, S = Simple, CO = Co-traitant utilisateur ; rôles R = Responsable, E = Expert, W = Rédacteur, O = Opérateur.

| Écran | Lecture | Écriture / autres |
|---|---|---|
| Module Paramètres | SFA, A, GA, AV | — |
| Compte | SFA, A, GA, AV | Edit : SFA, A, GA |
| Carnet clients (page, modale) | SFA, A, GA, AV | Delete : SFA, A, GA |
| Sociétés (page, modale) | SFA, GA | — |
| Familles page | SFA, A, GA, AV | Delete/Archive : SFA, A, GA ; modale : SFA, A, GA |
| Catégories par défaut, Statuts, Références, Attributs | SFA, A, GA | Delete : SFA, A, GA |
| Modèles de fichiers, Cellules, Dossiers (clôture) | SFA, A, GA, AV | Delete : SFA, A, GA |
| Corbeille | SFA, A, GA, AV | Restaurer (Edit) : idem |
| Général (compte/modules), Organisation, Trames, Suivi (wording), Backups, Logs push, Usage (KPI) | SFA uniquement | — |
| Tâches de fond | SFA, GA | — |
| Liste des entités | tous | Edit/Delete : SFA, A, GA **ou rôle R** ; Publier/Privatiser : SFA, GA |
| Modale édition / duplication / préparation / dossier | SFA, A, GA ou rôle R | — |
| Modale création d'entité | SFA, A, GA, N, AV, CO (pas Simple) | — |
| Gestion fichiers personnalisés / PGAC | SFA, A, GA, AV | — |
| Module Collaborateurs et tablettes | SFA, A, GA, AV, N | — |
| Utilisateurs | lecture SFA, A, GA, AV, N ; modale SFA, A, GA, AV | Edit : +AV ; Delete/Download/Export/Restore : SFA, A, GA ; Débloquer : SFA |
| Déplacer d'applicabilité | SFA, GA | — |
| Compétences (utilisateur/opérateur) | SFA, A, GA, AV, N | Edit/Delete : SFA, A, GA |
| Utilisateurs externes | SFA | — |
| Opérateurs | comme Utilisateurs (sans Unlock) | |
| Tablettes | lecture SFA, A, GA, AV, N | Edit/View(QR) : +AV ; Delete : SFA, A, GA ; Unlock : SFA |
| Appareils autorisés | SFA, A, GA, AV | Edit/Delete/View : SFA, A, GA, AV |
| Accès API | SFA | — |
| Entité > Collaborateurs | tous | Delete : SFA, A, GA ou R (co-traitants interdits) ; modale import : SFA, A, GA ou R/E ; édition : R/E |
| Entité > Tablettes | tous | Delete : R ; QR (View) / import : R/E |
| Entité > Catégories | tous | Edit/Archive : R/E ; Delete : R (co-traitants interdits) ; Add/Edit modale : R/E |

---

## 4. Collaborateurs & tablettes (page « Collaborateurs et tablettes »)

Menu [OBS `appMenu.contributors.*`] : Utilisateurs, Opérateurs, Utilisateurs externes, Tablettes, Appareils autorisés, (Accès API V1/V2 — hors périmètre).

« Users and operators are collaborators who share the same properties. Users have additional properties: Email, SSO identifier, Access right » ; users = WebApp + MobileApp, operators = MobileApp seule ; shared users = accès restreint via lien chiffré. [OBS HC:Library-and-resources]

### 4.1 Objet `collaborator` (utilisateur ou opérateur)

Type [OBS enum `pn Operator=1 User=2`, API `TypeEnum.USER/OPERATOR`] ; nature utilisateur [OBS enum `Gi`] : `NORMAL`=utilisateur interne, `EXTERN`=utilisateur (externe), `DEVICE`=tablette interne, `DEVICE_EXT`=tablette externe, `EXTERNAL_API_ACCESS`, `OPERATOR`, `EXTERNAL_CONTRIBUTOR`.

| Champ | Type | Obl. | Valeurs / règle | Libellé FR |
|---|---|---|---|---|
| id / uuid_entity | uuid | auto | | — |
| kind | enum `user`,`operator` | oui | | Type |
| first_name | text ≤50 | oui | erreur `LongFirstName` | Prénom |
| last_name | text ≤50 | oui | erreur `LongLastName` | Nom |
| trigram | text, upper-case | oui | min 3 [OBS `settings.messages.validate.trigramme.minlength`] | Trigramme |
| email | email ≤50 | oui (user) | unique (erreur `userConflict` « Adresse mail déjà utilisée ») ; pour un opérateur, email technique généré `prenomnom@siteflow<timestamp>` [OBS mapper] | Email |
| sso_identifier | text | non (user) | unique (`ssoIdentifierConflict`) | Identifiant SSO |
| register_number (matricule) | text | non | unique (`UnavailableMatricule` ; « Le matricule saisi est déjà renseigné pour un autre opérateur ») | Matricule |
| authority | enum §3.1 | oui (user) | | Droit |
| company_id | FK société | oui | `sfxRequired` | Société |
| function_id | FK famille nature *Fonction* (RhpFunction) | oui | | Fonction |
| complement | text | non | | Complément |
| group_id | FK famille nature *Groupe* (Team) | oui | | Groupe |
| legal_id | FK famille nature *Administratif* (Legal) | non | | Administratif |
| contract_type_id | FK famille nature *Contrat* | non | | Type de contrat |
| default_hierarchy_ids | M2M catégories nature *Hiérarchie* | non | placeholder « Hiérarchie A ; Hiérarchie B » | Hiérarchie par défaut |
| profession | text | non | | Poste / Fonction (profil) |
| language | enum fr/en/de/it | — | | Langue |
| signature | image | (profil) | | Signature |
| status | enum §4.2 | auto | | Statut |
| account_id | FK compte | oui | modifiable via « Déplacer » | Applicabilité |
| additional_rights | set §3.2 | non | | Droit complémentaire |
| created_at / updated_at | timestamptz | auto | | Date de MAJ |

Modale utilisateur [OBS chunk CS3BRNN6 ; routeIds `UserAddModal/UserEditModal`] : onglets **Général** (prénom, nom, trigramme, email, identifiant SSO, société, fonction, complément, groupe, droit, administratif, contrat, hiérarchie par défaut, matricule) et **Droit complémentaire**. Mode « conversion » d'un utilisateur externe en utilisateur (enum `ConvertUser=0, UpdateUser=1, AddUser=2`).
Modale opérateur [OBS chunk 6JQKWYFR] : mêmes champs sans email / SSO / droit / droits complémentaires.

Erreurs de création [OBS enum `userConflict=1 UnavailableMatricule=2 LongFirstName=3 LongLastName=4 LongEmail=5 ssoIdentifierConflict=6` + `users.modals.new.*`].

### 4.2 Statut d'un collaborateur [OBS enum `$o`, `users.table.*`]

| Statut | API | Libellé | Couleur |
|---|---|---|---|
| Active=1 | `ACTIVATED` | Activé | #57b09d |
| Inactive=2 | `DEACTIVATED` | Désactivé | #af1018 |
| Onboarding=3 | `ONBOARDING` | En attente (icône sync, clic = renvoyer l'email) | #ffb141 |
| Blocked=4 | `BLOCKED` | Bloqué | #af1018 |
| Deleted=5 | `DELETED` | Supprimé | #9e9e9e |

Le filtre Statut ne propose Onboarding/Blocked que pour les utilisateurs, Deleted selon contexte. [OBS `multiSelectResolver`]

### 4.3 Liste Utilisateurs / Opérateurs

- Colonnes utilisateurs [OBS enum `ER`] : Fonction (chip), Nom (Prénom Nom), Hiérarchie, Droit, Statut, Compétences (liste « ; » + tooltip), Société, Actions. Opérateurs : idem sans Droit.
- Filtres [OBS `users.filters.*`, mapper] : recherche texte, Applicabilité, Droit, Statut, Société, Fonction, Groupe, Hiérarchie (+ « Sans hiérarchie »), Compétence (+ « Sans compétence », « Compétence(s) expirée(s) »), Domaine d'activité, Administratif (+ « Sans administratif »), Contrat (+ « Sans contrat »), filtre par date ; « Effacer le(s) filtre(s) ».
- Barre d'outils : Créer, « Importer depuis un fichier Excel », « Réorganiser » (modification en masse), « Exporter les QR Code ID des … activé(e)s ».
- Menu d'actions par ligne [OBS enum `Yw` + `getActionMenu`] :

| Action | Condition | Permission |
|---|---|---|
| Compétence (Skill=1) | statut ≠ Supprimé | read |
| Connexion rapide (2) | Actif, utilisateur (pas opérateur) | read |
| Déplacer (MoveApplicability=8) | ≠ Supprimé | modale SFA/GA |
| Désactiver (6) | Actif | edit |
| Propriétés (10) | toujours | read |
| QR Code ID (11) | toujours (erreur si inactif) | export |
| Supprimer (3) | ≠ Supprimé | delete |
| Débloquer (4) | utilisateur Bloqué | unlock (SFA) |
| Restaurer (5) | Supprimé | restore |
| Renvoyer email d'activation (7, libellé « Activer ») | utilisateur Désactivé/En attente | edit |
| Réactiver opérateur ou tablette (9, « Activer ») | opérateur Désactivé | edit |

- Confirmations : désactivation (email de notification envoyé : « E-mail de notification de désactivation de compte envoyé avec succès »), suppression, restauration, déblocage. [OBS `users.sweetAlert.*`, `users.table.*`]
- Suppression impossible si dépendances [OBS `global.entityConflict.hint.contributor.*`] : affecté à des flows, à des entités (utilisateur/opérateur), « restreint aux flows suivants ».
- Propriétés : Prénom, Nom, Trigramme, Applicabilité, Droit, Fonction, Groupe, Hiérarchie, Statut, Flow(s) affectés. [OBS `contributors.modals.properties.*`]

### 4.4 Réorganisation (modification en masse)

« Changer le ou la [Catégorie] à [valeur] sur les N utilisateurs sélectionnés » ; catégories : Hiérarchie, Fonction, Groupe, Administratif, Contrat, Rôle, Droit [OBS enum `iS Hierarchy Function Legal Contract Group Role Droit`]. Les admins et co-traitants sont exclus. Message de confirmation `users.modals.reorganize.confirmMsg`. [OBS]

### 4.5 Import Excel (utilisateurs / opérateurs)

- Modale « Importer des utilisateurs.trices depuis un fichier Excel » : « Télécharger la trame » (trame initiale), dépôt du fichier, « Importer », état « Traitement en cours ». Formats : Csv/Xls/Xlsx [OBS enum fichiers]. [OBS `users.modals.upload.*`]
- Erreurs globales [OBS `global.elementConflict.user.errorKey.*`] : fichier au mauvais format/ancienne trame, type invalide, aucun élément ou trame invalide, chaîne trop longue dans une cellule, échec.
- Erreurs par ligne (rapport de conflit) [OBS enum `Duplicated=1 NotConform=2 InvalidFamily=3 InvalidDate=4 InvalidName=5 BreaksLine=6 InvalidEMail=7 InvalidRight=8 InvalidCompany=9 Mandatory=10`] : doublons, famille non reconnue, email invalide, droit invalide, société non reconnue, champ obligatoire, (retours à la ligne interdits, date invalide). « Plusieurs familles ont le même nom » (`global.errorToaster.error.user.duplicatedFamilyName`).
- Colonnes de la trame [INF] : prénom, nom, trigramme, email, SSO, matricule, droit, société, fonction, complément, groupe, hiérarchies, administratif, contrat.

### 4.6 Compétences d'un collaborateur (`collaborator_skill`) [OBS `operators.modals.skills.*`, `flowApp.skill.*`, DTO]

| Champ | Type | Obl. | Libellé |
|---|---|---|---|
| skill_parent_id | FK famille nature Compétence (parent) | oui | Compétence parent * |
| skill_id | FK famille nature Compétence (enfant) | oui | Compétence enfant * |
| activity_domain_id | FK famille nature Domaine d'activité | non | Domaine d'activité |
| started_at | date | non | Date de début |
| updated_at_business (updateDate) | date | non | Date de mise à jour |
| ended_at | date | non | Date de fin |
| expertise | int 0–10 | non | Expertise (« Expertise {{current}} / 10 ») |
| description | text | non | Description |
| comment | text | non | Commentaire |
| files | PDF[] | non | Document PDF |

- Règles [OBS `users.error.skill.*`] : fin ≥ début ; fin ≥ mise à jour ; mise à jour ≥ début. Une compétence ne peut être ajoutée 2 fois au même collaborateur (`global.errorToaster.skill.addSkill`).
- État calculé : **Actif** / **Expiré** (date de fin dépassée) [OBS `flowApp.skill.filter.*`, enum Active/Archive].
- Écrans : tableau (Compétence, Date de MAJ, Date de fin, État, PDF, Action : éditer, archiver/supprimer, document PDF), filtres (parent, enfant, état, domaine). « PDF récapitulatif » de toutes les compétences actives (nécessite trame « Collaborateur - Récapitulatif des compétences » ; sinon erreur `global.errorToaster.document.pageTypeNotFound`). Erreur « Le collaborateur n'a pas de compétences ».

### 4.7 Utilisateurs externes (shared users) [OBS `externalUsers.*`, chunk : companyName, email (lecture), firstName/lastName ≤50, profession requis]

- « La création de collaborateur externe n'est disponible que via le partage d'un formulaire » (`externalUsers.toaster.createUser`) — créés automatiquement lors d'un partage de formulaire/document par lien.
- Champs : Prénom*, Nom*, Email (lecture), Entreprise*, Fonction*. Statut : Activé / Désactivé / En attente / Bloqué / Supprimé.
- Colonnes : Nom Prénom, Email, Entreprise, Fonction, Statut, Action. Actions : Éditer, « Convertir en utilisateur » (ouvre la modale utilisateur en mode conversion), Supprimer.
- Accès : Admin Siteflow uniquement [OBS perm].

### 4.8 Tablettes (profils tablette) [OBS `tablets.*`, chunk SH2XCAKU, enums `jn`, `Gi`]

| Champ | Type | Obl. | Valeurs | Libellé |
|---|---|---|---|---|
| name | text 3–255 | oui | unique (« Le nom renseigné est déjà utilisé ») | Nom |
| nature | enum `device` (interne, icône maison), `device_ext` (externe, icône caravane) | oui | non modifiable en édition | Type |
| family_id | FK famille nature *Tablettes* (Device) | oui | | Famille |
| company_id | FK société | oui | | Société |
| status | enum ci-dessous | oui | | Statut |
| comment | text | non | | Commentaire |
| notify_email | email | oui | onglet « Personne à notifier » | Email |
| account_id | FK | oui | | Applicabilité |
| telemetry (lecture) | uuid tablette, version MobileApp, version Android, batterie %, modèle, taille écran, IMEI (`uniqueDeviceId`), adresse MAC, dernier envoi, position GPS (lat/long) | — | « Veuillez flasher le QR code avant de pouvoir visualiser des informations » | onglet Informations |

Statut matériel [OBS enum `jn`] : Active « Activé », Disable « Désactivé », Broken « Cassé », Down « En panne », Maintenance « En maintenance » (API HC : ACTIVATED, DEACTIVATED, BROKEN, CRASHED, IN_MAINTENANCE). Un état utilisateur `userStatus` (Activé/Désactivé…) existe en parallèle (colonne « État ») [OBS DTO].

- Modale : onglets Général, Informations, Options (Générer QR code, Envoyer un récapitulatif par email, Dissocier l'appareil actuel), Personne à notifier. « Impossible d'éditer une tablette désactivée » (`global.tablet.message`).
- Liste [OBS enum `vR`] : Famille, Nom, Version MobileApp, Dernier envoi, Position (« Afficher la position sur la carte »), Statut, État, Société, Actions. Filtres : Applicabilité, Société, Famille, Type (interne/externe), Statut, État.
- Actions [OBS enum chunk tablettes `Delete=1 Deactivate=2 Activate=3 Properties=4`] + QR. Propriétés : Nom, Famille, Type, Statut, État, Applicabilité, Flow(s).
- Suppression bloquée si la tablette est affectée à des entités/flows [OBS `global.entityConflict.hint.contributor.tabletLink`, `tablet.flowsLink`].
- Connexion rapide tablette : modale « Connexion avec QR code » (Nom, Famille, Statut, QR, « Flashez le QR code depuis la tablette »), indisponible si désactivée, « Dissocier l'appareil actuel ». [OBS `tablets.modals.quickConnection.*`]
- Les tablettes ne sont pas utilisables dans les entités Dossier, Référentiel, Modèle (`projectsWhereTabletNotUsed`) [OBS].

### 4.9 Appareils autorisés [OBS `authorizedDevices.*`, chunk U3PV4FBP, RN:PR101]

- Module optionnel : « configurer les tablettes ou smartphones autorisés à se connecter à la MobileApp (identifiant/mot de passe ou QR Code). Par défaut, sans configuration, tout appareil peut se connecter ». Feature flags `sfp-12172-enable-ma-authorized-devices-access`, `sfp-12350-enroll-new-ma-authorized-devices` [OBS].
- Champs : `designation` (requis, 3–?), `device_id` (requis, 3–?, unique « Identifiant de l'appareil déjà utilisé » ; affiché sur la page de connexion MobileApp via le bouton « Identifiant appareil »), `created_at`.
- Liste : Désignation, Date de création, Action (Éditer, Supprimer — « Son autorisation d'accès à votre environnement sera révoquée »). Recherche texte + filtre de dates.

### 4.10 Sociétés — voir §6.4.

---

## 5. Entités (projets)

### 5.1 Types d'entité [OBS enum `Ti`, `projects.modal.types.*`, `projects.letter.*`, HC]

| Code | API | Libellé | Lettre/badge | Notes |
|---|---|---|---|---|
| Project=1 | `PROJECT` (HC: CORE) | Projet | P | entité opérationnelle (terrain) |
| Referential=2 | `REFERENTIAL` (HC: STANDARD) | Référentiel | R | bibliothèque de flows référentiels réutilisables |
| Template=3 | `TEMPLATE` | Modèle | M | « template projects can only host core flows » |
| Pgac=4 | `PGAC` | Projet PGAC | P | variante métier nucléaire (EDF) |
| Folder=5 | `FOLDER` | Dossier référentiel / Sous-dossier référentiel | — | non créable directement (absent de `convertToCreateApiValue`) ; obtenu par « Convertir en dossier » d'un référentiel |

Paramètres d'URL : `project, referential, model, pgac, folder`. Groupes observés : `projectTypesWhereWeCanGenerateFlow=[Project,Pgac]`, `projectTypesWithDiagram=[Folder,Referential,Project,Pgac]`, `projectsWhereTabletNotUsed=[Folder,Referential,Template]`.

### 5.2 Champs d'une entité [OBS DTO create/update + concordance HC + i18n `projects.modal.*`, `information.*`]

| Champ | API | Type | Obl. | Libellé FR | Onglet |
|---|---|---|---|---|---|
| id | uuidEntity | uuid | auto | — | |
| type | typeProject | enum §5.1 | oui (non modifiable en édition) | Type | Général |
| designation | designation | text 3–255 | oui | Nom | Général |
| client_id | clientRef / client | FK client | oui (non modifiable en édition [OBS `client` disabled]) | Client | Général |
| family_id | labelFamilyApplicationUuidEntity | FK famille nature Entité | oui | Famille | Général |
| business_ref | businessRef | text ≤255 | non (peut être généré : « Généré(e) automatiquement ») | Référence (N° d'affaire, HC) | Général |
| location_label | locationLibelle | text | non | Localisation | Général |
| description | description | text | non | Description | Général |
| custom_status_id | customStatusUuidEntity | FK statut nature Entité | non (défaut = statut « par défaut ») | Statut | Général |
| status_comment | statusComment | text | non (à l'édition, si changement de statut) | Commentaire | Général |
| index | index | text ≤255 | non (sous-dossier référentiel) | Indice | Général |
| is_contractual | isContractual | bool | — | « Ajouter des informations sur le contrat » (bascule) | Général |
| contract_ref | contractRef | text | non (peut être généré) | N° de contrat | Informations contrat |
| internal_command | internalCommand | text | non | N° de commande interne | idem |
| external_command | externalCommand | text | non | N° de commande externe | idem |
| market_number | marketNumber | text | non | N° de marché | idem |
| technical_deal | technicalDeal | text | non | Affaire technique | idem |
| keywords | keywords | text | non | Mots clés | idem |
| business_domain | businessDomain | text | non | Domaine métier | idem |
| national_program | nationalProgram | text | non | Programme national | idem |
| complement_ref_1 / _2 | complementRefOne/Two | text | non | Complément référence 1 / 2 | idem |
| custom field values | — | §6.8 | selon attribut | Attribut personnalisé | **Attributs** |
| export_language_1 | exportLanguageOne | enum `NONE,FR,EN,DE,IT` | — (non modifiable après création [OBS disabled en édition, `flowApp.ChoixLanguage.toolTip.editCase`]) | Langue 1 | **Options** |
| export_language_2 | exportLanguageTwo | idem | — | Langue 2 | Options |
| is_intern_supervised | internSupervised | bool | — | « Modifier les conditions de surveillance interne de l'entité » | Options |
| supervision_intern_1..3 | supervisionIntern1..3 | text | 1 requis si activé | Surveillant interne 1/2/3 (placeholder « Surveillant interne A ») | Options |
| is_supervised | isSupervised | bool | — | « Modifier les conditions de surveillance externe de l'entité » (« Activer la multi-surveillance externe ») | Options |
| supervision_1..3 | supervision1..3 | text | 1 requis si activé | Surveillant externe 1/2/3 | Options |
| code_project | codeProject | text | requis si bloc PGAC | Code projet | Options (PGAC) |
| pgac_activities | pgacActivities (« ; ») | set de lettres | — | Activités PGAC (C Confinement, D Calorifuge, E Echafaudage, K Décontamination, M Mise à disposition, N Nettoyage, O Prévention des risques, P Protection biologique, R Rambarde/Caillebotis, S SAS Atelier, T Déchet, V Pompage, W Furetage) | Options (PGAC) |
| start_date / end_date | startDate / endDate | date | requis si bloc PGAC | Date de début / Date de fin | Options (PGAC) |
| folder_id | folderUuidEntity | FK entité Folder | non | (création dans un dossier) | — |
| published | published | bool | — | Partage Publique/Privée | action liste |
| local_form_allowed | localFormAllowed | bool | lecture | — | — |
| account_id, organization_id | application / uuidOrganization | FK | auto | Applicabilité / UUID organisation | Propriétés |
| created_at/by, updated_at/by | | | auto | Date de création / Dernière modification | Propriétés |
| deleted_at/by | | | corbeille | | |

Règles [OBS] :
- `pgacBlockActive` = codeProject ou dates ou activités renseignés ; bloc « Modifier les options spécifiques aux projets de PGAC » (type PGAC).
- `displayContractInformation` = isContractual et au moins un champ contrat renseigné.
- Modification de la surveillance : alerte « La modification de la surveillance ne va pas impacter les documents déjà diffusés au client » ; **impossible de désactiver** la multi-surveillance si au moins une signature a été faite avec (`projects.modal.signatoriesExistsTitle`).
- Alerte édition : « les modifications suivantes ne seront pas prises en compte sur les documents déjà diffusés ou validés par le client » (`global.errorToaster.dashboard.editProject.message`).
- Références auto-générées (Référence / N° de contrat) selon la configuration « Références » (§6.9) ; l'IHM vérifie si une référence int/ext est générée (`projects.modal.checkHasRef*GeneratedFail`).
- Famille : « Pour ajouter / modifier une famille, rendez-vous dans le module correspondant sur la page Paramètres » ; client : « Pour ajouter un client veuillez vous rendre dans … Carnet client ».
- Toasters : création « Entité créée avec succès », édition « Modification(s) enregistrée(s) avec succès ». Titre de modale selon type (« Edition du projet / référentiel / modèle / projet PGAC / dossier référentiel {{ projectDesignation }} »).

### 5.3 Statut et état d'une entité

- **Statut** = statut personnalisé de nature *Entité* (§6.7), avec couleur, description (tooltip), icônes « visible MobileApp » et « masqué » [OBS liste]. Chaque statut appartient à un **état** (`ToDo, InPreparation, InOperation, InProgress, Done`).
- **Visibilité** [OBS enum `p0 Active=1 Archive=2 All=3`, API `ACTIF/ARCHIVE`] : filtre « État » = Visible (œil) / Masquée (œil barré) / Toutes. Une entité est **masquée** quand son statut a l'option « Masquer l'entité pour ce statut à un état terminé » (`hideEntity`) [OBS `status.dialog.options.hideEntity`, RN:PR97 « comme pour les états d'entités »]. Action « Masquer » (`projects.table.actions.mask`). [INF : masquer = choisir un statut avec hideEntity, ou flag direct legacy]
- **Historique des statuts** (`ProjectStatusHistoryModal`, action « Historique des statuts ») [OBS `global.statusHistory.*`] : « {{user}} a créé l'entité {{name}} avec le statut X », « {{user}} a changé le statut de X à Y », « puis a ajouté le commentaire « … » », date, heure, source (Mobile / WebApp / API — enum `Mobile=1 WebApp=2 APIEXT=3`), pagination « Charger plus ».

### 5.4 Liste des entités (`/explore/projects`, routeId `Projects`) [OBS]

- Titre « Liste des entités ». Bouton « Ajouter un nouvel élément ».
- Filtres : recherche texte ; types (boutons toggle : projet, référentiel, modèle, projet PGAC, dossier référentiel — tooltips `projects.tooltips.filters.types.*`) ; État (Visible/Masquée/Toutes) ; Famille ; Client ; Responsable (utilisateurs) ; Partage (Toutes/Publiques/Privées) ; Applicabilité ; « Effacer le(s) filtre(s) » ; « Fichiers » (gestion des fichiers personnalisés, §5.10).
- Colonnes [OBS enum `t4`] :
  - **verrouillées** : Famille, Nom (désignation), Statut ;
  - **optionnelles** : Client, Référence, Localisation, Responsable, Description, N° de contrat, N° de commande interne/externe, N° de marché, Affaire technique, Mots clés, Domaine métier, Programme national, Complément référence 1/2 ;
  - **attributs personnalisés** de nature Entité, groupés par famille ; types éligibles : Vrai/faux, Date, Date et heure, Décimal, Liste unique, Liste multiple, Entier, Titre, Texte, Lien (`projectColumnAttributeTypes`).
  - Tri serveur : Nom, Référence, Localisation. Colonne Indice (sous-dossiers), Applicabilité/partage (icône magasin « Publique - compte » sinon base de données). Colonne Action figée à droite avec ombre ; colonnes redimensionnables ; dernier élément sélectionné en surbrillance. [OBS RN 2.12, 2.15]
- Personnalisation des colonnes (`ProjectsCustomizeColumnsModal`) : mode Défaut / Personnalisé, sections « Obligatoires » / « Optionnels » / « Catégories » (attributs), limite **30 colonnes** (« Nombre des colonnes dépassant les 30 éléments »), confirmation « vos paramètres seront enregistrés dans le cache de navigateur », Réinitialiser. Stockage **navigateur** (localStorage). [OBS `customizeColumns.*`]
- Pagination infinie (« Charger plus ») [OBS effet `loadNextPage`].
- Ouverture : clic → dashboard de l'entité ; un dossier référentiel s'ouvre sur la liste de ses sous-dossiers (« Revenir au dossier »).
- Menu d'actions [OBS enum `Kw` + `getActionMenu`] : Historique des statuts (7) ; Dupliquer (1) sauf PGAC et Dossier ; Rendre publique (4) / Rendre privée (5) sauf PGAC et seulement si l'utilisateur peut publier ; Propriétés (3) ; Supprimer (2). Plus : Éditer, Préparer (6, sous-dossier référentiel), « détail PGAC », Activer/Masquer [OBS i18n].
- Suppression : vers la corbeille ; « Le projet ne peut pas être supprimé, veuillez supprimer le(s) sous-dossier(s) » ; une entité PGAC ne peut être restaurée. [OBS]
- Historique d'accès : la navbar garde les **5 dernières entités ouvertes** avec les filtres du module Flows (`navbar.tooltip.lastEntity`), suppressible. [OBS]

### 5.5 Propriétés d'une entité (`ProjectPropertiesModal`) [OBS `projects.modal.properties.*`]

Nom, Type, Famille, Client, Applicabilité, Référence interne, Référence externe, Entité partagée (Oui/Non), État (statut), UUID de l'organisation, Date de création + auteur, Dernière modification + auteur.

### 5.6 Duplication (`ProjectDuplicateModal`, `ProjectFolderDuplicateModal`) [OBS `projects.modal.duplicateProject.*`, DTO]

- Phrase guidée : « Duplication de l'entité [type source] nommée [nom source] en entité [type destination] nommée [nom destination, requis] liée au client [client] rattachée au compte » ; nom par défaut « Copie … ». Payload : client, designationProject, typeProject, index.
- Information affichée : dans l'entité dupliquée le circuit de validation interne des flows et externe des documents est remis à 0 ; les autres documents (listes, documents de formulaires, dossier de clôture…) n'existent pas ; documents issus de la bibliothèque conservent leur état ; signatures et réponses de formulaires non copiées ; collaborateurs non copiés (et réponses de formulaire pour un projet).
- Traitement **asynchrone** : « Duplication en cours, traitement en tâche de fond ».
- Conversion de type possible (ex. référentiel → projet) [INF d'après `destinationType`].

### 5.7 Dossiers référentiels (folders) [OBS `projects.folderRef.*`, `projects.modal.prepareFolder.*`]

- « Convertir en dossier » : transforme un **Référentiel** en **Dossier référentiel** (« Référentiel transformé en dossier avec succès »). Le dossier contient des **sous-dossiers référentiels** (entités de type Folder avec `isSubFolder`, avec Indice).
- « Préparer » un sous-dossier : crée une **entité projet** à partir du sous-dossier (titre « Préparation du sous-dossier référentiel {{title}} - {{index}} ») ; impossible si aucun flow (« La préparation est impossible — Veuillez d'abord ajouter un ou plusieurs flows ») ; traitement asynchrone (« Préparation en cours »). API : `/standard-projects/{id}/async-prepare` [OBS RN API].
- Dans un projet préparé : module « Référentiels » (vue liste / diagramme) donnant accès aux flows référentiels liés et bouton « Exécuter ». [OBS RN:PR97]
- KPI : les dossiers référentiels sont exclus des comptes d'entités, seuls les sous-dossiers comptent. [OBS `settingsKpi.globalUse.tooltip.entity`]

### 5.8 Dashboard d'une entité (`/explore/dashboard/...`, routeId `ProjectDashboard`) [OBS menu `Oe`]

En-tête : titre = désignation, sous-titre = type, icône par type. Menu latéral (règles de visibilité observées) :

| Groupe | Module | Route | Masqué si |
|---|---|---|---|
| (principal) | Flows : Vue liste, Vue plan, Vue map, Vue diagramme (+ kanban) | `flow-management/vue-*` | Plan : Modèle ; Map : Modèle ou map désactivée ; Diagramme : option org. désactivée ou type hors [Folder, Referential, Project, Pgac] |
| | Documents | `documents` | Modèle |
| | Formulaires | `forms` | — |
| | Référentiels (vue liste / diagramme) | `flow-referential` | type ∉ {Projet, PGAC} |
| | Listes | `lists` | Modèle |
| | Planification | `schedule-tasks` | type ∉ {Projet, PGAC} |
| | Collaborateurs | `collaborators` | — |
| | Tablettes | `tablets` | Modèle, Référentiel |
| Suivi et clôture | Avancement | `metrics` | — |
| | Signatures (vue liste / temporelle) | `signatures` | Modèle, Référentiel |
| | Remontées terrain | `fields-feedback` | Modèle, Référentiel |
| | Dossier de clôture | `closing-folder` | Modèle, Référentiel |
| Configuration | Informations | `information` | — |
| | Catégories | `categories` | — |

Message si aucune entité : « Aucun projet, référentiel ou modèle sélectionné » ; accès refusé : « Vous n'avez pas les droits pour accéder à cette page ».

### 5.9 Module « Informations » [OBS `information.*`, routeId `DashboardInformation`]

Vue lecture/édition des champs §5.2 en 3 onglets (Général, Attribut, Options) : Nom, Famille, Client, Référence, Code projet, Localisation, Description, « Informations sur le contrat » (N° contrat, commandes, marché, affaire technique, mots clés, domaine métier, programme national, compléments), Référence dossier (+ « Convertir en dossier »), Langues 1/2, Surveillants internes/externes 1-3, Dates. Édition soumise à `projectModal` (admins ou Responsable).

### 5.10 Module « Avancement » (metrics, routeId `DashboardMetrics`) [OBS `dashboardMetrics.*`, `flowApp.dashboardTab.advancement.*`]

- Filtres : Famille, Catégorie, Flow, Provenance, Type, État, filtre par date.
- **Avancement des flows** : « {{count}} flows au total », statuts des flows, répartition WebApp / MobileApp.
- **État des blocs** : en rédaction / vérification / approbation / validés / activés ; **Utilisation des blocs** par type : Instructions, Moyens, Risques, Contrôles, Formulaires, Textes, Équipes, Instructions multiples (tooltip « N blocs sur T flows »).
- **Signatures** : effectuées (Mobile vs Web), obligatoires (« N signatures sur T (M obligatoires) », « % des signatures réalisées »), internes / externes / non listées, méthodes (authentification forte, sans authentification forte, procuration, collaborateur non présent), contrôles techniques, réalisation ; étapes désactivées. Les flows référentiels sont exclus [OBS RN 2.12].
- **Avancement des documents** : « {{count}} documents au total », par état (PREL, BPO, BPE, BPA, sans version…).
- Statistique projet : nb collaborateurs, documents générés, flows spécifiques / génériques / référentiels.

### 5.11 Collaborateurs d'une entité (team roles) [OBS `flowApp.teamRole.*`, `contributors.*`, routeIds `DashboardContributors*`]

Objet `project_member` :

| Champ | Type | Libellé |
|---|---|---|
| project_id, collaborator_id | FK | — |
| role | enum §3.3 | Rôle |
| hierarchy_ids | M2M catégories (nature Hiérarchie, propres à l'entité ou par défaut) | Hiérarchie(s) — au moins une si restreint (« Sauvegarde impossible, sélectionner au moins une hiérarchie ») |
| function_id, group_id, legal_id, contract_id, complement | copies/vues du collaborateur [INF] | Fonction, Groupe, Administratif, Type de contrat, Complément |
| order (teamRoleOrder) | int | — |

- Liste [OBS enum `yR`] : Type (utilisateur/opérateur, icône), Nom, Prénom, Fonction, Groupe, Rôle, Hiérarchie, Société, Actions ; filtres : Type, Rôle, Statut, Fonction, Groupe, Hiérarchie, Compétence, Domaine, Administratif, Contrat, Applicabilité, Société ; « Voir les compétences ».
- Import (« Importer depuis la base des collaborateurs ») : sélection multiple (y compris « tout sélectionner » avec exclusions), rôle par défaut, déjà importés grisés ; « Impossible d'ajouter 2 fois le même collaborateur au projet ». Les utilisateurs peuvent être importés dans tout type d'entité ; les opérateurs dans Projet ou Référentiel ; les tablettes uniquement dans Projet [OBS RN API].
- Réorganisation : changer Hiérarchie ou Rôle des collaborateurs sélectionnés (confirmations `contributors.reorganize.confirm*`).
- Édition (modale) : rôle, hiérarchie(s) ; « Cette hiérarchie ne peut pas être supprimée car elle est déjà rattachée à ce collaborateur restreint au sein d'un ou plusieurs flows ».
- Compétences (lecture) : « Aperçu des compétences de {{name}} » (Compétence, Date de MAJ, Date de fin, État Actif/Inactif, PDF).
- Suppression : bloquée si affecté à des flows.

### 5.12 Tablettes d'une entité [OBS `tablets.modals.import.*`, enum `rF`]

Import depuis la base de tablettes ; colonnes Famille, Nom, Niveau batterie, Position, Société, Statut, Actions ; actions QR (connexion rapide), Supprimer. Une tablette Y non ajoutée au projet ne peut pas télécharger ses données (message MobileApp) [OBS RN].

### 5.13 Catégories d'une entité [OBS `flowApp.category.*`, routeId `DashboardCategories`]

Catégories locales à l'entité (provenance « Entité ») + catégories issues des **catégories par défaut** (provenance « Défaut »). Action « Mettre à jour les catégories par défaut » (« Les différentes catégories seront mises à jour en fonction des catégories par défaut définies dans les paramètres »). Même modèle que §6.6.

### 5.14 Gestion des fichiers personnalisés & PGAC (entités) [OBS `projects.fileProcessing.*`, `projects.pgacs.*`]

Modale à onglets Importation / Exportation / Historique : choix du modèle d'import/export (modèles §6.11), entité(s) source, fichier, type de séparateur ; traitement asynchrone (« Fichier correctement téléchargé, traitement en cours » → « Traitement terminé »). Historique : Type, Utilisateur, Date, Message d'erreur, Action, Référence, Entité. Erreurs : « Les cellules requises sont manquantes "name", "labelFamilyApplication", "labelFamilyApplicationParent" », plusieurs catégories/familles/projets de même nom, flow référentiel vide.

---

## 6. Paramètres (`/explore/settings`)

Menu [OBS chunk Q6NZOZAJ] : Compte, Carnet clients, Sociétés, Familles, Catégories, Statuts (ouvre nature Flow par défaut), Références, Attributs, Fichiers (Modèles, Cellules), Dossiers, Corbeille, Tâches de fond ; groupe **« Admin siteflow »** : Général (Compte, Organisation), Trames, Suivi, Backups, Logs push, Usage.

Actions standard des tables de dictionnaires : Activer / Désactiver / Supprimer (+ Éditer) [OBS `families.table.actions.*`, `status.table.actions.*`, `attributes.table.actions.*`]. Règles communes :
- « Impossible d'activer cet élément tant que son parent est désactivé ! »
- « Impossible de changer le parent / la nature de cet élément » (après création).
- Suppression interdite si l'élément est utilisé (modale « Impossible d'effectuer la suppression » listant les dépendances, `global.entityConflict.*`).

### 6.1 Compte (applicabilité) — `settings/account` [OBS `accountSettings.*`, chunk FCJLGIME]

| Champ | Type | Obl. | Libellé |
|---|---|---|---|
| name (companyName) | text | oui | Nom du compte |
| full_name (companyNameComp) | text | non | Complément |
| organization_name (applicabilityName) | lecture | — | Organisation |
| address_line_1 / _2 | text | oui / non | Adresse / Adresse complément |
| postal_code | text | oui | Code postal |
| city | text | oui | Ville |
| country | text | non | Pays |
| phone, fax | text | non | Téléphone, Fax |
| contact_email | email | non | Email de contact |
| website | text | non | Site internet |
| subdomain | text (lecture) | — | Sous domaine |
| logo | image | non | Logo |
| uuid | lecture | — | UUID de l'organisation |

Édition : SFA, A, GA. Toaster « Modification(s) enregistrée(s) avec succès ».

### 6.2 Général — Compte (`general-account`, Admin Siteflow) [OBS `generalSettings.*`, chunk 76D2P7AK]

- **Comptes** : « Ajouter un compte » (nom ; erreur « Ce compte existe déjà »), liste des comptes existants, « Créer une copie » (duplication de compte).
- **Configuration des modules** : Module PGAC (on/off) + Sous-traitants PGAC (liste « A__B__C »), Module Fichiers, « Figer date signature » (autoSignature), « Autoriser la création de formulaire local », « Activer le verrouillage automatique des réponses de formulaires », « Cacher les titres du bloc instruction multiple », Type de séquence / de phase à la création (linéaire / parallèle).
- **Configuration sur les documents** : Langue 1, Langue 2, Type d'indice (Alpha, Numérique 1…, 0…, 01…, 00…, décimal [OBS enum `NumericZero=1 Numeric=2 Alpha=3 NumericAllZero=4 NumericAllZeroStartZero=5 NumericDecimal=6 NumericDecimalStartZero=7`]), Filigrane, Logo client page de garde (position X/Y, largeur, hauteur).
- **Formats de date** WebApp (date, date-heure, heure, date-heure évènement, signatures externes, sensible…), MobileApp, PDF (+ fuseau horaire `zoneId` requis ; erreurs « fuseau horaire inconnu », « champ obligatoire vide »).
- **Réparation** (outils de maintenance) : boutons « Réparer » (historique d'accès, statuts personnalisés des formulaires, formulaires/flows référentiels dupliqués, questions, nodeOrder des phases, configuration de modèle, valider les flowForm blocs…). [INF : non à reconstruire en V1]

### 6.3 Général — Organisation (`general-organization`, Admin Siteflow) [OBS chunk O2RXOHXV]

| Champ | Type | Libellé |
|---|---|---|
| allowed_download_response | int | Nombre de réponses terminées téléchargées par défaut sur la MobileApp |
| block_form_response_edition | bool | Les réponses à l'état terminé ne peuvent pas être modifiées sur la MobileApp |
| diagram_enabled | bool | Activer la vue diagramme |
| link_expiration_days | int 1–90 | Durée d'expiration des liens lors du partage de formulaire et/ou document |
| links_form_attributes_enabled | bool | Activer l'ajout d'attribut d'objet dans un formulaire |
| local_form_allowed | bool, irréversible | Activer les copies locales de formulaires (« Une fois activée cette option ne peut plus être désactivée ») |
| number_format | enum `fr` (12 345,67) / `en` (12,345.67) | Formatage des valeurs numériques |
| rubric_permissions_enabled | bool | Activer la restriction de navigation dans les formulaires |
| zendesk_enabled | bool (rafraîchit la page) | Activer Zendesk |
| pdf translations | fichier | Personnalisation des PDF : télécharger / charger une traduction |

### 6.4 Sociétés (`companies`, SFA + GA) [OBS `companies.*`, DTO `c4`]

| Champ | Type | Obl. | Libellé |
|---|---|---|---|
| name | text | oui | Nom |
| activity_area | text | non | Secteur d'activité |
| comment | text | non | Commentaire |
| logo | image | non | Logo |
| is_parent_company | bool (lecture) | — | Société principale (une par compte/organisation [INF]) |
| updated_at | | | |

- Liste : Nom, Secteur, Action. Suppression : impossible pour la société mère ; impossible si utilisée par des collaborateurs ou formulaires (liste affichée). La société sert au filtre « Société » des collaborateurs, tablettes et formulaires, et détermine le statut **co-traitant**.

### 6.5 Carnet clients (`clients`) [OBS `clients.*`, chunk BZWCH5F6, concordance]

| Champ | API | Type | Obl. | Libellé |
|---|---|---|---|---|
| name | name | text | oui | Nom 1 |
| name_2 | nameComp | text | non | Nom 2 |
| name_3 | nameComp2 | text | non | Nom 3 |
| address | address (lineOne) | text | oui | Adresse |
| address_comp | addressComp (lineTwo) | text | non | Complément |
| zip_code | zipCode | text | oui | Code postal |
| city | city | text | oui | Ville |
| country | country | text | non | Pays |
| observation | observation | text | non | Commentaire |
| logo | — | image | non | Logo |
| reference | reference | text | non (API) | — |
| **Onglet Options** : cover_page_enabled | | bool | | « Ajouter une page de garde spécifique au client » |
| cover_page_pdf | | PDF | | Trame PDF |
| page_number_x / _y | | number | | Position numéro page X/Y |
| index_max | | int | | Nombre d'indice précédent |

- « La page de garde spécifique du client sera ajoutée par défaut en 1ère page de chacun des documents générés ». Alerte en édition : « Attention les modifications vont impacter les entités où ce client est affecté ! ». Suppression impossible si « Client déjà utilisé ». Clients propres au compte.

### 6.6 Familles et catégories (`label_family`) [OBS `families.*`, `categories.*`, enum `Vi`, DTO]

Même objet technique (« LabelFamily »), distingué par **type** (enum `Qc`: Application = famille, Project = catégorie [INF d'après `Vi.values(isCategory)`]) et **nature**.

**Natures de famille** (`Vi.values(false)`) : Entité (Project=11), Flow (5), Document (4), Formulaire (6), Risque (Adr=1), Moyen (Emm=2), Tablettes (Device=10), Groupe de collaborateur (Team=3), Fonction de collaborateur (RhpFunction=7), Administratif (Legal=8), Compétence (Skill=13), Contrat (Contract=14), Objet (TechnicalObject=15), Domaine d'activité de compétence (ActivityDomain=16).
**Natures de catégorie** (`Vi.values(true)`) : Flow, Document, Liste (9), Hiérarchie de collaborateur (12).

**Nature relative** [OBS enum `ro Parent=1 Child=2 Container=3`] : chaque nature est un conteneur racine (`*_container_uuid_entity`) ; les familles sont **Parent** puis **Enfant** (2 niveaux) ; « Les familles parents et enfants vous permettent la structuration de vos données ». L'objet métier référence toujours une famille **enfant** (« Cette famille enfant est déjà affectée au(x)… »). Provenance des catégories : Défaut / Entité [OBS enum `r4`].

| Champ | API | Type | Obl. | Libellé |
|---|---|---|---|---|
| nature | nature | enum | oui, figé | Nature |
| relative_nature | relativeNature | `parent`/`child` | oui, figé | Type |
| parent_id | categoryParentUuidEntity / familyParent | FK self | oui si enfant, figé | Enfant de … |
| short_name | name | text ≥3 | oui ; unique par parent/nature (« Nom(s) renseigné(s) déjà utilisé(s) ») | Nom court (ex. « FAM », « SECU », « MO ») |
| long_name | fullName | text | non | Nom long (affichage « court - long ») |
| code | code | text | non ; unique (« Code renseigné déjà utilisé ») | Code |
| color | color | hex | défaut `#5e5a5a` ; palette bleu, orange foncé, vert, gris, orange, rose, violet, turquoise + picker | Couleur |
| priority | priority | int | ordre d'affichage (tri par défaut) | Ordre |
| quality_reference | qualityReference | text | non (familles Document) | Référence (qualité) — affichable dans les trames |
| logo | logo | image | non | Logo |
| client_supervision | clientSuperVision | bool | familles Document | Retour client sur l'indice |
| client_supervision_sub_index | clientSuperVisionSubIndex | bool | idem | Retour client sur le sous-indice |
| wording_configuration_id | customWordingUuidEntity | FK §6.13 | requis (familles Document) | Suivi |
| flow_type | — | enum type de flow | catégories/familles Flow | (filtre type de flow) |
| account_id | application | FK | familles : partagées org. ; catégories : compte | Applicabilité |
| active | bool | | | Activer / Désactiver |

Règles [OBS] : modification des conditions de retour client → « Cela impactera les documents déjà créés » ; édition impossible si des documents diffusés sont liés ; « Impossible de désactiver un statut par défaut » ; « Activation impossible : famille enfant déjà existante ! » ; suppression interdite si enfants ou si utilisée (entités, flows, documents, formulaires, moyens, risques, fonctions, compétences, statuts, tablettes, collaborateurs, attributs).

Écran liste : arbre « Nature / Nom » repliable (« Agrandir / Réduire »), filtre Nature, recherche, compteur ; sous-titre famille Document : « Sans retour client sur l'indice / sous-indice ». Modale : Nature, Type (parent/enfant), Enfant de…, Nom court, Nom long, Code, Couleur, Référence, Suivi, Retour client.

**Catégories par défaut** (`settings/categories`, routeId `DefaultCategories`) : modèle de catégories recopié dans chaque entité ; « Affecter à tous les projets » ; « Impossible de supprimer une catégorie déjà importée dans un projet » ; restauration de catégorie importée impossible. Permission : admins seulement.

### 6.7 Statuts personnalisés (`custom_status`) [OBS `status.*`, DTO `x3e`, enum `zt`]

Page « Liste des statuts de nature {{nature}} » ; **natures** (`zt.values[CustomStatus]`) : Entité, Flow, Formulaire, Réponse de formulaire, Objet, Bloc Instruction multiple.

| Champ | API | Type | Obl. | Libellé |
|---|---|---|---|---|
| nature | businessClass | enum ci-dessus | oui, figé | Nature |
| name | name | text ≥3 | oui ; unique (« Nom renseigné déjà utilisé ») | Nom |
| description | description | text ≥3 si saisi | non | Commentaire (« visible au moment de la sélection d'un statut mais aussi au survol ») |
| color | color | hex | défaut | Couleur |
| category (état) | customStatusCategory | enum `TODO`, `IN_PREPARATION`, `IN_OPERATION`, `IN_PROGRESS`, `DONE` (défaut TODO) | oui pour Entité/Flow | État (À faire, En préparation, En opération, En cours, Terminé) |
| link_type | choixLinkType | enum `DEFAULT`, `ENTITY_LABEL_FAMILY_PARENT`, `ENTITY_LABEL_FAMILY`, `ENTITY_PARENT_LABEL_FAMILY_PARENT`, `ENTITY_PARENT_LABEL_FAMILY` | oui, figé | Type de lien (Défaut / famille parent / famille enfant / famille de l'entité parente) |
| label_family_id | labelFamily | FK | si link_type ≠ défaut | Famille parent / enfant |
| is_default | defaultCustomStatus | bool | — | « Rendre ce statut sélectionné par défaut à la création » |
| downloadable | downloadable | bool | Formulaire | « Visible depuis la MobileApp (uniquement type Générique) » |
| importable | importable | bool | Formulaire | « Visible dans les fenêtres d'importation depuis la WebApp » |
| exportable | exportable | bool | Réponse, Flow, Objet | « Visible lors de l'exportation » |
| hide_entity | hideEntity | bool | Entité, Flow | « Masquer l'entité / le flow pour ce statut à un état terminé » |
| order | customStatusOrder | int | | |
| active | | bool | | |

Règles [OBS `zt.businessClassWhere*`, `Ka.customStatusSelectItems`] :
- Famille sélectionnable : Flow, Réponse, Formulaire, Objet, Entité ; « par défaut » cochable pour ces mêmes natures ; option hideEntity : Flow, Entité ; importable/downloadable : Formulaire ; exportable : Réponse, Flow, Objet ; Instruction multiple : sans options.
- Types de lien proposés : Objet → Défaut / famille parent / famille enfant ; Flow → Défaut / famille parente de l'entité / famille de l'entité ; autres → Défaut / famille entité parente parent / enfant.
- Pour les flows, depuis PR97 : l'état « En opération » remplace « Visible depuis la MobileApp », « En préparation » remplace « Visible depuis les fenêtres d'importation », « Terminé » + hideEntity masque le flow. Un flow est « sur le terrain » quand son statut le rend disponible sur la MobileApp (KPI).
- Interdits : supprimer un statut utilisé ; supprimer/désactiver un statut par défaut. Pas de corbeille.
- Liste [OBS enum `TR`] : Famille (P/E), Nom (couleur, « - Statut par défaut »), Importation, Exportation, MobileApp, Masqué, État, Actions ; filtres Nature, Actif/Inactif ; actions [OBS enum `Delete=3 Activate=4 Deactivate=5` + Éditer].
- Statuts de flow « historiques » (non personnalisés) observés : Vide, En préparation, Rédaction, Vérification, Approbation, À faire, En cours, En attente, À disposition, Terminé, Fermé, Annulé, Aucun [OBS `flowApp.dashboardTab.flows.status.*`] — hors périmètre (flows).

### 6.8 Attributs personnalisés (`custom_field`) [OBS `attributes.*`, DTO `u3e`, enum `P1`]

Page « Liste des attributs de nature {{nature}} » ; **natures** (`zt.values[CustomField]`) : Entité, Flow, Phase, Étape, Objet, Document. Filtre nature.

**Types** [OBS enum `P1` / API `TypeFieldEnum`] :

| Code | API | Libellé |
|---|---|---|
| Text=1 | STRING (longText=false) | Texte |
| TextArea=2 | STRING (longText=true) | Texte long |
| Label=3 | LABEL | Titre (séparateur, sans valeur) |
| Integer=4 | INTEGER | Nombre entier |
| Double=5 | DOUBLE | Nombre décimal |
| BooleanField=6 | BOOLEAN | Vrai ou faux |
| Date=7 | DATE | Date |
| DateTime=8 | DATETIME | Date et heure |
| Select=9 | ENUM_SINGLE_SELECTION | Liste à choix unique |
| MultiSelect=10 | ENUM_MULTIPLE_SELECTIONS | Liste à choix multiple |
| File=11 | FILE | Fichier |
| Image=12 | IMAGE | Image (jusqu'à 6 images, galerie, RN 2.17) |
| Metadata=13 | METADATA | Métadonnée |
| Link=14 | LINK | Lien hypertexte |

Phase et Étape : seulement Texte, Texte long, Entier, Décimal, Vrai/faux, Date, Date et heure.

| Champ | API | Type | Obl. | Libellé |
|---|---|---|---|---|
| nature | businessClass | enum | oui, figé | Nature |
| type | typeField + longText | enum | oui, figé | Type d'attribut |
| name | name | text ≥3 | oui ; unique (« Nom(s) déjà utilisé(s) ») | Nom (affiché « Nom - Type ») |
| link_type | choixLinkType | `DEFAULT` / `ENTITY_LABEL_FAMILY_PARENT` / `ENTITY_LABEL_FAMILY` | oui, figé | Type de lien (« spécifique à une famille parent ou enfant ou bien par défaut ») |
| label_family_id | labelFamilyUuidEntity | FK | si lien famille, figé | Famille parent / enfant |
| choices | selectTypeValue / enums | text « A__B__C » | si Select/MultiSelect | Liste de choix (valeur déjà utilisée : « La valeur d'attribut est déjà utilisée ») |
| default_value | defaultValue | selon type (> 255 car. autorisé) | non ; types : Texte, Texte long, Date, Date-heure, Lien (+ booléen/nombres) | Valeur par défaut |
| placeholder | placeholder | text | types Texte, Texte long, Entier, Décimal, listes, Lien | Placeholder |
| tooltip | tooltip | text | non | Tooltip |
| description | description | text | non | Aide |
| required | required | bool | non dispo pour Vrai/faux, Métadonnée, Lien, Titre | Obligatoire |
| read_only | readOnly | bool | | Lecture seule |
| pdf_field_name | pdfFieldName | text | types Texte, Texte long, nombres, listes, booléen, dates, image, métadonnée ; pas pour Objet/Phase/Étape | Champ PDF |
| variable_name | variableName | text | types Texte, Texte long, nombres, listes, booléen, dates, lien, image ; unique (« même variable dynamique qu'un existant ») ; Image : droit ≥ Admin | Variable dynamique |
| text_display | textDisplay | text | Lien ; défaut « Veuillez cliquer sur ce lien » | Texte affiché sur la MobileApp |
| display_in_flow_card | displayInFlowCard | bool | Flow ; pas pour Vrai/faux, Image, Fichier, Titre ; nb max (« nombre maximum … atteint ») | MobileApp - Afficher dans la carte d'un flow |
| display_in_flow_banner | displayInFlowBanner | bool | idem | … dans le bandeau d'un flow |
| display_on_flow_opening | displayOnFlowOpenning | bool | idem | … à l'ouverture du flow |
| order | orderField | int | | |
| active / deleted | | bool | | Activer/Désactiver |

- Champs non modifiables après création : nature, type, lien, famille [OBS : absents du mapper update].
- Suppression : « Suppression impossible — L'attribut est déjà utilisé » ; pas de corbeille. « Activer tout » (`attributes.linkAll`). « Un attribut par défaut avec ce @@Custom_ existe déjà » (`global.errorToaster.customField`).
- Valeurs (`custom_field_value`) : par (objet, attribut) ; multi-valeurs (listes, images) sérialisées avec « ; » ; booléen « true/false » ; date-heure zonée [OBS mapper]. API bulk `/flows|documents/custom-attributes/bulk-update` ; erreur si l'attribut n'appartient pas au même compte (`ATTRIBUTE_NOT_IN_SAME_ACCOUNT`).
- Recherche avancée : attributs « Vrai ou Faux » ciblables comme non paramétrés [OBS RN].

### 6.9 Références (nomenclatures, `reference_rule`) [OBS `referenceTranslateKey.*`, `flowApp.entityChrono.*`, DTO `uce`]

| Champ | API | Type | Obl. | Libellé |
|---|---|---|---|---|
| nature | nature | enum Entité, Flow, Document, Formulaire, Objet | oui, figé | Nature / Entité |
| field | fieldName | enum `REF_EXT=1, REF_INT=2, COMPLEMENT_REF_INT=3, COMPLEMENT_REF_EXT=4` ; libellés par nature (Entité : Référence = refInt, N° de contrat = refExt ; Flow/Formulaire : Référence ; Document/Objet : Référence interne/externe + compléments) | oui, figé | Champ |
| link_type | linkType | enum `Ka` (Défaut, famille parent/enfant, famille de l'entité parente parent/enfant pour Flow/Document) | oui, figé | Type de lien |
| label_family_id | labelFamily | FK | si lien famille | Famille |
| nomenclature | paternChrono | text | oui (seul champ modifiable en édition) | Nomenclature (« Nomenclature non conforme ») |
| counter_type | counterType | enum `global` (« Compteur général à toutes les entités ») / `local` (« Compteur local à chacune des entités ») | | Type de compteur |
| counter_format | counterFormat | int 4–8 (nb de chiffres) | oui | Format de compteur |
| start_value | startValue | int | non | Valeur de départ du compteur |
| active | | bool | | |

Règles : « Impossible de créer une référence déjà existante », « Une référence par défaut de ce champ existe déjà », « Impossible d'activer cette référence alors qu'une autre porte les mêmes caractéristiques ». Valeur générée affichée « Généré(e) automatiquement » dans les formulaires d'objets. Liste : Nature, Champ, Nomenclature, Action (Éditer, Activer, Désactiver, Supprimer).

### 6.10 Dossiers (modèles de dossier de clôture) — `settings/sections` [OBS `folders.*`, `sections.*`]

- **Modèle de dossier** (`closing_folder_template`) : Nom, Description ; contient des **modèles de section** ordonnés.
- **Modèle de section** (`closing_section_template`) : Nom, Description, Type [OBS enum `Document=1 Report=2 Certificate=3 Reference=4 ClientResponse=5 DocumentLargeFile=6 ClosingFolder=7` ; HC : MINUTES, CERTIFICATES, REFERENCES, CLOSING_FOLDER, DOCUMENT, CLIENT_FEEDBACK, LARGE_DOCUMENT], Catégorie Dossier de clôture (pour Document / Retour client / Document volumineux : « Tous les documents liés à cette catégorie seront automatiquement cochés »), option « Intégrer les différents indices disponibles par document » ; type Certificat : chaque certificat des moyens / chaque référence / moyens particuliers.
- Liste arborescente dossier → sections (« N section(s) dans le dossier »), actions Ajouter une section, Éditer, Supprimer (interdit si sections : « Ce modèle de dossier contient… »).

### 6.11 Fichiers : Modèles et Cellules (`files-models`, `files-cells`) [OBS `customFiles.*`, `customCells.*`, enum `MR`, `CR`]

Modèles de fichiers d'import/export (colonnes : Nature, Extension, Nom, Type, Action) composés de **cellules** (Format, Nature, Nom, Champ, Action) mappant une colonne de fichier sur un champ Siteflow (natures Entité/Flow/Formulaire/Attribut). Suppression d'un modèle impossible s'il a des cellules. [Détail hors périmètre principal — à spécifier avec le domaine « fichiers »]

### 6.12 Trames (`trams`, Admin Siteflow) [OBS `trams.*`, chunk BKFC36H2]

| Champ | Type | Obl. | Libellé |
|---|---|---|---|
| link_type | enum `DEFAULT=1, CLIENT=2, FAMILY=3` | oui | Type de lien (Défaut / Client / Famille) |
| client_id / family_id | FK | selon lien | Client / Famille |
| page_type | enum (COVER_PAGE, COVER_PAGE_CLIENT, COVER_PAGE_DSI, COVER_PAGE_LCA, COVER_PAGE_LDA, COVER_PAGE_MULTI_PR, COVER_PAGE_RFI, COVER_PAGE_DIAGRAM, FORM_GENERIC, FORM_GENERIC_H, FORM_MODEL, FORM_MODEL_H, FORM_TEMPLATE, FORM_CONTENT, PAGE_ANNEXE, PAGE_ANNEX_MULTI_PR, PAGE_CONTENT_H, PAGE_CONTENT_V, PAGE_CONTENT_RFI, PAGE_CONTENT_SUIVI, PAGE_CONTENT_SUIVI_DSI, PAGE_CONTENT_SUIVI_MULTI_PR, PAGE_CONTENT_SUIVI_RFI, PAGE_CONTENT_SUIVI_DIAGRAM, PAGE_CONTENT_VERTICAL_MULTI_PR, PAGE_EXPLICATION_DSI, PAGE_H_DSI, PAGE_V_DSI, PAGE_H_LCA, PAGE_H_DIAGRAM, PAGE_SECTION_RFI, PAGE_SOMMAIRE_RFI, PAGE_SUIVI_SIGNATURE_DSI, PAGE_SKILLS) groupés « Défaut document / clôture / formulaire et collaborateur / Spécifique contrôle / liste / diagramme / instruction multiple » | oui | Type de trame |
| pdf | fichier PDF | oui | Trame vierge PDF (aperçu) |
| margin_top/bottom/left/right | number | oui | Marges |
| page_number_x / _y | number | non | Position numéro de page X/Y |
| index_max | int | non | Nombre d'indice précédent |

Règles : « Cette configuration de trame existe déjà » ; « Impossible de modifier le type de trame par défaut » ; « Impossible de supprimer une trame obligatoire avec un lien par défaut ». Liste [OBS enum `oF`] : Lien, Type, Trame, Marges, Pos. X/Y, Date de création, Actions ; filtres Client, Famille, Lien, Type, Défaut.

### 6.13 Suivi — configuration du vocabulaire (`wording_configuration`, Admin Siteflow) [OBS `wordingConfiguration.*`, chunk G32ILFT2]

- **Configuration** : Nom (requis, unique « Une configuration portant le même nom existe déjà »), Description, options « Masquer l'ajout de sous indice (BPA) », « Masquer la validation bis d'un indice (BPE*) », « Masquer l'ajout de retour avec réserve (VSO-SR) », « Rendre cette configuration sélectionnée par défaut à la création d'une nouvelle famille ». Liée aux familles Document (§6.6). Certaines configurations sont en lecture seule (« Cette configuration n'est pas modifiable »).
- **Traduction (par langue)** : langue (unique par configuration) + pour chaque état documentaire une **valeur** (requise), un **tooltip** (requis), une **icône** et couleur d'étiquette. États (clé → valeur par défaut / libellé long) : prel → PREL « Préliminaire » ; bpoAd → BPO « Bon Pour Observation en attente diffusion » ; bpoRc → BPO RC ; bpoModification → « Modification » ; vso → VSO ; vsoSr → VSO-SR ; vao → VAO ; bpe → BPE ; bpeTemp → BPE TEMP ; bpeValid → BPE * ; bpa → BPA ; bpaAd → BPA AD ; bpaRc → BPA RC ; bpaOk → V ; bpaKo → X ; bpaRefused → BPA X ; bpaModification → « Ajout sous indice ». Sections : Par défaut, Validation bis, Sous indice, Retour avec réserve.
- Règles : suppression d'une configuration/traduction liée à des familles signalée ; « Impossible de supprimer l'unique traduction d'une configuration paramétrée par défaut ».

### 6.14 Usage (KPIs, Admin Siteflow) [OBS `settingsKpi.*`, `flowApp.kpi.*`, enum KPI]

- Filtres : Comptes disponibles, Clients, Famille, période (jour/semaine/mois/trimestre/année ; défaut mois courant), export XLS ; export « nombre de signatures par profil (par organisation) ».
- Blocs : **Utilisation globale** (Nouveaux/Total sur la période : entités, flows, phases, étapes, blocs, formulaires, réponses, signatures, utilisateurs, opérateurs, collaborateurs actifs) ; **Licences** (utilisateurs web activés / actifs, opérateurs mobile, opérateurs signataires (enregistrés / non), tablettes utilisateurs / actives, nombre de signataires) ; **Exécution des projets** (Audience utilisateurs/opérateurs actifs, Usage bureau / préparation / terrain, flows sur le terrain par type, réponses de formulaire créées vs envois tablettes).
- Définitions (tooltips) : utilisateur actif = ≥1 connexion dans le mois ; opérateur actif = ≥1 signature (bloc Contrôles, Instructions multiples, question « Collaborateur et signature ») ; tablette active = connectée ≥1 fois dans le mois ; totaux excluant comptes désactivés/supprimés.
- Indicateurs enum : EntityReferential, EntityProject, Flows, FlowReferential, FlowEmm, FlowSpecific, FlowGeneric, FlowGroup, FlowForm, FormLibrary, FormLocal, FormResponseLocal, FormGeneric, FormModel, FormViaTablet, SignatureRealized, FormResponse, UserActive, Users, OperatorActive, Operators, WebUsers(Active), MobileUsers(Active, ActiveUnregistered), DeviceUsers, DeviceActive.

### 6.15 Corbeille (`trash`) [OBS `trash.*`, enum `Entity=1 Flow=2 Category=3 Document=4 List=5 Form=6 ClosingFolder=7 FormResponse=8`]

- « Liste des éléments supprimés les 30 derniers jours » ; colonnes Nature, Nom, Date de suppression, Utilisateur.trice, Action « Restaurer » ; filtres Nature, Utilisateur.
- Erreurs de restauration : élément dont le parent est supprimé ; flow déjà importé dans l'entité / depuis une entité PGAC ; entité PGAC non restaurable ; document dont le type existe déjà ; réponse dont le flow/formulaire est supprimé ; catégorie importée dans un projet.
- → modèle : `deleted_at`, `deleted_by` sur les tables concernées + purge à 30 jours (pg_cron).

### 6.16 Backups MobileApp (Admin Siteflow) [OBS `backup.*`, enum `rR`]

Liste des sauvegardes envoyées par la MobileApp : Rapporteur, Date, Action utilisateur, Télécharger.

### 6.17 Tâches de fond (SFA + GA) [OBS `backgroundTasks.*`]

| Champ | Libellé |
|---|---|
| kind | Tâche : « Génération documentaire » (documentGeneration), legacy |
| type | PDF / XLSX / ZIP |
| name | Nom |
| status | En attente (acknowledged) / En cours / Terminé / Erreur / Nouvelle tentative (toRetry) |
| user_id | Utilisateur |
| created_at, started_at, finished_at | Date de création, début, fin de traitement |
| duration, delay | Durée / Délai de traitement |
| attempts | Tentatives |
| project_id | Projet |
| metadata | Fichier temporaire, Version de document ; section Debug |

Liste + modale « Propriétés de la tâche de fond ». La cloche des événements de la navbar affiche « En cours / Terminé / Erreur » des générations. [OBS RN PR97]

### 6.18 Logs push MobileApp (Admin Siteflow) [OBS `logs-push.*`]

« Liste des erreurs Push MobileApp » : Date/Heure, Type d'erreur, UUID Profil, Actions (détail : Dump, Override) ; filtre par date.

---

## 7. Recherche avancée (composant transverse) [OBS enum chunk BKHSN4IO, `advancedSearch.*`]

- Utilisée sur les listes de flows (champs : Type de flow, Nom, Référence/Chrono, Description, Famille, Catégorie, Statut, Rapporteur, Responsable, Collaborateurs, Tablette 1-3, dates planifiées/prévues/réalisées, modification, surveillants internes/externes 1-3, Site, Tranche, Local, Système élémentaire, Repère fonctionnel, Objet, attributs personnalisés par type, Affectation, Référence dossier) — **pas observée sur la liste des entités** (filtres simples uniquement).
- Opérateurs : `CONTAINS` Contient, `STARTS_WITH` Commence par, `EQUALS` Égal, `NOT_EQUALS` Différent de, `GREATER_THAN_OR_EQUALS` ≥, `LESS_THAN_OR_EQUALS` ≤, `BETWEEN` Compris entre, `NOT_BETWEEN`, `EMPTY` Est vide, `NOT_EMPTY` N'est pas vide, `SEARCH`, `INTERSECT` (= pour multi-valeurs), `NOT_INTERSECT` ; raccourcis date `CurrentDay`, `CurrentWeek`, `CurrentMonth`. Vide/Non vide disponibles pour Responsable, Collaborateurs, Affectation, Tablettes [OBS RN].
- Plusieurs critères (« Ajouter un autre critère »), plusieurs valeurs par critère combinées en « ou » ; sérialisation URL : séparateur de champs `;`, de liste `,`, champ API `~`, préfixe attribut `custom_field`.

---

## 8. Proposition de schéma SQL (Supabase / Postgres)

Principes : multi-tenant `organization_id` + `account_id` ; RLS par appartenance au compte (et partage organisation pour les objets « partagés ») ; `auth.users` ↔ `collaborators.auth_user_id` ; soft delete `deleted_at` pour la corbeille ; `uuid` partout (`gen_random_uuid()`) ; `timestamptz`.

```sql
-- ===== ENUMS =====
create type project_type        as enum ('project','referential','template','pgac','folder');
create type authority           as enum ('simple','normal','advanced','admin','global_admin','siteflow_admin',
                                         'co_contractor_user','co_contractor_operator','co_contractor_device');
create type additional_right    as enum ('generic_form','model_form','manage_diffusion');
create type team_role           as enum ('readonly','operator','writer','expert','responsible');
create type collaborator_kind   as enum ('user','operator');
create type collaborator_status as enum ('active','inactive','onboarding','blocked','deleted');
create type tablet_nature       as enum ('internal','external');
create type tablet_status       as enum ('active','disabled','broken','down','maintenance');
create type auth_mode           as enum ('basic','sso','basic_sso','sso_webapp');
create type ui_language         as enum ('fr','en','de','it');
create type export_language     as enum ('none','fr','en','de','it');
create type label_family_kind   as enum ('family','category');
create type label_family_nature as enum ('project','flow','document','form','risk','equipment','device','team',
                                         'function','legal','skill','contract','technical_object','activity_domain',
                                         'list','hierarchy');
create type relative_nature     as enum ('parent','child');
create type label_provenance    as enum ('default','entity');
create type business_class      as enum ('project','flow','phase','step','document','form','form_response',
                                         'technical_object','multi_pr');
create type status_category     as enum ('todo','in_preparation','in_operation','in_progress','done');
create type link_type           as enum ('default','entity_family_parent','entity_family',
                                         'entity_parent_family_parent','entity_parent_family');
create type custom_field_type   as enum ('text','textarea','label','integer','double','boolean','date','datetime',
                                         'select','multiselect','file','image','metadata','link');
create type reference_field     as enum ('ref_ext','ref_int','complement_ref_int','complement_ref_ext');
create type counter_type        as enum ('global','local');
create type tram_link_type      as enum ('default','client','family');
create type section_type        as enum ('document','report','certificate','reference','client_response',
                                         'large_document','closing_folder');
create type event_source        as enum ('mobile','webapp','api');
create type bg_task_status      as enum ('acknowledged','in_progress','done','error','to_retry');
create type trash_nature        as enum ('entity','flow','category','document','list','form','closing_folder','form_response');
create type number_format       as enum ('fr','en');

-- ===== TENANCY =====
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subdomain text unique,
  auth_mode auth_mode not null default 'basic',
  -- config organisation (§6.3)
  allowed_download_response int, block_form_response_edition bool default false,
  diagram_enabled bool default false, link_expiration_days int check (link_expiration_days between 1 and 90),
  links_form_attributes_enabled bool default false, local_form_allowed bool default false,
  number_format number_format default 'fr', rubric_permissions_enabled bool default false,
  zendesk_enabled bool default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table accounts (                       -- "Applicabilité"
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null, full_name text,
  address_line_1 text, address_line_2 text, postal_code text, city text, country text,
  phone text, fax text, contact_email text, website text, logo_path text,
  -- config modules/documents (§6.2), JSON pour les formats de date
  pgac_enabled bool default false, pgac_subcontractors text[], file_module_enabled bool default false,
  freeze_signature_date bool default false, local_form_creation bool default false,
  auto_lock_form_responses bool default false, hide_multi_pr_titles bool default false,
  default_sequence_type text, default_phase_type text,
  doc_language_1 export_language default 'fr', doc_language_2 export_language default 'none',
  doc_index_type text, doc_watermark text, cover_logo jsonb, date_formats jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (organization_id, name)
);
create table companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  account_id uuid references accounts(id),
  name text not null, activity_area text, comment text, logo_path text,
  is_parent_company bool not null default false,
  updated_at timestamptz default now()
);

-- ===== DICTIONNAIRES =====
create table wording_configurations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null, description text, read_only bool default false, is_default bool default false,
  hide_bpa bool default false, hide_bpe_valid bool default false, hide_vso_sr bool default false,
  unique (organization_id, name)
);
create table wording_configuration_languages (
  id uuid primary key default gen_random_uuid(),
  wording_configuration_id uuid not null references wording_configurations(id) on delete cascade,
  language ui_language not null,
  fields jsonb not null,           -- {prel:{value,tooltip,icon,color}, bpoAd:{...}, ...}
  unique (wording_configuration_id, language)
);
create table label_families (           -- familles + catégories (+ catégories par défaut / locales)
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  account_id uuid references accounts(id),          -- null = partagé organisation (familles)
  project_id uuid,                                   -- catégorie locale d'une entité (FK ajoutée plus bas)
  kind label_family_kind not null,
  nature label_family_nature not null,
  relative_nature relative_nature not null,
  parent_id uuid references label_families(id),
  provenance label_provenance,                       -- catégories : default / entity
  default_source_id uuid references label_families(id), -- catégorie d'entité issue d'une catégorie par défaut
  short_name text not null check (char_length(short_name) >= 3),
  long_name text, code text, color text not null default '#5e5a5a', priority int,
  quality_reference text, logo_path text,
  client_supervision bool default false, client_supervision_sub_index bool default false,
  wording_configuration_id uuid references wording_configurations(id),
  flow_type text,
  active bool not null default true,
  deleted_at timestamptz, deleted_by uuid,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  check ((relative_nature = 'parent') = (parent_id is null))
);
create unique index on label_families (organization_id, coalesce(project_id,'00000000-0000-0000-0000-000000000000'), nature, coalesce(parent_id,'00000000-0000-0000-0000-000000000000'), lower(short_name)) where deleted_at is null;
create unique index on label_families (organization_id, code) where code is not null;

create table custom_statuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  account_id uuid references accounts(id),          -- null si partagé (form, form_response, technical_object)
  nature business_class not null,
  name text not null check (char_length(name) >= 3),
  description text, color text,
  category status_category not null default 'todo',
  link_type link_type not null default 'default',
  label_family_id uuid references label_families(id),
  is_default bool not null default false,
  downloadable bool default false, importable bool default false, exportable bool default false,
  hide_entity bool default false,
  sort_order int, active bool not null default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table custom_fields (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  nature business_class not null check (nature in ('project','flow','phase','step','document','technical_object')),
  type custom_field_type not null,
  name text not null check (char_length(name) >= 3),
  link_type link_type not null default 'default',
  label_family_id uuid references label_families(id),
  choices text[], default_value text, placeholder text, tooltip text, description text,
  required bool default false, read_only bool default false,
  pdf_field_name text, variable_name text, text_display text,
  display_in_flow_card bool default false, display_in_flow_banner bool default false,
  display_on_flow_opening bool default false,
  sort_order int, active bool not null default true, deleted_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index on custom_fields (account_id, variable_name) where variable_name is not null and deleted_at is null;
create table custom_field_values (
  custom_field_id uuid not null references custom_fields(id),
  business_class business_class not null,
  object_id uuid not null,                           -- id de l'entité / flow / phase / step / document / objet
  value_text text, value_json jsonb,                 -- listes/images : jsonb array
  updated_at timestamptz default now(), updated_by uuid,
  primary key (custom_field_id, object_id)
);
create table reference_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  nature business_class not null check (nature in ('project','flow','document','form','technical_object')),
  field reference_field not null,
  link_type link_type not null default 'default',
  label_family_id uuid references label_families(id),
  nomenclature text not null,
  counter_type counter_type not null default 'global',
  counter_format int not null check (counter_format between 4 and 8),
  start_value int default 1,
  active bool not null default true
);
create table reference_counters (                     -- compteur global (project_id null) ou local
  reference_rule_id uuid references reference_rules(id),
  project_id uuid, current_value int not null,
  primary key (reference_rule_id, project_id)
);
create table clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  name text not null, name_2 text, name_3 text,
  address text not null, address_comp text, zip_code text not null, city text not null, country text,
  observation text, reference text, logo_path text,
  cover_page_enabled bool default false, cover_page_pdf_path text,
  page_number_x numeric, page_number_y numeric, index_max int,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table trams (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  link_type tram_link_type not null, client_id uuid references clients(id),
  label_family_id uuid references label_families(id),
  page_type text not null, pdf_path text not null,
  margin_top numeric not null, margin_bottom numeric not null, margin_left numeric not null, margin_right numeric not null,
  page_number_x numeric, page_number_y numeric, index_max int,
  created_at timestamptz default now(),
  unique (account_id, link_type, client_id, label_family_id, page_type)
);
create table closing_folder_templates (id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id), name text not null, description text);
create table closing_section_templates (id uuid primary key default gen_random_uuid(),
  folder_template_id uuid not null references closing_folder_templates(id),
  name text not null, description text, type section_type not null,
  category_id uuid references label_families(id), integrate_all_indexes bool default false,
  certificate_mode text, sort_order int);

-- ===== COLLABORATEURS =====
create table collaborators (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  account_id uuid not null references accounts(id),
  auth_user_id uuid unique references auth.users(id),   -- null pour opérateurs sans login web
  kind collaborator_kind not null,
  first_name text not null check (char_length(first_name) <= 50),
  last_name text not null check (char_length(last_name) <= 50),
  trigram text not null,
  email text check (char_length(email) <= 50),
  sso_identifier text, register_number text,
  authority authority,                                   -- null pour opérateurs
  additional_rights additional_right[] not null default '{}',
  company_id uuid not null references companies(id),
  function_id uuid references label_families(id), group_id uuid references label_families(id),
  legal_id uuid references label_families(id), contract_type_id uuid references label_families(id),
  complement text, profession text, language ui_language default 'fr',
  signature_path text, avatar_path text,
  status collaborator_status not null default 'onboarding',
  privacy_accepted_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz,
  check (kind = 'operator' or email is not null)
);
create unique index on collaborators (organization_id, lower(email)) where email is not null;
create unique index on collaborators (organization_id, sso_identifier) where sso_identifier is not null;
create unique index on collaborators (organization_id, register_number) where register_number is not null;
create table collaborator_default_hierarchies (
  collaborator_id uuid references collaborators(id) on delete cascade,
  hierarchy_id uuid references label_families(id), primary key (collaborator_id, hierarchy_id));
create table collaborator_skills (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references collaborators(id) on delete cascade,
  skill_id uuid not null references label_families(id),          -- famille enfant nature skill
  activity_domain_id uuid references label_families(id),
  started_at date, business_updated_at date, ended_at date,
  expertise smallint check (expertise between 0 and 10),
  description text, comment text, sort_order int, archived bool default false,
  unique (collaborator_id, skill_id),
  check (ended_at is null or started_at is null or ended_at >= started_at),
  check (ended_at is null or business_updated_at is null or ended_at >= business_updated_at),
  check (business_updated_at is null or started_at is null or business_updated_at >= started_at)
);
create table collaborator_skill_files (skill_id uuid references collaborator_skills(id) on delete cascade,
  file_path text not null, name text, primary key (skill_id, file_path));
create table external_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  first_name text not null, last_name text not null, email text not null,
  company_name text not null, profession text not null,
  status collaborator_status not null default 'active',
  converted_to uuid references collaborators(id),
  created_at timestamptz default now());
create table tablets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  name text not null check (char_length(name) between 3 and 255),
  nature tablet_nature not null,
  family_id uuid not null references label_families(id),
  company_id uuid not null references companies(id),
  status tablet_status not null default 'active',
  profile_status collaborator_status not null default 'active',
  comment text, notify_email text not null,
  unique_device_id text, app_version text, android_version text, battery_level int,
  device_model text, screen_size text, mac_address text, last_push_at timestamptz,
  last_latitude double precision, last_longitude double precision, sd_backup bool,
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz,
  unique (account_id, name));
create table authorized_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  designation text not null check (char_length(designation) >= 3),
  device_id text not null check (char_length(device_id) >= 3),
  created_at timestamptz default now(),
  unique (organization_id, device_id));
create table quick_connection_tokens (            -- QR connexion rapide (user ou tablette)
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid references collaborators(id), tablet_id uuid references tablets(id),
  token_hash text not null, linked_device_id text, created_at timestamptz default now(), revoked_at timestamptz);

-- ===== ENTITÉS =====
create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  account_id uuid not null references accounts(id),
  type project_type not null,
  is_sub_folder bool not null default false,
  folder_id uuid references projects(id),
  designation text not null check (char_length(designation) between 3 and 255),
  client_id uuid not null references clients(id),
  family_id uuid not null references label_families(id),
  custom_status_id uuid references custom_statuses(id),
  business_ref text, contract_ref text, location_label text, description text, project_index text,
  is_contractual bool default false,
  internal_command text, external_command text, market_number text, technical_deal text,
  keywords text, business_domain text, national_program text,
  complement_ref_1 text, complement_ref_2 text,
  export_language_1 export_language not null default 'none',
  export_language_2 export_language not null default 'none',
  is_intern_supervised bool default false, supervision_intern_1 text, supervision_intern_2 text, supervision_intern_3 text,
  is_supervised bool default false, supervision_1 text, supervision_2 text, supervision_3 text,
  code_project text, pgac_activities char(1)[], start_date date, end_date date,
  published bool not null default false,
  created_at timestamptz default now(), created_by uuid references collaborators(id),
  updated_at timestamptz default now(), updated_by uuid references collaborators(id),
  deleted_at timestamptz, deleted_by uuid references collaborators(id),
  check (not is_intern_supervised or supervision_intern_1 is not null),
  check (not is_supervised or supervision_1 is not null)
);
alter table label_families add foreign key (project_id) references projects(id);
create table project_status_history (
  id bigint generated always as identity primary key,
  project_id uuid not null references projects(id) on delete cascade,
  from_status_id uuid references custom_statuses(id), to_status_id uuid references custom_statuses(id),
  comment text, source event_source not null default 'webapp',
  actor_id uuid references collaborators(id), created_at timestamptz default now());
create table project_members (
  project_id uuid references projects(id) on delete cascade,
  collaborator_id uuid references collaborators(id),
  role team_role not null, sort_order int, created_at timestamptz default now(),
  primary key (project_id, collaborator_id));
create table project_member_hierarchies (
  project_id uuid, collaborator_id uuid, hierarchy_id uuid references label_families(id),
  primary key (project_id, collaborator_id, hierarchy_id),
  foreign key (project_id, collaborator_id) references project_members on delete cascade);
create table project_tablets (
  project_id uuid references projects(id) on delete cascade,
  tablet_id uuid references tablets(id), primary key (project_id, tablet_id));
create table project_access_history (       -- 5 dernières entités ouvertes
  collaborator_id uuid references collaborators(id), project_id uuid references projects(id),
  flow_filters jsonb, accessed_at timestamptz default now(), primary key (collaborator_id, project_id));

-- ===== TECHNIQUE =====
create table background_tasks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id), project_id uuid references projects(id),
  user_id uuid references collaborators(id),
  kind text not null, file_type text check (file_type in ('pdf','xlsx','zip')), name text,
  status bg_task_status not null default 'acknowledged', attempts int default 0,
  metadata jsonb, error text,
  created_at timestamptz default now(), started_at timestamptz, finished_at timestamptz);
create table mobile_backups (id uuid primary key default gen_random_uuid(), account_id uuid references accounts(id),
  reporter_id uuid, user_action text, file_path text, created_at timestamptz default now());
create table mobile_push_logs (id bigint generated always as identity primary key, account_id uuid,
  profile_id uuid, error_type text, dump jsonb, overridden jsonb, created_at timestamptz default now());
-- Corbeille : vue union des tables avec deleted_at (entity, flow, category, document, list, form, closing_folder, form_response)
-- + job pg_cron de purge à 30 jours.
-- KPIs : vues matérialisées / RPC agrégeant collaborators, projects, flows, signatures par période.
```

RLS (principe) : `current_collaborator()` (via `auth.uid()`) → `account_id`, `organization_id`, `authority`. Lecture d'une entité si même compte, ou `published` et même organisation, ou membre (`project_members`). Écriture via fonctions `can(screen, action, project_id)` reproduisant §3.4 (table `permission_rules(screen, action, rights authority[], roles team_role[], forbidden authority[])` alimentée depuis la matrice §3.5).

---

## 9. Incertitudes

1. **Masquage d'entité** : l'action liste « Masquer » (`projects.table.actions.mask`) et le filtre Visible/Masquée (API `ACTIF/ARCHIVE`) coexistent avec l'option de statut `hideEntity` (état Terminé). Les sources ne disent pas si « masquer » est un flag direct ou toujours dérivé du statut. Proposition : colonne calculée `hidden = status.hide_entity and status.category='done'` + flag legacy `archived`.
2. **Folder vs sous-dossier** : le type `FOLDER` couvre le dossier et ses sous-dossiers (`isSubFolder`). Le lien parent (`folderUuidEntity`) et la règle d'indice des sous-dossiers ne sont pas totalement visibles.
3. **Statuts d'entité partagés ou par compte** : HC ne liste pas « Entité » dans le tableau de partage des statuts ; supposé **par compte** comme les flows.
4. **Familles partagées** : HC dit familles partagées dans l'organisation, mais l'IHM montre une Applicabilité dans la modale famille (`families.dialog.applicability`). Possible partage partiel. `account_id` nullable proposé.
5. **Distinction famille/catégorie** : déduite de `Vi.values(isCategory)` et des routes (`families` vs `categories`) ; l'enum `Qc` (Application/Project…) n'a pas été entièrement résolu.
6. **Syntaxe de la nomenclature** des références (variables, compteur) : validée côté serveur (`patternNotValid`) ; aucune grammaire dans le front.
7. **Colonnes exactes de la trame d'import Excel** des utilisateurs/opérateurs : non présentes dans le bundle (fichier téléchargé du serveur).
8. **Droits complémentaires à la création** : le mapper envoie les 3 droits activés à la création pour les droits éligibles, alors qu'une note de version parle d'un droit complémentaire « désactivé par défaut » (peut-être un 4e droit non encore dans l'IHM).
9. **Seuil de blocage de compte** (nombre de tentatives avant `Blocked`) et durée des tokens (activation, reset, partage) : non observés (sauf liens de partage 1–90 j).
10. **Admin global vs Admin** : périmètre exact (multi-comptes de l'organisation) inféré des règles `rolesWhereUserCanEditApplicability` ; qui peut attribuer le droit « Administrateur global » n'est pas explicite.
11. **Rôle vs droit** : l'algorithme observé fait primer le rôle d'entité sur le droit global quand les deux existent (un Admin avec rôle Invité serait restreint) ; c'est la raison pour laquelle les admins importés reçoivent « Responsable ». À confirmer par test.
12. **Limites d'affichage MobileApp** des attributs (carte, bandeau, ouverture) : nombre maximum non observé dans le front (renvoyé par le serveur).
13. **Société principale** : unicité (par compte ou organisation) et création automatique non observées.
14. **Applicabilité des tablettes et appareils autorisés** : appareils autorisés supposés au niveau organisation ; tablettes au niveau compte.
15. **Recherche avancée sur la liste des entités** : non observée (seulement sur flows) ; la personnalisation des colonnes d'entités, elle, est confirmée (RN 2.15).
16. **Libellés « N° d'affaire » vs « Référence »** : HC appelle `businessRef` « N° d'affaire », l'IHM « Référence ».
17. **Outils « Réparation »** et module d'événements support : non reconstruits (outillage interne Siteflow).
