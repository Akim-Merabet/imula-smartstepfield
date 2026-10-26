# Lexique Qiwi Intervention

Mis à jour le 26/10/2026.

Ce lexique définit les mots employés dans Qiwi Intervention, la WebApp de préparation comme l'app terrain mobile. Les définitions suivent les spécifications du projet (`docs/specs/00` à `05`). Les termes sont regroupés par thème, du plus général (organisation, entités) au plus technique.

Le mot « flow » peut être remplacé dans toute l'interface par « Procédure » ou « Intervention » : c'est un réglage d'organisation (voir « Vocabulaire de l'organisation »). Ce lexique emploie le terme par défaut.

Un terme marqué **[W]** concerne surtout la WebApp, **[M]** surtout l'app terrain ; sans marque, il vaut pour les deux.

## Organisation et entités

| Terme | Définition |
| --- | --- |
| Organisation | L'espace d'un client d'Imula (ex. « demo ») : ses utilisateurs, ses paramètres, ses statuts, ses référentiels. Tout ce qui suit appartient à une organisation. |
| Entreprise | Société rattachée à l'organisation (entreprise utilisatrice, sous-traitant). Elle sert à la connexion mobile (champ « Entreprise ») et au partage. |
| Client | Le client final pour qui les travaux sont faits. Une entité peut être rattachée à un client ; il apparaît sur les cartes de projet et de flow. |
| Collaborateur | Une personne connue de l'organisation : utilisateur nominatif, opérateur ou profil tablette. Il peut être affecté à une entité, à un flow, et signer. |
| Entité | Le conteneur de travail de plus haut niveau. Il existe cinq types d'entité : Projet, Référentiel, Modèle, Projet PGAC et Dossier référentiel. Sur mobile, on les appelle « Projets ». |
| Projet | Entité opérationnelle, celle du terrain : ses flows sont exécutés sur les tablettes. C'est le seul type d'entité qui peut être téléchargé sur mobile. |
| Famille | Étiquette de classement avec un nom court et une couleur (ex. « CTRL — Contrôles »). Elle s'applique aux entités, aux flows et aux formulaires. |
| Vocabulaire de l'organisation [W] | Réglage « Nom donné aux flows dans l'interface » : Flow (défaut), Procédure ou Intervention. Il s'applique à la WebApp, aux documents PDF et à l'app terrain. Avec « Intervention », le type de flow léger s'appelle « Intervention formulaire ». |
| Statut personnalisé | Statut défini par l'organisation pour une entité, un flow, un formulaire ou une réponse (ex. « En préparation », « En cours »). Il porte une couleur et des propriétés, dont « téléchargeable ». |
| Responsable de flow | Collaborateur affecté à un flow. Il voit ce flow dans « Mes flows » sur mobile. |

## Flows

Un flow décrit une intervention étape par étape : une entité contient des flows, un flow des phases, une phase des étapes, une étape des blocs.

```
Entité (projet)              ex. Maintenance site de Lyon
└── Flow                     ex. Remplacement disjoncteur   ◄── Référentiel : flows types importés dans les projets
    └── Phase (P1, P2…)      ex. P2 — Consignation          ◄── Modèle : flows modèles importés comme contenu
        └── Étape (E1, E2…)  ex. E1 — Couper alimentation
            └── Blocs        ex. Équipe, Risques, Formulaires, Contrôles…
```

Seuls les projets s'exécutent sur le terrain ; référentiels et modèles fournissent des flows prêts à importer.

