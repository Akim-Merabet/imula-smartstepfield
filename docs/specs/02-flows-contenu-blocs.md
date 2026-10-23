# Spec fonctionnelle 02 — Flows, contenu (phases / étapes / blocs) et signatures

> Reconstruction fonctionnelle de Siteflow (WebApp Angular, build FE 2.23.6) vers Next.js + shadcn + Supabase.
> Ce document décrit des **comportements, champs, enums et règles**. Il ne reprend pas de code Siteflow.

## 0. Conventions

- **OBSERVÉ** : constaté dans une source. Je cite la clé i18n (`flows.modals.addFlow.chrono`), l'enum extrait (`enums-numeric: Pr=1 …`), le nom de champ d'un payload API repéré dans le bundle (`payload: refUuideActor1`) ou une note de version (`RN97`, `R2.18`…).
- **INFÉRÉ** : déduit par recoupement. À valider (voir §9 Incertitudes).
- Noms techniques proposés : `snake_case`, en anglais, alignés sur les noms API quand ils existent.
- « Entité » = conteneur projet. Types : Project=1, Referential=2, Template=3, Pgac=4, Folder=5 (`enums-numeric`). Dans la doc API : CORE / STANDARD / TEMPLATE. Le domaine Entités est spécifié ailleurs ; ici on n'en garde que les FK.
- Sources principales : `i18n-fr.json` (namespaces `flows.*`, `flowApp.*`, `blocks.*`, `flowContentNavigation.*`, `phases.*`, `steps.*`, `sequences.*`, `flowSignature.*`, `diagram.*`, `planTranslate.*`, `referentialFlows.*`, `status.*`, `schedule.*`, `advancedSearch.*`), `enums-numeric.txt`, `enums-string.txt`, les enums API (chaînes) du chunk partagé `chunk-HCYDDSAJ.js`, et les notes de version du helpcenter.

### Légende des notes de version citées
| Code | Article |
|---|---|
| RN92 | Product Release 92 (sept. 2024) |
| RN97 | Product Release 97 (fév. 2025) |
| RN101 | Product Release 101 (mai/juin 2025) |
| RN105 | Product Release 105 (oct. 2025) |
| RN110 | Product Release 110 (déc. 2025) |
| R2.x | Notes 2025/2026 WebApp & MobileApp (R2.1 → R2.23) |
| API25 | API V2 – Note de mise à jour 2025 |
| SBO | « Structural and business objects » (modèle fonctionnel API V2) |

---

## 1. Modèle d'ensemble

```
Entité (project)
 ├── Flow (type, statut custom, affectation, planning, localisation…)
 │    ├── Séquence* (linéaire|parallèle)  ──regroupe──> Phases
 │    ├── Phase (ordre, n° perso, linéaire|parallèle, optionnelle, désactivable)
 │    │    └── Étape (ordre, n° perso, blocs activés, flow lié, redirections, validation)
 │    │         └── Bloc (1 par type activé et par étape ; état Rédaction→…→Validé)
 │    │              └── Éléments du bloc (lignes EMM/ADR/RHP/FORM/OBJ, sous-instructions MultiPR,
 │    │                  config + signatures DSI, contenu riche PR/TXT, documents liés)
 │    ├── Géométrie(s) (carte)
 │    ├── Rappels (scheduling) → tâches
 │    ├── Révisions
 │    └── Historique (événements de contenu + changements de statut)
 ├── Diagrammes (GoJS) → cartes flow/phase/étape
 └── Plans (Gantt) → éléments de plan, dépendances, jalons
```

OBSERVÉ (SBO) : « A flow breaks down into phases, themselves composed of steps. The step is described by operational instruction/data captured in specialised functional blocks: instructions, equipment, risks, checks, forms, text, team, multi instructions. »

---

## 2. Flow

### 2.1 Types de flow

OBSERVÉ : enum numérique FE `Generic=1 Referential=2 Template=3 Specific=4 Group=5 FlowForm=6 GroupReferential=7 LocalReferential=8 ReferentialGeneric=9 ReferentialForm=10`. Enum API `TypeFlowEnum = GENERIC, REFERENTIAL, TEMPLATE, SPECIFIC, GROUP, LIST_EMM, LIST_ADR, FLOW_FORM, GROUP_REFERENTIAL, LOCAL_REFERENTIAL, REFERENTIAL_GENERIC, REFERENTIAL_INTERVENTION`.

| FE | Valeur API | Lettre (`flows.letter.*`) | Libellé (`flows.types.*`) | Rôle (tooltip) |
|---|---|---|---|---|
| 4 Specific | SPECIFIC | S | Spécifique | « coeur d'un projet, il permet aussi d'associer un ou plusieurs flows génériques à différentes étapes » (`flowApp.dashboardTab.flows.flowcheckboxSpecificToolTip`) |
| 1 Generic | GENERIC | G | Générique | « potentiellement réutilisé plusieurs fois dans un ou plusieurs flows spécifiques » |
| 5 Group | GROUP | C | Chapeau | « permet de lier différents flows pour les regrouper et extraire l'enchainement des interventions » |
| 6 FlowForm | FLOW_FORM | I | Intervention | « permet de partir rapidement sur le terrain avec simplement des formulaires » |
| 3 Template | TEMPLATE | M | Modèle | flow d'une entité Modèle, importable comme contenu |
| 2 Referential | REFERENTIAL | R | Référentiel | flow d'une entité Référentiel (= spécifique côté référentiel) |
| 9 ReferentialGeneric | REFERENTIAL_GENERIC | – | Référentiel Générique | |
| 7 GroupReferential | GROUP_REFERENTIAL | – | Référentiel Chapeau | |
| 10 ReferentialForm | REFERENTIAL_INTERVENTION | – | Référentiel Intervention | |
| 8 LocalReferential | LOCAL_REFERENTIAL | – | Référentiel local | INFÉRÉ : copie locale d'un référentiel |
| – | LIST_EMM / LIST_ADR | – | (listes de moyens/risques) | INFÉRÉ : technique, réservé au module Listes, à exclure des flows métier |
| – | (PGAC) | – | PGAC (`flows.types.pgac`) | flows d'entités PGAC (métier EDF, hors périmètre MVP) |

Correspondance avec la doc API (SBO), INFÉRÉ : CORE ≈ Specific/Referential/Template, HEAD ≈ Group, GENERIC ≈ Generic, FORM ≈ FlowForm. SBO précise : « template projects can only host core flows ».

Règles :
- R-TYPE-1 (OBSERVÉ `flowApp.dashboardTab.flows.typeFlow` « Type de flow * ») : le type est obligatoire à la création et n'est **pas modifiable** ensuite (INFÉRÉ : il n'apparaît qu'en lecture dans `flows.modals.addFlow.editFlow` « Edition du flow {{ flowType }} {{ flowName }} »).
- R-TYPE-2 : types proposés à la création selon le type d'entité (INFÉRÉ) : Projet → Spécifique, Générique, Chapeau, Intervention ; Référentiel → Référentiel, Référentiel générique, Référentiel chapeau, Référentiel intervention ; Modèle → Modèle uniquement.
- R-TYPE-3 (OBSERVÉ `flowContentNavigation.dialog.editStep.toaster.errorUncheck`) : « Impossible de désactiver le bloc contrôle sur un flow chapeau ». Le bloc DSI est donc imposé sur les étapes d'un chapeau.
- R-TYPE-4 (OBSERVÉ `diagram.actions.add.flows.subtitle`) : « Les flows chapeau ne peuvent pas être utilisés dans la vue diagramme. »
- R-TYPE-5 (OBSERVÉ `flowApp.dashboardTab.flows.HelpTextImportReferentiel`) : quand on importe un référentiel en contenu, les blocs Contrôle et Formulaire ne sont pas repris.

### 2.2 Origine et filiation

OBSERVÉ (SBO) :
- **Base flow** : créé localement, `origin = LOCAL`.
- **Standard flow** : importé d'une entité référentiel (standard) dans une entité projet. `origin = DERIVED_FROM_STANDARD` (enum API `TypeEnum = LOCAL, DERIVED_FROM_STANDARD`). `sourcedFromFlow` est un **lien fort** : mise à jour depuis la source possible tant que le flow n'est pas déverrouillé.
- **Imported content flow** : résulte de l'**exécution** d'un standard flow, ou a reçu du contenu importé. `origin = LOCAL`, `executedFromFlow` (lien léger), `contentImportedFromFlows[]` (liens légers).

OBSERVÉ (payload) : `importedFlowUuidEntity` (`sourceFlowRef`), `hasFlowSource`, `unlocked`. Propriétés source : `flowContentNavigation.dialog.flowReferential.*` (« Type de Flow », « Flow », « Entité source », « Indice source »), `flows.modals.propertiesModal.entitySource` et `entityIndex`.

| Champ | Type | Description |
|---|---|---|
| `origin` | enum `flow_origin` (LOCAL, DERIVED_FROM_STANDARD) | |
| `sourced_from_flow_id` | uuid FK flows, null | lien fort vers le référentiel importé |
| `sourced_from_index` | text | indice de la source au moment de l'import (« Indice source ») |
| `executed_from_flow_id` | uuid FK flows, null | lien léger (exécution) |
| `content_imported_from` | table de liaison `flow_content_imports` | liens légers, avec date et position (après quelle phase) |
| `unlocked` | bool, défaut false | « Ce flow a été déverrouillé » (`flows.tooltip.unlocked`), icône cadenas (Concordance API-IHM) |

### 2.3 Champs du flow

Mappeur API observé : `name, description, version, labelFamilyApplication (famille), labelFamilyProject (catégorie), typeFlow, customStatusFlow, startDate, finishDate, createDate, modificationDate, modificationStatus, reporter, assignees[], actor1..3, flowBarColor, supervision1..3, supervisionIntern1..3, refInt, refExt, locationSite, locationArea, locationLocal, functionalMarker, elementarySystem, technicalObject, technicalOffer, locationActivated, sourceFlowRef, unlocked, tags[], estimatedStartDate, estimatedEndDate, achievedStartDate, achievedEndDate, internalSupervisorName1..3, externalSupervisorName1..3, canEditSupervision, hasFlowSource, simplifiedSignatureMode` (et des champs PGAC : `zc, earthquakeRisk, earthquakeADR, earthquakeParade`).

