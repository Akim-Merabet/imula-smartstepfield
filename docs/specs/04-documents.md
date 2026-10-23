# Spec fonctionnelle 04 — Documents (bibliothèque, module Documents, suivi des versions, dossier de clôture, listes, génération PDF)

> Reconstruction fonctionnelle de l'application de référence (build FE 2.23.6, bundle du 22 oct. 2026) vers Next.js 16 + shadcn + Supabase.
> Ce document décrit des **comportements, champs, enums et règles**. Il ne reprend ni code ni marque. Les noms d'API cités servent de
> **référence de correspondance** (mapping), pas de modèle à copier.

## 0. Conventions

- **[OBS]** = observé : clé i18n (`document.addModal.label.name`), enum du bundle (`Prel=1 Bpo=2…`), DTO / mapper du bundle (nom de propriété API, ex. `natureFile`), article d'aide (`HC:<titre>`), note de version (`RN:<version>`).
- **[INF]** = inféré (déduction raisonnable à valider en recette).
- Noms techniques proposés en `snake_case` ; entre parenthèses le nom API observé quand il diffère.
- Libellés FR = valeurs de `i18n-fr.json`. Le genre inclusif (« collaborateur.trice ») est celui de l'app.
- Chunks du bundle principalement exploités : `chunk-QCSXR6AA` (mapper document), `chunk-LDUCS5D5` (service des versions, visa, contributeurs, diffusion, retour client), `chunk-SZ5PH52S` (modale document : onglets, contenu, suivi, popovers, menu d'actions de version), `chunk-K5L6FQMZ` (table du module Documents), `chunk-4J6Z26QQ` / `chunk-ZECV3454` (dossier de clôture), `chunk-HCYDDSAJ` (enums, matrice de permissions, mappers communs), `chunk-KXNV7A55` (limites de taille).
- Renvois : spec 00 (shell : cloche, panneau d'imports, tables), spec 01 (§6.6 familles, §6.10 modèles de dossier, §6.12 trames, §6.13 configuration de suivi, §6.1 configuration documentaire du compte), spec 02 (§5.11 liens bloc ↔ document, R-DSI-4 gel des indices), spec 03 (§8.3 document de formulaire).

---

## 1. Modèle conceptuel

```
Bibliothèque (organisation, filtrée par compte « Applicabilité »)
  └─ Document externe (PDF avec version | PDF sans version)
        └─ Versions (lignes de l'onglet Suivi)

Entité (projet)
  ├─ Document externe local / importé de la bibliothèque / copié d'une entité standard
  ├─ Document généré (source Flow | Formulaire | Module)
  │     └─ Versions (indice + état), contributeurs, diffusion, retour client, PDF figé
  ├─ Dossier de clôture (document généré de nature RFI)
  │     └─ Sections ordonnées (Document | Compte rendu | Certificat | Référence | Retour client | Document volumineux | Dossier de clôture)
  │            └─ éléments (versions de documents, moyens, …)
  └─ Listes (de moyens / de risques) — sources des documents « Liste de moyens / risques »
```

[OBS `HC:Structural-and-business-objects` §Documents and document versions] : 2 grandes familles — **document externe** (un PDF ou un jeu de PDF fourni par l'utilisateur) et **document généré** (PDF produit par l'application ; le dossier de clôture en est un sous-type). Les documents générés (y compris dossiers de clôture) ont **toujours** un circuit de validation et des versions ; les documents externes **éventuellement**. « A document version is uniquely identified by an index and a state. It might have contributors, distribution properties, review feedback. »

---

## 2. Typologie

### 2.1 Nature du document (`nature`, API `natureFile`) [OBS enum `Pr=1 … Object=22`, `document.nature.*`, `document.addModal.type.label.*` / `.comment.*`]

| # | Code proposé | API | Source | Libellé type (modale) | Description (modale) | Icône [OBS] |
|---|---|---|---|---|---|---|
| 1 | `pr` | PR | Flow | Document Instructions | Contenu d'instructions venant d'un flow | book-open |
| 2 | `emm` | EMM | Flow | Document Moyens | Tableau de moyens venant d'un flow | tools |
| 3 | `adr` | ADR | Flow | Document Risques | Tableau de risques venant d'un flow | exclamation-triangle |
| 4 | `dsi` | DSI | Flow | Document Contrôles | Tableau de contrôles venant d'un flow | file-signature |
| 18 | `multi_pr` | MULTIPR | Flow | Document Instructions multiples | Contenu d'instructions multiples venant d'un flow | check-square |
| 12 | `flow_form` | FFORM | Flow | Document Formulaires | Contenu de formulaires venant d'un flow | list-alt |
| 22 | `object` | OBJECT | Flow | Document Objets | Tableau d'objets venant d'un flow | object-group |
| 10 | `project_form` | PFORM | Formulaire | Formulaire unique venant du projet | Contenu d'un formulaire venant d'un projet | folder-open |
| 13 | `block_form` | BFORM | Formulaire | Formulaire unique venant du flow | Contenu d'un formulaire venant d'un flow | sitemap |
| 19 | `multi_flow_form` | MULTIFLOWFORM | Formulaire | Formulaire unique venant d'un ou plusieurs flows | Contenu d'un formulaire venant d'un ou plusieurs flows | sitemap |
| 6 | `lfa` | LFA | Module | Liste de flows | Tableau de flows venant d'un projet | sitemap |
| 5 | `lda` | LDA | Module | Liste des documents | Tableau de documents venant d'un projet | file-invoice |
| 16 / 17 | `list_adr` / `list_adr_flow` | LISTADR / LISTADRFLOW | Module | Liste de risques | Tableau de risques venant d'une liste de risque ou bien de plusieurs flows | exclamation-triangle |
| 14 / 15 | `list_emm` / `list_emm_flow` | LISTEMM / LISTEMMFLOW | Module | Liste de moyens | Tableau de moyens venant d'une liste de moyen ou bien de plusieurs flows | tools |
| 7 | `lca` | LCA | Module | Liste de collaborateurs | Tableau de collaborateurs venant d'un projet | user-friends |
| 20 | `field_feedback` | FIELDFEEDBACK | Module | Remontées terrain | Contenu d'un ou plusieurs formulaires venant du projet ou d'un ou plusieurs flows | comments |
| 21 | `diagram` | DIAGRAM | Module | Diagramme | Export de la vue diagramme des flows | project-diagram |
| 8 | `pdf_versioned` | PROJECT | Externe | PDF avec version | Document PDF avec une notion d'indice et d'état | file-upload |
| 9 | `pdf_unversioned` | AUTRE | Externe | PDF sans version | Document PDF sans une notion d'indice et d'état | file-pdf |
| 11 | `rfi` | RFI | (dossier de clôture) | Dossier de clôture | — | archive |

Règles [OBS bundle `un` / `DocumentNatureEnum`] :
- `list_emm` ↔ `list_emm_flow` (et `list_adr` ↔ `list_adr_flow`) ne sont **pas choisis directement** : l'utilisateur choisit « Liste de moyens » puis « Générer un document listant les moyens à partir » **d'une liste** (`list_emm`) **ou de plusieurs flows** (`list_emm_flow`) — bascule `switchDocNature` [OBS `chunk-QCSXR6AA`, `document.addModal.field.emmAdrList` / `someFlows`].
- Type « Diagramme » proposé seulement si l'organisation a le diagramme activé et si le type d'entité le permet (`moduleTypesBuilder`) [OBS]. RN97 : « Une entité peut maintenant avoir plusieurs documents diagramme, à hauteur d'un document par diagramme ».
- Bibliothèque : seules les natures `pdf_versioned` et `pdf_unversioned` existent (`convertToLibraryApiValue`) [OBS].
- Catégorisation HC équivalente [OBS `HC:Structural…`] : FLOW_INSTRUCTION, FLOW_EQUIPMENT, FLOW_RISK, FLOW_CHECKS, FLOW_FORM, FLOW_MULTIPLE_INSTRUCTION ; FORM_PROJECT, FORM_ONE_FLOW, FORM_MANY_FLOWS ; MODULE_FLOWS, MODULE_RISKS, MODULE_EQUIPMENTS, MODULE_DOCUMENTS, MODULE_COLLABORATORS, MODULE_FEEDBACKS. (L'objet « Document Objets » et le diagramme sont postérieurs à cet article.)

### 2.2 Source (`source`, API `documentSource`) [OBS enum `Flows=1 Forms=2 Modules=3 Externs=4`, `document.addModal.source.*`]

| Code | Libellé | Commentaire affiché |
|---|---|---|
| `flow` | Depuis un flow | Documents regroupant des blocs depuis un flow |
| `form` | Depuis un formulaire | Documents regroupant des réponses depuis un formulaire |
| `module` | Depuis un module | Documents regroupant des éléments depuis un module |
| `extern` | Depuis l'ordinateur | Document PDF non généré depuis Siteflow à intégrer dans l'application |

Choix en deux temps dans l'onglet Général : **Source** puis **Type** (liste filtrée par source). Source et type sont figés après création [INF : aucun mapper de mise à jour ne transporte `documentSource` ; `natureFile` est renvoyé mais seulement pour bascule liste ↔ multi-flow].

### 2.3 Provenance / origine [OBS enum `Library=1 LibraryCreated=2 Local=3 ProvenanceLibrary=4 ProvenanceReferential=5 Referential=6 ReferentialCreated=7`, `documentProvenance.*`]

| Valeur bundle | Sens [INF] | Origine HC | Libellé filtre / propriété | Pastille |
|---|---|---|---|---|
| LibraryCreated | créé dans la bibliothèque | — | Bibliothèque | — |
| Local | créé dans l'entité | LOCAL | Entité | — |
| ProvenanceLibrary | importé de la bibliothèque dans l'entité | IMPORTED_FROM_LIBRARY | Bibliothèque | « B » |
| ProvenanceReferential | copié depuis une entité standard (référentiel) avec un flow référentiel | DERIVED_FROM_STANDARD | Référentiel | « R » (+ cadenas si `unlocked`) |
| Library / Referential / ReferentialCreated | variantes historiques (pivot côté serveur) | — | Bibliothèque / Référentiel | — |

- Filtre « Provenance » de l'entité : Entité, Bibliothèque, Référentiel (`getValues = Local, ProvenanceLibrary, ProvenanceReferential`) [OBS].
- Proposition : deux colonnes — `scope` (`library` | `project`) et `origin` (`local` | `imported_from_library` | `derived_from_standard`) ; `library_source_id` (document de bibliothèque d'origine) et `standard_source_id` (document d'origine dans l'entité standard).
- Document importé de la bibliothèque : **aucune action de suivi** possible dans l'entité (« Aucune action n'est possible quand le document provient de la bibliothèque » `document.addModal.toaster.libraryActionFail`) ; idem document référentiel tant que le flow référentiel est bloqué (« Aucune action n'est possible quand le flow référentiel est bloqué » `referentialActionFail`) [OBS `checkActionAuthority` : `disabledActions` + provenance].

### 2.4 Disponibilité des types par type de flow [OBS `displayedDocument`, `flowTypeByDocNatureAndProjectNature`]

Types de document de flow proposés selon le type du flow (création depuis le flow, `flows.documents.name.*`) :

| Type de flow | Natures disponibles |
|---|---|
| Spécifique, Référentiel | pr, emm, adr, dsi, flow_form, multi_pr, object |
| Générique, Référentiel générique | pr, emm, adr |
| Chapeau (Groupe), Référentiel chapeau | pr, dsi, flow_form |
| Formulaire, Référentiel formulaire | flow_form |

Flows sélectionnables dans « Générer un document depuis le flow » (entité standard = référentiel / sinon) :

| Nature | Entité « projet » | Entité référentielle |
|---|---|---|
| pr | Spécifique, Chapeau (sauf entité « projet référentiel »), Générique | Référentiel, Référentiel chapeau, Référentiel générique |
| dsi | Spécifique, Chapeau, Générique | Référentiel, Référentiel chapeau |
| adr, emm | Spécifique, Générique | Référentiel, Référentiel chapeau |
| multi_pr, object | Spécifique | Référentiel |
| block_form | Spécifique, Chapeau, Formulaire | Référentiel, Réf. chapeau, Réf. formulaire |
| flow_form | Spécifique, Formulaire, Chapeau | Référentiel, Réf. chapeau, Réf. formulaire |
| lfa, lda | Spécifique, Chapeau, Générique, Formulaire | toutes variantes référentielles |
| list_adr_flow, list_emm_flow | Spécifique, Générique | Référentiel, Réf. générique |
| multi_flow_form | Spécifique, Chapeau, Formulaire | Référentiel, Réf. chapeau, Réf. formulaire |

### 2.5 Unicité [OBS `mapToControlUniqueDoc`, toasts]

- Un même flow ne peut alimenter **qu'un document d'un même type** : « Sélection de ce flow impossible — Flow déjà sélectionné pour le même type de document » ; idem formulaire (« Formulaire déjà sélectionné… »), diagramme (« Diagramme déjà sélectionné… »), réponse (« Impossible d'assigner le même réponse sur 2 documents du même type » `global.errorToaster.document.checkUnique.response`). Contrôle serveur sur (nature, flow | formulaire | diagramme | réponse, entité).
- Proposition SQL : index uniques partiels `(project_id, nature, linked_flow_id)` pour les natures de flow, `(project_id, nature, linked_form_id)`, `(project_id, linked_diagram_id)`, `(project_id, nature, linked_response_id)`.

### 2.6 Onglets de la modale selon la nature [OBS `nn.displayedTabs`, enum `General / CustomFields / Content / Follow / Options`, `document.addModal.tabs.*`]

| Nature | Général | Attribut | Contenu | Suivi | Options |
|---|---|---|---|---|---|
| `pdf_versioned` (PDF avec version) | ✔ | ✔ | — | ✔ | ✔ |
| `pdf_unversioned` (PDF sans version) | ✔ | ✔ | ✔ (fichiers) | — | — |
| toutes les natures générées | ✔ | ✔ | ✔ | ✔ | ✔ |
| `rfi` (dossier de clôture, modale dédiée) | ✔ | ✔ | (sections dans la liste) | ✔ | ✔ |

Icônes d'onglet [OBS] : Suivi `file-signature`, Options `wrench`, Contenu `box`. L'onglet Suivi n'est accessible qu'après une première sauvegarde (passage par « Sauvegarder » forcé : `checkTabFollowSelection`) [OBS dossier de clôture ; INF identique pour les documents].

---

## 3. Champs du document

### 3.1 Onglet Général [OBS mapper `mapToCreateProjectDocRequest`, `mapToCreateLibDocRequest`, `mapToUpdateRequest`, composant `sfx-document-general-tab`]

| Champ | API | Type | Obl. | Règles | Libellé FR |
|---|---|---|---|---|---|
| source | documentSource | enum §2.2 | oui (entité) | figé après création [INF] | Source |
| nature | natureFile | enum §2.1 | oui | figé (sauf bascule liste/multi-flow) | Type |
| account_id | applicabilityUuidEntity | FK comptes | oui (bibliothèque seulement) | | Applicabilité |
| family_id | labelFamilyUuidEntity | FK `label_families` (nature document, **enfant**) | oui | porte la configuration de suivi et les options de retour client | Famille |
| name | name | text 3–255 | oui | | Nom |
| ref_int | refInt | text 3–255 | non | **générée automatiquement** si une règle de référence nature Document existe (placeholder « Générée automatiquement depuis le module « Références » ») | Référence interne |
| ref_ext | refExt | text 3–255 | non | | Référence externe |
| start_index | index | text 1–16 | non | absent pour `pdf_unversioned` ; doit respecter le format d'indice (« Le format d'indice n'est pas conforme ») ; éditable seulement s'il n'existe **qu'une version, à l'état PREL** [OBS RN110] | Premier indice du document |
| category_id | categoryUuidEntity (`labelFamilyProject`) | FK catégorie Document de l'entité | non | « Permet en plus de regrouper les documents par catégorie dans un document « Liste de documents » » | Catégorie Liste des documents |
| closing_category_id | categorySecondaryUuidEntity (`labelFamilyProjectSecondary`) | FK catégorie | non | « Permet en plus de cocher automatiquement les documents par catégorie dans une section de « Dossier de clôture » » | Catégorie Dossier de clôture |
| folder_template_id | folderRefUuidEntity | FK modèle de dossier | non (RFI seulement) | « Utilise un modèle de dossier de clôture avec des sections prédéfinies » ; « Pour créer ou modifier un modèle : Page Paramètres / Module Dossiers » | Modèle de dossier |

- En-tête de modale : « Créer un nouveau document » / « Edition du document {{familyName}} - {{docName}} » ; navigation « Document précédent / suivant » ; garde « Les modifications seront perdues si vous ne sauvegardez pas » [OBS `document.addModal.titles.*`, `tooltip.previousDocument`].
- Création réussie : « Document créé avec succès » ; erreurs « Création impossible », « Le format d'indice n'est pas conforme » [OBS `createDocErrorKeys`].
- Mise à jour : « Modification(s) enregistrée(s) avec succès » ; erreurs mappées [OBS `updateDocErrorKeys`] : `noDocumentSelected` → « Merci d'ajouter du contenu au document », `recursionLdaError` → « Un document de type “Liste de documents” est déjà sélectionné dans la liste en cours, impossible de réaliser l'action », `passwordProtectedPdf` → « Le fichier est verrouillé avec un mot de passe, import impossible », `invalidIndex`, `uploadFileFail` → « L'import du fichier a échoué ».

### 3.2 Onglet Attribut [OBS `document.addModal.tabs.customField`, `loadCustomFieldFail`]

Valeurs des attributs personnalisés de nature **Document** (spec 01 : `custom_fields.nature = 'document'`, valeurs dans `custom_field_values` avec `business_class = 'document'`). Attributs filtrés par famille selon `link_type`. Vide si pas de famille. API v2 : lecture et mise à jour en masse des attributs de documents [OBS `RN:API V2 2025` `/documents/custom-attributes/bulk-update`].

### 3.3 Onglet Options [OBS `sfx-document-options-tab`]

| Champ | API | Visible pour | Éditable | Libellé |
|---|---|---|---|---|
| language_1 / language_2 | exportLanguageOne / exportLanguageTwo | toutes sauf externes | seulement à l'état **PREL** ; Langue 2 ≠ Langue 1 et exige Langue 1 (si Langue 1 = Langue 2, Langue 2 → Aucune) | « Modifier la langue par défaut du document venant du compte ou de l'entité » : Langue 1, Langue 2 |
| linked_flow_id | refFlow (`linkedFlow`) | `multi_flow_form`, `rfi`, natures Module | seulement à l'état PREL ; bascule « Récupérer les informations d'un flow afin de renseigner un ou plusieurs champs spécifiques de vos trames PDF » | Flow lié |
| client_cover_page | clientCoverPage | toutes sauf externes | seulement aux états PREL ou BPO | Page de garde client |
| highlight_changes | revisionOnMainIndices | source Flow et nature ∈ {pr, multi_pr, dsi, emm, adr, object} | toujours | Mettre en évidence les changements entre les indices successifs |
| index_format | natureIndice | (historique) | option masquée depuis RN110 | Type d'indice / « Modifier le type d'indice par défaut du document venant du compte » |

Défauts [INF, cohérent spec 01 §6.1] : langues = langues d'export de l'entité si renseignées, sinon langues documentaires du compte (`accounts.doc_language_1/2`) ; format d'indice = `accounts.doc_index_format`.

### 3.4 Onglet Contenu — par nature

#### 3.4.1 Documents de flow (pr, emm, adr, dsi, multi_pr, flow_form, object) [OBS `sfx-doc-flow-content`, `sfx-doc-linked-pages`, `sfx-doc-linked-content`]

Bloc « Générer un document depuis le flow » : **Flow** obligatoire (« Cliquez pour sélectionner un flow » ; « Veuillez d'abord sélectionner un flow avant de continuer ») filtré selon §2.4.

| Champ | API | Natures | Libellé |
|---|---|---|---|
| preamble | preamble | [INF] pr, multi_pr | Préambule (« Préambule si nécessaire ») |
| subject | subject | [INF] idem | Objet du document |
| glossary | glossary | [INF] idem | Glossaire |
| form_content_location | formContentLocation | natures de flow ; dsi et multi_pr : Aucun / En annexe seulement [OBS `itemsResolver`] ; autres : Aucun / Dans le contenu / En annexe | Afficher les formulaires : |
| include_form_references | includeFormReferences | si « Dans le contenu » | Référence(s) de réponse(s) de formulaire(s) dans le contenu |
| include_form_doc | includeFormDoc | si « En annexe » | Formulaire(s) vierge(s) lié(s) en annexe (tooltip : « Ajout du ou des formulaires vierges appelés dans le bloc Formulaire du flow, sans doublon et dans l'ordre de liaison ») |
| include_response_doc | includeResponseDoc | si « En annexe » | Réponse(s) de formulaire liés en annexe (info : « Le formulaire vierge n'apparaîtra plus dans l'annexe du document si une réponse est affichée en annexe. ») |
| include_empty_option | includeEmptyOption | si réponses en annexe ; flow_form | Afficher le(s) choix non renseigné(s) des réponses — décoché : questions sans réponse exclues du PDF [OBS RN2.13 : « une question est considérée comme non renseignée lorsqu'elle ne contient aucune réponse utilisateur, aucune valeur calculée, aucun commentaire et aucune pièce jointe »] |
| selected_attribute_ids | linkedTechnicalObjectAttributesUuidEntities | object | Sélectionner les attributs à afficher — **3 maximum** (`maxCustomAttributes=3`) ; « Seuls les attributs d'objet appartenant à la famille “Défaut” peuvent être affichés dans le document Objet » |

« avec les pages suivantes » (`linkedPages` : pr, emm, adr, dsi, flow_form, multi_pr, object) :

| Champ | API | Natures | Libellé |
|---|---|---|---|
| hide_cover_page | hideCoverPage | toutes | « Masquer la page de garde et de suivi des évolutions » (flow_form : « Masquer la page de garde ») |
| include_contributors_page | includeContributorsPage | pr, dsi, multi_pr, adr, emm | Afficher la page de suivi des contributeurs |
| include_annex_interlayer | includeAnnexeInterlayer | pr, dsi, multi_pr, object | Intercalaires entre chaque annexe |
| hide_index_column | hideIndexColumn | [INF] dsi | Masquer le contenu de la colonne indice |

« avec les contenus suivants » (`sfx-doc-linked-content`) :

| Nature | Champs (API → libellé) |
|---|---|
| object | includeConformityCertificates → Afficher les certificats de conformité en annexe |
| pr | showAnnexes → Document(s) « PDF sans version » lié(s) en annexe ; includeControlBlock → Bloc(s) Contrôle(s) dans le contenu ; includePhaseNumber → Afficher les numéros de phase et étape dans les titres ; si flow chapeau : includeEmmDoc → Bloc(s) Moyen(s) en annexe, includeRhContent → Bloc(s) Equipe(s) dans le contenu |
| dsi | includeRefForm → Référence(s) de formulaire(s) dans la colonne « Documents applicables » ; includeFormReferences → Référence(s) de réponse(s) de formulaire(s) dans la colonne « Observations » ; navigationConditions → Redirection(s) du flow dans le tableau ; si flow chapeau : showLinkedEntitiesReferences → Afficher les références des documents, des formulaires et réponses associées des flows liés |
| flow_form (si réponses ≠ Aucune) | includeSkeletonForm → Afficher le(s) formulaire(s) vierge(s) par défaut avant les réponses ; includeEmptyOption → Afficher le(s) choix non renseigné(s) des réponses |
| multi_pr | hideMultiPrTitleOnSummary → Masquer les titres des blocs instructions multiples dans le sommaire ; showAnnexes → PDF sans version en annexe ; includeEmmDoc → Bloc(s) Moyen(s) en annexe ; includeRhContent → Bloc(s) Equipe(s) dans le contenu ; includeControlBlock → Bloc(s) Contrôle(s) dans le contenu ; includeInstructionBlock → Bloc(s) Instruction(s) dans le contenu ; includeTxtContent → Bloc(s) Texte(s) dans le contenu ; includeMultiPrObs → Observation(s) dans le contenu |
| tout document dont le flow est chapeau | childRendered → Afficher les documents des flows enfants en annexe [OBS RN105] |

Règles d'annexes des documents liés aux blocs [OBS `flowApp.documentFlow.*Tooltip`] :
- PDF **sans version** lié à un bloc Instruction → visible **en annexe** du document Instructions.
- PDF **avec version** lié à un bloc Instruction → visible **uniquement par renvoi** (référence interne) dans le corps du texte.
- PDF lié à un bloc Contrôle → visible uniquement par renvoi dans la colonne « Référence document applicable ».
- Document volumineux (> 20 Mo) : jamais en annexe ni sur la MobileApp (« Non visible depuis la MobileApp et en annexe de document »).

#### 3.4.2 Documents de formulaire (project_form, block_form, multi_flow_form) [OBS `sfx-doc-form-content`, enum `a: All=1 Some=2 None=3`, `ResponsesStrategyEnum ALL/SELECTED/NONE`]

| Champ | API | Règles | Libellé |
|---|---|---|---|
| linked_form_id | refUuideForm | obligatoire (« Cliquez pour sélectionner un formulaire ») | Générer un document depuis le formulaire |
| linked_flow_id | refFlow | block_form : obligatoire | Générer un document depuis le flow |
| selected_flow_ids | selectedElementsUuidEntities | multi_flow_form : ≥ 1 (« Au moins un flow doit être sélectionné ») | Depuis le(s) flow(s) suivant(s) : |
| responses_strategy | responsesStrategy | project_form : Toutes les réponses / Une réponse en particulier / Uniquement le(s) formulaire(s) vierge(s) ; flow_form et block_form : Toutes / Vierges [OBS `projectFormSelectItems`, `flowFormSelectItems`] | en affichant : |
| linked_response_id / selected_response_ids | refUuideResponse / refResponsesList | si « Une réponse en particulier » (« Veuillez sélectionner les réponses ») | Réponse |
| hide_cover_page | hideCoverPage | | Masquer la page de garde |
| include_skeleton_form | includeSkeletonForm | | Afficher le(s) formulaire(s) vierge(s) |
| include_empty_option | includeEmptyOption | | Afficher le(s) choix non renseigné(s) des réponses |

Correspondance HC [OBS] : FORM_PROJECT / FORM_ONE_FLOW / FORM_MANY_FLOWS × contentIncluded ALL_RESPONSES / SELECTED_RESPONSE / EMPTY_FORMS_ONLY. Messages : « Formulaire sans réponses — Veuillez d'abord ajouter des réponses à votre formulaire avant de continuer » ; « Liste de réponses vide — Veuillez répondre au formulaire pour visualiser le document » ; « Aucune réponse disponible ». Création depuis le module Formulaires : popover « Générer un document » (spec 03 §8.3).

#### 3.4.3 Documents de module [OBS `sfx-doc-*-content`]

| Nature | Contenu | Règles / libellés |
|---|---|---|
| lfa | Table de sélection de flows (filtres du module Flows : famille, catégorie, statut, type, affectation, date) | ≥ 1 flow ; requête de sélection mémorisée (`pageFlowRequest`) [OBS] ; options « Masquer la page de garde » |
| lda | Table de sélection de documents de l'entité (filtres : famille, catégorie 1, catégorie 2, provenance, état, flow, date) | ≥ 1 document (« Au moins un document doit être sélectionné ») ; pas d'autre LDA dans la sélection (récursion interdite) ; options : « Masquer le contenu des colonnes liées aux indices » (`ldaHideIndexColumn`), « Afficher les informations des documents source flow liées » (`includeLinkedDocumentsInfos`) ; « Dossier compressé » = export ZIP des documents sélectionnés (« Exporter les documents sélectionnés dans un dossier compressé ») |
| list_emm / list_adr | Choix d'**une liste** de l'entité (« Cliquez pour sélectionner une liste ») | §5.12 |
| list_emm_flow / list_adr_flow | Sélection de **plusieurs flows** | ≥ 1 flow |
| lca | « Générer un document listant … » : Tou.te.s les collaborateur.trice.s de l'entité — peu importe les critères **ou** Afficher certaines compétences (« Veuillez sélectionner les compétences ») | `responsesStrategy` réutilisé (All/Some) ; « Afficher les fiches récapitulatives des compétences en annexe » (`showSkillsSummary`) ; erreur « Collaborateur n'a aucune compétence ajoutée » ; trame requise « collaborateur - récapitulatif des compétences » |
| field_feedback | Formulaires/réponses du projet ou d'un ou plusieurs flows | options page de garde, vierges, choix non renseignés |
| diagram | Choix d'un diagramme (« Veuillez d'abord sélectionner un diagramme avant de continuer ») | l'image du diagramme est rendue **côté client** puis envoyée avant génération ; sinon « Générer le document avant de le diffuser » [OBS `saveDiagramImageAndExecuteAction`, `diagramDocumentImageNotSet`] |

#### 3.4.4 PDF sans version (pdf_unversioned) — onglet Contenu [OBS `sfx-document-content-tab`, `ac` / `ic`]

- Liste de fichiers PDF (« Fichier (.pdf) », « Choisir un fichier ») ; plusieurs fichiers ; « {{ filesCount }} fichier(s) est/sont sélectionné(s) » ; « Veuillez cliquer sur "Sauvegarder" pour télécharger et ajouter vos fichiers au document ».
- Suppression d'un fichier : « Êtes-vous certain.e de vouloir supprimer ce document ? » ; refus si dernier : « Il faut garder au moins un document dans la liste ».
- Pas d'indice ni d'état ; colonne État « Sans état » [INF : version technique unique d'état `none`].

#### 3.4.5 PDF avec version (pdf_versioned)

Pas d'onglet Contenu : chaque **indice** porte son fichier, déposé depuis l'onglet Suivi (icône d'import sur la ligne en attente de fichier ; popover « Ajout du fichier sur l'indice » / « Edition du fichier sur l'indice ») [OBS `UploadFile`, `document.addModal.popover.title.fileIndex`].

### 3.5 Propriétés (lecture) [OBS `dashboardDocuments.dialogs.properties.*`]

Popup « Propriétés du document » : Nom, Type, Source, Famille, Applicabilité, Provenance, Référence interne, Référence externe, Etat, « Date de création : … par … », « Dernière modification : … par … ».

---

## 4. Versions et suivi

### 4.1 Champs d'une version (ligne de l'onglet Suivi) [OBS mapper `f.convertFromApiValue` `chunk-LDUCS5D5`]

| Champ | API | Type | Libellé / usage |
|---|---|---|---|
| index_label | indice | text | Indice |
| seq | version | int | ordre technique |
| state | etat | enum §4.3.1 | état documentaire |
| step | status | enum §4.3.2 | étape attendue / action suivante |
| visa | visa | enum §4.3.3 | retour enregistré sur la ligne |
| next_visa_label | nextVisa | text calculé | colonne « Retour » (« --- » si vide) |
| action_key | customWording.actionKey | enum §4.3.4 | pastille d'état (valeur, tooltip, couleur, icône issus de la configuration de suivi de la famille) |
| is_last | last | bool | seule la dernière ligne porte les actions |
| diffusion_date / diffusion_comment | diffusionDate (ou dynamicDate) / commentaireDiffusion (ou dynamicComment) | timestamptz / text ≤ 255 | « Date » ; tooltip de l'indice |
| redactor_id, checker_id, approver_id, quality_supervisor_id, safety_supervisor_id | redactor / verificator / approbator / qualityController / safetyController | FK collaborateurs | Rédacteur.trice, Vérificateur.trice, Approbateur.trice, Supervision qualité, Supervision sûreté |
| redactor_date … safety_date | diffusionDateR / V / A / Q / S | date | date de chaque contribution |
| bpe_user_id / bpe_date / bpe_comment | userBpe / bpeDate / commentaire BPE | | « Collaborateur.trice * » de l'état BPE validé |
| bpa_user_id | userBpa | | « Collaborateur.trice * » de l'état BPA |
| response_date | reponseDate | date | Date du retour * |
| response_label | libelleReponse | text | Organisme |
| response_ref | refReponse | text | Référence (colonne « Référence ») |
| response_comment | commentaireResponse | text ≤ 255 | Commentaire |
| response_file | responseFile | fichier | Document (pièce jointe du retour) |
| client_cover_page_file | clientCoverPageFile | fichier | Page de garde signée |
| complement_ref_int / complement_ref_ext | complementRefInt / complementRefExt | text | Complément référence interne / externe (particularisation) |
| compressed_file_size | compressedFileSize | bigint | taille du PDF |
| is_extern | extern | bool | version d'un document externe |
| files | files[] | fichiers | PDF de la version (externe) / PDF figé (généré) |

### 4.2 Indice

#### 4.2.1 Formats [OBS enum `NumericZero=1 Numeric=2 Alpha=3 NumericAllZero=4 NumericAllZeroStartZero=5 NumericDecimal=6 NumericDecimalStartZero=7`, `document.natureIndex.*`, RN110]

| Code (`index_format` existant) | Libellé | Suite |
|---|---|---|
| `numeric_zero` | Indice numérique (0, 1, 2, ...) | 0, 1, 2 |
| `numeric` | Indice numérique (1, 2, 3, ...) | 1, 2, 3 |
| `alpha` | Indice alphabétique (A, B, C, ...) | A, B, C … (après Z : AA [INF]) |
| `numeric_all_zero` | Indice numérique (01, 02, 03, ...) | 01, 02 |
| `numeric_all_zero_start_zero` | Indice numérique (00, 01, 02, ...) | 00, 01 |
| `numeric_decimal` | Indice décimal (1.0, 1.1, 1.2, ...) | 1.0, 1.1 |
| `numeric_decimal_start_zero` | Indice décimal (0.0, 0.1, 0.2, ...) | 0.0, 0.1 |

Règles :
- R-IDX-1 [OBS RN110] : à la création, **indice de départ** optionnel ; s'il est saisi il doit appartenir à l'un des formats ; « Chaque changement d'indice ultérieur du document respectera ensuite cette incrémentation » → le format est **déduit de l'indice de départ** [INF : `00` → numeric_all_zero_start_zero, `0.0` → decimal_start_zero, `A` → alpha…] ; sinon format par défaut du compte. Ambiguïtés : `1` (numeric) vs `0` (numeric_zero) → par la valeur ; `01` vs `00` idem.
- R-IDX-2 [OBS RN110] : modification de l'indice de départ à l'édition **uniquement si une seule version existe et qu'elle est PREL**.
- R-IDX-3 : « Indice (n+1) » = indice suivant dans le format ; « Indice (n) » = nouvelle ligne au même indice ; « Indice (n.1) » = **sous-indice** (`<indice>.1`, puis `.2` …) [INF sur la forme exacte ; libellé OBS « Nouvelle ligne et sous indice +1 »].
- R-IDX-4 : libellé d'une ligne = « {{docIndex}} - <état> » (ex. « B - BPO », « B - BPE * ») [OBS `document.indexStatuses.*`].
- R-IDX-5 : longueur 1–16 [OBS validators].
- RN105 « Nouveau format de compteur d'indice de document » — [INF] = format `numeric_all_zero_start_zero` ou `numeric_decimal_start_zero`.

### 4.3 Énumérations du suivi

#### 4.3.1 État documentaire (`state`, API `etat`) [OBS enum `Prel=1 Bpo=2 Bpe=3 Temp=4 Bpa=5 Other=6`, `document.statuses.*`]

| Code | Valeur affichée | Tooltip |
|---|---|---|
| `prel` | PREL | Préliminaire |
| `bpo` | BPO | Bon Pour Observation (en attente de diffusion / en attente retour client) |
| `bpe` | BPE | Bon Pour Exécution (BPE * = validé bis) |
| `temp` | BPE (« BPE TEMP ») | Bon Pour Execution en attente de prise en compte des réserves clients |
| `bpa` | BPA | Bon Pour Application (sous-indice) |
| `none` | Sans état | Sans état |

#### 4.3.2 Étape attendue (`step`, API `status`) [OBS enum `Bpa=1 Bpe=2 BpeValid=3 ClientRes=4 ClientResBpa=5 Diffusion=6 DiffusionBpa=7 UploadFile=9 BpaRefused=10`]

`diffusion` (à diffuser) · `client_res` (attente retour client) · `bpe` (indice validé, actions BPE*/BPA/nouvel indice possibles) · `bpe_valid` (validé bis) · `diffusion_bpa` (sous-indice à diffuser) · `client_res_bpa` (attente retour sur sous-indice) · `bpa` (sous-indice validé) · `bpa_refused` (sous-indice refusé) · `upload_file` (externe : fichier à déposer).

#### 4.3.3 Visa / retour (`visa`) [OBS enum `BpeValid=1 Diffusion=2 DiffusionBpa=3 Modification=4 ModificationBpa=5 Vao=6 VaoBpa=7 Vso=8 VsoSr=9 VsoBpa=10`, `document.addModal.visa.*`]

| Code | Libellé | Tooltip |
|---|---|---|
| `diffusion` | Première diffusion | Diffusion du document |
| `diffusion_bpa` | Diffusion BPA | Diffusion du document Bpa |
| `modification` | Modification | (nouvel indice ajouté depuis cette ligne) |
| `modification_bpa` | Ajout sous indice | — |
| `vso` | VSO | Vu sans observation |
| `vso_sr` | VSO-SR | Vu sans observation sous réserve |
| `vao` | VAO | Vu avec observation |
| `vso_bpa` | OK | Vu sans observation Bpa |
| `vao_bpa` | KO | Vu avec observation Bpa |
| `bpe_valid` | Bpe Valid | Bon pour exécution valide |

#### 4.3.4 Clé de libellé configurable (`action_key`) [OBS enum `Other=1 … BpaRefused=20`, `wordingConfiguration.modals.languageConfig.*`]

Chaque clé reçoit, par langue, **valeur, tooltip, couleur, icône** dans la configuration de suivi (spec 01 §6.13 ; JSON `wording_configuration_languages.fields`). Défauts :

| Clé | (state, step/visa) [INF] | Libellé de configuration | Valeur défaut | Tooltip défaut |
|---|---|---|---|---|
| prel | prel, diffusion | Préliminaire | PREL | Préliminaire |
| diffusion_bpo (bpoAd) | bpo, diffusion | Indice en attente diffusion | BPO | Bon Pour Observation en attente diffusion |
| client_return_bpo (bpoRc) | bpo, client_res | Indice en attente retour | BPO RC | Bon Pour Observation en attente retour client |
| modification_bpo | visa modification | Retour ajout d'indice | Modification | Modification |
| vso | visa vso | Retour indice validé | VSO | Vu sans Observation |
| vso_sr | visa vso_sr | Retour indice sous réserve | VSO-SR | Vu sans Observation sous réserve |
| vao | visa vao | Retour indice refusé | VAO | Vu avec Observation |
| bpe | bpe, bpe | Indice validé | BPE | Bon Pour Exécution |
| temp (bpeTemp) | temp | Indice en attente traitement retour | BPE TEMP | Bon Pour Exécution suite à VSO-SR |
| bpe_valid | bpe, bpe_valid | Indice validé bis | BPE * | Bon Pour Exécution validé |
| diffusion_bpa (bpaAd) | bpa, diffusion_bpa | Sous indice en attente diffusion | BPA AD | Bon Pour Application en attente diffusion |
| client_return_bpa (bpaRc) | bpa, client_res_bpa | Sous indice en attente retour | BPA RC | Bon Pour Application en attente retour client |
| vso_bpa (bpaOk) | visa vso_bpa | Retour sous indice validé | V | Validé |
| vao_bpa (bpaKo) | visa vao_bpa | Retour sous indice refusé | X | Refusé |
| bpa_valid (bpa) | bpa, bpa | Sous indice validé | BPA | Bon Pour Application |
| bpa_refused | bpa, bpa_refused | Sous indice refusé | BPA X | Bon Pour Application refusé |
| modification_bpa | visa modification_bpa | Retour ajout de sous-indice | Ajout sous indice | Ajout sous indice |
| other | none | Sans état | Sans état | Sans état |

Correspondance clé → état [OBS `toDocumentStatusEnum`] : Prel→PREL, Bpe→BPE, DiffusionBpo→BPO, Temp→TEMP, Other→Sans état, BpaValid→BPA.

#### 4.3.5 Statuts de filtre (liste) [OBS enum `prel=1 clientReturnBpo=2 diffusionBpo=3 bpeSuiteVsosr=4 bpe=5 bpeValid=6 clientReturnBpa=7 diffusionBpa=8 bpaValid=9 Other=10`, `document.filtreStatuses.*`]

PREL · BPO - En attente RC · BPO - En attente diffusion · BPE - Suite VSO-SR · BPE · BPE - Validé · BPA - En attente RC · BPA - En attente diffusion · BPA - Validé · Sans état. Dans les filtres « Etat » des listes, les valeurs sont celles des configurations de suivi utilisées (clé + configuration) [OBS `initializeDocDocumentsQueryRequest` : `states` = actionKey, `customWording` = uuid configuration] + « Sans état ».

### 4.4 Paramètres qui pilotent le circuit

| Paramètre | Porté par | Effet |
|---|---|---|
| `client_supervision` « Retour client sur l'indice » | famille du document (spec 01 §6.6) | si vrai : diffusion → BPO **en attente retour client** ; colonnes Réponse/Référence affichées ; action « Editer le retour client ». Si faux : diffusion → BPE direct [INF], colonnes réduites (`customTrackingDialogColumns`) [OBS] |
| `client_supervision_sub_index` « Retour client sur le sous-indice » | famille | si vrai : diffusion BPA → BPA RC ; sinon → BPA validé [INF] |
| `hide_bpa` | configuration de suivi | masque « Ajouter un sous indice » [OBS `!f.hideBpa`] |
| `hide_bpe_valid` | idem | masque « Passage indice validé bis » [OBS] |
| `hide_vso_sr` | idem | masque le bouton VSO-SR dans le popover de retour client [OBS] |
| droit `manage_diffusion` | collaborateur (droit additionnel) | autorise « Déverrouiller le suivi » (action ControlDiffusion) — aussi ouvert aux co-traitants depuis RN105 |
| modification des conditions de retour client sur la famille | — | « Cela impactera les documents déjà créés » ; interdite si des documents diffusés sont liés (spec 01) |

### 4.5 Machine à états des versions

Notation : chaque transition s'applique à la **dernière ligne** (`is_last`) sauf mention. « Nouvelle ligne » = insertion d'une version ; l'ancienne ligne devient historique (lecture seule hors mode déverrouillé).

| # | Déclencheur (UI) | Pré-conditions | Effet | Message | Source |
|---|---|---|---|---|---|
| T0 | Création du document | nature versionnée | ligne 1 : indice = indice de départ ou 1er du format ; `state=prel` ; `step=diffusion` (externe avec version : `step=upload_file`) | « Document créé avec succès » | OBS (PREL initial RN110) / INF (step) |
| T1 | Dépôt du fichier d'indice (icône import) | externe, `step=upload_file` | fichier attaché ; `step=diffusion` | « Fichier ajouté avec succès » ; « L'import du document est en cours, à retrouver dans les imports de document » | OBS UI / INF effet |
| T2 | **Diffuser** (icône `mail-bulk`) → popover « Informations sur la diffusion » : Date * (défaut aujourd'hui), Commentaire (≤ 255) | `step=diffusion` ; contrôles §4.6 | PDF généré et **figé** sur la ligne ; `diffusion_date`, `diffusion_comment` ; `visa=diffusion` ; si `client_supervision` : `state=bpo`, `step=client_res` ; sinon `state=bpe`, `step=bpe` | « Document diffusé avec succès — Veuillez le télécharger et l'envoyer à votre client » | OBS UI / INF effet |
| T2e | Diffuser un **externe** | `step=diffusion`, externe | idem T2 sans popover (date = maintenant), pas de génération | — | OBS (`diffuse()` direct) |
| T3 | **Annuler la diffusion** (menu, icône `plane-slash`) | `step ∈ {client_res, client_res_bpa}` | retour `step=diffusion` (resp. `diffusion_bpa`), `state` d'avant diffusion, visa effacé, PDF figé supprimé [INF] | confirm « Êtes-vous certain.e de vouloir annuler la diffusion ? » ; « Diffusion annulé avec succès » | OBS |
| T4 | Retour client **VSO** (popover « Informations sur le retour client ») | `step=client_res` ; Date du retour * | ligne : `visa=vso` + champs de réponse ; **nouvelle ligne** même indice `state=bpe`, `step=bpe` | — | OBS (bouton, réponse renvoie ancienne + nouvelle version) / INF (contenu nouvelle ligne) |
| T5 | Retour client **VSO-SR** | idem ; `!hide_vso_sr` | ligne : `visa=vso_sr` ; nouvelle ligne même indice `state=temp` | « Vous pouvez aller prendre les modifications en compte dans votre flow » | OBS bouton + toast / INF |
| T6 | Retour client **VAO** | idem | ligne : `visa=vao` ; nouvelle ligne **indice n+1**, `state=bpo`, `step=diffusion` | — | OBS bouton / INF effet |
| T7 | **Retour à l'état BPO** (icône cadenas « Retour à l'état {{BPO}} ») | `step ∈ {bpe, bpe_valid, bpa}` (et `temp` [INF]) ; mode normal | ligne : `visa=modification` ; nouvelle ligne **n+1**, `state=bpo`, `step=diffusion` | confirm « Êtes-vous certain.e de vouloir retourner à l'état BPO ? » ; « Retour du document à l'état BPO réalisé avec succès » | OBS (`addVersionDocument(sameIndex=false)`) |
| T8 | **Passage indice validé bis** (menu, icône `stamp`) → popover « Informations sur l'état BPE validé » : Collaborateur.trice *, Date, Commentaire | `step=bpe` ; `!hide_bpe_valid` ; **hors bibliothèque** | `step=bpe_valid`, `visa=bpe_valid`, `bpe_user_id`, `bpe_date`, `bpe_comment` (même ligne) | — | OBS (`convertToBpeValid`, API `bpe-validations`) |
| T9 | **Ajouter un sous indice** (menu, icône `paint-roller`) | `step ∈ {bpe, bpe_valid, bpa}` ; `!hide_bpa` | ligne : `visa=modification_bpa` ; nouvelle ligne sous-indice `state=bpa`, `step=diffusion_bpa` | erreur 409 « Impossible d'ajouter un sous indice depuis cet état de document » | OBS (`convertToBpa`) |
| T10 | **Diffuser BPA** (icône diffusion) → popover « Informations sur l'état BPA » : Collaborateur.trice *, Date *, Commentaire | `step=diffusion_bpa` | `bpa_user_id`, date ; `visa=diffusion_bpa` ; si `client_supervision_sub_index` : `step=client_res_bpa` ; sinon `step=bpa` | — | OBS UI / INF |
| T11 | Retour client sous-indice **OK** | `step=client_res_bpa` | `visa=vso_bpa` ; `step=bpa` (BPA validé) | — | OBS bouton / INF |
| T12 | Retour client sous-indice **KO** | idem | `visa=vao_bpa` ; `step=bpa_refused` | — | OBS bouton / INF |
| T13 | **Particularisation** « Complément référence » (menu, icône `hat-wizard`) → popover Complément référence interne / externe (pré-remplis par la règle de référence) | `step ∈ {diffusion, diffusion_bpa}` ou `state=prel` ; nature ≠ PDF avec version ; mode normal | met à jour `complement_ref_*` de la ligne et régénère | « Régénération du document effectuée avec succès » | OBS |
| T14 | **Version avant données terrain** (menu, icône œil) | nature ∈ {dsi, multi_pr, flow_form, pr} ; `step ∈ {bpe, bpe_valid, bpa}` ; provenance ≠ référentiel ; flow_form seulement si réponses = Toutes ; pr seulement si réponses en annexe ; mode normal | génère (sans modifier la ligne) le PDF **sans les données terrain** (signatures, réponses) [INF] | — | OBS conditions |
| T15 | **Télécharger** | toujours | télécharge le PDF de la ligne (asynchrone si lourd → cloche) | — | OBS |

Mode **« Déverrouiller le suivi »** (case à cocher, droit ControlDiffusion) [OBS `sfx-manage-diffusion`, `getActionMenu(…, manageDiffusion)`] : les icônes d'action de ligne disparaissent ; apparaissent les boutons et menus suivants.

| # | Action | Pré-conditions | Effet | Source |
|---|---|---|---|---|
| U1 | Indice (n+1) — « Nouvelle ligne et indice +1 » | — | nouvelle ligne n+1 `state=bpo`, `step=diffusion` (sans confirmation) | OBS |
| U2 | Indice (n.1) — « Nouvelle ligne et sous indice +1 » | — | nouvelle ligne sous-indice `state=bpa`, `step=diffusion_bpa` | OBS (`addSubIndex`) |
| U3 | Indice (n) — « Nouvelle ligne et indice identique » | — | nouvelle ligne même indice `state=bpo`, `step=diffusion` [INF] | OBS |
| U4 | Indice (corbeille) — « Supprime la dernière ligne de la liste » | > 1 ligne ; droit Delete sur la modale | supprime la dernière ligne (sans corbeille) | OBS (« Il faut garder au moins un indice dans la liste ») |
| U5 | Relancer la génération (`print`) | dernière ligne ; nature ≠ PDF avec version | régénère le PDF figé de la ligne avec le contenu actuel | OBS |
| U6 | Editer les contributeurs.trices | nature ≠ PDF avec version | popover « Edition des contributeurs.trices sur l'indice » | OBS |
| U7 | Editer la diffusion | visa ∉ {vso, vso_sr, bpe_valid, vso_bpa} | popover « Edition de la diffusion » : Date *, Commentaire, **Etat *** (choix libre de l'état parmi la configuration) [OBS `editDiffuseFree` : `etat` envoyé] | OBS |
| U8 | Editer le retour client | `client_supervision` ; visa ∉ {vso, bpe_valid, vso_bpa} | popover « Edition du retour client » (bouton Sauvegarder) ; confirmation « Êtes-vous certain de vouloir modifier le PDF et/ou la réf. de réponse? » | OBS |
| U9 | Appliquer la dernière trame (`sync-alt`) | dernière ligne | régénère avec la configuration de trame **actuelle** | OBS (`RefreshDocumentFromConfig`) |
| U10 | Appliquer la trame de l'indice précédent | dernière ligne | régénère avec la trame utilisée par l'indice précédent | OBS (`RefreshDocumentFromLastIndex`) |
| U11 | Editer le fichier (externe) | externe | remplace le PDF de la ligne | OBS |

La case est **désactivée** pour un document de provenance bibliothèque ou référentiel bloqué [OBS].

### 4.6 Contrôles à la diffusion [OBS `translateErrorKeys`, toasts]

| Contrôle | Message |
|---|---|
| Blocs du flow liés au document tous validés (circuit Rédaction → Vérification → Approbation → Validé, spec 02) | « Validation interne incomplète — Veuillez d'abord valider tous les blocs liés au document avant de continuer » ; variante « Les blocs du flow sélectionné ne sont pas tous validés, veuillez vérifier le workflow de validation » |
| Contributeurs renseignés sur l'indice | « Impossible de diffuser — Veuillez d'abord sélectionner des contributeurs.trices » |
| Trame présente et correcte | « Problème lors de la génération de votre document — Veuillez votre rapprocher de votre référent Siteflow afin de vérifier vos trames » ; « Erreur liée à la trame — Trame manquante ou erreur de formatage sur la trame existante » ; « Impossible de diffuser — Configuration trame pour LDA non trouvé » ; « Trame manquante. » ; erreurs détaillées : Trame introuvable, Contenu de page H/V introuvable, Modèle (générique) de formulaire (H) introuvable, Trame RFI / Contenu de page RFI / Section RFI / Sommaire RFI introuvable |
| Formulaire avec réponses (natures formulaire) | « Liste de réponses vide — Veuillez répondre au formulaire avant de diffuser le document » ; « Formulaire sans réponses » |
| Diagramme : image générée | « Générer le document avant de le diffuser » |
| LDA : documents listés à jour | popover « Information — Un ou plusieurs documents présents dans votre liste ne sont pas à jour : » + liste ; boutons « Mettre à jour » / « Diffuser sans mettre à jour » |
| Champs PDF de trame | « Les attributs rensigné dans la trame ne sont pas corrects ! — Veuillez vérifier les attributs de la trame » |

### 4.7 Contributeurs de l'indice [OBS `sfx-doc-collaborator-popover`, mapper `h`]

- Popover « Contributeurs.trices sur l'indice » / « Edition des contributeurs.trices sur l'indice » : Rédacteur.trice, Vérificateur.trice, Approbateur.trice, Supervision qualité, Supervision sûreté (sélection d'un collaborateur, affichage « TRI - Prénom Nom », + date par rôle).
- Bouton « Mettre à jour depuis le flow » : recopie les contributeurs depuis le circuit de validation des blocs du flow lié (rédacteur, vérificateur, approbateur) [INF sur la correspondance] — « Utilisateurs liés mis à jour avec succès ».
- Ouvrable en mode normal **uniquement** sur la dernière ligne à l'étape `diffusion`/`diffusion_bpa` ; colonne « Contributeurs.trices » = trigrammes « R / V / A / Q / S » (« - » si vide) [OBS].
- Liste des collaborateurs proposés : ceux de l'entité ; pour une source flow, ceux du flow lié [INF `linkedFlow` passé au popover].

### 4.8 Retour client [OBS `sfx-client-feedback-popover`, mapper `y`, API `visa`, `client-response-files`, `client-cover-pages`]

Champs : Date du retour * (défaut aujourd'hui), Organisme, Référence, Commentaire (≤ 255), Document (PDF), Page de garde signée (PDF). Boutons : **VAO** (rouge), **VSO-SR** (orange, masquable), **VSO** (vert) pour un indice ; **KO** / **OK** pour un sous-indice ; **Sauvegarder** en édition. Libellés, couleurs et icônes des boutons = valeurs de la configuration de suivi. Les fichiers joints sont téléchargeables depuis la ligne (`downloadVdfFileInResponse`, `downloadClientCoverPage`). Retirer un fichier = `resetDocFile` / `resetCoverFile`.

API externe équivalente [OBS `HC:Liste-des-appels-API`] : renseigner le retour client (`/version-document-flows/{id}/visa`), lier la pièce jointe et la page de garde signée, passer à l'état validé (`/bpe-validations`), lister/lire/exporter les versions, exporter le PDF du dossier de clôture.

### 4.9 Gel des indices et liens bloc ↔ document

- R-GEL-1 [OBS RN97, spec 02 R-DSI-4] : à chaque signature d'un bloc Contrôles, les indices des documents **avec version** liés au bloc Contrôles de l'étape sont **figés** (`block_documents.frozen_version_id`).
- R-GEL-2 : un lien non figé suit la **dernière version** (« montée d'indice dynamique ») sauf si l'utilisateur a choisi un indice (« Indice à lier », popover « Option d'indice sur le document ») → `pinned_version_id`. Liste des indices proposés : « {{docIndex}} - <état> » ; versions **sans fichier désactivées** ; deux indices identiques d'un même document interdits sur un même bloc (« Impossible d'avoir 2 indices identiques d'un même document sur un même bloc ») [OBS `$l.mapToSelectItem`, `linkedDocVersionAlert.fail`].
- R-GEL-3 : « Mettre à jour document » au niveau du flow (menu flow `UpdateDocument=11`) : tous les liens non figés passent au dernier indice ; popup « La liste de documents mis à jour — Les documents suivants ont été mis à jour dans le projet » [OBS `flowApp.documentFlow.modalUpdatedDoc.*`].
- Modale « Lier un document » : documents de l'entité, filtres Famille / Catégorie / Etat, « {{current}} éléments dans la liste / {{total}} au total », bouton « Lier » ; succès « Document lié avec succès » ; retrait « Êtes-vous certain.e de vouloir supprimer ce lien? ». Colonnes [OBS enum `NR`] : Famille, Nom, Référence interne, Indice, Indice du bloc, Statut, Actions.

### 4.10 Mise à jour depuis la bibliothèque [OBS `dashboardDocuments.*`, `RN:2026`]

- Document importé : si une **nouvelle version** existe en bibliothèque, icône orange « Mettre à jour » (`sync`) dans la colonne Actions, à gauche des autres (`updated=true`) [OBS R2.18 « l'indicateur n'est affiché que lorsqu'une nouvelle version du document est réellement disponible »].
- Mise à jour unitaire : « Êtes-vous certain.e.s de vouloir mettre à jour le document? » → « Le document mis à jour avec succès » ; incohérence : « Impossible de mettre à jour le document "{{documentName}}". Il existe une incohérence entre deux versions ».
- Mise à jour de masse (« Mettre à jour tous les documents déjà importés ») : « Les documents déjà validés ou en état de validation faisant appel à la bibliothèque ne seront pas affectés par la mise à jour. »
- Effet [INF] : recopie dans l'entité les versions de bibliothèque manquantes (index, état, fichiers) ; les liens non figés suivent la dernière version.

### 4.11 Documents externes sans version

Pas de suivi. API : création, lecture des propriétés, remplacement du PDF [OBS RN97]. Utilisables : liés à un bloc (annexe des documents Instructions), dans une LDA, dans une section Document du dossier de clôture [INF].

---

## 5. Écrans

### 5.1 Module Documents d'une entité (`/projects/:id/documents`, routeId `DashboardDocuments`) [OBS `chunk-K5L6FQMZ`, `chunk-NVBUMJE7`, `dashboardDocuments.*`]

- Masqué dans le menu pour une entité de type **Modèle** (spec 00 §menu).
- Titre « Liste des documents » ; sous-titre « {{ current }} élément(s) dans la liste ».
- Barre : recherche ; filtres **Famille**, **Catégorie** (Liste des documents), **Catégorie** (Dossier de clôture), **Provenance**, **Etat** (clés de suivi + « Sans état »), **Flow**, **Filtrer par date** (Date de création | Date de diffusion ; Journée en cours, Semaine en cours, Mois en cours, Mois N-1, période Début/Fin) ; « Effacer le(s) filtre(s) ».
- Boutons : **Créer** (+), « Importer depuis la bibliothèques », « Mettre à jour tous les documents déjà importés », « Réorganiser les documents ».
- Colonnes [OBS enum `LR`] : **Famille** (pastille couleur ; pastille provenance « B »/« R » ; cadenas ouvert si référentiel débloqué) · **Nom** (+ pastille « Document volumineux » ; recherche surlignée) · **Référence interne** · **Indice** · **Etat** (pastille de configuration : valeur, couleur, icône, tooltip) · **Diffusion** (date) · **Date d'importation** · **Action** (figée à droite). Tri par Famille, Nom, Référence, Indice, Etat, Diffusion. Colonnes redimensionnables (R2.12).
- Actions de ligne : spinner « Fichier en cours d'import » pendant un upload ; icône orange **Mettre à jour** (si `updated`) ; **Dernière version du PDF** (œil ; icône téléchargement si document volumineux ; « Pas de PDF existant à afficher ») ; clic ligne = **Editer** ; menu Options : **Propriétés**, **Partager**, **Supprimer**.
- Génération en cours : la ligne est verrouillée (pas d'édition) tant qu'une tâche de génération de ce document est active [OBS `isGeneratingDocument`].
- Suppression : « Êtes-vous certain.e de vouloir supprimer ce document? » → « Document supprimé avec succès » ; conflits listés : « Ce document est utilisé dans un ou plusieurs flows : » (« {{flowName}} - Phase {{phaseOrder}} - Etape {{stepOrder}} »), « … dans un ou plusieurs documents : » (LDA), « … dans une ou plusieurs sections : » (« Dossier {{sectionName}} »). Suppression → corbeille 30 jours (nature Document) ; restauration impossible si « le type existe déjà » (spec 01 §6.15).
- Réorganiser : sélection multiple ; « Changer la catégorie » (Catégorie Liste des documents | Dossier de clôture) « à » <catégorie> « sur les {{number}} documents sélectionnés » ; confirmation « Êtes-vous certain.e.s de vouloir changer le.la " {{type}} " à " {{name}} " pour le(s) {{count}} document(s) sélectionné(s)? ».
- État vide : « Veuillez en ajouter depuis le bouton d'importation ».

### 5.2 Modale document (`DashDocumentsAddModal` / `DashDocumentsEditModal`, sous-routes `general-tab`, `attribute-tab`, `content-tab`, `follow-tab`, `options-tab`)

- Onglets §2.6 ; « Suivant » en création pour passer d'onglet en onglet ; « Sauvegarder » ; « Fermer ».
- En-tête du Suivi : case **Déverrouiller le suivi** + boutons du mode déverrouillé (§4.5).
- La modale est **lecture seule** (`disabled`) si le contenu est désactivé (`contentDisabled`, ex. document importé / référentiel) [OBS mapper].

### 5.3 Onglet Suivi (`sfx-document-tracking-tab`) [OBS enum `EGRNJEV6`]

- Colonnes avec retour client : **Indice** (tooltip = commentaire de diffusion) · **Contributeurs.trices** · **Date** · **Réponse** · **Référence** · **Statut** · **Retour** · **Action**. Sans retour client : Indice · Contributeurs.trices · Date · Statut · Retour · Action.
- Tri par indice (asc/desc), pagination infinie.
- Icônes de la dernière ligne en mode normal : import de fichier (`upload_file`) ; retour client (`client_res*`) ; cadenas « Retour à l'état BPO » (`bpe`, `bpe_valid`, `bpa`) ; diffusion (`diffusion*`) ; aperçu PDF ; menu Options (§4.5, libellés `libraryDocuments.table.actions.*`).
- Aperçu d'une ligne ancienne, d'un document de bibliothèque ou référentiel = **PDF figé** ; sinon génération/aperçu à la volée [OBS `shouldBeDownloadedDirectly`].

### 5.4 Bibliothèque des documents (`/library/documents`, routeId `LibraryDocuments`) [OBS `libraryDocuments.*`]

- Titre « Bibliothèque des documents » ; filtres **Applicabilité**, Catégorie (×2), Famille, Etat ; recherche.
- Création : Applicabilité *, Famille *, Nom *, Type (PDF avec version | PDF sans version), références, premier indice, catégories ; suivi identique sauf **pas de BPE*** en bibliothèque [OBS `b!==Library`].
- Menu ligne [OBS enum `F3TGXTFG Edit=1 ViewDocument=2 Proprieties=3 Delete=4`] : Editer, Dernière version du PDF, Propriétés, Supprimer.
- Suppression : « Êtes-vous certain.e de vouloir supprimer le document {{name}} ? » ; conflit « Ce document est utilisé dans un ou plusieurs entités : » ; variante « Impossible de supprimer un document déjà importé dans un projet — Veuillez supprimer le document dans chacun des projets afin de le supprimer depuis la bibliothèque ».
- Réorganiser (catégories) identique au module.
- Correction R2.13 : la mise à jour d'un document de bibliothèque depuis un fichier PC ne doit pas dupliquer le contenu.

### 5.5 Import depuis la bibliothèque (`DashboardDocumentsImportFromLibraryDialog`) [OBS]

- « Importer depuis la bibliothèque » ; « {{ current }} élément(s) / {{ total }} au total » ; colonnes Famille, Nom, Référence interne, Indice, Etat ; filtres Famille, Catégorie, Etat.
- **10 éléments maximum** par import : « Impossible de sélectionner plus de 10 éléments. Veuillez faire le traitement par lots. »
- Lignes **non sélectionnables** : déjà importées, ou sans aucun fichier [OBS `frozen = alreadyImported || !atLeastOneFile`].
- Succès « Importation effectuée avec succès ». Le document importé : `origin=imported_from_library`, actions de suivi désactivées.

### 5.6 Cloche (génération asynchrone) et panneau « Import de documents »

- Génération : si le PDF n'est pas prêt immédiatement, l'API renvoie l'identifiant d'une tâche de fond ; la cloche suit la tâche (spec 00 §5.5). Toasts : « La génération du document a bien été lancée », « La génération du document est en cours, à retrouver dans la liste des évènements », « La génération du document est terminée, retrouvez le dans la liste des évènements » ; dossier lourd : « Le document est en cours de génération. Vous pouvez continuer à utiliser Siteflow. Merci d'aller voir sur la cloche (en bas à gauche) pour visualiser le document généré ! » [OBS `document.generate.*`, `closingFolder.table.alert.generateDocHeavy`].
- Tâche : kind « Génération documentaire », types PDF / XLSX / ZIP, métadonnées « Version de document » et « Fichier temporaire », tentatives, durées [OBS `backgroundTasks.*`] → table existante `background_tasks` (`kind='document_generation'`, `metadata.document_version_id`, `result_path`).
- Import : panneau « Import de documents » (spec 00 §5.6) ; imports en tâche de fond, multiples simultanés, visibles seulement par leur auteur ; alerte avant fermeture d'onglet tant qu'un import est en cours ; une coupure réseau fait échouer l'import (à relancer) [OBS RN 2025].

### 5.7 Limites de taille [OBS `chunk-KXNV7A55`, `global.files.*`, RN 2025]

| Contexte | Limite | Message |
|---|---|---|
| Document externe (bibliothèque, source ordinateur) | **2 Go** | « Le fichier sélectionné est trop volumineux — Siteflow prend en charge les PDF jusqu'à 2Go » |
| Fichier dans une question de formulaire | 40 Mo | « … jusqu'à 40Mo » |
| Seuil « document volumineux » | > **20 Mo** | pastille « Document volumineux » ; non visible MobileApp ni en annexe ; interdit dans une section **Document** du dossier de clôture |
| Dossier de clôture généré | **10 Go** | génération plus robuste ; documents volumineux intégrés au dossier (avant : ZIP séparé) |
| PDF protégé par mot de passe | refus | « Le fichier est verrouillé avec un mot de passe, import impossible » |

### 5.8 Partage d'un document (`ShareDialog`, `init-document`) [OBS `share.*`]

- Popup « Partager un document » : e-mails (« Ajouter un e-mail »), Langue, Commentaire (« Le commentaire saisi sera visible dans le mail de partage ») ; historique « Personnes ayant accès » (nom, e-mail, « Envoyé le {{ date }} », statut, Renvoyer, Supprimer — « Le lien de partage ne sera plus valide ») ; vide « Ce document n'a jamais été partagé auparavant. » ; doublon « Vous avez déjà effectué ce partage avec cette adresse mail » ; e-mail inactif refusé.
- Parcours destinataire : page « {{ firstName }} {{ lastName }} vous a envoyé un document à télécharger » → identité (Prénom, Nom, Entreprise, Fonction, Email) → code secret par e-mail → « Générer mon document » → « Votre document est en cours de génération. Vous recevrez un mail lorsque votre document sera prêt à être téléchargé. » → « Télécharger mon document ». Durée de validité = `organizations.link_expiration_days`.
- Pour une LDA partagée : ZIP de tous les documents liés en version « terrain », asynchrone si long [OBS RN92].

### 5.9 Dossier de clôture (`/projects/:id/closing-folder`, routeId `DashboardClosingFolder`) [OBS `closingFolder.*`, `sections.*`, `folders.*`, `chunk-4J6Z26QQ`]

Masqué pour les entités Modèle et Référentiel.

#### 5.9.1 Dossier (document nature `rfi`)

| Champ | Obl. | Libellé |
|---|---|---|
| name | oui | Nom du dossier * |
| family_id | oui | Famille * (« Veuillez définir la famille du dossier ») |
| ref_int / ref_ext | au moins une [OBS « Réference Interne / Externe * »] | Référence interne / externe (+ compléments) |
| folder_template_id | non | Type de modèle (« Veuillez sélectionner un modèle pour le dossier de clôture ») — crée les sections du modèle ; avertissement « Ce modèle de dossier de clôture contient des catégories par défaut non présentent dans votre projet actuel » |
| linked_flow_id | non | Flow lié (champs de trame) |
| attributs, options (langues, page de garde client) | — | onglets Attribut / Options |

Onglets : Général, Attribut, Suivi (même circuit que §4 ; trames RFI), Options. Titres « Créer un nouveau dossier de clôture » / « Edition du dossier de clôture RFI {{folderName}} ». Navigation dossier précédent/suivant.

#### 5.9.2 Sections [OBS enum section `Document=1 Report=2 Certificate=3 Reference=4 ClientResponse=5 DocumentLargeFile=6 ClosingFolder=7` ; DTO `natureSection, name, category, description, flowLight, elementEmms, hasAllEmmElement, includePreviousVersions, disabled, sectionDocumentFlows`]

| Type | Libellé long | Paramètres |
|---|---|---|
| `document` | Document - Compilation de documents sélectionnés depuis le projet | catégorie Dossier de clôture (pré-cochage **à la création uniquement**), sélection de documents **diffusés**, « Intégrer les différents indices disponibles par document » ; documents > 20 Mo refusés |
| `report` | Compte rendu - Génération d'un compte rendu rédigé depuis un flow | flow (« Flow de compte rendu ») — tableau récapitulatif des signatures du flow [INF] |
| `certificate` | Certificat - Compilation de certificats des éléments moyens depuis un flow | flow + « chaque certificat des moyens présents dans le flow » **ou** « d'un ou des moyen(s) en particulier » (sélection) |
| `reference` | Référence - Compilation de références des éléments moyens depuis un flow | flow + tous les moyens / certains |
| `client_response` | Retour client - Compilation de retours clients sélectionnés depuis le projet | catégorie, sélection, intégrer tous les indices |
| `document_large_file` | Document volumineux - Compilation de documents volumineux sélectionnés depuis le projet | catégorie, sélection, intégrer tous les indices |
| `closing_folder` | Dossier de clôture - Compilation de dossier de clôture validés sélectionnés depuis le projet | sélection d'autres dossiers validés |

Champs communs : Type *, Désignation (Nom) *, Description, Catégorie Dossier de clôture, Position (« Dernière position » par défaut), Observation. Onglets de la modale section : **Général**, **Contenu** (table de sélection : Nom, Famille, Référence interne, Indice, Etat, Diffusion ; moyens : Nom, Référence, Fournisseur, Quantité), **Ordre**. Bouton « Rafraichir la sélection depuis l'onglet « Contenu » » ; « Créer une autre section ».

Ordre — « Réorganiser par : » [OBS enum 1–10] : Date de création (chrono / antéchrono), Date de modification (chrono / antéchrono), Date d'ajout dans la section (chrono / antéchrono), Nom (A → Z / Z → A), Référence interne (A → Z / Z → A) ; « Section réorganisée ». Glisser-déposer des éléments et des sections (« Arrangement enregistrée avec succès » ; « Impossible de changer le parent de cet élément »).

Avertissement de non-diffusion : « Impossible d'afficher certains documents dans le dossier de clôture — Un ou plusieurs documents ne sont pas diffusés et ne seront donc pas visibles dans le dossier de clôture : … — Veuillez diffuser les documents listés ci-dessus si vous voulez qu'ils apparaissent dans le dossier ».

#### 5.9.3 Écran liste

- Arbre **dossier → sections → documents** ; « {{ count }} section(s) dans le dossier », « {{ count }} document(s) dans la section » ; « Agrandir / Réduire » ; vide : « Veuillez ajouter une section afin d'agrandir le dossier » / « … un document afin d'agrandir la section ».
- Colonnes [OBS enum `gR`] : Nom, Référence interne, Indice, Statut, Diffusion, Action ; pastille « Document volumineux ».
- Actions dossier : Ajouter une section, Editer, **Générer le dossier**, Aperçu, **Vérification**, Propriétés, Supprimer (« Êtes-vous certain.e de vouloir supprimer ce dossier? » ; corbeille nature ClosingFolder). Actions section : Editer, Aperçu (« Prévisualiser la section en PDF »), Télécharger (PDF / ZIP de la section), Supprimer (« Il n'y a pas de corbeille pour cet élément »). Date de dernière génération de section en tooltip.
- **Vérification** : « Vérification du contenu des dossier de clôture — Liste des catégories secondaires parents appelées dans le dossier de clôture : » ; par catégorie « {{ name }} ({{ used }} / {{ total }} catégories enfants utilisées) » ; « Aucune catégorie dans la section ». Variante : « Certaines catégories de document ne sont pas utilisées … Veuillez utiliser toutes les catégories dans les documents sélectionnés » / « Toutes vos catégories sont liées à des documents ».
- Figé : « Tout le contenu du dossier de clôture est figé » [INF : après diffusion du dossier].
- Erreurs volumineuses : « Impossible de générer votre dossier car la taille d'un document présent dans une section document dépasse 20mo… » ; « La section ne peut pas contenir un document volumineux » ; « Impossible d'importer un document volumineux dans la section ».
- Propriétés de section : Nom, Référence interne, Etat, création / modification.

### 5.10 Listes (`/projects/:id/lists`, routeId `DashboardLists`) [OBS `lists.*`]

Rôle : **listes de moyens ou de risques** propres à l'entité, constituées par import d'éléments de la bibliothèque (moyens / risques), servant de source aux documents « Liste de moyens / de risques » à partir **d'une liste** (`list_emm` / `list_adr`). Masqué pour les entités Modèle.

- Liste : titre « Listes » ; colonnes Type (Moyen / Risque), Nom, Action ; filtres Type, Catégorie, Applicabilité ; actions Voir, Editer, Supprimer (« Êtes-vous certain.e.s de vouloir supprimer la liste? » ; refus si utilisée — « Suppression impossible »).
- Modale « Créer une nouvelle liste » / « Edition de la liste {{name}} » : onglets **Général** (Type *, Nom *, Référence, Catégorie (catégorie de nature Liste), Description), **Importation** (table de la bibliothèque : moyens — Famille, Nom, Référence, Fournisseur, Quantité / Unité ; risques — Famille, Risque, Source ; « Option d'importation » : Quantité, Unité, Consommable ; « Elément déjà importé »), **Contenu** (éléments importés, retrait). « Mettre à jour la liste » depuis la bibliothèque (« Êtes-vous certain.e.s de vouloir mettre à jour la liste? »).
- Visualisation d'un élément : moyen (Général ; Vérification : Organisme de vérification, Date de validité (« Date de validité dépassée »), « Soumis à vérification », Document de certificat, Document de référence, Fournisseur, Commentaire + « Afficher le commentaire lors des exportations en PDF et le rendre ainsi visible par le client ») ; risque (Général ; Parade : Parade, Pictogramme, PDF).

### 5.11 Paramètres liés (renvois)

Trames (spec 01 §6.12), modèles de dossier de clôture et de section (§6.10), configuration de suivi (§6.13), familles Document (§6.6), règles de référence nature Document (§6.8), configuration documentaire du compte (§6.1 : langues, type d'indice, filigrane, logo client de page de garde X/Y/largeur/hauteur), clients (page de garde client PDF, position du n° de page, nombre d'indices précédents).

---

## 6. Génération PDF — structure observable

### 6.1 Assemblage d'un document généré [OBS types de trame `trams.dialog.pageType.*`, options §3.4 ; ordre INF]

1. **Page de garde** (trame `COVER_PAGE`, ou spécifique `COVER_PAGE_DSI` / `_LDA` / `_LCA` / `_MULTI_PR` / `_DIAGRAM` / `_RFI`, sinon défaut) — champs PDF remplis ; ou **page de garde client** (`COVER_PAGE_CLIENT`, PDF du client) si l'option est active. Logo client positionné (compte). Masquée si `hide_cover_page`.
2. **Page de suivi des évolutions** (`PAGE_CONTENT_SUIVI` ou variantes DSI / MULTI_PR / DIAGRAM / RFI) : historique des indices (indice, date, état, contributeurs, commentaire) — limité aux N derniers indices (« Nombre d'indice précédent », `index_max`). Masquée avec la page de garde.
3. **Page de suivi des contributeurs** (option `include_contributors_page`).
4. **Contrôle** : page d'explication (`PAGE_EXPLICATION_DSI`) puis tableau (`PAGE_H_DSI` / `PAGE_V_DSI`) et page de suivi de signature (`PAGE_SUIVI_SIGNATURE_DSI`) ; légende des natures de signature (« Point d'arrêt interne / externe », « Point de convocation interne / externe », « Contrôle technique », « Signature requise ») [OBS `flowApp.documentReport.badge.*`].
5. **Sommaire** (instructions multiples : titres masquables ; RFI : `PAGE_SOMMAIRE_RFI`).
6. **Contenu** sur pages de contenu verticales/horizontales (`PAGE_CONTENT_V` / `PAGE_CONTENT_H`, formulaires `FORM_GENERIC(_H)` / `FORM_MODEL(_H)`), titres avec numéros de phase/étape si option ; mise en évidence des changements entre indices si option.
7. **Annexes** (`PAGE_ANNEXE`, intercalaires optionnels) : PDF sans version liés, formulaires vierges, réponses, moyens, certificats de conformité, documents des flows enfants, fiches compétences (`PAGE_SKILLS`).
8. **Numérotation** de page à la position (X, Y) de la trame ; **filigrane** du compte ; **langues** : libellés en Langue 1, et Langue 2 en second si définie.

Dossier de clôture : page de garde RFI → suivi RFI → sommaire RFI → pour chaque section : page de section (`PAGE_SECTION_RFI`) puis contenus (PDF figés des versions diffusées, comptes rendus, certificats) sur `PAGE_CONTENT_RFI`.

Champs PDF (AcroForm) [OBS RN92 / RN105 ; liste exacte INF] : champs nommés de la trame remplis avec les données du document (nom, références, compléments, indice, état, date de diffusion, famille, catégorie, contributeurs et dates), de l'entité (désignation, client(s), n° d'affaire / contrat / marché, lieu, supervisions…), du flow lié (nom, chrono, dates de planning…) ; **suffixe « Indice »** sur un champ = déclinaison multi-indice (indices précédents) ; attributs personnalisés via `custom_fields.pdf_field_name`. Erreur de nommage → « Les attributs rensigné dans la trame ne sont pas corrects ! ».

Résolution de trame (par type de page) [OBS lien `DEFAULT=1 CLIENT=2 FAMILY=3`] : trame **Famille** du document > trame **Client** de l'entité > trame **Défaut** ; pour un type optionnel absent, repli sur le type générique indiqué dans le libellé (« optionnel (sinon Page de garde) »).

R2.23 : compression des images JPEG/PNG avant intégration, sans perte visible [OBS].

---

## 7. Permissions

### 7.1 Matrice UI [OBS `chunk-HCYDDSAJ` : `dashDocumentPage`, `dashDocumentModal`, `dashDocumentImportModal`, `documentPage`, `documentModal`, `dashboardClosingFolderPage/Modal`, `dashboardListPage/Modal`, `folderPage/Modal`, `tramPage`, `backgroundTasksPage`]

Abréviations (spec 01 §3.5) : SFA Admin plateforme, GA Admin global, A Admin, AV Avancé, N Normal ; rôles R Responsable, E Expert, W Rédacteur ; CO = co-traitants (interdits quand indiqué) ; MD = droit additionnel `manage_diffusion`.

| routeId | Lecture | Edit | Delete | Autres |
|---|---|---|---|---|
| DashboardDocuments (page) | tous (avec accès entité) | SFA, A, GA **ou** R/E/W | SFA, A, GA ou R/E ; CO interdits | ControlDiffusion (Déverrouiller le suivi) : SFA, **MD** |
| DashDocumentsAddModal / EditModal / ReorganizeDialog | SFA, A, GA ou R/E/W | — | (suppression dernier indice : droit Delete demandé sur la modale, non défini → [INF] = Delete de la page) | EditRef : SFA, A, GA |
| DashboardDocumentsImportFromLibraryDialog | SFA, A, GA ou R/E ; CO interdits | | | |
| LibraryDocuments (page) | SFA, A, GA, AV, N | SFA, A, GA, AV | SFA, A, GA, AV | ControlDiffusion : SFA, MD |
| LibraryDocuments Add / Edit / Reorganize | SFA, A, GA, AV | | | |
| DashboardClosingFolder (page) | tous | — | SFA, A, GA, AV ou R/E | ControlDiffusion : SFA, MD |
| DashboardAdd/EditFolder, Add/EditSection, VerificationSection | SFA, A, GA, AV ou R/E/W (R2.x : « Le rôle rédacteur permet maintenant d'éditer un dossier de clôture ») | | | EditRef : SFA, A, GA, AV |
| DashboardLists (page) | tous | SFA, A, GA ou R/E/W | SFA, A, GA ou R/E ; CO interdits | |
| Modales Listes | SFA, A, GA ou R/E/W ; CO interdits | | | |
| SettingsSections (modèles de dossier) | SFA, A, GA, AV | | SFA, A, GA | |
| SettingsTrams | SFA | | SFA | |
| SettingsBackgroundTasks | SFA, GA | | | |

Règle d'évaluation (spec 01 §3.4) : dans une entité, si la règle a des `roles` et que l'utilisateur a un rôle sur l'entité, seul le rôle compte. [INF] **EditRef** = modifier manuellement une référence générée (référence interne / compléments) ; sans ce droit les champs de référence générés sont en lecture seule.

### 7.2 Traduction RLS [INF]

- Lecture document d'entité : `private.can_read_project(project_id)`. Bibliothèque : `account_id in accessible_account_ids()` pour SFA/A/GA/AV/N.
- Écriture (création, édition, suivi normal) : `private.can_write_project(project_id, 'writer')`. Suppression : `can_write_project(project_id, 'expert')` et autorité non co-traitant.
- Actions du mode déverrouillé : `private.current_authority() = 'siteflow_admin' or private.has_additional_right('manage_diffusion')`, **plus** droit d'écriture sur l'entité.
- Mutations du suivi **uniquement via RPC** `security definer` (pas d'UPDATE direct sur `document_versions` pour `authenticated`) afin de garantir la machine à états.

---

## 8. Messages notables (récapitulatif)

| Contexte | Message [OBS] |
|---|---|
| Création | Document créé avec succès · Création impossible · Le format d'indice n'est pas conforme |
| Diffusion OK | Document diffusé avec succès — Veuillez le télécharger et l'envoyer à votre client |
| Diffusion KO | Validation interne incomplète · Impossible de diffuser — Veuillez d'abord sélectionner des contributeurs.trices · Problème lors de la génération de votre document |
| Retour BPO | Êtes-vous certain.e de vouloir retourner à l'état {{BPO}} ? · Retour du document à l'état BPO réalisé avec succès |
| Annulation | Êtes-vous certain.e de vouloir annuler la diffusion ? · Diffusion annulé avec succès |
| Sous-indice | Impossible d'ajouter un sous indice depuis cet état de document |
| Suppression indice | Êtes-vous certain.e de vouloir supprimer cet indice ? · Il faut garder au moins un indice dans la liste |
| BPE modif | Êtes-vous certain de vouloir modifier le document BPE? |
| Retour client | Retour client édité avec succès · Êtes-vous certain de vouloir modifier le PDF et/ou la réf. de réponse? |
| VSO-SR | Vous pouvez aller prendre les modifications en compte dans votre flow |
| Import fichier | Fichier ajouté avec succès · L'import du fichier a échoué · Le fichier est verrouillé avec un mot de passe, import impossible · Ne fermez pas votre navigateur tant que l'import est en cours |
| Aperçu | Impossible de charger le document, aucun PDF disponible · Une erreur est survenue lors du chargement du PDF |
| Bibliothèque | Aucune action n'est possible quand le document provient de la bibliothèque |
| Référentiel | Aucune action n'est possible quand le flow référentiel est bloqué |
| LDA | Un document de type “Liste de documents” est déjà sélectionné dans la liste en cours, impossible de réaliser l'action |
| Contenu vide | Impossible de générer le document car aucun contenu n'est sélectionné · Merci d'ajouter du contenu au document |
| Suppression | Impossible de supprimer ce document car il est déjà associé a un flow |

---

## 9. Proposition de schéma SQL

Cohérente avec les migrations existantes (`projects`, `label_families`, `wording_configurations`, `collaborators`, `flows`, `blocks`, `block_documents`, `diagrams`, `forms`, `form_responses`, `custom_fields`, `background_tasks`, `index_format`, `export_language`, `ui_language`). Conventions : `uuid` PK, `organization_id` + `account_id` pour la RLS, `created_*/updated_*`, soft delete `deleted_at` (corbeille 30 jours).

```sql
-- ===== ENUMS =====================================================================
create type public.document_nature as enum (
  'pr','emm','adr','dsi','multi_pr','flow_form','object',            -- flow
  'project_form','block_form','multi_flow_form',                     -- formulaire
  'lfa','lda','list_emm','list_emm_flow','list_adr','list_adr_flow',
  'lca','field_feedback','diagram',                                  -- module
  'pdf_versioned','pdf_unversioned',                                 -- externe
  'rfi');                                                            -- dossier de clôture
create type public.document_source   as enum ('flow','form','module','extern','closing_folder');
create type public.document_scope    as enum ('library','project');
create type public.document_origin   as enum ('local','imported_from_library','derived_from_standard');
create type public.document_state    as enum ('prel','bpo','bpe','temp','bpa','none');
create type public.document_step     as enum ('diffusion','client_res','bpe','bpe_valid',
                                              'diffusion_bpa','client_res_bpa','bpa','bpa_refused','upload_file');
create type public.document_visa     as enum ('diffusion','diffusion_bpa','modification','modification_bpa',
                                              'vso','vso_sr','vao','vso_bpa','vao_bpa','bpe_valid');
create type public.form_content_location as enum ('none','content','appendix');
create type public.selection_strategy    as enum ('all','selected','none');
create type public.closing_section_type  as enum ('document','report','certificate','reference',
                                                  'client_response','document_large_file','closing_folder');
create type public.document_selection_kind as enum ('flow','document','skill','technical_object_attribute',
                                                    'form_response','emm_element');
create type public.project_list_type     as enum ('emm','adr');

-- ===== DOCUMENTS ================================================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,      -- « Applicabilité »
  scope public.document_scope not null,
  project_id uuid references public.projects(id) on delete cascade,
  nature public.document_nature not null,
  source public.document_source not null,
  origin public.document_origin not null default 'local',
  library_source_id uuid references public.documents(id) on delete set null,
  standard_source_id uuid references public.documents(id) on delete set null,
  name text not null check (char_length(name) between 3 and 255),
  ref_int text check (ref_int is null or char_length(ref_int) between 3 and 255),
  ref_ext text check (ref_ext is null or char_length(ref_ext) between 3 and 255),
  complement_ref_int text,
  complement_ref_ext text,
  family_id uuid not null references public.label_families(id),
  category_id uuid references public.label_families(id) on delete set null,
  closing_category_id uuid references public.label_families(id) on delete set null,
  index_format public.index_format not null,
  start_index text check (start_index is null or char_length(start_index) between 1 and 16),
  language_1 public.export_language not null default 'fr',
  language_2 public.export_language not null default 'none',
  -- liens de contenu
  linked_flow_id uuid references public.flows(id) on delete set null,
  linked_form_id uuid references public.forms(id) on delete set null,
  linked_response_id uuid references public.form_responses(id) on delete set null,
  linked_diagram_id uuid references public.diagrams(id) on delete set null,
  linked_list_id uuid,                                  -- FK project_lists ajoutée plus bas
  folder_template_id uuid,                              -- FK closing_folder_templates (rfi)
  responses_strategy public.selection_strategy,
  form_content_location public.form_content_location not null default 'none',
  preamble text, subject text, glossary text,
  options jsonb not null default '{}'::jsonb,           -- cases à cocher §3.4 (hide_cover_page, include_*, …)
  selection_query jsonb,                                -- filtres mémorisés (lfa/lda)
  client_cover_page boolean not null default false,
  highlight_changes boolean not null default false,
  content_disabled boolean not null default false,
  actions_disabled boolean not null default false,
  library_update_available boolean not null default false,   -- icône orange
  is_large_file boolean not null default false,               -- > 20 Mo
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.collaborators(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.collaborators(id) on delete set null,
  check ((scope = 'library') = (project_id is null)),
  check (scope = 'project' or nature in ('pdf_versioned','pdf_unversioned')),
  check (language_2 = 'none' or language_2 <> language_1),
  check (source <> 'extern' or nature in ('pdf_versioned','pdf_unversioned'))
);
create index documents_project_idx on public.documents (project_id) where deleted_at is null;
create index documents_account_idx on public.documents (account_id) where scope = 'library' and deleted_at is null;
create index documents_family_idx on public.documents (family_id);
create index documents_category_idx on public.documents (category_id);
create index documents_closing_category_idx on public.documents (closing_category_id);
create index documents_library_source_idx on public.documents (library_source_id);
create index documents_linked_flow_idx on public.documents (linked_flow_id);
-- Unicité (§2.5)
create unique index documents_unique_flow_nature on public.documents (project_id, nature, linked_flow_id)
  where linked_flow_id is not null and source = 'flow' and deleted_at is null;
create unique index documents_unique_form_nature on public.documents (project_id, nature, linked_form_id, coalesce(linked_flow_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where linked_form_id is not null and deleted_at is null;
create unique index documents_unique_diagram on public.documents (linked_diagram_id)
  where linked_diagram_id is not null and deleted_at is null;
create unique index documents_unique_library_import on public.documents (project_id, library_source_id)
  where library_source_id is not null and deleted_at is null;

-- Sélections multiples (flows, documents, compétences, attributs, réponses, moyens)
create table public.document_selections (
  document_id uuid not null references public.documents(id) on delete cascade,
  kind public.document_selection_kind not null,
  ref_id uuid not null,
  position int not null default 0,
  primary key (document_id, kind, ref_id)
);
create index document_selections_ref_idx on public.document_selections (ref_id);

-- ===== VERSIONS (lignes du suivi) ==================================================
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  seq int not null,
  index_label text not null check (char_length(index_label) between 1 and 16),
  is_sub_index boolean not null default false,
  state public.document_state not null,
  step public.document_step,
  visa public.document_visa,
  is_last boolean not null default true,
  diffusion_date timestamptz,
  diffusion_comment text check (char_length(diffusion_comment) <= 255),
  diffused_by uuid references public.collaborators(id) on delete set null,
  redactor_id uuid references public.collaborators(id) on delete set null,  redactor_date date,
  checker_id uuid references public.collaborators(id) on delete set null,   checker_date date,
  approver_id uuid references public.collaborators(id) on delete set null,  approver_date date,
  quality_supervisor_id uuid references public.collaborators(id) on delete set null, quality_date date,
  safety_supervisor_id uuid references public.collaborators(id) on delete set null,  safety_date date,
  bpe_user_id uuid references public.collaborators(id) on delete set null,
  bpe_date timestamptz, bpe_comment text check (char_length(bpe_comment) <= 255),
  bpa_user_id uuid references public.collaborators(id) on delete set null,
  response_date timestamptz,
  response_label text, response_ref text,
  response_comment text check (char_length(response_comment) <= 255),
  response_file_path text,
  client_cover_page_path text,
  complement_ref_int text, complement_ref_ext text,
  pdf_path text,                         -- PDF figé (généré à la diffusion) ou fichier externe principal
  pdf_size bigint,
  template_snapshot jsonb,               -- ids/versions des trames utilisées (Appliquer la trame de l'indice précédent)
  wording_snapshot jsonb,                -- action_key + libellé au moment de la transition (optionnel)
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (document_id, seq)
);
create unique index document_versions_one_last on public.document_versions (document_id) where is_last;
create index document_versions_redactor_idx on public.document_versions (redactor_id);
create index document_versions_checker_idx on public.document_versions (checker_id);
create index document_versions_approver_idx on public.document_versions (approver_id);

create table public.document_files (               -- fichiers des PDF sans version / multi-fichiers d'une version
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_id uuid references public.document_versions(id) on delete cascade,
  storage_path text not null,
  name text not null,
  size bigint not null check (size <= 2147483648),
  position int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null
);
create index document_files_document_idx on public.document_files (document_id);
create index document_files_version_idx on public.document_files (version_id);

create table public.document_version_events (     -- historique (qui / quand / transition)
  id bigint generated always as identity primary key,
  version_id uuid not null references public.document_versions(id) on delete cascade,
  action text not null,                           -- T0..T15 / U1..U11
  from_state public.document_state, to_state public.document_state,
  from_step public.document_step,  to_step public.document_step,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid references public.collaborators(id) on delete set null,
  created_at timestamptz not null default now()
);
create index document_version_events_version_idx on public.document_version_events (version_id);

-- ===== PARTAGE ==================================================================
create table public.document_shares (             -- calqué sur form_shares
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version_id uuid references public.document_versions(id) on delete set null,
  email text not null,
  language public.ui_language not null default 'fr',
  comment text,
  token_hash text not null, code_hash text, code_expires_at timestamptz,
  expires_at timestamptz not null,
  sent_at timestamptz, sent_by uuid references public.collaborators(id) on delete set null,
  revoked_at timestamptz,
  contributor jsonb,                               -- prénom, nom, entreprise, fonction
  created_at timestamptz not null default now()
);
create unique index document_shares_active_unique on public.document_shares (lower(email), document_id) where revoked_at is null;
create index document_shares_document_idx on public.document_shares (document_id);

-- ===== TRAMES (si non créées par le lot Paramètres, cf. spec 01 §6.12) =============
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  link_type text not null check (link_type in ('default','client','family')),
  client_id uuid references public.clients(id) on delete cascade,
  family_id uuid references public.label_families(id) on delete cascade,
  page_type text not null,                         -- COVER_PAGE, PAGE_CONTENT_V, … (spec 01 §6.12)
  pdf_path text not null,
  margin_top numeric not null, margin_bottom numeric not null,
  margin_left numeric not null, margin_right numeric not null,
  page_number_x numeric, page_number_y numeric,
  index_max int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((link_type = 'client') = (client_id is not null)),
  check ((link_type = 'family') = (family_id is not null))
);
create unique index document_templates_unique on public.document_templates
  (organization_id, page_type, link_type, coalesce(client_id, family_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ===== DOSSIER DE CLÔTURE ========================================================
create table public.closing_folder_templates (    -- spec 01 §6.10
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null, description text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.closing_section_templates (
  id uuid primary key default gen_random_uuid(),
  folder_template_id uuid not null references public.closing_folder_templates(id) on delete restrict,
  type public.closing_section_type not null,
  name text not null, description text,
  category_id uuid references public.label_families(id) on delete set null,
  include_previous_versions boolean not null default false,
  position int not null default 0
);
create index closing_section_templates_folder_idx on public.closing_section_templates (folder_template_id);

alter table public.documents
  add constraint documents_folder_template_fkey foreign key (folder_template_id)
  references public.closing_folder_templates(id) on delete set null;

create table public.closing_sections (             -- sections d'un dossier (document nature 'rfi')
  id uuid primary key default gen_random_uuid(),
  folder_document_id uuid not null references public.documents(id) on delete cascade,
  type public.closing_section_type not null,
  name text not null,
  description text, observation text,
  category_id uuid references public.label_families(id) on delete set null,
  flow_id uuid references public.flows(id) on delete set null,            -- report / certificate / reference
  all_emm_elements boolean not null default true,
  include_previous_versions boolean not null default false,
  sort_mode smallint check (sort_mode between 1 and 10),
  disabled boolean not null default false,
  position int not null default 0,
  last_generated_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.collaborators(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.collaborators(id) on delete set null,
  check (type not in ('report','certificate','reference') or flow_id is not null)
);
create index closing_sections_folder_idx on public.closing_sections (folder_document_id, position);

create table public.closing_section_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.closing_sections(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  version_id uuid references public.document_versions(id) on delete set null,   -- null = dernière diffusée
  emm_element_id uuid,                              -- block_emm_items (certificats / références)
  position int not null default 0,
  added_at timestamptz not null default now(),
  check (document_id is not null or emm_element_id is not null)
);
create index closing_section_items_section_idx on public.closing_section_items (section_id, position);
create index closing_section_items_document_idx on public.closing_section_items (document_id);

-- ===== LISTES ===================================================================
create table public.project_lists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  type public.project_list_type not null,
  name text not null, reference text, description text,
  category_id uuid references public.label_families(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index project_lists_project_idx on public.project_lists (project_id);
create table public.project_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.project_lists(id) on delete cascade,
  equipment_id uuid references public.library_equipments(id) on delete restrict,
  risk_id uuid references public.library_risks(id) on delete restrict,
  quantity numeric, unit text, consumable boolean not null default false,
  comment text, display_comment boolean not null default false,
  position int not null default 0,
  check ((equipment_id is null) <> (risk_id is null))
);
create unique index project_list_items_unique on public.project_list_items
  (list_id, coalesce(equipment_id, risk_id));
alter table public.documents
  add constraint documents_linked_list_fkey foreign key (linked_list_id)
  references public.project_lists(id) on delete restrict;

-- ===== FK MANQUANTES SUR LES TABLES EXISTANTES =====================================
alter table public.block_documents
  add constraint block_documents_document_fkey foreign key (document_id)
    references public.documents(id) on delete restrict,          -- « Ce document est utilisé dans un ou plusieurs flows »
  add constraint block_documents_pinned_version_fkey foreign key (pinned_version_id)
    references public.document_versions(id) on delete set null,
  add constraint block_documents_frozen_version_fkey foreign key (frozen_version_id)
    references public.document_versions(id) on delete restrict;  -- un indice figé par signature ne disparaît pas
create unique index block_documents_unique_doc_version on public.block_documents
  (block_id, document_id, coalesce(pinned_version_id, frozen_version_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where document_id is not null;
create index block_documents_pinned_idx on public.block_documents (pinned_version_id);
create index block_documents_frozen_idx on public.block_documents (frozen_version_id);

alter table public.diagrams
  add constraint diagrams_document_fkey foreign key (document_id)
    references public.documents(id) on delete set null;
create unique index diagrams_document_unique on public.diagrams (document_id) where document_id is not null;

-- ===== STOCKAGE ==================================================================
-- Bucket privé « documents » : library/<document_id>/…, projects/<project_id>/<document_id>/<version_id>/…
-- file_size_limit 2 Go (upload résumable TUS côté client) ; PDF générés dans le même bucket (generated/…).
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 2147483648) on conflict (id) do nothing;
```

RPC (security definer, `search_path=''`, contrôle de droits en tête, verrou `for update` sur la dernière version) [INF] :
- `document_create(...)` (T0 : génère `ref_int` via `reference_rules`, calcule `index_format` depuis `start_index`, insère la version 1) ;
- `document_diffuse(version_id, date, comment)`, `document_diffuse_bpa(version_id, user_id, date, comment)`, `document_cancel_diffusion(version_id)`, `document_client_response(version_id, visa, date, label, ref, comment)`, `document_to_bpe_valid(version_id, user_id, date, comment)`, `document_add_index(document_id, mode 'next'|'same'|'sub')`, `document_delete_last_version(document_id)`, `document_set_contributors(...)`, `document_particularize(version_id, ref_int, ref_ext)`, `document_edit_diffusion_free(version_id, state, date, comment)` (mode déverrouillé), `document_refresh_from_library(document_id)` ;
- fonction pure `private.next_document_index(format index_format, current text, mode text) returns text` ;
- trigger `freeze_dsi_documents` (spec 02) : renseigne `block_documents.frozen_version_id` = dernière version **ayant un fichier** du document au moment de la signature ;
- trigger de propagation bibliothèque : à l'insertion d'une version de bibliothèque, `library_update_available = true` sur les copies d'entité.
- Les RPC qui génèrent un PDF insèrent une ligne `background_tasks (kind='document_generation', file_type='pdf', metadata={document_version_id, action})` ; la transition d'état est validée **après** génération réussie (statut `done`) pour T2/T10/T13/U5/U9/U10 [INF : sinon la diffusion échoue avec les erreurs de trame §4.6].

---

## 10. Plan de génération PDF

### 10.1 Architecture

- **Exécution serveur Node** (pas Edge) : route handler Next.js `runtime='nodejs'` ou worker dédié, déclenché par une ligne `background_tasks` (statut `acknowledged` → `in_progress` → `done|error|to_retry`) ; réveil via `pg_net`/webhook Supabase ou cron toutes les minutes ; Realtime sur `background_tasks` pour la cloche (spec 00).
- Réponse synchrone si génération < ~5 s (aperçu d'un petit document), sinon identifiant de tâche → cloche (comportement observé : blob ou `backgroundTaskUuidEntity`).
- **Pipeline** :
  1. *Collecte* : requêtes SQL du contenu (document + options + flow/blocs/formulaires/réponses/liste/diagramme + version + contributeurs + entité + client + compte).
  2. *Résolution des trames* par type de page (famille > client > défaut, replis §6.1) ; chargement des PDF de trame depuis Storage (cache mémoire par `document_templates.id`).
  3. *Composition du contenu* avec **@react-pdf/renderer** : composants par nature (tables DSI/EMM/ADR/Objets, flux d'instructions HTML → éléments react-pdf, rendu de formulaires/réponses, listes), format A4 portrait/paysage selon la trame V/H, **marges = marges de la trame** (le contenu est rendu sur une page vierge de mêmes dimensions avec padding = marges).
  4. *Habillage* avec **pdf-lib** : pour chaque page de contenu, nouvelle page = copie de la page de trame (`embedPage` de la trame en fond) + `drawPage` du contenu rendu par-dessus ; page de garde : remplissage des **champs AcroForm** de la trame (`getForm().getTextField(name).setText`) puis `flatten()` ; numéro de page « n / N » à (X, Y) (police standard Helvetica) ; **filigrane** (texte du compte, diagonal, opacité ~0,15, sur chaque page) ; **logo client** (`accounts.cover_logo` {x,y,width,height}, image du client) sur la page de garde.
  5. *Annexes* : `PDFDocument.load` des PDF externes (refus si chiffrés → message « verrouillé ») ; `copyPages` en fin de document, intercalaire (page titre) optionnel entre annexes ; documents volumineux exclus.
  6. *Langues* : dictionnaire de libellés par langue (`fr/en/de/it`) ; si Langue 2 ≠ none, libellés bilingues « Libellé L1 / Libellé L2 » dans les en-têtes de tableau et les pages techniques [INF].
  7. *Compression* : images re-encodées avec `sharp` (JPEG qualité ~80, PNG → JPEG si pas d'alpha, redimensionnées à 150–200 dpi effectifs) avant intégration (R2.23).
  8. *Persistance* : PDF figé dans `documents/…/<version_id>/document.pdf` (`pdf_path`, `pdf_size`, `template_snapshot`) ; URL signée pour téléchargement.
- **Diagramme** : l'image est produite côté client (export du canevas du diagramme en PNG) et téléversée avant génération (comportement observé) ; le serveur l'intègre.
- **Mise en évidence des changements** (option) : comparer `blocks.revision` / `flow_revisions` entre la version courante et le dernier indice principal ; barre verticale en marge gauche des blocs modifiés [INF].
- **Version avant données terrain** : même pipeline avec un indicateur `withoutFieldData` qui omet signatures, réponses et observations.

### 10.2 Dossier de clôture (jusqu'à 10 Go)

- pdf-lib charge tout en mémoire : inadapté au-delà de quelques centaines de Mo. Approche : générer **chaque section** en PDF séparé (react-pdf + pdf-lib), stocker en Storage, puis **concaténer en flux** avec un outil natif (`qpdf --empty --pages …` dans le conteneur worker) ; sommaire RFI calculé à partir du nombre de pages de chaque partie (2 passes : sommaire provisoire puis final).
- [INF recommandé v1] plafond plus bas (ex. 1–2 Go) et alternative « ZIP des sections » ; la limite 10 Go et les documents volumineux intégrés au PDF final en v2.
- Avertissements bloquants : document > 20 Mo dans une section Document ; documents non diffusés listés (exclus).

### 10.3 Raisonnablement générable en v1 vs différé

| Élément | v1 | Remarque |
|---|---|---|
| PDF avec / sans version (externe) | ✔ | pas de génération, seulement stockage + aperçu |
| Instructions, Instructions multiples, Moyens, Risques, Contrôles, Objets | ✔ | tables + HTML simple ; HTML riche (Froala) → convertisseur HTML → react-pdf limité (titres, listes, gras, images, tableaux simples) |
| Formulaires (toutes variantes), remontées terrain | ✔ | réutiliser le rendu de réponses de la spec 03 |
| Listes (flows, documents, moyens, risques, collaborateurs + fiches compétences) | ✔ | |
| Diagramme | ✔ | image client |
| Champs PDF de trame | ✔ | convention de nommage à documenter (§11) |
| Mise en évidence des changements | ◐ | après stabilisation des révisions |
| Dossier de clôture > 2 Go | ✖ | v2 (qpdf en flux) |

---

## 11. Incertitudes

1. **Effet exact des retours client** (T4–T6, T11–T12) : le FE montre seulement que la réponse renvoie `currentVersion` + `newVersion`. Que la nouvelle ligne soit « même indice / BPE » (VSO), « même indice / TEMP » (VSO-SR) et « n+1 / BPO » (VAO) est inféré des libellés ; idem KO sur sous-indice (nouvelle ligne ou simple état `bpa_refused`).
2. **Diffusion sans retour client** (famille `client_supervision=false`) : passage direct à BPE supposé ; à confirmer (peut aussi rester BPO sans attente).
3. **État après annulation de diffusion** de la toute première ligne : retour PREL supposé.
4. **Sous-indice** : forme de l'indice (`A.1` ? `A1` ?) et incrément pour les formats décimaux non observés.
5. **Déduction du format d'indice** depuis l'indice de départ (R-IDX-1) et suite alphabétique après Z.
6. **Natures portant Préambule / Objet / Glossaire** et **hide_index_column** : conditions d'affichage non résolues (probablement pr/multi_pr et dsi).
7. **Liste des champs PDF** des trames (noms exacts) : côté serveur, non présente dans le bundle ; à établir avec des trames réelles (suffixe « Indice » pour le multi-indice).
8. **Droit Delete** demandé pour « supprimer le dernier indice » sur `DashDocumentsEditModal` alors que la règle n'existe pas pour cette modale : comportement réel (autorisé à tous / refusé) inconnu.
9. **EditRef** : sens exact (édition manuelle des références générées) inféré.
10. **Compte rendu** (section `report`) : contenu exact (tableau récapitulatif des signatures + avancement ?) non observé.
11. **« Tout le contenu du dossier de clôture est figé »** : déclencheur (diffusion du dossier ? état BPE ?) inconnu.
12. **Mise à jour depuis la bibliothèque** : périmètre exact des versions recopiées et traitement des documents « en cours de validation » (« ne seront pas affectés ») ; sémantique de « Diffuser sans mettre à jour » pour une LDA.
13. **Seuil 20 Mo vs limite d'upload** : la spec 00 mentionne « PDF 20 Mo » (validateur générique) alors que les documents externes acceptent 2 Go ; 20 Mo est ici retenu comme **seuil de document volumineux**, pas comme limite d'import.
14. **Supabase Storage** : objets de 2 Go exigent l'upload résumable (TUS) et une limite de taille relevée au niveau du projet (plan payant) ; à valider avant de promettre 2 Go.
15. **Contributeurs obligatoires** à la diffusion : lesquels (rédacteur seul ? les trois ?) non déterminé ; « Mettre à jour depuis le flow » : correspondance supposée avec rédacteur/vérificateur/approbateur des blocs.
16. **Lignes « Réponse » / « Référence »** de l'onglet Suivi : la colonne « Réponse » affiche probablement la date de réponse ; non vérifié.
17. **Module Listes** : présence d'une applicabilité et d'une famille sur la liste (libellés présents dans `lists.dialog.labels.*`) non confirmée pour les listes d'entité ; modèle réduit proposé.
18. **Provenances historiques** (`Library`, `Referential`, `ReferentialCreated`) : sens exact non déterminé ; ramenées à `scope` + `origin`.
19. **Génération synchrone vs asynchrone** : seuil de bascule côté serveur inconnu (flag `sfp-19671-async-doc-gen`).
20. **Langue 2** dans le PDF : rendu bilingue supposé (libellés juxtaposés) ; il pourrait s'agir d'un second PDF.