| Terme | Définition |
| --- | --- |
| Flow | La procédure d'une intervention (ex. « Remplacement disjoncteur »). Il est préparé sur la WebApp puis rempli sur le terrain. |
| Type de flow | Fixé à la création, non modifiable. Spécifique (S), Générique (G), Chapeau (C), Intervention (I), Modèle (M), Référentiel (R) et ses variantes. |
| Flow spécifique | Le cœur d'un projet. Il peut appeler des flows génériques à certaines étapes. |
| Flow générique | Flow réutilisable plusieurs fois, dans un ou plusieurs flows spécifiques. |
| Flow chapeau | Regroupe et enchaîne plusieurs flows. Ses étapes portent obligatoirement un bloc Contrôle. |
| Flow intervention | Flow léger pour partir vite sur le terrain avec seulement des formulaires. |
| Phase | Grande partie d'un flow (« Phase 1 — Consignation »). Sur mobile, ce sont les pastilles P1, P2… en haut de l'écran. |
| Étape | Subdivision d'une phase (« Étape 1 — Couper alimentation »), notée E1, E2… sur mobile. Elle contient les blocs à consulter ou remplir. |
| Étape désactivée | Étape marquée « non nécessaire » pour ce flow. Elle reste visible mais en lecture seule, avec une pastille grise. |
| Lecture seule sur mobile | Réglage d'une phase ou d'une étape : consultable sur l'app terrain mais pas modifiable, sans pastille. |
| Validation d'étape [M] | Bouton « Valider et passer à l'étape suivante ». Il vérifie les éléments obligatoires (signatures, formulaires…) puis passe l'étape au vert. |
| Pastille [M] | Point de couleur qui résume l'avancement : gris = pas encore ouverte, bleu = ouverte sans rien de fait, orange = en cours, vert = validée. Une phase prend la couleur commune de ses étapes, orange si elles diffèrent. |
| Séquencement | L'ordre imposé pour réaliser le flow. Le flow est découpé en séquences ; une séquence ou une phase est soit linéaire (dans l'ordre), soit parallèle (dans n'importe quel ordre). |
| Étape verrouillée [M] | Étape bloquée par le séquencement tant que les étapes précédentes ne sont pas validées (icône cadenas). |
| Déverrouiller le flow [M] | Action du chef de chantier, signée, commentée et irréversible. Elle lève le séquencement : toutes les étapes deviennent saisissables. |

## Blocs

Un bloc est l'unité de contenu d'une étape. Son type détermine ce qu'il affiche et ce qu'on peut y faire sur le terrain.

| Terme | Définition |
| --- | --- |
| Bloc | Élément de contenu d'une étape (Équipe, Moyens, Risques…). Il suit un circuit de validation interne avant d'être utilisé. |
| Circuit de validation interne [W] | Les états successifs d'un bloc : rédaction, vérification, approbation, validé. Une même personne ne peut pas être rédacteur et vérificateur d'un même bloc. Tant qu'il n'est pas terminé, le mobile affiche « Ce bloc n'a pas été validé en interne ». |
| Équipe (RHP) | Les profils de personnes nécessaires et leur nombre (ex. « Technicien × 2 »). |
| Moyens (EMM) | Le matériel et les consommables nécessaires (ex. « Multimètre MM-15, 2 pièces »). |
| Risques (ADR) | Les risques de l'étape avec leur niveau (ex. « Électrocution — Risque majeur »). |
| Instructions (PR) | Le mode opératoire en texte mis en forme : paragraphes, encadrés, images, liens. |
| Texte (TXT) | Un texte libre, par exemple une consigne propre au client. |
| Instructions multiples (MULTI_PR) | Une liste d'instructions numérotées, à traiter une par une sur le terrain : statut à choisir, observation, signature. Un changement de statut ou une signature peut s'appliquer à plusieurs instructions d'un coup. |
| Formulaires (FORM) | Les formulaires à remplir à cette étape. Chaque lien peut être obligatoire ou limité à une seule réponse. |
| Contrôles (DSI) | Le bloc des signatures attendues (ex. « Réalisation », « Contrôle technique »), chacune avec son rôle et son caractère obligatoire. |
| Objets (OBJECT) | Les objets techniques concernés (équipements, attributs). Pas encore disponible sur l'app terrain. |
| Document de flow [W] | PDF généré à partir des blocs d'un même type (document Instructions, Contrôles, Moyens…). Il a son propre circuit de diffusion (PREL, BPE…). |

## Formulaires et réponses

| Terme | Définition |
| --- | --- |
| Formulaire | Un questionnaire à remplir (ex. « E2E Contrôle chantier »), avec une référence et un indice (« FRM-E2E · A »). Il est défini dans une entité ou dans la bibliothèque. |
| Version de formulaire | Photographie figée de la structure d'un formulaire, publiée quand il change. Une réponse reste attachée à la version avec laquelle elle a été créée. |
| Rubrique | Section d'un formulaire (« Rubrique 1 »), affichée en onglet sur mobile. |
| Tableau | Rubrique en grille : des questions en colonnes et des lignes. On peut parfois ajouter des lignes ou des colonnes sur le terrain. |
| Question | Un élément à renseigner, d'un type donné : réponse courte ou longue, choix unique ou multiple, liste, date, durée, valeur avec unité, photo, collaborateur, localisation, formule, fichier, texte riche. |
| Option (cellule) | La case de saisie d'une question. Une question simple en a une ; une question à choix ou en tableau en a plusieurs. |
| Réponse | Un remplissage d'un formulaire, avec sa propre référence (ex. « FRM-E2E - A - P2 - E1 - 26/10/2026 R2 »). Elle est « en cours » puis « terminée ». |
| Réponse unique | Réglage d'un lien de formulaire : une seule réponse autorisée, que l'on reprend au lieu d'en créer une nouvelle. |
| Formule | Question calculée automatiquement à partir d'autres réponses (ex. « Longueur doublée = 24 m »). |
| Pré-remplissage | Valeur proposée d'office à l'ouverture : date du jour, position GPS, valeur fixe… |
| Validation de données | Contrôle d'une valeur (bornes, format). Une valeur non conforme peut déclencher la proposition de déclarer une non-conformité. |
| Redirection | Saut automatique vers une autre rubrique ou question selon la réponse donnée. |
| Valeur verrouillée | Question « verrouillable » : une fois enregistrée, la modifier exige une signature de changement. |
| Remplissage en masse [M] | Appliquer une même valeur à toutes les cellules d'une colonne de tableau. |
| Éditeur d'image [M] | Outil d'annotation d'une photo (crayon, gomme, ligne, flèche, rectangle, ellipse, texte). La photo annotée remplace l'originale. |

## Référentiels, modèles et bibliothèque

Un référentiel est le catalogue des procédures de référence d'une organisation : on y écrit une fois les flows types, puis on les importe dans les projets au lieu de les réécrire.

| Terme | Définition |
| --- | --- |
| Référentiel | Type d'entité qui sert de bibliothèque de flows réutilisables (flows de type Référentiel, Référentiel générique, chapeau ou intervention). Il ne s'exécute pas sur le terrain : aucune tablette n'y est affectée. |
| Flow référentiel | Flow écrit dans un référentiel : l'équivalent d'un flow spécifique, mais comme procédure de référence. |
| Import d'un référentiel [W] | Copie d'un flow référentiel dans un projet. Le flow obtenu garde un lien fort avec sa source et son indice (« Indice source ») : il peut être mis à jour depuis la source tant qu'il n'est pas déverrouillé. |
| Import en contenu [W] | Ajout du contenu d'un référentiel dans un flow existant. Les blocs Contrôle et Formulaire ne sont pas repris. |
| Dossier référentiel [W] | Référentiel converti en dossier de sous-dossiers indicés. « Préparer » un sous-dossier crée un projet à partir de ses flows. |
| Modèle | Type d'entité qui contient des flows modèles (type M), importables comme contenu dans d'autres flows. Comme le référentiel, il ne s'exécute pas sur le terrain. |
| Onglet « Référentiels et Modèles » [M] | Second onglet de l'écran Projets. Il permet de consulter, en lecture seule et en ligne uniquement, le rendu terrain des flows des référentiels et modèles. |
| Bibliothèque de formulaires [W] | L'endroit où les formulaires sont créés en premier, au niveau de l'organisation, avant d'être importés dans les entités. |
| Formulaire modèle | Formulaire de bibliothèque destiné à être lié à un bloc Formulaires d'une étape. |
| Formulaire générique | Formulaire de bibliothèque auquel on peut répondre directement au niveau du projet (ex. déclaration d'aléa ou de non-conformité). Il peut aussi être lié à un bloc. |
| Formulaire de projet | Copie d'un formulaire de bibliothèque importée dans une entité (liée à sa source), ou copie locale indépendante. |
| Lignée | Identifiant commun à un élément et à toutes ses copies (formulaire, rubrique, question). Il permet de rapprocher les réponses d'une version à l'autre. |

## Signatures et aléas

| Terme | Définition |
| --- | --- |
| Signature de bloc | Signature attendue dans un bloc Contrôles (ex. « Réalisation »). Elle est signée par un collaborateur interne ou une personne externe, avec date, commentaire et dessin de signature. |
| Signature en attente | Signature préparée mais pas encore complétée. Elle compte dans l'avancement de l'étape. |
| Tableau des signatures [M] | Vue de toutes les signatures d'un flow, accessible par « Aller au tableau des signatures ». |
| Signataire de formulaire | Personne qui signe dans une question de type Collaborateur (ex. le « Technicien »). Un signataire peut aussi seulement être identifié, sans signer. |
| Signature de changement | Signature exigée pour modifier une valeur verrouillée d'un formulaire. |
| Authentification forte (QR) | Signature validée en scannant le QR Code ID personnel du collaborateur, au lieu de le choisir dans une liste. |
| Aléa | Événement imprévu sur le terrain. « Déclarer un aléa », depuis le bloc Formulaires, permet d'ajouter un formulaire (remontée terrain, non-conformité) ou de déverrouiller le flow. |
| Non-conformité | Valeur hors des limites attendues. L'app propose alors de créer une réponse de formulaire générique pour la déclarer. |
| Remontée terrain | Information envoyée du terrain vers la préparation (problème, retour d'expérience) au moyen d'un formulaire ajouté. |

## App terrain et hors ligne

| Terme | Définition |
| --- | --- |
| Profil [M] | Un compte connecté sur l'appareil. Plusieurs profils peuvent coexister, chacun avec sa propre base locale chiffrée. |
| Profil tablette | Compte de connexion d'une tablette partagée (nature « appareil »), par opposition au profil utilisateur nominatif. |
| Tablette | Appareil déclaré dans l'organisation. Un flow peut désigner jusqu'à trois tablettes (Tablette 1, 2, 3). |
| Connexion par QR [M] | Connexion sans saisie : on scanne un QR de connexion rapide généré sur la WebApp pour un collaborateur. |
| QR d'un flow | QR imprimable généré sur la WebApp. Scanné depuis l'écran Projets, il ouvre directement le flow, en ligne comme hors ligne, s'il est téléchargé. |
| Statut téléchargeable | Propriété d'un statut de flow (« En opération »). Seul un flow à un statut téléchargeable peut être ouvert et téléchargé sur mobile ; sinon il apparaît grisé avec un cadenas. |
| Téléchargement (checkout) [M] | Copie d'un flow, de son entité et de ses formulaires sur l'appareil pour travailler hors ligne. Le projet affiche alors « Téléchargé ». Un flow qui n'est plus téléchargeable disparaît de l'appareil. |
| Envoi (push) [M] | Transmission au serveur des modifications faites sur l'appareil. Elle se fait automatiquement dès que l'app est en ligne. |
| Mode en ligne / hors ligne [M] | Choix explicite de l'utilisateur (bouton « En ligne »), pas une simple détection du réseau. Hors ligne, tout est enregistré localement puis envoyé au retour en ligne. |
| Mode lecture [M] | Ouverture d'un flow sans pouvoir le modifier. |
| Accès rapide [M] | Onglet qui liste les derniers flows ouverts pour les reprendre. |
| Sauvegarde [M] | Copie chiffrée des données locales (envoyées ou non), faite régulièrement ou à la demande, conservée sur l'appareil ou envoyée au support. |
| Importer les données (restauration) [M] | Rechargement d'une sauvegarde sur l'appareil pour récupérer des saisies non envoyées. |
| Journal (Logs push) | Historique des actions faites sur l'appareil (connexion, téléchargement, scan, envoi…), consultable sur la WebApp pour le support. |

## Termes techniques

| Terme | Définition |
| --- | --- |
| Supabase | La plateforme serveur du projet : base de données PostgreSQL, authentification, stockage des fichiers (photos, signatures, PDF) et fonctions serveur. |
| RLS (Row Level Security) | Règles de la base qui limitent chaque utilisateur aux lignes qu'il a le droit de voir ou de modifier. |
| Edge Function | Petite fonction exécutée côté serveur (ex. connexion mobile, connexion par QR, restauration de sauvegarde). |
| RPC | Fonction de la base appelée par l'app pour une opération contrôlée (ex. enregistrer les valeurs d'une rubrique). |
| PowerSync | Le service de synchronisation entre la base du serveur et la base locale de l'appareil (SQLite). Il permet le travail hors ligne. |
| Sync Stream | Une règle PowerSync qui décrit quelles données envoyer à l'appareil (ex. le contenu d'un flow téléchargé), en revérifiant les droits. |
| Bucket | Paquet de données synchronisé pour un appareil, produit par un Sync Stream. |
| Expo / React Native | Les outils avec lesquels l'app terrain Android est construite. |
| APK | Le fichier d'installation de l'app Android. L'APK « debug » charge le code depuis le PC du développeur (Metro) ; l'APK « release » embarque tout et fonctionne seul. |
| Metro | Le serveur de développement qui envoie le code de l'app à un APK debug et le recharge à chaud à chaque modification. |