| Nom technique | Type | Oblig. | Valeurs / règles | Libellé FR (clé) | Statut |
|---|---|---|---|---|---|
| `id` | uuid | oui | | Uuid (`flows.uuid`) | OBSERVÉ |
| `project_id` | uuid FK | oui | entité conteneur | Projet | OBSERVÉ |
| `flow_type` | enum `flow_type` | oui | §2.1 | Type de flow * | OBSERVÉ |
| `name` | text | oui | 3 à 255 car., pas d'espace en début/fin (règle observée sur l'étape, INFÉRÉE pour le flow) ; `flows.validators.field.length.*` | Nom * — placeholder « Désignation du flow dans l'application » | OBSERVÉ |
| `description` | text | non | « Description du flow uniquement visible en interne de l'entreprise » | Description | OBSERVÉ |
| `ref_int` | text | non | **N° chrono** : saisi ou « Généré(e) automatiquement » via la nomenclature (`flows.entityChrono.generated`) | Référence (`flows.modals.addFlow.chrono`) / « N° Chrono » (Concordance) | OBSERVÉ |
| `ref_ext` | text | non | | Référence externe (`flows.modals.propertiesModal.refExtern`) | OBSERVÉ |
| `family_id` | uuid FK label_families (nature FLOW) | non | famille de nature Flow (paramètres) | Famille | OBSERVÉ |
| `category_id` | uuid FK project_categories | non | catégorie locale de l'entité ; pour ajouter : module catégories (`flows.linkedFields.category`) | Catégorie | OBSERVÉ |
| `secondary_category_ids` | via table | non | filtre « Catégories secondaires » (`flowApp.dashboardTab.flows.filter.secondaryCategories`) | | INFÉRÉ (multi-catégories) |
| `custom_status_id` | uuid FK custom_statuses (nature FLOW) | oui (défaut) | « Si aucun statut n'est sélectionné alors le statut déclaré par “défaut” sera affecté » | Statut / Statut personnalisé | OBSERVÉ |
| `status_change_comment` | text (transitoire) | non | stocké dans l'historique de statut (`submitterComment`) | Commentaire changement statut | OBSERVÉ |
| `tags` | via `flow_tags` | non | étiquettes de la bibliothèque (arborescence) | Etiquette | OBSERVÉ |
| `location_activated` | bool | non | interrupteur « Localisation » | Localisation (`flowApp.dashboardTab.flows.locationActivated`) | OBSERVÉ |
| `location_site` | text | non | | Site | OBSERVÉ |
| `location_area` | text | non | | Tranche | OBSERVÉ |
| `location_local` | text | non | | Local | OBSERVÉ |
| `elementary_system` | text | non | | Système élémentaire | OBSERVÉ |
| `functional_marker` | text | non | | Repère fonctionnel | OBSERVÉ |
| `technical_object_id` | uuid FK technical_objects / text | non | « Objet » ; le payload envoie un texte `technicalObject` (et `technicalObjectUuidEntity` dans un autre contexte) | Objet / Objet technique | OBSERVÉ (type à trancher) |
| `technical_offer` | text | non | | — | OBSERVÉ (payload), libellé inconnu |
| `reporter_team_role_id` | uuid FK team_roles | non | 1 seul | Rapporteur | OBSERVÉ |
| `assignees` | via `flow_assignees` | non | **plusieurs responsables** (R2.1) | Responsable(s) | OBSERVÉ |
| `tablet_1_id`, `tablet_2_id`, `tablet_3_id` | uuid FK team_roles (profil tablette) | non | | Tablette 1/2/3 | OBSERVÉ |
| `collaborators` | via `flow_collaborators` | non | collaborateurs restreints + hiérarchie | Collaborateur.trice(s) | OBSERVÉ |
| `start_date` / `finish_date` | timestamptz | non | **planifiées** | Début planifié / Fin planifiée | OBSERVÉ |
| `estimated_start_date` / `estimated_end_date` | timestamptz | non | **prévues** | Début prévue / Fin prévue | OBSERVÉ |
| `achieved_start_date` / `achieved_end_date` | timestamptz | non | **réalisées** | Début réalisée / Fin réalisée | OBSERVÉ |
| `bar_color` | text (#hex) | non | couleur de barre (plan/Gantt), défaut couleur système | — | OBSERVÉ (payload `flowBarColor`) |
| `supervision_extern_1..3` | bool | non | surveillants externes applicables (cases) | Surveillant(s) externe(s) applicable(s) | OBSERVÉ |
| `supervision_intern_1..3` | bool | non | surveillants internes applicables | Surveillant(s) interne(s) applicable(s) | OBSERVÉ |
| `external_supervisor_name_1..3` | text | non | nom du surveillant, colonne « Surveillant externe n » | | OBSERVÉ |
| `internal_supervisor_name_1..3` | text | non | | Surveillant interne n | OBSERVÉ |
| `simplified_signature_mode` | bool | non | « Passer le bloc Contrôle en mode simplifié » (onglet Options). Impossible à activer si une signature existe déjà | `global.modals.addFlow.signatureMode` | OBSERVÉ |
| `qr_code_file_id` | uuid null | non | QR code imprimable généré à la demande (action 14) | « Générer le QR Code imprimable » | OBSERVÉ (RN92) |
| `modification_status` | enum (ENABLED, WARNING, DISABLED) | calculé | calculé d'après l'état des documents liés (§2.6) | | OBSERVÉ (enum) / INFÉRÉ (calcul) |
| `version` | int | auto | | Version | OBSERVÉ |
| `origin`, `sourced_from_*`, `unlocked`… | §2.2 | | | | |
| `created_at`, `created_by`, `updated_at`, `updated_by` | | auto | « Dernière modification: {{date}} par … ». La date de modification tient compte des changements **dans** le contenu (RN97) | | OBSERVÉ |
| `deleted_at`, `deleted_by` | | | corbeille 30 jours (§2.9) | | OBSERVÉ |
| attributs personnalisés | via `custom_attribute_values` (nature FLOW) | selon config | onglet « Attribut(s) ». Types : Text, TextArea, Integer, Double, Boolean, Date, DateTime, Select, MultiSelect, Link, File, Image (≤ 6 images, R2.17), Metadata, Label (titre) | `flows.modals.addFlow.customAttr` | OBSERVÉ |

Champs **PGAC** (`flows.modals.PgacDetails.*`, valeurs exportables Calo/Echaf/MDS/Ouvrage/Rambarde…) : métier EDF spécifique. INFÉRÉ : hors périmètre MVP ; si on les garde, les mettre dans une table `flow_pgac_details` en JSONB.

Champs « Réglementation » observés (`flowApp.dashboardTab.flows.regulation`, `generalCode` RCCM, `secondaryCode` CODAP, `thirdCode` CODETI, `categoryCode`, `qualityRanking`, `eipsRanking`, `espn`, `aip`, `materialProperty`, enum `RegulationCodeEnum = RCCM, CODAP, CODETI`). INFÉRÉ : ancien onglet (legacy), absent du mappeur flow actuel. À ne pas reprendre en V1.

### 2.4 Statut personnalisé et états

OBSERVÉ (RN97) : « Nouvelle notion d'états de flows, au-dessus des statuts ». Chaque statut personnalisé (paramètres, nature Flow) appartient à une **catégorie d'état** :

| FE | API `CustomStatusCategoryEnum` | Libellé | Effet |
|---|---|---|---|
| ToDo | TO_DO | À faire | (utilisé surtout pour les tâches et entités) |
| InPreparation | IN_PREPARATION | En préparation | remplace l'option « Visible depuis les fenêtres d'importation » : un flow référentiel *En préparation* est **importable** dans un projet (`global.modals.addFlow.defaultFlowCustomStatusInfo`) |
| InOperation | IN_OPERATION | En opération | remplace l'option « Visible depuis la MobileApp » : seuls les flows *En opération* sont utilisables sur la MobileApp |
| InProgress | IN_PROGRESS | En cours | |
| Done | DONE | Terminé | option « Masquer le flow pour ce statut à un état terminé » (`status.dialog.options.hideFlow`) |

Règles :
- R-STAT-1 : un statut est marqué « par défaut à la création » (`status.dialog.options.defaultCustomStatus`). Un statut par défaut ne peut être ni désactivé ni supprimé (`status.toaster.declaredAsDefault`, `status.alert.declaredAsDefault`).
- R-STAT-2 : un statut peut être spécifique à une famille parent/enfant (« Type de lien », `ChoixLinkTypeEnum = DEFAULT, ENTITY_LABEL_FAMILY, ENTITY_LABEL_FAMILY_PARENT, …`). Dans le sélecteur, on ne propose que les statuts compatibles avec la famille du flow (INFÉRÉ).
- R-STAT-3 : chaque changement de statut crée une ligne d'historique : ancien statut, nouveau statut, commentaire, utilisateur ou tablette, date et source WebApp/MobileApp/API (API25 `/flows/{id}/history-status-changes` ; `flows.modals.HistoryModal.*` ; `EventSourceEnum = WebApp, MobileApp, API_EXT`).
- R-STAT-4 : changement rapide depuis la liste par un popover « Changement de statut » (Statut + Commentaire), `flows.customStatusPopover.*`.

**Statuts système hérités** (`flows.flowStatus.*`, `flowApp.dashboardTab.flows.status.*`) : Vide, En préparation, Rédaction, Vérification, Approbation, À faire, En cours, En attente, Terminé, Fermé, Annulé, À disposition, Aucun. Exemples de textes d'aide : « Le flow est terminé, toutes les signatures sont renseignées », « Le flow est en cours de signature sur le terrain ». INFÉRÉ : ancien statut calculé, remplacé par les statuts personnalisés. On ne le stocke pas ; on pourra le recalculer pour un badge d'avancement.

### 2.5 États calculés d'avancement (phase/étape)

OBSERVÉ : enum `PhaseStatusEnum = TO_DO, IN_PROGRESS, DONE, DISABLED` (FE `ToDo=1 InProgress=2 Done=3 Disabled=4`), libellés `flowContentNavigation.status.*` (À faire, En cours, Terminé, Désactivé). Ces états sont calculés et renvoyés en `embedded.statuses` pour la phase et ses étapes. Voir §4.7.

### 2.6 Verrouillage et statut de modification

- **Référentiel importé (verrouillé)** : un flow DERIVED_FROM_STANDARD reste synchronisé avec sa source. Actions disponibles : « Mettre à jour » (RefreshRefProject=8) et « Mettre à jour tous les référentiels déjà importés ». OBSERVÉ `flows.alerts.refreshFlows.subtitle` : « Toutes les modifications effectuées sur des flows “débloqués” seront perdues. »
- **Débloquer** (Unlock=9, endpoint `flows/{id}/unlock`) : OBSERVÉ `referentialFlows.alerts.unlock.subtitle` « Plus aucune mise à jour ne sera possible par la suite. » Options de la modale (`flows.modals.unlock.*`) :
  - Réinitialiser la validation interne du flow référentiel débloqué : retour à l'état « Rédaction » de tous les blocs.
  - Réinitialiser la validation externe : retour à l'état « PREL » des documents « source flow » liés.
  - Variantes « chapeau » et « flows liés » (non valables pour les génériques).
  - Après déblocage : `unlocked = true`, le contenu devient éditable et la synchronisation s'arrête.
- **modificationStatus** (`ModificationStatusEnum = ENABLED, WARNING, DISABLED`, endpoint `flows/{id}/modification-status`) :
  - WARNING → toast « Attention au moins un des documents liés est en état de validation, vos modifications peuvent avoir un impact sur celui-ci » (`flows.toastrMessage.warningFlow`).
  - DISABLED → « Impossible d'effectuer l'action car tous les documents liés sont en état de validation » (`flows.toastrMessage.disabledFlow`), édition bloquée (même règle pour les séquences : `sequences.toaster.disabledFlow`).
  - INFÉRÉ : DISABLED si tous les documents générés liés sont dans un état figé (BPE…), WARNING si au moins un l'est.
- Bloc lié à un document validé BPE : « pour le modifier, relancez d'abord la modification du document depuis sa fenêtre d'édition » (`flowApp.flowTab.blocs.message.adjustBlocKO`).

### 2.7 Actions sur un flow

OBSERVÉ, enum d'actions de la ligne flow : `Duplicate=1 Refresh=2 Delete=3 PGACDetails=4 UpdatePgacForm=5 History=6 Property=7 RefreshRefProject=8 Unlock=9 Execute=10 UpdateContent=11 Schedule=12 Collaborators=13 QRCodeGeneration=14`. Libellés `flows.table.actions.*`.

| # | Action | Libellé | Règles / effets |
|---|---|---|---|
| 1 | Duplicate | Dupliquer | Modale « Dupliquer un flow » : nom (« Copie » + nom), destination « Dupliquer vers » (entité, recherche projet) ou « Dupliquer vers le modèle », n° d'identification. Info (`flows.modals.duplicateFlow.info.*`) : la duplication **remet à zéro les circuits de validation interne et externe** (blocs → Rédaction, documents → PREL) et ne reprend ni signatures ni réponses (INFÉRÉ). Titres selon le type (générique, chapeau, intervention, référentiel…). Traitement asynchrone (`NatureActionEnum DUPLICATE_IN_PROGRESS/SUCCESS/ERROR`). |
| 2 | Refresh | Mettre à jour bibliothèque | « Tous les éléments venant de la bibliothèque de moyens et de risques seront mis à jour » (endpoint `update-library-elements`). Événement UPDATE_LIBRARY. Erreur possible : « un changement de validation a été détecté, veuillez relancer l'action » (`flowContentNavigation.error.silentLibraryUpdate`). |
| 3 | Delete | Supprimer | Confirmation « …supprimer le flow {{name}} ? ». **Bloqué** si le flow : a des documents liés, est importé dans un autre projet, est lié à des étapes d'autres flows, ou figure dans un diagramme (`flows.delete.error.*`, `global.entityConflict.hint.flow.*`, `NatureLinkEnum`). Le flow part à la corbeille. |
| 4-5 | PGAC | Détail PGAC / Mise à jour PGAC formulaire | hors MVP |
| 6 | History | Historique de flow | §2.8 |
| 7 | Property | Propriétés | Modale lecture seule : nom, type, famille, applicabilité, réf. interne/externe, entité source, indice, création (date + auteur), dernière modification (date + auteur) (`flows.modals.propertiesModal.*`) |
| 8 | RefreshRefProject | Mettre à jour | met à jour un référentiel importé depuis sa source (« Tous les contenus seront écrasés sans aucun retour en arrière possible ») |
| 9 | Unlock | Débloquer | §2.6 |
| 10 | Execute | Exécuter | §3.6 |
| 11 | UpdateContent | Supprimer et importer à nouveau | « tout le contenu de votre flow est sur le point d'être supprimé ! Seul le contenu du dernier flow importé sera de nouveau importé » ; événement DELETE_AND_RE_IMPORT_CONTENT |
| 12 | Schedule | Rappel | §3.8 |
| 13 | Collaborators | Collaborateurs.trices | collaborateurs restreints au flow (§3.7) |
| 14 | QRCodeGeneration | Générer le QR Code imprimable | génère un PDF/PNG avec un QR code pointant vers le flow (endpoint `flows/{id}/qr-code-flow`). « Le QR Code a été généré avec succès ». Sur MobileApp : flasher le code ouvre le flow (RN92). |

Autres actions (menu « Options » de l'éditeur, `flowContentNavigation.options.*`, enum `ImportFlow=1 UpdateLibrary=2 InternValidation=3 EditFlow=4 FlowSourceInfo=5 ResetFlow=7 Revision=8 UpdateContent=10 UpdateDocument=11 ViewHistory=12 OrphanResponses=13`) : Importer du contenu, Mettre à jour bibliothèque, Validation interne, Editer le flow, Information contenu, Réinitialiser le flow, Révision, Supprimer et importer à nouveau, Mettre à jour document (« Tous les documents liés seront mis à jour au dernier indice »), Historique de flow, Réponses orphelines. Détails en §4.

Actions de masse (liste) : **Réorganiser les flows** (`flows.modals.reorganize.*`, endpoint `flows/reorganize`). On choisit un champ (Catégorie, Statut, Rapporteur, Responsable, Tablette 1/2/3, Collaborateur, dates planifiées/prévues/réalisées), une valeur, puis on confirme : « changer le.la "{{type}}" à "{{name}}" pour le(s) {{count}} flow(s) sélectionné(s) ? ». **Exécuter** plusieurs référentiels (≤ 10 à la fois, `referentialFlows.modals.import.sizeLimitExceeded`).

### 2.8 Historique du flow

OBSERVÉ `FlowEventTypeEnum = CREATE, DELETE, IMPORT_CONTENT_REFERENTIAL, IMPORT_CONTENT_TEMPLATE, RESET_FLOW, DELETE_AND_RE_IMPORT_CONTENT, UPDATE_LIBRARY, DETACH_FBL, ACTIVATE_PHASE, ACTIVATE_STEP, ACTIVATE_FORM, DEACTIVATE_PHASE, DEACTIVATE_STEP, DEACTIVATE_FORM, DEACTIVATE_AND_LINK_NEW_FORM, DETACH_AND_LINK_NEW_FORM, ADD_USER_HIERARCHY_IN_FLOW, DELETE_USER_HIERARCHY_FROM_FLOW, DEACTIVATE_SIGNATURE`. Phrases `flowContentNavigation.dialog.history.content.actions.*`, par exemple « {{userName}} a désactivé l'étape {{stepName}} de la phase {{phaseName}} – {{date}} ».

Écran « Historique du flow {{name}} » : liste chronologique paginée, filtres « Filtrer par date » et « Type d'événement », lien « Voir le commentaire » (l'activation ou la désactivation d'une phase/étape demande un commentaire), état vide « Aucun évènement enregistré ».

Table `flow_events` : `id, flow_id, event_type, actor_id, source (WEB|MOBILE|API), occurred_at, payload jsonb (phase_id, step_id, form_name, signature_nature, supervisor_name, comment, source_flow…)`.

Historique séparé des statuts : `flow_status_history` (R-STAT-3), modale « Historique des changements de statut » avec « Charger plus ».

### 2.9 Corbeille

OBSERVÉ `trash.*` : « Liste des éléments supprimés les 30 derniers jours », colonnes Nom, Nature (Flow…), Date de suppression, Utilisateur.trice, action Restaurer. Erreurs de restauration :
- « Impossible de restaurer un flow déjà importé dans l'entité »
- « …depuis une entité PGAC »
- « …depuis une entité supprimée »

Règle (R2.7) : la date affichée est la date de suppression.
Suppression de phase ou d'étape : **pas de corbeille** (« Il n'y a pas de corbeille pour cet élément »).

### 2.10 Modale Création / Édition de flow

OBSERVÉ, onglets (enum `General=general CustomField=customField Document=referentialFlowDocument Assignment=assignment Planning=planning Options=options`), titres `flows.modals.addFlow.{general, customAttr, document, assignment, planning, options}`. Navigation « Flow précédent / Flow suivant » en édition, « Sauvegarder ». Si on quitte sans sauvegarder : « Les modifications seront perdues si vous ne sauvegardez pas ».

1. **Général**
   - Type de flow * (radio avec tooltips, création uniquement)
   - Nom *, Description
   - Référence (N° chrono : saisie ou « Généré(e) automatiquement » si une nomenclature existe pour l'entité Flow / champ REF_INT)
   - Famille, Catégorie (lien d'aide vers le module)
   - Statut (sélecteur groupé par état, info statut par défaut), Commentaire changement statut, bouton « Afficher statut personnalisé historique »
   - Etiquette(s)
   - Bloc « Localisation » avec interrupteur (`locationActivated`) : Site, Tranche, Local, Système élémentaire, Repère fonctionnel, Objet. Lien « Ajouter des informations sur la localisation ».
2. **Attribut(s)** : attributs personnalisés de nature Flow, regroupés par famille (applicabilité filtrée, R2.3).
3. **Document** : liste des documents de flow générables (Instructions, Moyens, Risques, Contrôles, Formulaires, Instructions multiples, Objets ; `flows.documents.name.*`), chacun avec famille et options (« Afficher les options du document »), et bouton « Générer le(s) document(s) ». Le détail est dans la spec Documents.
4. **Affectation** : Rapporteur (1), Responsable(s) (n), Tablette 1/2/3, Collaborateur.trice(s). Les sélecteurs listent les team roles de l'entité.
5. **Planning** : trois couples de dates avec légende colorée « Date planifiée / Date prévue / Date réalisée » (`flows.modals.addFlow.legend`). Start ≤ end (INFÉRÉ, cf. `planTranslate.assign.teamRole.date`).
6. **Options** : « Passer le bloc Contrôle en mode simplifié ». Erreur `editFail.hasSignatures` « Impossible d'activer cette option, au moins une signature est présente dans le flow » ; `editFail.hasDsiBlocsNotInRedaction` « Les blocs contrôle ne peuvent pas être modifiés car au moins un des blocs n'est pas en rédaction ». Surveillants applicables : cases internes 1-3 / externes 1-3 avec noms (« Surveillant(s) applicable(s) », `canEditSupervision`). INFÉRÉ : les surveillants sont dans Options ou Affectation, à vérifier.

Messages : « Flow crée avec succès », « Modification(s) enregistrée(s) avec succès », « Une erreur s'est produite lors de l'ajout du flow », « Un nouveau flow a été créé avec l'identifiant {{ param }} ». En mode aperçu : « L'ajout de flows n'est pas disponible en mode aperçu ».

---

## 3. Module Flows d'une entité (vues)

OBSERVÉ (routes) : `/dashboard/flow-management/{vue-list | vue-plan | vue-map | vue-diagram | vue-kanban}`. La vue par défaut est la liste.
- Plan / Carte / Kanban : disponibles pour les entités Project, Referential, Pgac, Folder.
- Carte : désactivable par la configuration d'organisation `mapViewDisabled`.
- Diagramme : soumis à `diagramEnabled = true` et à un sous-ensemble de types d'entité.
- Signatures : `/dashboard/signatures` (liste) et `/signatures/vue-temporal`.
- Référentiels : `/dashboard/flow-referential` (vues liste / diagramme).

### 3.1 Vue Liste

Titre « Liste des flows », sous-titre « {{current}} élément(s) dans la liste / {{total}} au total ». Bouton « Créer nouveau flow ». Dernier élément sélectionné en surbrillance (RN92).

**Colonnes possibles** (enum OBSERVÉ `FlowType=1 Name=2 Chrono=3 Description=4 Family=5 Category=6 Status=7 Reporter=8 Responsible=9 Collaborator=10 Tablet1=11 Tablet2=12 Tablet3=13 EstimatedStartDate=14 EstimatedEndDate=15 StartDate=16 EndDate=17 ModificationDate=18 achievedStartDate=19 achievedEndDate=20 InternalSupervisor1..3=21-23 ExternalSupervisor1..3=24-26 Site=27 Unit=28 Local=29 ElementarySystem=30 FunctionalLandmark=31 Object=32 Text..Link=33-42 FamilyName=43 CategoryName=44 Reference=45 Scheduling=46 FlowReferential=47 Search=48 Assignment=49`). Les codes 33-42 correspondent aux colonnes d'attributs personnalisés, selon leur type. En-têtes `flows.table.header.*` : Nom, Référence, Famille, Catégorie, Statut, Rapporteur, Responsable, Tablette 1-3, Date de début/fin prévue, planifiée et réalisée, Modification, Dernière importation, Référence dossier, Local, Repère, Etiquette, Affectation, Surveillant interne/externe 1-3, Action.

- Colonne Type : pastille-lettre S/G/C/I/R/M. Tooltip « Nouvelle version disponible » sur un référentiel importé dont la source a évolué (`flows.types.tooltip.availableUpdate`).
- Colonne Action figée à droite, avec ombre (R2.13). Colonnes redimensionnables (R2.12). En-têtes sticky.
- **Personnaliser les colonnes** (`customizeColumns.*`) : mode « Défaut » ou « Personnalisé ». Colonnes « Obligatoires » verrouillées et colonnes « Optionnels » ; attributs regroupés par famille (« Attribut(s) {{name}} »). Au plus 30 colonnes (« Nombre des colonnes dépassant les 30 éléments »). Configuration enregistrée dans le navigateur (« Vos paramètres sont enregistrés dans le cache de navigateur »), bouton Réinitialiser. INFÉRÉ : colonnes verrouillées = Type, Nom, Statut. Pour la reconstruction : `localStorage` par utilisateur et entité, ou une table `user_table_prefs`.

**Filtres** (`flows.filters.*`) :
- puces de type (Filtrer par flow spécifique/générique/chapeau/intervention/référentiel…)
- Famille, Catégorie, Statut (arbre par état), Local, Repère, Affectation, Référentiel / Sans référentiel, Entité référentiel, Rappel
- filtre date (`flows.filter.date.*`) : champ (début/fin du flow, modification, réalisation…), plage, raccourcis Journée/Semaine/Mois en cours, Mois N-1 ; on peut ne saisir qu'une borne (RN92)
- « Effacer le(s) filtre(s) ». Si la recherche avancée porte déjà sur un champ : « Un filtre spécifique est déjà défini dans la recherche avancée ».

**Recherche texte** + **Recherche avancée** (`advancedSearch.*`) : constructeur de critères « Champ / Action / Valeur(s) » combinés par « ou » pour plusieurs valeurs ; touche Entrée = rechercher (RN110).
- Champs : Type de flow, Nom, Référence, Description, Famille, Catégorie, Statut, Rapporteur, Responsable, Collaborateur(s), Affectation, Tablette 1-3, dates planifiées/prévues/réalisées, Date de modification, Surveillants int./ext. 1-3, Site, Tranche, Local, Système élémentaire, Repère fonctionnel, Objet, Référence dossier, attributs (même applicabilité que l'entité, R2.3).
- Opérateurs (enum `CONTAINS, STARTS_WITH, GREATER_THAN_OR_EQUALS, LESS_THAN_OR_EQUALS, BETWEEN, NOT_BETWEEN, EMPTY, NOT_EMPTY, EQUALS, NOT_EQUALS, SEARCH, INTERSECT, NOT_INTERSECT, CurrentDay, CurrentWeek, CurrentMonth`).
- Restrictions (RN110) : pas de Égal/Différent sur Nom, Référence et Description ; « Vide / N'est pas vide » disponibles pour Responsable, Collaborateurs, Affectation, Tablettes et Date de modification ; booléens « non paramétrés » ciblables.

**Tri** (INFÉRÉ par les colonnes triables) : nom, référence, dates, modification.

État vide : « Aucun élément dans le tableau, vous pouvez ajouter un flow depuis le module “Gestion flow” du tableau de bord » ; pour les référentiels : « Aucun flow référentiel importé… ».

Actions de ligne : §2.7 (menu ellipse), clic sur la ligne = ouvrir le contenu du flow. Sélection multiple : Réorganiser, Exécuter (référentiels), Supprimer (INFÉRÉ).

### 3.2 Vue Kanban

OBSERVÉ : la route et l'entrée de menu existent (`appMenu.dashboard.flows.viewKanban` « Vue kanban »), mais le composant est un **placeholder** (« Flow kanban is here ! »). La fonctionnalité n'est pas livrée.
PROPOSITION (INFÉRÉ) : colonnes = catégories d'état (§2.4) ou statuts personnalisés de nature Flow, cartes = flows (lettre type, nom, référence, famille, responsable(s)), glisser-déposer = changement de statut avec commentaire optionnel (règles R-STAT). Regroupements possibles via l'enum OBSERVÉ `None=1 Family=2 Category=3 Status=4 Reporter=5 Responsible=6 Tablet=7 Flow=8 TeamRole=9`. À traiter en V2.

### 3.3 Vue Carte (Leaflet)

OBSERVÉ `flows.map.*` :
- Fond « Système WGS84 (ESPG 3857) | Sitemap by Siteflow ».
- Boîte de recherche : Adresse ou Latitude/Longitude, Zoom.
- Bascule « Afficher / Masquer le(s) libellé(s) ».
- **Géométries** liées à un flow : types `GeometryTypeEnum = POINT, POLYGON, POLYLINE, CIRCLE, MULTI_LINE_STRING`. Icônes `GeometryIconEnum = DEFAULT (Point d'intérêt), WITHOUT_ICON, TRUCK, SNOWPLOW (Machine), WAREHOUSE, ARCHIVE (Stock), HARD_HAT (Casque), TOOLBOX (Outils), ROCKET, CARAVAN`.
- Popup d'une géométrie :
  - onglet Général : Libellé, Icône, Latitude, Longitude, Altitude, Rayon (cercle), Flow lié
  - onglet Détail : Nom, Référence, Famille, Catégorie, Statut du flow, lien « Ouvrir la fenêtre d'édition d'un flow »
  - actions Déplacer, Supprimer
- **Couches GeoJSON** de l'entité (`flows.map.geoJson.*`) : ajout d'un fichier (pièce jointe), couleur, afficher/masquer, bloquer/débloquer, supprimer. Tableau : Nom, Couleur, Date de création.
- Filtres : statuts (endpoint `custom-status/project/map/flow/filter`), famille, catégorie, etc.

Table `flow_geometries` : `id, flow_id, project_id, geometry_type, label, icon, coordinates (geojson / PostGIS), altitude, radius_m, color, created_at`. Table `project_geojson_layers` : `id, project_id, name, file_id, color, visible, locked`.

### 3.4 Vue Plan (Gantt)

OBSERVÉ `planTranslate.*`, endpoints `plan`, `element-plan/*`, `element-plan-link`.
- **Plans** de l'entité (sélecteur « Sélectionner un plan », créer / éditer / supprimer) : Nom, Description, Type, Échelle. Échelles `ScaleEnum = TEMPORAL, SCHEDULING, DEFAULT` (FE `Temporal=1 Default=2 Scheduling=3`) :
  - **Défaut** : « Liste des flows du plan défaut » ; tous les flows de l'entité, barres sur les dates.
  - **Temporel** (Jour / Semaine / Mois / Trimestre / Année) : on ajoute au plan du contenu à partir de flows existants (`ElementPlanTemporalImport`).
  - **Ordonnancement** : ressources (collaborateurs et tablettes) en lignes, affectation sur période (`planTranslate.affectationModal.*` « Affectation des collaborateur.trice(s) sur la période du {{startDate}} au {{endDate}} »).
- Périodes d'affichage : Jour, Semaine, Mois, Trimestre, Année ; bouton « Aujourd'hui » ; zoom.
- Colonnes latérales (masquables) : Désignation, Etat, Date de début, Date de fin, Affectation ; en ordonnancement : Famille, Hiérarchie, Fonction, Compétence, Groupe, Nom, Affecté à…
- **Dépendances** entre barres (`DependencyTypeEnum = START_END, END_START` ; libellés « Dépendance(s) avant / après », « Ajouter une dépendance »). Erreurs « Un lien existe déjà ! » ; avertissement « Chevauchement des dates » ; « Détails des dépendances ».
- **Jalons** : Nom, Date, Couleur, Description.
- **Regroupement** (« Regrouper ») : Aucun, Famille, Catégorie, Statut, Type, Affectation – Rapporteur / Responsable / Tablette.
- Filtres : Affectation, Famille, Type, État, Local, Repère, Collaborateurs, Tablettes, Fonction, Hiérarchie, Compétences, Rôle, Groupe, Contrat, Domaine, Administratif, Applicabilité.
- Popover d'affectation sur une barre : Rapporteur, Responsable(s), Tablette 1-3, Collaborateur.trice(s).
- Le déplacement ou redimensionnement d'une barre met à jour les dates prévues du flow (INFÉRÉ : « Veuillez sélectionner les dates prévisionnelles de début et fin avant de continuer ! »).

### 3.5 Vue Diagramme (GoJS)

OBSERVÉ `diagram.*`, RN97, RN101, RN110, R2.5, R2.13, endpoints `diagrams`, `diagrams/{id}`, `projects/{id}/diagrams?type=`, `diagrams/{id}/flows`, `…/flows-to-import`, `…/execute`, `flows/{id}/phases`.

- Une entité peut avoir **plusieurs diagrammes** (bouton « + », menu déroulant de sélection), chacun avec un nom modifiable. Chaque diagramme peut produire **un document diagramme** (nature fichier DIAGRAM). Un diagramme lié à un document ne peut pas être supprimé (« La vue diagramme est déjà associé au document suivant »).
- Modèle stocké : `{uuidEntity, projectUuidEntity, name, config (JSON GoJS : nodeDataArray + linkDataArray), readOnly, documentFlowUuidEntity}`.
- Deux modes : **Édition** / **Aperçu** (`diagram.toggle.*`).
- Catégories de nœuds (OBSERVÉ `DEFAULT, FLOW, TEXT, PHASE, STEP, SEQUENCE_GROUP, SEQUENCE_NODE, SEQUENCE_PHASE, SEQUENCE_LINK, SEQUENCE_EXIT`) :
  - **Carte flow** : nom, référence, famille et couleur de famille, statut, dates ; pastille « disponible ».
  - **Carte phase** / **Carte étape** : obtenues par **Décomposer** (`breakDown`) une carte flow en phases, puis une phase en étapes ; affichent « Origine : » (flow source).
  - Les phases et étapes désactivées apparaissent barrées (R2.5).
- Palette et outils (enum OBSERVÉ `deleteNode, unlinkNode, shapes, backgroundColor, style, thickness, connectorDirection, outlineColor, fontColor, fontSize, shape, text, connector, group, reference, flowReference, flowName, breakDown, stepOrigin, edit, editLayout, duplicateBtn, groupBtn, ungroupBtn, deleteBtn, undoBtn…`) :
  - formes libres + texte
  - connecteurs : épaisseur, sens (`NONE, LEFT, RIGHT, BOTH`)
  - styles : couleur de fond, contour, texte, taille de police (RN101)
  - grouper / dégrouper, dupliquer, supprimer, dissocier, annuler, avec raccourcis (`diagram.actionButton.*` : Suppr, Ctrl+C/V, Ctrl+G, Ctrl+Maj+G, Ctrl+Z)
  - zoom (+, −, curseur) et mini-plan
- Ajout : « Ajouter des flows » (modale d'import filtrable Statut / Famille / Catégorie / Type / Affectation, sans chapeaux) ou « Nouveau flow ».
- Règle : un flow présent dans un diagramme **ne peut plus être supprimé** (RN97).
- **Diagramme référentiel** : dans le module Référentiels, un projet « préparé » depuis un sous-dossier référentiel récupère les diagrammes référentiels. Bouton **Exécuter** (popover « Importer dans : » diagramme existant ou « Nouvelle vue de diagramme ») : transforme tous les flows référentiels du diagramme en flows utilisables (RN97).
- Licence GoJS chargée par API (`diagram.loadLicense.error`). Pour la reconstruction, envisager React Flow (MIT) et garder le même modèle JSON. Le **logigramme des séquences** (§4.5) réutilise les catégories SEQUENCE_*.

### 3.6 Module Référentiels (import / exécution)

OBSERVÉ `referentialFlows.*`, `flows.modals.executeFlow.*`, RN92 API (exécution asynchrone).
- « Liste des flows référentiels applicables au projet » (vue liste) et « Liste des diagrammes référentiels » (vue diagramme). Filtres : Type, Famille, Catégorie, Statut, Indice, Entité référentiel. Recherche.
- **Importer depuis un référentiel** : on sélectionne au plus 10 flows d'une entité référentiel ; seuls les statuts *En préparation* sont proposés. Un flow déjà importé est signalé « Flow(s) déjà importé(s) » / « Ce flow référentiel est déjà importé dans un projet existant ». Case « Mettre à jour tous les référentiels déjà importés ». Import asynchrone : « L'import du référentiel est en cours. Le traitement sera terminé lorsque le flow importé sera visible… ». Résultat : flows DERIVED_FROM_STANDARD verrouillés.
- **Exécuter** (« Exécuter à partir d'un standard » ; variantes référentiel / chapeau / intervention) :
  - « Nombre de copie: » (n ≥ 1)
  - options sur les flows et documents générés :
    - ne pas générer les documents « source flow » liés au flow spécifique / intervention / chapeau / flows liés
    - réinitialiser la validation interne (blocs → Rédaction)
    - réinitialiser la validation externe (documents → PREL)
  - Résultat : n flows Spécifique (ou Chapeau + flows liés, ou Intervention) avec `executed_from_flow_id`. Séquences reprises (R2.23 SFP-21474).
  - Messages « Flow référentiel exécuté avec succès », « {{count}} flow(s) référentiel(s) exécuté(s) avec succès ».
  - Traitement **asynchrone** par job : statuts TO_DO / IN_PROGRESS / DONE / FAILED (API25 `/jobs/...`).
  - Droit : rédacteur, expert ou responsable de l'entité (R2.13).
- Mise à jour d'un référentiel source : « Les anciennes importations du flow référentiel ne sont pas affectées par la mise à jour » (`referentialFlows.alerts.refresh.subtitle`).

### 3.7 Affectation et collaborateurs

- Rôles d'affectation sur un flow (enum OBSERVÉ `Reporter=1 Responsible=2 Tablet_1=3 Tablet_2=4 Tablet_3=5 Contributors=6`, API `RoleEnum = ASSIGNE, REPORTER, TABLET_1, TABLET_2, TABLET_3, COLLABORATOR`). Endpoints : `flows/{id}/affectation/{reporter|assignee|tablet1..3|collaborators}`.
- Les candidats sont les **team roles** de l'entité (utilisateurs, opérateurs, tablettes importés dans l'entité ; domaine Collaborateurs). Un même collaborateur ne peut pas être ajouté deux fois à l'entité.
- **Responsables multiples** (R2.1) : un responsable voit le flow dans sa liste MobileApp et **peut signer sans être dans « collaborateurs »**.
- **Collaborateurs restreints au flow** (`flows.modals.collaborators.modalTitle`) : liste de collaborateurs, chacun avec **au moins une hiérarchie** (« Sélectionner au moins une hiérarchie par collaborateur »). Par défaut tous les collaborateurs de l'entité peuvent signer ; si une liste restreinte existe, seuls eux sont proposés à la signature, y compris sur la MobileApp (RN101). Sinon : « Vous n'êtes pas présent dans la liste des collaborateurs.trices restreints à ce flow » (`blocks.dsi.dialogs.sign.emptyListLabel`). Événements ADD/DELETE_USER_HIERARCHY_IN_FLOW.
- Droits liés au rôle dans l'entité (`ReadOnly=1 Operator=2 Writer=3 Expert=4 Responsible=5`) : spécifiés dans la spec Droits.

### 3.8 Rappels (scheduling) liés à un flow

OBSERVÉ `schedule.*`, enums `NatureEnum = REFERENTIAL, REMINDER`, `PriorityEnum = LOW, MEDIUM, HIGH, HIGHEST`, `StatusEnum = ACTIVE, INACTIVE, PAUSED, FINISHED`, `StateEnum = SCHEDULED, EXPIRED, EXECUTED`, conditions de début (`TIME, STATUS`) et de fin (`STATUS, TIME, AMOUNT, NEVER`), fréquences Yearly…Minute.
Modale « Rappel » d'un flow : liste (Nom, Début, Fin, Fréquence, Action) et création :
- onglet Général : Nom, Description, Nature « Flow » ou « Flow référentiel », Priorité, Options (« Bloquer les suites non traitées », « Planification glissante », « Autoriser l'action une fois l'échéance révolue », plage de tolérance avant/après, alerte avant échéance)
- onglet Fréquence : expression récurrente type RRULE, conditions de début et de fin

Prérequis : un statut par défaut de nature Tâche (`schedule.dialog.notifications.customStatusNotFound`). Produit des **tâches** (module Tâches planifiées, spec séparée). Ici on garde seulement la FK `schedulings.flow_id`.

---

## 4. Contenu du flow : éditeur, phases, étapes

### 4.1 Éditeur de contenu (écran)

OBSERVÉ `flowContentNavigation.*`, `flowApp.flowTab.*`, routes `content-view`, `sequence-view`, `edit`, `blocks`.
- **Menu arborescent** à gauche : phases P{n} et étapes E{n} (préfixes `phases.phase.initial` « P », `steps.step.initial` « E »), avec pastilles d'état (§4.7) et flows liés aux étapes en sous-nœuds. Actions : Agrandir/Réduire la ou les phases, Ajouter une phase / une étape, recherche (afficher/masquer). Filtres : Arborescence, Type de blocs, Etat des blocs, Flow(s) lié(s) ; « Afficher uniquement les Phases » / « Phases et Etapes ». États vides : « Aucune phase dans le flow – Ajouter une phase pour commencer », « Aucune étape dans la phase », « Veuillez sélectionner une étape pour commencer ».
- **Zone étape** à droite : barre d'onglets ou d'icônes des blocs activés (« Afficher le bloc Instruction / Moyen / Risque / Contrôle / Formulaire / Texte / Equipe / Instruction multiple / Objet »), puis le contenu du bloc sélectionné, avec dans l'en-tête l'état de validation et les actions de validation.
- **Vue Séquencement** (onglet « Séquencement du flow », §4.5).
- Menu **Options** du flow : §2.7.
- **Mode révision** (bandeau « Mode révision - », §4.10).
- Bandeau flow : « Agrandir / Réduire le bandeau ».

### 4.2 Phase

OBSERVÉ (mappeur et clés) : `name, description, customNodeOrder, nodeOrder, nodeOrderToDisplay, hideTitlePdf, tags[], additionalComment, readOnlyOnMobileApp, disabled, excludeNumbering, type (LINEAR|PARALLEL), mandatory, sequenceIdentifier, stepsCount`.

| Nom technique | Type | Oblig. | Valeurs / règles | Libellé FR | Statut |
|---|---|---|---|---|---|
| `id` | uuid | oui | | | OBSERVÉ |
| `flow_id` | uuid FK | oui | | | OBSERVÉ |
| `node_order` | int | oui | ordre interne (position) | Position avant la phase | OBSERVÉ |
| `custom_node_order` | text | non | « Numéro de phase personnalisé » ; remplace l'affichage `P{n}` | N° de la phase | OBSERVÉ |
| `exclude_numbering` | bool | non | « Exclure de la numérotation » | | OBSERVÉ |
| `name` | text | oui | | Nom * | OBSERVÉ |
| `description` | text | non | « Détail sur la phase uniquement visible sur la WebApp et utilisable depuis une variable dynamique dans les formulaires » ; titré « Information à destination des collaborateurs.trices » dans la modale récente | Détail sur la phase | OBSERVÉ |
| `additional_comment` | text | non | | Mention complémentaire | OBSERVÉ |
| `hide_title_pdf` | bool | non | « Masquer ce nom sur le document d'instructions » | | OBSERVÉ |
| `tags` | via `phase_tags` | non | | Etiquette | OBSERVÉ |
| `custom attributes` | via valeurs (nature PHASE) | | onglet « Attribut(s) » (`flowContentNavigation.dialog.attributes`) ; affichés dans le document contrôles (RN92) | | OBSERVÉ |
| `disabled` | bool | non | Activer/Désactiver la phase, avec commentaire obligatoire (modale « Désactivation d'une phase / Commentaire ») ; l'activation d'une phase active ses étapes | | OBSERVÉ |
| `read_only_on_mobile_app` | bool | non | « A remplir sur la WebApp uniquement » (mode lecture MobileApp, RN92) | | OBSERVÉ |
| `sequence_type` | enum LINEAR/PARALLEL | oui | défaut = configuration organisation `DefaultPhaseTypeEnum` | Linéaire / Parallèle | OBSERVÉ |
| `mandatory` | bool | oui (défaut true) | false = « Phase optionnelle » | | OBSERVÉ |
| `sequence_id` | uuid FK sequences | oui si séquencé | | | OBSERVÉ |

Règles :
- R-PH-1 : avec `disabled` et `read_only_on_mobile_app` tous deux vrais, la désactivation prime (`disabledPhaseInfo`).
- R-PH-2 : suppression avec confirmation, sans corbeille. **Refusée** dès qu'une signature existe sur le périmètre (R2.18 ; `steps.alertModal.updateStep.blockWithSignatures.fail` « Des signatures sont présentes, la suppression est impossible »).
- R-PH-3 : **Dupliquer** (« Dupliquer la phase juste avant… » + sélection d'une phase) ; **Déplacer** (« Déplacer la phase juste après… », « En première position / En dernière position »).
- R-PH-4 : affichage numéro = `custom_node_order` sinon `P{nodeOrderToDisplay}` (l'affichage ×100 côté Siteflow est un détail technique, INFÉRÉ).
- Modale « Créer / Édition de la phase {{n}} - {{name}} » : Nom, Numéro personnalisé, Exclure de la numérotation, Mention complémentaire, Information collaborateurs, Activer/Désactiver, WebApp uniquement, Attribut(s) ; « Créer une autre phase » ; navigation « Phase précédente / suivante » ; bouton « Ajouter une étape ».

### 4.3 Étape

OBSERVÉ (mappeur) : `name, description, customNodeOrder, revisionNodeOrder, nodeOrder, nodeOrderToDisplay, hideTitlePdf, adr, emm, rhp, dsi, form, txt, pr, multiPr, blocObject (bool par type de bloc), flow (lié), navigationFlowCount, blocValidityDetails[], tags[], additionalComment, excludeNumbering, readOnlyOnMobileApp, disabled, parentFlowUuidEntity`. API V2 (API25) : `additionalName, customOrderingNumber, internalInformation, managementProperties{commentOnStateChange, isEnabled, listEnabledThematicBlocks[]}, usageProperties{isCustomOrderingNumberExcludedFromNumbering, isNameHiddenInInstructionDocument, listTagsIdentifiers, toBeFilledOnWebappOnly}`.

| Nom technique | Type | Oblig. | Valeurs / règles | Libellé FR | Statut |
|---|---|---|---|---|---|
| `id`, `phase_id`, `flow_id` (dénormalisé) | uuid | oui | | | OBSERVÉ |
| `node_order` | int | oui | « Position avant l'étape », « Première / Dernière position » | | OBSERVÉ |
| `custom_node_order` | text | non | « Numéro d'étape personnalisé » | N° de l'étape | OBSERVÉ |
| `revision_node_order` | text | non | numérotation en mode révision | | OBSERVÉ (nom), INFÉRÉ (sens) |
| `exclude_numbering` | bool | non | | Exclure de la numérotation | OBSERVÉ |
| `name` | text | oui | 3 à 255 car., pas d'espace en bord (`nameTextHelpMin/Max`) | Nom * | OBSERVÉ |
| `description` | text | non | « Détail sur l'étape visible sur la WebApp, la MobileApp et utilisable depuis une variable dynamique » (= `internalInformation`) | Information à destination des collaborateurs.trices | OBSERVÉ |
| `additional_comment` | text | non | (= `additionalName`) | Mention complémentaire | OBSERVÉ |
| `hide_title_pdf` | bool | non | | Masquer ce nom sur le document d'instructions | OBSERVÉ |
| `enabled_blocks` | ensemble de `block_type` | ≥ 1 | cases à cocher des types de blocs (« Veuillez sélectionner au moins un bloc », « Au moins un bloc doit être sélectionné ») | Bloc Instruction / Moyen / Risque / Contrôle / Formulaire / Texte / Equipe / Instruction multiple / Objet | OBSERVÉ |
| `linked_flow_id` | uuid FK flows | non | « Lier un flow » (générique, ou flows liés d'un chapeau) ; « Créer un flow et le lier à l'étape » ; un seul lien (« Veuillez d'abord supprimer le lien existant avant de pouvoir lier un flow ») | | OBSERVÉ |
| `tags` | via `step_tags` | non | | | OBSERVÉ |
| attributs | nature STEP | | onglet Attribut(s) | | OBSERVÉ |
| `disabled` | bool | non | avec commentaire (« Désactivation d'une étape ») ; signature impossible sur étape désactivée (`blocks.dsi.alertMessage.disableSignature.title`) | Activer / Désactiver l'étape | OBSERVÉ |
| `read_only_on_mobile_app` | bool | non | « A remplir sur la WebApp uniquement » (endpoint dédié) | | OBSERVÉ |
| `validated_at`, `validated_by`, `validation_source` | | non | « Valider l'étape / Dévalider l'étape » (§4.7) | | OBSERVÉ (actions) |

Règles :
- R-ST-1 : décocher un type de bloc dont le bloc est « Validé » demande une confirmation : « Êtes-vous certain de vouloir désactiver et donc potentiellement supprimer les données d'un bloc à l'état “Validé” ? ». Décocher un bloc lié à un document en validation est bloqué : « Veuillez d'abord passer le document lié en état de modification ». Décocher le bloc DSI sur un chapeau est interdit.
- R-ST-2 : réactiver un bloc (« Ce bloc n'est pas activé sur l'étape en cours, souhaitez-vous l'activer ? » → endpoint `steps/reactivate/bloc`) **retrouve** les données antérieures. INFÉRÉ : la désactivation est logique (le bloc garde `disabled = true`) et non une suppression.
- R-ST-3 : supprimer une étape est interdit si elle a des signatures (R2.18) ou si elle est la cible de redirections (`global.entityConflict.hint.flow.navigationFlow` « L'étape fait l'objet des redirections suivantes »).
- R-ST-4 : Dupliquer (« Dupliquer l'étape vers… [phase] juste avant… [étape] ») ; Déplacer (« Déplacer l'étape vers la… [phase] juste après… »).
- R-ST-5 : « Supprimer le lien » vers le flow lié (`steps/{id}/remove-linked-flow`) ; « Ouvrir le flow lié à l'étape « {{value}} » ». La modale « Lier un flow à l'étape actuelle » filtre par Statut / Famille / Catégorie.
- Modale « Édition de l'étape {{n}} - {{name}} » : Nom, N° personnalisé, Exclure numérotation, Mention complémentaire, Information collaborateurs, blocs à cocher (avec description de chaque bloc, `flowApp.flowTab.steps.*Description`), Lier un flow / Créer un flow et le lier, Activer/Désactiver, WebApp uniquement, Attribut(s), **Redirections** (§4.4) ; « Créer une autre étape » ; « Etape précédente / suivante ».

Descriptions des blocs (OBSERVÉ `flowApp.flowTab.steps.*`) :
- PR : « Décrivez l'instruction opératoire à destination des opérateurs sur le terrain »
- EMM : « Listez les matériels, matériaux et équipements nécessaires sur le terrain »
- ADR : « Listez les risques et les parades associées présent sur le terrain »
- DSI : « Paramétrez les contrôles qualités à renseigner sur le terrain »
- FORM : « Listez les formulaires à compléter sur le terrain »
- TXT : « Texte uniquement visible en interne ou en externe »
- RHP : « Définissez les besoins en ressource humaine sur le terrain »

### 4.4 Redirections (conditions d'étape)

OBSERVÉ `flowContentNavigation.dialog.stepNavigation.*`, `flowApp.flowTab.steps.condition.*`, mappeur `{natureStyle, description, linkedPhase, linkedStep, navigationOrder}`, endpoints `navigation-flows` (+ move).
- « Rediriger vers une ou plusieurs autres étapes du flow » : liste ordonnée de « Redirection {{index}} ». Chaque redirection a une **Phase** et une **Étape** cibles, un **Style** (Défaut, Information, Avertissement, Erreur, Réussite ; enum `NatureStyleEnum = TRACE, INFO, WARN, ERROR, SUCCESS`) et un « Message d'information si besoin ».
- Les redirections se réordonnent (glisser) et se suppriment.
- Rendu MobileApp : boutons de redirection en bas d'étape (« En savoir plus sur l'affichage des redirections depuis la MobileApp »).

Table `step_navigations` : `id, step_id, target_phase_id, target_step_id, style, message, position`.

### 4.5 Séquencement

OBSERVÉ `sequences.*`, RN105 (paramétrage WebApp), RN110 (application MobileApp), R2.10 (sortie officielle), R2.13 (zoom, phases désactivées), R2.23 (reprise à l'exécution) ; endpoints `sequences`, `sequences/{id}`, `sequences-with-phases` ; configuration d'organisation `DefaultSequenceTypeEnum`, `DefaultPhaseTypeEnum`.
- Un flow se découpe en **séquences** ordonnées (« Séquence {{order}} »). Bouton ciseaux « Séquencer le flow » : « Créer une nouvelle séquence à partir d'ici » coupe la liste de phases. Zone de dépôt « Ajouter à la séquence ».
- Type de séquence :
  - **Linéaire** : « Les phases à l'intérieur de cette séquence devront être réalisées les unes après les autres »
  - **Parallèle** : « …pourront être réalisées dans n'importe quel ordre »
- Type de phase :
  - **Linéaire** : « Les étapes … devront être réalisées les unes après les autres »
  - **Parallèle** : « …dans n'importe quel ordre »
- Badges de phase : « Phase optionnelle » (mandatory = false), « WebApp » (à remplir sur WebApp uniquement), état désactivé.
- **Logigramme** des séquences (GoJS) : cartes de phase avec numéro, nombre d'étapes et illustration linéaire/parallèle ; zoom + mini-plan.
- Règles d'exécution terrain (RN110) :
  - R-SEQ-1 : on ne peut pas compléter une étape tant que les **éléments obligatoires** des étapes précédentes (selon la séquence et le type de phase) ne sont pas remplis.
  - R-SEQ-2 : les étapes non accessibles restent visibles en lecture seule.
  - R-SEQ-3 : un chef de chantier peut **déverrouiller une étape bloquée** après authentification ; l'action est tracée (`NatureActionEnum SKIP_FILL_RESTRICTION`, action `SkipFillRestriction=11`).
  - R-SEQ-4 (INFÉRÉ) : une phase optionnelle n'est pas bloquante pour la suite.
- Modification interdite si le flow est en `modification_status = DISABLED`.

Table `sequences` : `id, flow_id, position, type (LINEAR|PARALLEL)`. Les phases portent `sequence_id`, `sequence_type`, `mandatory`.

### 4.6 Validation d'étape et pastilles d'avancement

OBSERVÉ `flowContentNavigation.stepValidation.*`, endpoints `steps/{id}/validate|devalidate`, RN105.
- « Valider l'étape » / « Dévalider l'étape ».
  - Succès : « L'étape est validée. »
  - Échec : « Certains éléments obligatoires ne sont pas remplis. »
- Éléments obligatoires d'une étape :
  - signatures obligatoires du bloc Contrôle
  - statuts et/ou signatures obligatoires du bloc Instructions multiples
  - formulaires à réponse obligatoire du bloc Formulaire
- MobileApp : bouton « Valider et passer à l'étape suivante » ; sur la dernière étape visible, « Valider et terminer le flow » (R2.10). Ce bouton est accessible quel que soit l'état de validation interne des blocs (R2.2).
- **Pastilles** (RN105) :

| Couleur | Condition |
|---|---|
| Gris | l'étape n'a pas encore été ouverte |
| Bleu | l'étape a été ouverte, aucun élément réalisé |
| Orange | au moins un élément réalisé, étape non validée (même si tous les obligatoires sont faits) |
| Vert | étape validée par le bouton |

  Pour la WebApp, l'état calculé suit `PhaseStatusEnum` : TO_DO (gris), IN_PROGRESS (bleu/orange), DONE (vert), DISABLED. INFÉRÉ : « ouverte » nécessite de tracer une première ouverture par flow (table `step_progress`).

### 4.7 Import de contenu, réinitialisation, mise à jour

OBSERVÉ `flows.content.import.*`, `flowContentNavigation.dialog.importFlow.*`, endpoints `import-content-template`, `import-content-referential`, `flows/{id}/reset`.
- **Importer du contenu** : onglets « Référentiel » / « Modèle », filtre Entité, choix du flow, puis « Importer le contenu après la phase… » (sélection d'une phase). Tooltip : détail du flow actuel (Nom, Description, Local, Repère fonctionnel). Confirmation « Le contenu précédent sera supprimé » (quand on remplace).
  - Interdit si des réponses de formulaire existent (`haveResponseError`) ou si un signataire existe (`haveSignatoryError` « Impossible d'importer du contenu lorsque le flow a déjà un signataire »).
  - Flow source vide : « Le flow est vide, il n'y a rien à importer ! ».
  - Événements IMPORT_CONTENT_REFERENTIAL / TEMPLATE.
  - Les blocs DSI et FORM ne sont pas importés depuis un référentiel (R-TYPE-5).
- **Réinitialiser le flow** : saisie de « REINITIALISER » pour confirmer. « Tout le contenu de votre flow et les documents associés seront supprimés définitivement ! ». **Bloqué** si une signature existe sur un bloc multi-instruction et/ou contrôles (R2.18). Événement RESET_FLOW.
- **Mettre à jour contenu** (référentiel) : « Impossible de mettre à jour le contenu car le flow contient au moins une signature ou une réponse de formulaire ».
- **Information contenu** : modale « Information sur le contenu » (type, flow, entité source, indice source).

### 4.8 Copier / coller de blocs

OBSERVÉ enum `Historic=1 Properties=2 Copy=3 Paste=4 HideMultiPrTitle=5 ShowMultiPrTitle=6`, endpoint `blocs/copyPaste`, clé de stockage local `block_copy_paste`, messages « Contenu copié avec succès », « Impossible de copier dans le même bloc ».
- Copier un bloc met en mémoire (navigateur) la référence du bloc source. Coller dans un bloc **du même type** d'une autre étape, ou d'un autre flow, copie son contenu.
- INFÉRÉ : le bloc cible doit être en Rédaction ; le collage remplace le contenu (PR/TXT) ou ajoute les éléments (EMM/ADR/RHP…).

### 4.9 Validation interne globale du flow

OBSERVÉ `flowContentNavigation.dialog.flowValidation.*`, `flowApp.flowTab.validationModal.*`, endpoints `flows/validate-blocs`, `flows/redaction-blocs`.
- Modale « Validation interne du flow » : sélection des blocs (par type, « Sélectionner tout »), puis action :
  - Passer tous les blocs concernés à l'état Vérification / Approbation / Validé
  - Effectuer une autre vérification / approbation
  - Retour à l'état rédaction pour tous les blocs
- Messages :
  - « {{ count }} bloc(s) concerné(s) »
  - « Le ou les blocs présents dans le flow ne sont pas dans un état valable pour cette action ! »
  - « Aucun bloc de sélectionné pour effectuer l'action »
- Raccourcis : « Rédaction générale / Vérification générale / Approbation générale » (`flowApp.flowTab.flowButton.gWritten/gValidate/gApproved`) ; même action au niveau de l'étape (`stepNavbar.tooltip.stepVerification`…).

### 4.10 Révisions de flow

OBSERVÉ `flowContentNavigation.dialog.review.*`, endpoints `revision`, `revision/close`, `revision/re-open`, `revision-event`. Nature de statut « Révision » (`status.filter.nature.revision`). Document « regroupant toutes les révisions du flow » (`textHelpREVISION`).
- « Détail des différentes révisions sur le flow » : liste, « Ajouter une révision » (Référence *, Commentaire), Ouvrir, Fermer, Mettre à jour, Activer/Désactiver, Supprimer (enum `Close=1 Create=2 Disable=3 Enable=4 None=5 Reopen=6 Update=7 Delete=8`).
- Règles :
  - R-REV-1 : une seule révision ouverte à la fois (« Veuillez d'abord fermer la révision ouverte »).
  - R-REV-2 : on ne ferme une révision que si les blocs et les documents concernés sont validés (`blocksShouldBeValidated`, `errorMessage.validate`).
  - R-REV-3 : impossible sur un flow vide (« Veuillez ajouter des phases et des étapes avant de commencer »).
  - INFÉRÉ : pendant une révision ouverte, l'éditeur est en « Mode révision », les blocs modifiés reçoivent `revision` (affiché « Rév » / « REJETÉ - Rév {{revision}} - Ind {{indice}} ») et les étapes ajoutées un `revision_node_order`.

Table `flow_revisions` : `id, flow_id, reference, comment, status (OPEN|CLOSED), enabled, opened_at, closed_at, created_by` ; `revision_events`.

### 4.11 Réponses orphelines

OBSERVÉ `flowContentNavigation.dialog.orphanResponses.*` : « Gestion des réponses orphelines ». Ce sont des réponses de formulaire dont le formulaire ou le lien de bloc n'existe plus. Pour chacune : « Réparer la réponse » → « Choisir le formulaire » → Réparer (rattache la réponse à un formulaire du flow). Échec : « Échec de la réponse de réparation ».

---

## 5. Blocs

### 5.1 Modèle commun

OBSERVÉ :
- enum FE `Pr=1 Emm=2 Adr=3 Dsi=4 Form=5 Txt=6 Rhp=7 Document=8 MultiPr=9 Object=10`
- enum API `NatureBlocEnum = TXT, PR, RHP, EMM, ADR, DSI, FORM, AUTRE, MULTI_PR, OBJECT`
- mappeur bloc `{uuidEntity, disabled, type, status, revision, redactor+dateRedaction, approver+dateAprobation, auditor+dateVerification, history (blocEvents), multiPrTitleHidden, requiredSignature, requiredStatus, linkedDocumentUuidEntity}`

| Code | Libellé (`blocks.title.*`) | Sous-titre (`blocks.label.subtitle.*`) |
|---|---|---|
| PR | Instruction | Editeur de texte avec ajout de documents possible |
| EMM | Moyen | Liste de moyens venant de la bibliothèque |
| ADR | Risque | Liste de risques venant de la bibliothèque |
| DSI | Contrôle | Editeur de contrôles qualité |
| FORM | Formulaire | Liste de formulaires venant de l'entité |
| TXT | Texte | Editeur de texte avec ajout de documents possible |
| RHP | Equipe | Liste de besoin en fonctions, nombre et compétences |
| MULTI_PR | Instruction multiple | Editeur de texte multiple avec liste d'actions possibles |
| OBJECT | Objet | Liste des objets venant de la bibliothèque |
| DOCUMENT | Document | documents liés à un bloc (sous-section de PR/TXT/DSI/MultiPR) |

Règles communes :
- R-BL-1 : **un bloc par type activé et par étape** (INFÉRÉ par `isBlockEnabled(step, type)` et un seul `blocUuidEntity` par type et par étape).
- R-BL-2 : **États de validation interne** (FE `Redaction=1 Verification=2 Approbation=3 Validation=4 Active=5` ; API `StatusBlocEnum = REDACTION, VERIFICATION, APROBATION, VALIDE` ; libellés Rédaction, Vérification, Approbation, Validé ; filtre « Rejeté »). `Active=5` est INFÉRÉ comme état technique « sans circuit », non exposé.
- R-BL-3 : **le contenu n'est modifiable qu'à l'état Rédaction**. OBSERVÉ pour TXT (`disabled` si non Rédaction), pour le mode réponse unique (« Le bloc doit être au statut Rédaction pour modifier la réponse unique »), pour la dissociation d'objets (« Le bloc Formulaire doit être à l'état “Rédaction” ») et pour les options DSI. INFÉRÉ pour les autres types.
- R-BL-4 : **Workflow** (modale « Validation interne du bloc », `blocks.blockValidation.*`) :
  - Rédaction → « Valider et passer en état « Vérification » » ou « Valider et rester sur cet état pour effectuer une autre Rédaction »
  - Vérification → « …passer en état « Approbation » » ou « …une autre Vérification »
  - Approbation → « …passer en état « Validé » » ou « …une autre Approbation »
  - À tout état : « Rejeter le bloc et revenir en état « Rédaction » » (commentaire « Commentaire de retour à l'état «Rédaction» »)
  - Commentaire optionnel à chaque passage.
- R-BL-5 : **Séparation des rôles** (même utilisateur, même bloc) : on ne peut pas être Rédacteur et Vérificateur, ni Vérificateur et Approbateur, ni Approbateur et Validateur (`blocks.blockValidation.ConflictMessage.*`). Une variante au niveau flow existe aussi (`validationModal.message.verificationMessage` : « Le « rédacteur » ne peut pas être « vérificateur » sur un même Flow »). INFÉRÉ : contrôle sur le dernier acteur de l'état précédent.
- R-BL-6 : on trace qui a rédigé, vérifié et approuvé, avec la date (« Rédacteur: {{name}} le {{date}} à {{time}} », « Vérificateur… », « Approbateur… »).
- R-BL-7 : **Historique des changements d'état** (`blocks.status.*`) : « {{user}} a créé le bloc en l'état … », « a changé l'état de X à Y », commentaire, date et heure, compte (application). Événements API `BLOC_REDACTION, BLOC_VERIFICATION, BLOC_APROBATION, BLOC_REJECTION, BLOC_VALID`.
- R-BL-8 : **Propriétés du bloc** : Type, Etat, Référence interne / externe, Date de création (date, heure, auteur), Dernière modification.
- R-BL-9 : **Réinitialiser l'état des blocs** (route `reset-bloc-status`, `ResetBlocks=15`) : remet en Rédaction.
- R-BL-10 : un bloc sert de source à un **document de flow** du même type (« Dernière version du PDF généré par le bloc depuis le module « Documents » », « Aucun document du même type associé à ce Flow »). Bloc lié à un document BPE : modification soumise à R-§2.6.
- R-BL-11 : `blocValidityDetails` sur l'étape (INFÉRÉ : liste des blocs incomplets ou invalides, utilisée pour la pastille et la validation d'étape).
- R-BL-12 : chaque **élément** de liste (EMM/ADR/RHP/FORM/PR-multi) peut être **désactivé / activé** individuellement (endpoints `…/update/disable`) ; un élément désactivé n'est pas éditable (« Impossible d'éditer un élément désactivé »).

Encarts de style dans les éditeurs riches (`flowApp.flowTab.blocStyle.*`, enum `Info=1 Waning=2 Error=3 Note=4 Success=5`) : « Insérer un encart » Volet d'informations / Panneau d'avertissement / d'erreur / de notes / de réussite. Styles de tableau Froala : bordure noire / rouge / blanche. Caractères spéciaux (enum Alpha…UpDown). Images ≤ 2 Mo (`blocks.froala.uploadImageError`).

### 5.2 PR — Instructions

- Contenu : **texte riche** (HTML Froala ; en reconstruction, Tiptap) avec images, encarts et tableaux. Placeholder « Commencez par écrire une instruction… ». API : `update-instruction-block`, `rich-text-content-in-block` (pictogrammes inclus).
- **Documents liés** (sous-section « Document(s) lié(s) au bloc instruction ») :
  - « Ajouter un nouveau document » depuis la base documentaire du projet ; seuls les PDF « avec et sans version » sont visibles
  - « Attacher pièce jointe » : PDF visible uniquement en pièce jointe du bloc, hors base documentaire
  - option d'indice : « Indice à lier » (un indice précis plutôt que le dernier) ; tooltip « Document lié différent du dernier indice »
- Erreur « Le contenu de ce bloc est trop grand » (limite à fixer, INFÉRÉ ~ quelques Mo).
- Stockage : `blocks.content_html text` + table `block_documents`.

### 5.3 TXT — Texte

OBSERVÉ `blocks.txt.*`, `flowApp.flowTab.steps.titles.TXT.intern/extern`, placeholders `blockTxtClientPlaceholder` / `blockTxtOperatorPlaceholder`.
- Contenu : texte riche + documents liés (comme PR).
- **Visibilité** par bascule à deux valeurs (`documentView` bool) :
  - **MobileApp** (false) : « Le contenu de ce bloc sera visible uniquement depuis la MobileApp Siteflow et non dans les documents PDF à destination du client » (= « Texte - Interne », destination opérateur).
  - **Document** (true) : « …visible uniquement dans les documents PDF et non dans la MobileApp » (= « Texte - Externe », destination client).
- Règle R2.10 : une étape dont le seul contenu est un TXT en visibilité « document » est **invisible sur la MobileApp** et n'est pas comptée comme dernière étape visible.

Champs : `content_html`, `visibility` enum (`MOBILE_APP` | `DOCUMENT`).

### 5.4 EMM — Moyens (équipements, matériels, matériaux)

OBSERVÉ `blocks.emm.*`, `flowApp.flowTab.emm.*`, mappeurs (élément de bloc : `name, labelFamily, quantity, unit, reference, consumable, provider, expired, verification, commentaire, displayComment, disabled`).
- Liste d'éléments **issus de la bibliothèque Moyens** (« Ajouter un moyen depuis la bibliothèque »). Modale d'import : filtres Applicabilité et Famille, compteur, sélection multiple, puis popover « Option d'importation » (Quantité, Unité, Consommable). Possibilité d'« Ajouter à la bibliothèque » (création à la volée : « L'élément sera ajouté à la bibliothèque »).
- Colonnes : Famille, Nom, Quantité, Unité (ou « Q / U »), Référence, Fournisseur, Action.
- Badges :
  - « Moyen consommable »
  - « Soumis à vérification »
  - « Date de validité dépassée » (propriété de la bibliothèque : validityDate < aujourd'hui)
- Édition d'un élément dans le bloc (« Edition du moyen dans le bloc ») : Quantité, Unité, Consommable, Commentaire, case « Afficher le commentaire lors des exportations en PDF et le rendre ainsi visible pour le client ».
- Aperçu (« Aperçu du moyen ») en lecture : propriétés de la bibliothèque (Famille, Applicabilité, Nom, Référence, Fournisseur, Photo, Document de référence, Document de certificat ; onglet Vérification : Date de validité, Organisme de vérification).
- Actions de ligne : Voir, Editer, Désactiver/Activer, Supprimer. Suppression **bloquée** si l'élément est lié à un dossier de clôture (`blocks.emm.alerts.delete.blocked`).
- « Mettre à jour bibliothèque » (action flow 2) resynchronise les propriétés de bibliothèque. Seules Quantité, Unité, Consommable et Commentaire sont propres au bloc (INFÉRÉ).

Table `block_emm_items` : `id, block_id, library_emm_id (FK), name_snapshot, family_id, reference, provider, quantity numeric, unit text, consumable bool, comment, display_comment bool, disabled bool, position`.

### 5.5 ADR — Risques et parades

OBSERVÉ `blocks.adr.*`, `flowApp.flowTab.adr.*`, mappeurs (`family, applicability, name, source, reference, pictogram, landmark, major`) ; parades (`name, applicationFile (PDF), description, pictogram`, `generic` true/false) ; pictogrammes `SFX_PICTO_0001..0240`.
- Éléments **issus de la bibliothèque Risques** (« Ajouter un risque depuis la bibliothèque » ; filtres Applicabilité et Famille).
- Colonnes : Famille, Risque, Source, Majeur (Oui/Non), Pictogramme, Action.
- Édition dans le bloc (« Edition du risque dans le bloc ») : seulement **Majeur** (bool) est modifiable localement (mappeur update `{uuidEntity, major}`).
- Aperçu du risque : Général (Famille, Applicabilité, Nom, Référence, Source, Repère, Pictogramme, Majeur) + tableau des **parades génériques** (bibliothèque : Parade, Pictogramme, PDF) + **parades spécifiques** au flow : « Ajouter une parade spécifique au risque » (Rappel du risque, Parade au risque *, Pièce jointe PDF), éditer, supprimer (« …supprimer la parade [{{name}}] ? »).
- Actions : Voir, Editer, Désactiver/Activer, Supprimer.
- Champs bibliothèque (référence, domaine Bibliothèque) : Fréquence, Occurrence, Gravité (`flowApp.flowTab.adr.frequency/occurrence/severity`).

Tables : `block_adr_items` (`id, block_id, library_adr_id, major bool, disabled, position`), `block_adr_specific_parades` (`id, block_adr_item_id, name, pictogram, file_id`).

### 5.6 RHP — Equipe

OBSERVÉ `blocks.rhp.*`, `flowApp.flowTab.rhp.*`, mappeur `{function (familyFunction), count (number), observation, skills[]}`.
- « Créer un nouveau besoin » :
  - **Fonction *** : famille de nature « Fonction collaborateurs » (Paramètres / Familles)
  - **Nombre *** : entier ≥ 1
  - **Compétence(s)** : n compétences parent/enfant, nature « Compétences collaborateurs » ; « + Ajouter un nouveau requis de compétence »
  - **Observation**
  - « Créer un autre besoin »
- Colonnes : Fonction, Nombre, Compétence(s), Action (Voir, Editer, Désactiver/Activer, Supprimer).

Tables : `block_rhp_items` (`id, block_id, function_family_id, count int, observation, disabled, position`), `block_rhp_item_skills` (`item_id, skill_family_id`).

### 5.7 DSI — Contrôles et signatures

OBSERVÉ `blocks.dsi.*`, `flowApp.flowTab.dsi.*`, mappeur élément DSI. Champs : `technicalControlStep, technicalControlDetails, aip, documentRequired, signatoriesStatus, observation, reference, signatoryDisabledComment, supervisionIntern1..3 + supervisionNameIntern1..3, supervisionExtern1..3 + supervisionNameExtern1..3, technicalControl, signatureConvocationSupervisionIntern1..3, signatureBreakpointSupervisionIntern1..3, signatureConvocationSupervisionExtern1..3, signatureBreakpointSupervisionExtern1..3, listSignatories[]`.

**Configuration du bloc** (modale « Modification des contrôles » / « Edition des contrôles qualités de l'étape ») :

| Nom technique | Type | Libellé | Règle |
|---|---|---|---|
| `signatories_status` | enum `ENABLED, DISABLED, REQUIRED, OPTIONAL` (FE `Disabled=1 Enabled=2 Optional=3 Required=4`) | « Sans option » / « Signature(s) désactivée(s) » / « Signature(s) obligatoire(s) » | Défaut **REQUIRED** depuis RN105 (les blocs antérieurs ne sont pas impactés). « Options possibles sur les contrôles ». Passer à DISABLED est impossible si des signatures existent (« Action impossible, des signatures sont présentes ») et demande un commentaire (`signatory_disabled_comment`, « Commentaire de signature(s) désactivée(s) »). |
| `realization` | toujours actif | Signature « Réalisation de l'opération » (R) | |
| `technical_control` | bool | Contrôle technique (CT) | |
| `technical_control_step` | bool | « Rendre l'étape entière contrôle technique » | |
| `technical_control_details` | text | Détail contrôle technique | |
| `aip` | bool | AIP (Activité Importante pour la Protection) | |
| `document_required` | bool | R (Document Requis) | |
| `observation` | text | Observation / Référence matériel | |
| `document_reference` | text | Référence document externe | |
| `breakpoint_intern_1..3` | bool | Signature point d'arrêt interne (PA), par surveillant interne | actif seulement si le surveillant interne n est applicable au flow ; sans surveillant défini → mode « mono » (1 seul) |
| `convocation_intern_1..3` | bool | Signature point de convocation interne (PC) | idem |
| `breakpoint_extern_1..3` | bool | Point d'arrêt externe | idem, surveillants externes ; « applicable à… » (cocher les surveillants concernés) |
| `convocation_extern_1..3` | bool | Point de convocation externe | idem |
| documents liés | via `block_documents` | « Document(s) nécessaire(s) pour réaliser l'étape », « Lier un document », « Importer document » | PDF de la base documentaire (workflow documentaire avec renvoi depuis le bloc) |

Règles DSI :
- R-DSI-1 : on ne peut pas désactiver un contrôle déjà renseigné (« Impossible de désactiver un contrôle lors qu'il est déjà renseigné ») ni quand le bloc est validé (« …lorsque le bloc est validé »).
- R-DSI-2 : désactiver un *type* de signature (« Êtes vous certain de vouloir désactiver ce type de signature ? ») crée l'événement DEACTIVATE_SIGNATURE (historique du bloc et du flow, avec le nom du surveillant). Action de droit `DeactivateSignature=10`.
- R-DSI-3 : **Mode simplifié** (option du flow `simplified_signature_mode`) : INFÉRÉ, seule la signature « Réalisation » (+ éventuellement CT) est présentée, sans points d'arrêt ni convocation par surveillant. Activable seulement sans signature existante et avec tous les blocs DSI en Rédaction.
- R-DSI-4 : **Gel des indices** (RN97) : à chaque signature (Web ou Mobile), les indices des **documents avec version liés au bloc contrôle de l'étape sont figés** ; la montée d'indice n'est plus dynamique pour eux.
- R-DSI-5 : « Levée des préalables » : « Edition des contrôles suite à la levée des préalables avec le client » (INFÉRÉ : même formulaire, ouvert après le démarrage pour ajuster les points externes).
- R-DSI-6 : les alertes « point de convocation interne/externe » ont été supprimées (RN92) ; ne pas les reprendre.
- R-DSI-7 : DSI obligatoire sur les étapes d'un chapeau (R-TYPE-3).
- Historique des contrôles (`blocks.dsi.dialogs.history.*`) : « {{user}} {{action}} le contrôle le {{date}} à {{time}} depuis la {{source}} ».

Les signatures elles-mêmes sont décrites au §6.

### 5.8 FORM — Formulaires (lien bloc ↔ formulaire, « FBL »)

OBSERVÉ `blocks.form.*`, mappeur FBL `{name, family, index, reference, nature (Model/Generic/Autre/LOCAL), modificationDate, customStatus, requiredResponse, guided, uniqueResponse, uniqueResponseMode, nextRubric, formUuidEntity, completedResponsesCount, disabled, additionalComment, responsesCount, allowedRubricsFormatted, linkToTechnicalObjectAttributesEnabled, technicalObject}`. Enum d'actions `Reply=1 Overview=2 Navigate=3 ActivateMandatory=4 DisableMandatory=5 ActivateUnique=6 DisableUnique=7 History=8 Replace=9 Delete=10 Disable=11 Enable=12 Share=13 Summarize=14 ImportResponses=15`.

- **Lier un formulaire** : choix parmi les formulaires **de l'entité** (eux-mêmes importés de la bibliothèque) ; filtres Applicabilité, Famille, Statut, Type ; variante « Lier un formulaire générique ». Un formulaire à attributs d'objet ne peut être lié que si un bloc Objet est actif et qu'un objet y est lié (tooltip `linkFormWithObjectAttribute`).
- Colonnes : Famille, Nom, Référence, Indice, Statut, Modification, Activer/Désactiver, Action. Badges : Réponse obligatoire, Réponse unique, Guider actif, Objet lié au formulaire.

| Option FBL | Champ | Règle |
|---|---|---|
| Réponse obligatoire | `required_response` bool | « Permet de rendre l'ajout d'au moins une réponse obligatoire » (élément obligatoire pour valider l'étape, §4.6) |
| Réponse unique | `unique_response` bool + `unique_response_mode` (`NEW_OR_RESUME` « Nouvelle réponse et reprendre une réponse autorisées », `NEW_RESPONSE` « Nouvelle réponse uniquement », `RESUME_RESPONSE` « Reprendre une réponse uniquement ») | « Ces autorisations s'appliquent uniquement à l'application mobile ». Modifiable seulement en Rédaction. Bandeau « Réponse unique activée : {{mode}} sur le terrain ». Erreurs : « Impossible d'ajouter une autre réponse Ce formulaire est à réponse unique », « Impossible de dupliquer la réponse car l'option réponse unique est activée ». |
| Navigation / Guider | `initial_rubric_id` | « Ouvrir la réponse à la rubrique… » à la création d'une réponse |
| Autoriser le remplissage de | `rubric_permissions[]` `{rubric_id, readonly}` | restreint les rubriques remplissables ; conflit signalé si la rubrique guidée n'est pas remplissable (`blocks.form.navigation.conflict.*`) ; « toutes les rubriques sont en lecture seule » |
| Indice | `form_index` | « Sélectionner un indice différent » |
| Objet lié | `technical_object_id` | via le bloc Objet (§5.10) |
| Activer / Désactiver | `disabled` | désactivation avec confirmation « DESACTIVER » ; élément désactivé : impossible de répondre ; événements ACTIVATE/DEACTIVATE_FORM |

- **Répondre** (« Répondre à un formulaire ») : nouvelle réponse ou « Continuer une réponse en cours » (seules les réponses « en cours » sont listées). La référence de réponse est modifiable, avec un modèle par défaut `{reference}{indice}{objectName}{chrono}P{phaseOrder} - E{stepOrder} - {todayDate} R{count}`.
- **Voir les réponses** (« Gestion des réponses de formulaire ») : colonnes Référence réponse, Indice, Statut, Provenance (MOBILE/WEB/API), Date de création/modification. Actions : Editer, Editer la référence, Revenir à l'état « En cours » / « Rédaction », Dupliquer, Générer un document, Partager, Historique, Supprimer. Spécifié dans la spec Formulaires.
- **Importer des réponses** depuis un autre flow du projet (RN92) : recherche (avancée) d'un flow, liste des réponses (Référence réponse, Indice, Statut, Date), sélection multiple.
- **Gérer** (remplacer, enum `Deactivate=1 Delete=2 DeactivateAndReplace=3 DeleteAndReplace=4`) :
  - type d'action : Désactiver, Désactiver et remplacer, Supprimer, Supprimer et remplacer
  - périmètre : « Toutes les étapes du flow » ou « Uniquement les étapes de la phase actuelle »
  - formulaire de remplacement
  - confirmation par saisie (REMPLACER / SUPPRIMER)
  - Règles : le lien est changé dans toutes les étapes où le formulaire est appelé ; les formulaires qui ont déjà au moins une réponse sont **seulement désactivés** sur les étapes concernées.
  - Événements DEACTIVATE_AND_LINK_NEW_FORM / DETACH_AND_LINK_NEW_FORM / DETACH_FBL.
- Suppression d'un FBL **interdite** s'il a des réponses en cours ou terminées (`flowApp.flowTab.blocs.warning.form.delete.message`) ; « Il n'y a pas de corbeille pour ce Formulaire ».
- Autres : Aperçu, Résumé, Partager, Historique des réponses (« {{user}} {{action}} la réponse « {{ref}} » … »).

Tables : `form_block_links` (`id, block_id, project_form_id, form_index, required_response, unique_response, unique_response_mode, initial_rubric_id, technical_object_id, disabled, additional_comment, position`), `form_block_link_rubric_permissions` (`fbl_id, rubric_id, readonly`). Les réponses (`form_responses.context = FLOW`, `fbl_id`, `flow_id`, `step_id`) sont dans la spec Formulaires.

### 5.9 MULTI_PR — Instructions multiples

OBSERVÉ `blocks.multiPr.*`, mappeur sous-élément `{elementOrder, name, content, nameAutoFilled, observation, signatory, customStatus, lastModifiedBy, modificationDate, disabled, hideOnExport}`, bloc `{multiPrTitleHidden, requirementSignatory, requirementStatus}`. Endpoints `element-pr/*`, `blocs/multi-pr/status-signatory`, `blocs/hideMultiPrTitle`.
- Liste ordonnée de **sous-blocs** (au plus 50 : « Impossible d'ajouter plus de 50 blocs » ; le dernier ne peut pas être supprimé : « Impossible de supprimer le seul bloc »). Chaque sous-bloc a :
  - un **Titre** (« Titre [{{index}}] » auto-rempli → `name_auto_filled`)
  - un **contenu riche**
  - un **Statut** : statut personnalisé de nature « Bloc Instruction multiple », choisi sur le terrain
  - une **Signature** (collaborateur, date, image ; création, édition, suppression)
  - une **Observation** (« Ajouter / Editer l'observation », limite de longueur)
  - Actions : Désactiver/Activer, Masquer/Afficher lors de l'exportation PDF (`hide_on_export`), Insérer 1 au-dessus / en-dessous, Dupliquer, Supprimer (enum `InsertAbove=1 … ShowWhenExportingPdf=8`)
- Options du bloc :
  - « Masquer / Afficher les titres » (`multi_pr_title_hidden`)
  - **Statut obligatoire / facultatif** (`requirement_status`)
  - **Signature obligatoire / facultative** (`requirement_signatory`) ; « Cette option peut être activée uniquement quand l'option “Statut obligatoire” est active »
  - INFÉRÉ : la signature obligatoire dépend du statut obligatoire.
- Messages de complétude : « Statut obligatoire », « Signature obligatoire », « Statut et signature obligatoires ».
- Glisser-déposer pour réordonner (seulement éditeurs réduits : « Veuillez réduire les éditeurs avant de pouvoir effectuer un glisser-déposer »), « Agrandir / Réduire le(s) bloc(s) ».
- **Historique des instructions multiples** (filtrable par sous-bloc : « Tous les blocs ») : « a renseigné / édité / supprimé la signature », « a sélectionné le statut », « a changé le statut de X à Y » (+ commentaire), avec date, heure et source.
- Documents liés au bloc (« Document(s) lié(s) au bloc instruction multiple »).

Tables : `block_multi_pr_items` (`id, block_id, position, title, title_auto_filled, content_html, custom_status_id, observation, disabled, hide_on_export, updated_by, updated_at`), `block_multi_pr_signatures` (`id, item_id, team_role_id/user_id, signed_at, signature_image_file_id, source`), `block_multi_pr_events`.

### 5.10 OBJECT — Objets techniques

OBSERVÉ `blocks.object.*`, RN92, RN97, RN101, RN105, endpoints `bloc-object`, `bloc-object/import`, `bloc-objects/{bloc}/technical-objects/{to}/pre-unlinking-checks|unlink`, `bloc-forms/link-forms-to-object/{to}` ; enum de pré-contrôle `UNLINKING_ALLOWED, OBJECT_BLOC_NOT_IN_REDACTION_STATE, FORM_BLOC_NOT_IN_REDACTION_STATE, LINKED_FORMS_HAVE_RESPONSES`.
- « Lier un objet depuis la bibliothèque » (objets techniques ; spec Objets). Colonnes : Famille, Nom, Référence (Code article), Indice, Modification, Action.
- Actions :
  - **Editer** : ouvre les attributs de l'objet, modifiables depuis le terrain en ligne
  - **Lier un formulaire** : associe l'objet à un ou plusieurs FBL de l'étape dont le formulaire a des questions « attribut » ; le bloc Formulaire doit être en Rédaction
  - **Dissocier** : confirmation par saisie « DISSOCIER »
- Pré-contrôle de dissociation :
  - bloc Objet en Rédaction
  - bloc Formulaire en Rédaction
  - aucune réponse sur les formulaires liés ; sinon liste « Réponse(s) du formulaire “{{formName}}” » et « Veuillez supprimer les dépendances avant de pouvoir dissocier »
- Document « Objets » du flow (RN101 ; option certificats de conformité en annexe) ; bouton d'accès au document depuis le bloc (RN105).

Table `block_object_items` : `id, block_id, technical_object_id, position` ; liaison `form_block_links.technical_object_id`.

### 5.11 DOCUMENT — Documents liés à un bloc

OBSERVÉ enum `Document=8`, `blocks.document.*`, `blocks.linkDocument.*`, endpoints `blocs/documents/{lazy|import|remove|update}`, `flows/{id}/blocs/all-documents`. Titre `blocks.label.blockDocumentTitle.{dsi,multiPr,pr,text}`.
- Ce n'est pas un bloc autonome activé par l'étape (INFÉRÉ) mais une **sous-section** des blocs PR, TXT, DSI et MULTI_PR.
- Modale « Lier un document » : documents du projet, filtres Famille / Catégorie / Etat, « {{current}} éléments… ».
- Pour chaque lien : « Indice à lier » (popover « Option d'indice sur le document ») ; « Visualiser le document lié » ; supprimer le lien.
- « Mettre à jour document » au niveau du flow : tous les liens passent au **dernier indice**, sauf ceux figés par une signature DSI (R-DSI-4).

Table `block_documents` : `id, block_id, document_id, pinned_version_id null, frozen bool, is_attachment bool (pièce jointe hors base), file_id null, position`.

---

## 6. Signatures

### 6.1 Modèle de signature (bloc DSI)

OBSERVÉ (mappeur signataire) : `uuidEntity, firstName, lastName, email, companyName, profession, comment, signatoryImage, date, signatoryNature, signatureState, user (ref), contributorType, signWithQrCode, proxied, signatureProxiedDate, source`.

| Nom technique | Type | Oblig. | Valeurs | Libellé FR |
|---|---|---|---|---|
| `id` | uuid | oui | | |
| `dsi_block_id` | uuid FK | oui | | |
| `step_id`, `flow_id` | uuid (dénormalisés) | oui | | |
| `nature` | enum `signature_nature` | oui | §6.2 | Type |
| `state` | enum `SIGNED, WAITING, FREE, SIGNATURE_NOT_POSSIBLE` (FE `Signed=1 Waiting=2 Free=3 NotPossible=4`) | oui | Signé / Signature en attente / Non signé / Signature non applicable | Etat |
| `contributor_type` | enum `INTERN, EXTERN, NO_LISTED_INTERN` (FE `Intern=1 Extern=2 NotListed=3`) | oui | collaborateur de la liste / externe (client) / collaborateur non présent dans la liste | |
| `signatory_user_id` | uuid FK users/team_roles | si INTERN | | Collaborateur * |
| `first_name`, `last_name`, `email` | text | si EXTERN / non listé | | Prénom *, Nom *, Email * |
| `company_name` | text | non | | Société |
| `profession` | text | non | | Fonction |
| `signature_image_file_id` | uuid | si SIGNED | image du tracé | Signature |
| `signed_at` | timestamptz | oui | « Date * » ; format différent pour les externes | Date |
| `comment` | text | non | | Commentaire |
| `sign_with_qr_code` | bool | non | « Signature avec Authentification forte » (QR code opérateur) | |
| `proxied` | bool | non | « Signature par procuration » | |
| `proxy_principal_name` | text | si proxied | « Mandant : la personne donnant procuration » | Mandant |
| `proxy_date` | timestamptz | si proxied | doit être **antérieure** à la date de signature (`proxyDateAfterSignDateError`) | Date de procuration |
| `source` | enum `WEB, MOBILE` | oui | « Signature réalisée depuis la WebApp / MobileApp » | |
| `hash` | text | non | empreinte (`hashSignature`) | |
| `disabled` | bool | non | | |

Méthodes de signature (filtre) : enum FE `Strong=1 WithoutStrong=2 Proxied=3 NotListed=4` (avec ou sans authentification forte, par procuration, non listé).

### 6.2 Natures de signature

OBSERVÉ `SignatoryNatureEnum` (API) / enum FE `Realization, ControlTech, BreakPointIntern(1-3), BreakPointExtern(1-3), ConvocationIntern(1-3), ConvocationExtern(1-3), AllConvocation, AllBreakPoint` ; trigrammes R / CT / PA / PC.

| API | Libellé | Trigramme |
|---|---|---|
| SIGNATURE_REALISATION | Réalisation de l'opération / de l'étape | R |
| SIGNATURE_SUPRV_INT_CT | Contrôle technique | CT |
| SIGNATURE_SUPRV_INT_PI1..3 | Point d'arrêt interne (1, 2, 3) | PA |
| SIGNATURE_CONVOCATION_SUPRV_INT_PI1..3 | Point de convocation interne (1, 2, 3) | PC |
| SIGNATURE_SUPRV_EXT1..3 | Point d'arrêt externe (1, 2, 3) | PA |
| SIGNATURE_CONVOCATION_SUPRV_EXT1..3 | Point de convocation externe (1, 2, 3) | PC |

Les index 1-3 renvoient aux surveillants internes/externes du flow (`internal/external_supervisor_name_n`). Libellés d'édition : « Edition de la signature “Point d'arrêt externe - {{supervisor}}“ » ou « …mono » quand il n'y a qu'un seul surveillant.

### 6.3 Règles de signature

- R-SIG-1 : il faut une étape **active** (non désactivée) et un bloc DSI actif.
- R-SIG-2 : « Impossible de signer 2 fois avec le même collaborateur.trice à la même étape » (`blocks.dsi.alertMessage.createSignature.error.signTwice`).
- R-SIG-3 : si le flow a des collaborateurs restreints, seuls eux (et les responsables, R2.1) sont proposés.
- R-SIG-4 : « Signer en personne » ou « Signer par procuration » (Mandant, Mandataire = soi-même, société du mandataire, date de procuration, signature, commentaire optionnel).
- R-SIG-5 : « Signature non applicable » → état SIGNATURE_NOT_POSSIBLE, avec commentaire.
- R-SIG-6 : « Signature en attente » (WAITING) : « Seul le signataire peut compléter la signature » (« Compléter la signature »). INFÉRÉ : signature préparée (signataire désigné) à finaliser par lui.
- R-SIG-7 : suppression d'une signature (« Ecrire « SUPPRIMER » pour confirmer ») : droit `DeleteSignature`. Effet : historique « a supprimé ».
- R-SIG-8 : **verrouillages liés aux signatures** (R2.18 et suivants) : la présence d'au moins une signature sur le périmètre interdit :
  - de supprimer le bloc, l'étape ou la phase
  - de réinitialiser le flow (signature MultiPR ou DSI)
  - d'importer du contenu, de mettre à jour le contenu depuis le référentiel
  - d'activer le mode simplifié
  - de désactiver ce contrôle ou de passer le bloc en « Signatures désactivées »
- R-SIG-9 : chaque signature fige l'indice des documents liés au bloc DSI de l'étape (R-DSI-4).
- R-SIG-10 : « Conflit » (`flowSignature.label.conflict`, action `Conflict` de DSI, bouton « Voir les signatures ») : INFÉRÉ, plusieurs signatures concurrentes pour une même nature (synchronisation hors ligne) à arbitrer.
- R-SIG-11 : « Refaire la signature » (`redoSignatory`) = éditer la signature (image, date, société, commentaire, date de procuration modifiables ; mappeur update).

### 6.4 Vue liste des signatures (« Tableau récapitulatif des signatures »)

OBSERVÉ `flowSignature.*`, endpoints `flows/{id}/phases/signatories/lazy`, `phases/{id}/steps/signatories/lazy`.
- Titre « Tableau récapitulatif des signatures - {{progress}} % d'avancement ». Un flow est sélectionné (« Aucun flow sélectionné pour le moment – Veuillez utiliser les filtres pour commencer »).
- Arborescence phase → étape (« E »), « Tout agrandir / réduire », « Charger plus ». Colonnes :
  - N°
  - Nom
  - Réalisation de l'opération / Contrôle technique
  - Levée des points de convocation / arrêt
  - Commentaires (« Observation : »)
- Chaque cellule affiche une pastille par signature : trigramme du signataire, date, icône Web/Mobile, et l'un des badges « Signé », « En attente », « Non signé », « Signature non applicable », « Signature par procuration », « Signature avec Authentification forte ». Tooltips « Bloc contrôle obligatoire », « Bloc contrôle désactivé », « Aucun bloc contrôle actif à cette étape ». Phases et étapes désactivées visibles (RN110).
- Filtres : Sélection flow, Famille, Catégorie, Statut, Type (nature), Etat, Option (Enabled/Disabled/Required/Optional), Méthode, Collaborateur, date.
- Actions : Ouvrir (le flow), Voir les signatures, Vérification des signatures.
- Compteurs : total signatures, filtrées, signées.

### 6.5 Vue temporelle des signatures

OBSERVÉ : route `signatures/vue-temporal`, menu « Vue temporelle » (`appMenu.dashboard.signatures.viewTemporal`). Pas de clés dédiées trouvées. INFÉRÉ : frise ou calendrier des signatures par date (jour / semaine / mois, enum `Day/Week/Month/Quarter/Year`), avec les mêmes filtres que la liste. À spécifier avec captures d'écran (§9).

### 6.6 Avancement (dashboard entité)

OBSERVÉ `flowApp.dashboardTab.advancement.*` et mappeur métriques :
- « Exécution - Avancement des signatures sur le terrain » : par catégorie (réalisation, interne, externe, contrôle technique), `count, signed, mandatory, percent, webApp, mobileApp`, plus un total. Les flows référentiels sont exclus (R2.12).
- « Préparation - Avancement remplissage flow » : blocs par état (rédaction, vérification, approbation, validés).
- « Documentaire - Avancement diffusion client » : documents par état PREL / BPO / BPE / BPA / sans version.

---

## 7. Écrans : récapitulatif

| Écran | Route proposée | Contenu |
|---|---|---|
| Liste des flows | `/entities/[id]/flows` | §3.1 (colonnes, filtres, recherche avancée, personnalisation, actions, réorganiser) |
| Modale flow | dialog `?flow=new\|[flowId]` | §2.10 (6 onglets) |
| Propriétés / Historique / Historique statut / Dupliquer / Exécuter / Débloquer / Collaborateurs / Rappel / QR code | dialogs | §2.7, §2.8, §3.6, §3.7, §3.8 |
| Carte | `/entities/[id]/flows/map` | §3.3 |
| Plan | `/entities/[id]/flows/plan` | §3.4 |
| Diagramme | `/entities/[id]/flows/diagram` | §3.5 |
| Kanban | `/entities/[id]/flows/kanban` | §3.2 (V2) |
| Référentiels | `/entities/[id]/referentials` | §3.6 |
| Éditeur de contenu | `/entities/[id]/flows/[flowId]` (+ `?step=`) | §4.1 |
| Séquencement | `/entities/[id]/flows/[flowId]/sequences` | §4.5 |
| Signatures liste / temporelle | `/entities/[id]/signatures`, `/signatures/timeline` | §6.4, §6.5 |

Composants shadcn suggérés : `DataTable` (TanStack) avec colonnes dynamiques, `Sheet`/`Dialog` + `Tabs` pour la modale flow, `Command`/`Popover` pour les sélecteurs (team roles, statuts groupés par état), `Resizable` pour l'éditeur (arbre et contenu), `Badge` pour les lettres de type et les états de bloc, `AlertDialog` avec saisie de confirmation (REINITIALISER, SUPPRIMER, DESACTIVER, REMPLACER, DISSOCIER).

---

## 8. Proposition de schéma SQL (Postgres / Supabase)

### 8.1 Choix de modélisation : tables relationnelles ou JSONB

- **Tables relationnelles** pour tout ce qui porte un état propre, un historique, une FK entrante ou des contraintes d'intégrité : phases, étapes, blocs, éléments EMM/ADR/RHP/FORM/OBJ/MultiPR, signatures, liens de documents. Les signatures, réponses de formulaire, dossiers de clôture et documents référencent ces lignes. Les règles « suppression interdite si signature / réponse » s'écrivent naturellement en FK `ON DELETE RESTRICT` + triggers. Les mises à jour de bibliothèque se font par jointure (`library_*_id`).
- **Colonnes typées** pour la configuration DSI : une vingtaine de booléens stables, filtrés par la vue Signatures.
- **Texte riche** (`content_html` + `content_json` Tiptap optionnel) pour PR, TXT et sous-blocs MultiPR. Ce n'est pas du JSONB métier.
- **JSONB** réservé : au modèle de diagramme (`diagrams.config`, document GoJS/React-Flow opaque), au `payload` d'événements d'historique (hétérogène), aux détails PGAC (hors MVP) et aux préférences d'affichage. Un JSONB « contenu de bloc » générique est **écarté** : il casserait l'intégrité des signatures et des liens, ainsi que les requêtes de la vue Signatures et des documents.

### 8.2 Enums

```sql
create type flow_type as enum ('SPECIFIC','GENERIC','GROUP','FLOW_FORM','TEMPLATE',
  'REFERENTIAL','REFERENTIAL_GENERIC','GROUP_REFERENTIAL','REFERENTIAL_INTERVENTION','LOCAL_REFERENTIAL');
create type flow_origin as enum ('LOCAL','DERIVED_FROM_STANDARD');
create type flow_modification_status as enum ('ENABLED','WARNING','DISABLED');
create type status_category as enum ('TO_DO','IN_PREPARATION','IN_OPERATION','IN_PROGRESS','DONE'); -- partagé avec spec Paramètres
create type progress_status as enum ('TO_DO','IN_PROGRESS','DONE','DISABLED');
create type sequencing_type as enum ('LINEAR','PARALLEL');
create type block_type as enum ('PR','EMM','ADR','DSI','FORM','TXT','RHP','MULTI_PR','OBJECT');
create type block_state as enum ('REDACTION','VERIFICATION','APPROBATION','VALIDATED');
create type block_validation_action as enum ('CREATE','TO_VERIFICATION','TO_APPROBATION','TO_VALIDATED','RETRY','REJECT','RESET');
create type txt_visibility as enum ('MOBILE_APP','DOCUMENT');
create type navigation_style as enum ('DEFAULT','INFO','WARNING','ERROR','SUCCESS');
create type dsi_signatories_status as enum ('ENABLED','DISABLED','REQUIRED','OPTIONAL');
create type signature_nature as enum ('REALISATION','TECH_CONTROL',
  'BREAKPOINT_INT_1','BREAKPOINT_INT_2','BREAKPOINT_INT_3',
  'CONVOCATION_INT_1','CONVOCATION_INT_2','CONVOCATION_INT_3',
  'BREAKPOINT_EXT_1','BREAKPOINT_EXT_2','BREAKPOINT_EXT_3',
  'CONVOCATION_EXT_1','CONVOCATION_EXT_2','CONVOCATION_EXT_3');
create type signature_state as enum ('SIGNED','WAITING','FREE','NOT_POSSIBLE');
create type contributor_type as enum ('INTERN','EXTERN','NOT_LISTED_INTERN');
create type event_source as enum ('WEB','MOBILE','API');
create type unique_response_mode as enum ('NEW_OR_RESUME','NEW_RESPONSE','RESUME_RESPONSE');
create type flow_assignment_role as enum ('REPORTER','ASSIGNEE','TABLET_1','TABLET_2','TABLET_3','COLLABORATOR');
create type geometry_kind as enum ('POINT','POLYGON','POLYLINE','CIRCLE','MULTI_LINE_STRING');
create type geometry_icon as enum ('DEFAULT','WITHOUT_ICON','TRUCK','SNOWPLOW','WAREHOUSE','ARCHIVE','HARD_HAT','TOOLBOX','ROCKET','CARAVAN');
create type flow_event_type as enum ('CREATE','DELETE','IMPORT_CONTENT_REFERENTIAL','IMPORT_CONTENT_TEMPLATE','RESET_FLOW',
  'DELETE_AND_RE_IMPORT_CONTENT','UPDATE_LIBRARY','DETACH_FBL','ACTIVATE_PHASE','ACTIVATE_STEP','ACTIVATE_FORM',
  'DEACTIVATE_PHASE','DEACTIVATE_STEP','DEACTIVATE_FORM','DEACTIVATE_AND_LINK_NEW_FORM','DETACH_AND_LINK_NEW_FORM',
  'ADD_USER_HIERARCHY_IN_FLOW','DELETE_USER_HIERARCHY_FROM_FLOW','DEACTIVATE_SIGNATURE','SKIP_FILL_RESTRICTION');
create type job_status as enum ('TO_DO','IN_PROGRESS','DONE','FAILED');
```

### 8.3 Tables

```sql
-- FLOW ----------------------------------------------------------------------
create table flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  project_id uuid not null references projects(id) on delete cascade,
  flow_type flow_type not null,
  name text not null check (char_length(name) between 1 and 255),
  description text,
  ref_int text, ref_ext text,
  family_id uuid references label_families(id),          -- nature FLOW
  category_id uuid references project_categories(id),
  custom_status_id uuid not null references custom_statuses(id), -- nature FLOW ; défaut via trigger
  location_activated boolean not null default false,
  location_site text, location_area text, location_local text,
  elementary_system text, functional_marker text,
  technical_object_id uuid references technical_objects(id),
  technical_object_label text, technical_offer text,
  reporter_team_role_id uuid references team_roles(id),
  tablet_1_team_role_id uuid references team_roles(id),
  tablet_2_team_role_id uuid references team_roles(id),
  tablet_3_team_role_id uuid references team_roles(id),
  start_date timestamptz, finish_date timestamptz,                 -- planifiées
  estimated_start_date timestamptz, estimated_end_date timestamptz, -- prévues
  achieved_start_date timestamptz, achieved_end_date timestamptz,   -- réalisées
  bar_color text,
  supervision_intern_1 boolean not null default false, supervision_intern_2 boolean not null default false, supervision_intern_3 boolean not null default false,
  supervision_extern_1 boolean not null default false, supervision_extern_2 boolean not null default false, supervision_extern_3 boolean not null default false,
  internal_supervisor_name_1 text, internal_supervisor_name_2 text, internal_supervisor_name_3 text,
  external_supervisor_name_1 text, external_supervisor_name_2 text, external_supervisor_name_3 text,
  simplified_signature_mode boolean not null default false,
  qr_code_file_id uuid references files(id),
  origin flow_origin not null default 'LOCAL',
  sourced_from_flow_id uuid references flows(id) on delete set null,
  sourced_from_index text,
  executed_from_flow_id uuid references flows(id) on delete set null,
  unlocked boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(), created_by uuid references profiles(id),
  updated_at timestamptz not null default now(), updated_by uuid references profiles(id),
  content_updated_at timestamptz,               -- RN97 : modif. dans le contenu
  deleted_at timestamptz, deleted_by uuid references profiles(id),
  check (start_date is null or finish_date is null or start_date <= finish_date),
  check (estimated_start_date is null or estimated_end_date is null or estimated_start_date <= estimated_end_date),
  check (achieved_start_date is null or achieved_end_date is null or achieved_start_date <= achieved_end_date)
);
create index on flows (project_id) where deleted_at is null;
create index on flows (sourced_from_flow_id);
-- modification_status : vue calculée (documents liés) -> flow_modification_status_v

create table flow_assignees (flow_id uuid references flows(id) on delete cascade,
  team_role_id uuid references team_roles(id), primary key (flow_id, team_role_id));
create table flow_collaborators (                 -- collaborateurs restreints
  flow_id uuid references flows(id) on delete cascade,
  team_role_id uuid references team_roles(id),
  primary key (flow_id, team_role_id));
create table flow_collaborator_hierarchies (       -- >= 1 hiérarchie par collaborateur (contrainte applicative)
  flow_id uuid, team_role_id uuid, hierarchy_family_id uuid references label_families(id),
  primary key (flow_id, team_role_id, hierarchy_family_id),
  foreign key (flow_id, team_role_id) references flow_collaborators on delete cascade);
create table flow_tags (flow_id uuid references flows(id) on delete cascade, tag_id uuid references tags(id), primary key (flow_id, tag_id));
create table flow_secondary_categories (flow_id uuid references flows(id) on delete cascade, category_id uuid references project_categories(id), primary key (flow_id, category_id));
create table flow_content_imports (id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references flows(id) on delete cascade,
  source_flow_id uuid references flows(id) on delete set null,
  kind text not null check (kind in ('REFERENTIAL','TEMPLATE')),
  after_phase_id uuid, imported_at timestamptz not null default now(), imported_by uuid);

create table flow_status_history (id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references flows(id) on delete cascade,
  from_status_id uuid references custom_statuses(id), to_status_id uuid not null references custom_statuses(id),
  comment text, actor_id uuid, actor_team_role_id uuid, source event_source not null,
  occurred_at timestamptz not null default now());
create table flow_events (id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references flows(id) on delete cascade,
  event_type flow_event_type not null, actor_id uuid, source event_source not null default 'WEB',
  phase_id uuid, step_id uuid, comment text, payload jsonb not null default '{}',
  occurred_at timestamptz not null default now());
create index on flow_events (flow_id, occurred_at desc);

create table flow_geometries (id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  flow_id uuid references flows(id) on delete cascade,
  kind geometry_kind not null, label text, icon geometry_icon not null default 'DEFAULT',
  geojson jsonb not null,           -- ou geometry(Geometry,4326) avec PostGIS
  altitude numeric, radius_m numeric, color text, created_at timestamptz default now());
create table project_geojson_layers (id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade, name text not null,
  file_id uuid not null references files(id), color text, visible boolean default true, locked boolean default false,
  created_at timestamptz default now());

-- CONTENU ---------------------------------------------------------------------
create table sequences (id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references flows(id) on delete cascade,
  position int not null, type sequencing_type not null default 'LINEAR',
  unique (flow_id, position) deferrable initially deferred);

create table phases (id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references flows(id) on delete cascade,
  sequence_id uuid references sequences(id) on delete set null,
  position int not null, custom_number text, exclude_numbering boolean not null default false,
  name text not null, description text, additional_comment text,
  hide_title_pdf boolean not null default false,
  disabled boolean not null default false, read_only_on_mobile_app boolean not null default false,
  sequence_type sequencing_type not null default 'LINEAR', mandatory boolean not null default true,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (flow_id, position) deferrable initially deferred);

create table steps (id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references phases(id) on delete restrict,   -- suppression applicative contrôlée
  flow_id uuid not null references flows(id) on delete cascade,
  position int not null, custom_number text, revision_number text, exclude_numbering boolean not null default false,
  name text not null check (char_length(name) between 3 and 255 and name = btrim(name)),
  description text, additional_comment text, hide_title_pdf boolean not null default false,
  disabled boolean not null default false, read_only_on_mobile_app boolean not null default false,
  linked_flow_id uuid references flows(id) on delete restrict,
  validated_at timestamptz, validated_by uuid, validation_source event_source,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (phase_id, position) deferrable initially deferred);
create table phase_tags (phase_id uuid references phases(id) on delete cascade, tag_id uuid references tags(id), primary key (phase_id, tag_id));
create table step_tags  (step_id uuid references steps(id) on delete cascade,  tag_id uuid references tags(id), primary key (step_id, tag_id));
-- attributs perso phase/étape : custom_attribute_values(entity_kind in ('FLOW','PHASE','STEP'), entity_id, …) — spec Paramètres

create table step_navigations (id uuid primary key default gen_random_uuid(),
  step_id uuid not null references steps(id) on delete cascade,
  target_phase_id uuid references phases(id) on delete restrict,
  target_step_id uuid references steps(id) on delete restrict,
  style navigation_style not null default 'DEFAULT', message text, position int not null);

create table step_progress (step_id uuid references steps(id) on delete cascade,
  first_opened_at timestamptz, first_opened_by uuid, has_activity boolean default false,
  primary key (step_id));   -- pastilles gris/bleu/orange/vert

create table step_fill_unlocks (id uuid primary key default gen_random_uuid(),  -- déverrouillage séquencement
  step_id uuid not null references steps(id) on delete cascade, unlocked_by uuid not null, reason text,
  source event_source not null, occurred_at timestamptz default now());

-- BLOCS -----------------------------------------------------------------------
create table blocks (id uuid primary key default gen_random_uuid(),
  step_id uuid not null references steps(id) on delete restrict,
  flow_id uuid not null references flows(id) on delete cascade,
  type block_type not null,
  enabled boolean not null default true,          -- coché sur l'étape (désactivation logique)
  state block_state not null default 'REDACTION',
  revision int,                                   -- n° de révision du flow
  redactor_id uuid, redacted_at timestamptz,
  verifier_id uuid, verified_at timestamptz,
  approver_id uuid, approved_at timestamptz,
  ref_int text, ref_ext text,
  -- PR / TXT
  content_html text, content_json jsonb,
  txt_visibility txt_visibility,                  -- TXT seulement
  -- MULTI_PR
  multi_pr_title_hidden boolean default false,
  multi_pr_requires_status boolean default false,
  multi_pr_requires_signature boolean default false
    check (not multi_pr_requires_signature or multi_pr_requires_status),
  created_at timestamptz default now(), created_by uuid, updated_at timestamptz default now(), updated_by uuid,
  unique (step_id, type));

create table block_state_events (id uuid primary key default gen_random_uuid(),
  block_id uuid not null references blocks(id) on delete cascade,
  action block_validation_action not null, from_state block_state, to_state block_state not null,
  actor_id uuid not null, comment text, source event_source default 'WEB', occurred_at timestamptz default now());

create table block_documents (id uuid primary key default gen_random_uuid(),
  block_id uuid not null references blocks(id) on delete cascade,
  document_id uuid references documents(id) on delete restrict,
  pinned_version_id uuid references document_versions(id),
  frozen_version_id uuid references document_versions(id),   -- figé par signature DSI
  is_attachment boolean not null default false, attachment_file_id uuid references files(id),
  position int not null default 0,
  check (document_id is not null or attachment_file_id is not null));

create table block_emm_items (id uuid primary key default gen_random_uuid(),
  block_id uuid not null references blocks(id) on delete cascade,
  library_emm_id uuid references library_equipments(id) on delete set null,
  name text not null, family_id uuid, reference text, provider text,
  quantity numeric, unit text, consumable boolean not null default false,
  comment text, display_comment boolean not null default false,
  disabled boolean not null default false, position int not null);

create table block_adr_items (id uuid primary key default gen_random_uuid(),
  block_id uuid not null references blocks(id) on delete cascade,
  library_adr_id uuid not null references library_risks(id) on delete restrict,
  major boolean not null default false, disabled boolean not null default false, position int not null);
create table block_adr_specific_parades (id uuid primary key default gen_random_uuid(),
  block_adr_item_id uuid not null references block_adr_items(id) on delete cascade,
  name text not null, pictogram smallint check (pictogram between 1 and 240), file_id uuid references files(id), position int);

create table block_rhp_items (id uuid primary key default gen_random_uuid(),
  block_id uuid not null references blocks(id) on delete cascade,
  function_family_id uuid not null references label_families(id),
  count int not null check (count >= 1), observation text,
  disabled boolean not null default false, position int not null);
create table block_rhp_item_skills (item_id uuid references block_rhp_items(id) on delete cascade,
  skill_family_id uuid references label_families(id), primary key (item_id, skill_family_id));

create table block_dsi_configs (block_id uuid primary key references blocks(id) on delete cascade,
  signatories_status dsi_signatories_status not null default 'REQUIRED',
  signatory_disabled_comment text,
  technical_control boolean not null default false,
  technical_control_step boolean not null default false,
  technical_control_details text,
  aip boolean not null default false, document_required boolean not null default false,
  observation text, document_reference text,
  breakpoint_int_1 boolean default false, breakpoint_int_2 boolean default false, breakpoint_int_3 boolean default false,
  convocation_int_1 boolean default false, convocation_int_2 boolean default false, convocation_int_3 boolean default false,
  breakpoint_ext_1 boolean default false, breakpoint_ext_2 boolean default false, breakpoint_ext_3 boolean default false,
  convocation_ext_1 boolean default false, convocation_ext_2 boolean default false, convocation_ext_3 boolean default false);

create table signatures (id uuid primary key default gen_random_uuid(),
  block_id uuid not null references blocks(id) on delete restrict,   -- interdit la suppression du bloc
  step_id uuid not null references steps(id) on delete restrict,
  flow_id uuid not null references flows(id) on delete restrict,
  nature signature_nature not null, state signature_state not null,
  contributor_type contributor_type not null,
  signatory_user_id uuid references profiles(id),
  first_name text, last_name text, email text, company_name text, profession text,
  signature_image_file_id uuid references files(id),
  signed_at timestamptz not null, comment text,
  sign_with_qr_code boolean not null default false,
  proxied boolean not null default false, proxy_principal_name text, proxy_date timestamptz,
  source event_source not null, hash text, disabled boolean not null default false,
  created_at timestamptz default now(), created_by uuid,
  check (not proxied or (proxy_date is not null and proxy_date <= signed_at)),
  check (contributor_type <> 'INTERN' or signatory_user_id is not null));
create unique index signatures_one_user_per_step on signatures (step_id, signatory_user_id)
  where signatory_user_id is not null and not disabled;              -- R-SIG-2
create table signature_events (id uuid primary key default gen_random_uuid(),
  block_id uuid not null references blocks(id) on delete cascade, signature_id uuid,
  action text not null check (action in ('CREATE','UPDATE','DELETE','DEACTIVATE_NATURE')),
  nature signature_nature, supervisor_name text, actor_id uuid, source event_source, occurred_at timestamptz default now());

create table block_multi_pr_items (id uuid primary key default gen_random_uuid(),
  block_id uuid not null references blocks(id) on delete cascade,
  position int not null, title text, title_auto_filled boolean default true,
  content_html text, content_json jsonb,
  custom_status_id uuid references custom_statuses(id),   -- nature MULTI_PR
  observation text, disabled boolean default false, hide_on_export boolean default false,
  updated_by uuid, updated_at timestamptz default now());
-- trigger : max 50 items / bloc, min 1
create table block_multi_pr_signatures (id uuid primary key default gen_random_uuid(),
  item_id uuid not null references block_multi_pr_items(id) on delete restrict,
  signatory_user_id uuid references profiles(id), signed_at timestamptz not null,
  signature_image_file_id uuid references files(id), source event_source not null);
create table block_multi_pr_events (id uuid primary key default gen_random_uuid(),
  block_id uuid not null references blocks(id) on delete cascade, item_id uuid,
  action text not null, from_status_id uuid, to_status_id uuid, comment text,
  actor_id uuid, source event_source, occurred_at timestamptz default now());

create table form_block_links (id uuid primary key default gen_random_uuid(),
  block_id uuid not null references blocks(id) on delete restrict,
  project_form_id uuid not null references project_forms(id) on delete restrict,
  form_index text, required_response boolean not null default false,
  unique_response boolean not null default false, unique_response_mode unique_response_mode,
  initial_rubric_id uuid, technical_object_id uuid references technical_objects(id),
  additional_comment text, disabled boolean not null default false, position int not null,
  check (unique_response or unique_response_mode is null));
create table form_block_link_rubric_permissions (fbl_id uuid references form_block_links(id) on delete cascade,
  rubric_id uuid not null, readonly boolean not null default false, primary key (fbl_id, rubric_id));
-- form_responses(fbl_id references form_block_links on delete restrict, …) : spec Formulaires

create table block_object_items (id uuid primary key default gen_random_uuid(),
  block_id uuid not null references blocks(id) on delete cascade,
  technical_object_id uuid not null references technical_objects(id), position int not null,
  unique (block_id, technical_object_id));

-- RÉVISIONS / DIAGRAMMES / PLANS / JOBS -------------------------------------------
create table flow_revisions (id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references flows(id) on delete cascade,
  reference text not null, comment text, is_open boolean not null default true, enabled boolean default true,
  opened_at timestamptz default now(), closed_at timestamptz, created_by uuid);
create unique index one_open_revision on flow_revisions (flow_id) where is_open;   -- R-REV-1

create table diagrams (id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null default 'LOCAL' check (kind in ('LOCAL','REFERENTIAL')),
  name text not null, config jsonb not null default '{"nodeDataArray":[],"linkDataArray":[]}',
  read_only boolean default false, document_id uuid references documents(id),
  created_at timestamptz default now(), updated_at timestamptz default now());
create table diagram_flows (diagram_id uuid references diagrams(id) on delete cascade,
  flow_id uuid references flows(id) on delete restrict, primary key (diagram_id, flow_id)); -- RN97 : empêche la suppression

create table plans (id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null, description text, scale text not null check (scale in ('DEFAULT','TEMPORAL','SCHEDULING')));
create table plan_elements (id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete cascade, flow_id uuid references flows(id) on delete cascade,
  team_role_id uuid references team_roles(id), start_at timestamptz, end_at timestamptz, color text);
create table plan_element_links (id uuid primary key default gen_random_uuid(),
  from_element_id uuid references plan_elements(id) on delete cascade,
  to_element_id uuid references plan_elements(id) on delete cascade,
  dependency_type text not null check (dependency_type in ('START_END','END_START')),
  unique (from_element_id, to_element_id));
create table plan_milestones (id uuid primary key default gen_random_uuid(),
  plan_id uuid references plans(id) on delete cascade, name text not null, date date not null, color text, description text);

create table async_jobs (id uuid primary key default gen_random_uuid(),
  kind text not null,            -- EXECUTE_REFERENTIAL, IMPORT_REFERENTIAL, DUPLICATE_FLOW, DIAGRAM_EXECUTE…
  project_id uuid, requested_by uuid not null, params jsonb not null, status job_status not null default 'TO_DO',
  result jsonb, error text, created_at timestamptz default now(), finished_at timestamptz);
```

### 8.4 Triggers et fonctions à prévoir

- `flows_default_status` : à l'insertion, si `custom_status_id` est nul, prendre le statut par défaut de nature FLOW compatible avec la famille.
- `flows_status_history` : à chaque changement de `custom_status_id`, insérer une ligne `flow_status_history`.
- `touch_flow_content` : toute écriture sur phases, steps, blocks ou éléments met à jour `flows.content_updated_at` et `updated_by` (RN97, R2.20).
- `guard_signatures` : refuser le DELETE de phase, step ou block si une signature (DSI ou MultiPR) existe dans le périmètre (R-SIG-8). Message applicatif : « Des signatures sont présentes, la suppression est impossible ».
- `guard_block_editable` : refuser l'UPDATE du contenu ou des éléments d'un bloc dont `state <> 'REDACTION'` (R-BL-3).
- `guard_flow_locked` : refuser l'édition du contenu si `origin = 'DERIVED_FROM_STANDARD' and not unlocked`, ou si `flow_modification_status_v = 'DISABLED'`.
- `freeze_dsi_documents` : après INSERT sur `signatures`, renseigner `block_documents.frozen_version_id` avec la version courante pour les blocs DSI de l'étape (R-DSI-4).
- `block_role_separation` : dans la RPC de transition d'état, vérifier les conflits rédacteur / vérificateur / approbateur (R-BL-5).
- RPC `execute_referential(flow_id, copies, options)` / `import_referentials(...)` : créent un `async_jobs` traité par Edge Function ou pg-queue, avec copie profonde (phases, étapes, blocs, éléments, séquences ; sans signatures ni réponses ; blocs remis en REDACTION selon les options).
- RLS : toutes les tables filtrent par `organization_id` / `project_id` via l'appartenance team_role, et les droits Lecture/Écriture via le rôle d'entité (spec Droits).

---

## 9. Incertitudes

1. **Kanban** : non implémenté dans Siteflow (placeholder). Colonnes et règles proposées en §3.2 (INFÉRÉ) à valider avec le métier.
2. **Vue temporelle des signatures** : aucune clé i18n dédiée trouvée ; comportement à capturer en usage réel (captures d'écran ou trafic réseau).
3. **Mode simplifié du bloc Contrôle** : effet exact (natures masquées ? un seul signataire ?) non observé ; seules l'option et ses garde-fous le sont.
4. **Signature « En attente » (WAITING)** et **« Conflit »** : déclencheurs exacts inconnus (préparation de signature, synchronisation hors ligne ?).
5. **`technical_object` du flow** : le payload envoie une chaîne libre (`technicalObject`), alors qu'ailleurs on voit une FK `technicalObjectUuidEntity`. Faut-il un texte, une FK, ou les deux ?
6. **Catégories secondaires** du flow : filtre observé, champ de saisie non localisé.
7. **Statuts système hérités** (`flowStatus.*` : Vide, Rédaction, À disposition…) : probablement legacy ; vérifier s'ils sont encore calculés ou affichés quelque part.
8. **Champs réglementation** (RCCM / CODAP / CODETI, AIP, EIPS, ESPN, Qualité) : présents en i18n, absents du mappeur actuel ; probablement legacy.
9. **Emplacement des surveillants applicables** (onglet Options ou Affectation) et règle d'édition `canEditSupervision` (probablement interdite si des signatures de supervision existent).
10. **Activation de l'option « Signature obligatoire » MultiPR** : la tooltip « activée uniquement quand “Statut obligatoire” est active » s'applique-t-elle à la signature ou à un autre toggle ? Hypothèse retenue : signature ⇒ statut.
11. **État de bloc `Active=5`** de l'enum FE : sans équivalent API (`VALIDE` = 4). Supposé technique.
12. **Bloc Document (8)** : traité comme sous-section des blocs PR/TXT/DSI/MultiPR, pas comme bloc activable ; il n'apparaît pas dans les booléens de l'étape (`adr, emm, rhp, dsi, form, txt, pr, multiPr, blocObject`).
13. **Copier/coller de blocs** : règle de fusion ou remplacement, et contrainte d'état du bloc cible, non observées.
14. **Révisions** : impact précis sur la numérotation (`revisionNodeOrder`) et sur le champ `revision` des blocs, déduit seulement des libellés.
15. **Pastilles d'avancement côté WebApp** : la logique gris/bleu/orange/vert est documentée pour la MobileApp. Sur la WebApp, on n'observe que TO_DO / IN_PROGRESS / DONE / DISABLED.
16. **Limites de taille** (contenu de bloc « trop grand », observation MultiPR) : valeurs non trouvées. Proposition : 1 Mo HTML par bloc, 4 000 caractères par observation.
17. **Types créables par type d'entité** (R-TYPE-2) et règles de duplication inter-entités (projet → modèle) : à confirmer.
18. **PGAC / EpsilonOut** : très spécifique EDF (doublons, import CSV GESOP, valeurs exportables). Exclu du périmètre ; conserver éventuellement un JSONB `flow_pgac_details`.
19. **Rappels (scheduling)** : modèle de récurrence et génération de tâches à détailler dans la spec « Tâches planifiées » ; ici seule la relation au flow est posée.
