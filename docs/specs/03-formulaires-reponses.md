# Spec fonctionnelle 03 — Formulaires (bibliothèque + projet) et réponses de formulaires

> Cible : reconstruction fonctionnelle de Siteflow (WebApp Angular, build FE 2.23.6) en Next.js + shadcn + Supabase.
> Ce document décrit **comportements, champs, enums, règles**. Il ne reprend aucun code Siteflow.
> Date de rédaction : 2026-10-23.

## 0. Conventions

### 0.1 Légende des preuves

| Marque | Signification |
|---|---|
| **[O]** | OBSERVÉ : présent dans une source (clé i18n citée entre backticks, enum de `enums-numeric.txt` / `enums-string.txt`, article helpcenter, ou structure lue dans le bundle). |
| **[I]** | INFÉRÉ : déduit par recoupement ; à valider. |

Abréviations des sources :
- `i18n:` clé de `docs/reverse/i18n-fr.json` (libellé FR entre guillemets).
- `enum:` ligne de `docs/reverse/enums-numeric.txt` ou `enums-string.txt`.
- `HC:` article helpcenter (`docs/reverse/helpcenter/*.txt`), ex. `HC:Structural`, `HC:Concordance`, `HC:R2.19` (notes de version 2026), `HC:APIv2-2025`.
- `BUNDLE:` structure observée dans `exhibit_2026-10-22_1552/*.js` (nom de propriété DTO, liste de types, regex). Les noms DTO cités servent de **référence de mapping**, pas de modèle à copier.

### 0.2 Nommage proposé

- Colonnes et champs techniques en `snake_case`.
- Les natures/enums sont exprimées en codes texte stables (`short_answer`, `table_column`…) ; la valeur numérique Siteflow est donnée pour mémoire.
- « Formulaire » = *form* ; « rubrique » = *rubric* (1er niveau) ; « question » = *field* (2e niveau ; dans un tableau = une ligne ou une colonne) ; « option » = *field option* (3e niveau ; dans un tableau = une cellule).

### 0.3 Correction de l'analyse antérieure

`COMPARAISON_formulaires_siteflow_vs_qiwi_2026-10-22.md` affirme « Logique conditionnelle : ❌ non livrée ». **C'est inexact.** Siteflow possède une logique conditionnelle de **navigation** au niveau de l'option de réponse :
- [O] `i18n:option.label.redirect` « Conditions de redirection », `i18n:option.redirect.cell` « Si la question suivante est remplie: », `i18n:option.redirect.operator` « alors l'opérateur sera redirigé vers: », `i18n:option.redirect.rubric` « Rubrique », `i18n:option.redirect.question` « Question ».
- [O] BUNDLE : propriétés d'option `checkedNextQuestion`, `nextRubric{uuidType,uuidEntity,name}`, `nextQuestion{…}`, et un algorithme de navigation qui remplace « rubrique suivante » par la rubrique cible (§6.6).
- [O] `HC:R2.15` « [Ticket #2115] La redirection de rubrique est désormais correctement prise en compte lors de la reprise d'un formulaire ».
- [O] Au niveau flow (hors de ce domaine) : `flowContentNavigation.dialog.stepNavigation.redirect` « Redirection {{ index }} » (redirections entre étapes, endpoint `navigation-flows`).

Ce qui **n'existe pas** (aucune trace) : afficher/masquer une question selon une réponse (*show/hide*), rendre obligatoire conditionnellement, scoring. La redirection est un **saut de navigation**, pas une visibilité conditionnelle.

Autres logiques « réactives » existantes que l'analyse antérieure ne mentionnait pas : alertes sur option (§3.5.4), validation de données bloquante ou non (§3.5.3), formules inter-rubriques (§5).

---

## 1. Modèle conceptuel

```
Organisation
 ├── Bibliothèque (location = library)
 │    └── Formulaire bibliothèque (nature: modèle | générique)
 │          └── Rubrique* (question | tableau par colonnes | tableau par lignes)
 │                └── Question* (nature 1..17)  ── en tableau : ligne ou colonne
 │                      ├── Option* (champ de saisie, choix, cellule)
 │                      └── Signataire* (si nature = Collaborateur et signature)
 └── Projet (entité)
      ├── Formulaire projet importé (origin = imported, sourced_from = formulaire bibliothèque)
      ├── Formulaire local (origin = local, copie indépendante d'un importé)
      ├── Liaison formulaire ↔ bloc Formulaires d'une étape de flow  (« form business link »)
      └── Réponse de formulaire (context = project | flow)
            └── Valeur d'option* (+ historique des modifications)
```

[O] `HC:Structural` : « Forms are always created in the library first; they can then be imported into any type of project. There are 2 types of forms : TEMPLATE and GENERIC. » ; « Library forms … location set to library » ; « Imported forms … origin set to imported from library … Has sourcedFromForm » ; « Local forms are forms copied, locally within a project, from imported forms (origin set to local). They are independent » ; « A form response … Directly within a project (context set to project). Or … linked to a form block at a step in a flow (context set to flow). »
[O] `HC:Structural` : « A form response always contain a technical reference to: The project form the response is issued from including its reference and index at response time. The library form the project form is sourced from at response time. »

Identifiants : [O] `HC:Concordance` « uuidType (UUID du formulaire ou UUID du formulaire originel : si un formulaire est importé dans un projet, alors l'uuidType correspond au formulaire dans la bibliothèque à partir duquel il a été importé) ». Le même principe `uuidType` existe pour rubriques et questions (BUNDLE : `rubric.uuidType`, `nextRubric.uuidType`, `initialRubricUuidType`) → **identifiant de lignée stable** entre la bibliothèque et ses copies. À reproduire : chaque élément a `id` (instance) et `lineage_id` (origine).

---

## 2. Formulaire (métadonnées)

### 2.1 Champs

| Champ proposé | Type | Oblig. | Valeurs / règles | Libellé FR | Preuve |
|---|---|---|---|---|---|
| `id` | uuid | oui | | | |
| `lineage_id` | uuid | oui | = id du formulaire bibliothèque d'origine (sinon = id) | — | [O] `uuidType` |
| `organization_id` | uuid | oui | | | [O] `uuidOrganization` |
| `location` | enum | oui | `library`, `project` | — | [O] `HC:Structural` |
| `origin` | enum | si project | `imported`, `local` | — | [O] `HC:Structural` |
| `project_id` | uuid | si project | | Projet | [O] `HC:Concordance project.*` |
| `sourced_from_form_id` | uuid | si imported | formulaire bibliothèque source | — | [O] `sourcedFromForm` |
| `nature` | enum | oui | `model`(1) `generic`(2) `other`(3) `local`(4) `archived`(5) | Type : « Modèle » / « Générique » / « Autre » / « Local » | [O] `enum: Model=1 Generic=2 Other=3 Local=4 Archived=5`, `i18n:forms.formNature.*` (abréviations M/G/O/L) |
| `name` | text | oui | | « Nom » | [O] `i18n:forms.dialogs.createOrEdit.fields.name` |
| `description` | text | non | | « Description » | [O] |
| `reference` | text | non | référence interne ; peut être générée par une règle de chrono (module Paramètres > Références, entité « Formulaire », champ « Référence ») | « Référence » | [O] `i18n:forms.dialogs.createOrEdit.fields.reference`, `i18n:referenceTranslateKey.modals.new.form.refInt`, `i18n:forms.entityChrono.generated` « Généré(e) automatiquement » |
| `index` | text | non | indice de version libre (« A », « 01 »…) | « Indice » ; tooltip « Indice du formulaire lors de la réponse » | [O] `i18n:forms.dialogs.createOrEdit.fields.index`, `i18n:forms.tooltips.index` |
| `family_id` | uuid | oui en création | famille (label family) de nature formulaire | « Famille » (`Famille *`) | [O] `i18n:flowApp.form.labelFamily.required` |
| `applicability_id` | uuid | non | | « Applicabilité » | [O] |
| `company_ids` | uuid[] | non | sociétés autorisées à voir/utiliser | « Société(s) autorisée(s) » | [O] `i18n:forms.dialogs.createOrEdit.fields.companies`, `HC:R92` filtre Société |
| `custom_status_id` | uuid | non | statut personnalisé de nature « Formulaire » ; défaut = statut « par défaut » | « Statut » | [O] `i18n:forms.dialogs.createOrEdit.fields.status`, `status.dialog.options.defaultCustomStatus` |
| `status_change_comment` | text | non | commentaire saisi lors d'un changement de statut (historisé) | « Commentaire changement statut » | [O] `i18n:forms.dialogs.createOrEdit.fields.customStatusChangeComment`, BUNDLE `submitterComment` |
| `additional_comment` | text | non | texte affiché en en-tête du formulaire / dans les variables `@@AdditionalStatementForm` | « Mention complémentaire » | [O] |
| `additional_observation` | text | non | texte d'aide affiché en tooltip | « Observation complémentaire » | [O] |
| `lock_responses` | bool | non (false) | verrouillage automatique des valeurs après saisie (§6.10) | « Activer le verrouillage automatique des réponses de formulaires » | [O] `i18n:forms.dialogs.lockForm`, BUNDLE `lockForm` |
| `object_attributes_link` | enum | non | `disabled`(0) `default_family`(1) `other_family`(2) | « Activer l'ajout d'attributs d'objet dans le formulaire » | [O] `i18n:forms.dialogs.objectAttributesLabel`, BUNDLE `formTechnicalObjectAttributesLinkType` |
| `object_family_id` | uuid | si other_family | famille d'objet technique | | [O] BUNDLE `technicalObjectFamily` |
| `use_pdf_template` | bool | non | exporter avec une trame de fond PDF personnalisée | « Exporter ce formulaire avec une trame de fond PDF personnalisée » | [O] `i18n:forms.dialogs.createOrEdit.fields.useTemplate` |
| `pdf_template_file_id` | uuid | si use_pdf_template | fichier PDF importé | « Importation du fichier » | [O] |
| `pdf_page_number_x`, `pdf_page_number_y` | int | non | position du numéro de page sur la trame | « Position numéro de page X/Y » | [O] |
| `hide_in_export_control_doc` | bool | non | masqué dans « Document Contrôles » (tableau de contrôles venant d'un flow) | | [O] `hiddenInControlDocument.*`, BUNDLE `hideInExportDsi` |
| `hide_in_export_forms_doc` | bool | non | masqué dans « Document Formulaires » | | [O] `hideInExportForm` |
| `hide_in_export_multi_instr_doc` | bool | non | masqué dans « Document Instructions Multiples » | | [O] `hideInExportMultiPr` |
| `hide_in_export_instr_doc` | bool | non | masqué dans « Document Instructions » | | [O] `hideInExportPr` |
| `archived` | bool | non | archivage bibliothèque (réversible) | | [O] endpoint `forms-library/archive` corps `{uuidEntity, archived}` |
| `already_imported` | bool (calculé) | | vrai si importé dans ≥1 projet → certaines modifications/suppression bloquées | | [O] BUNDLE `frozen: alreadyImported` |
| `update_available` | bool (calculé, projet) | | la source bibliothèque a changé depuis l'import | icône orange « Mettre à jour » | [O] BUNDLE `updated`, `HC:R2.21` |
| `created_at/by`, `updated_at/by` | | | | « Date de création … par » / « Dernière modification … par » | [O] `i18n:forms.dialogs.properties.*` |

Les sections « Général » et « Options » du dialogue de création/édition [O] `i18n:forms.dialogs.createOrEdit.general/options`. La section options porte : verrouillage auto, attributs d'objet, trame PDF, masquages documentaires [I] (répartition exacte non certaine).

### 2.2 Natures et droits

- [O] Création : la liste des types proposés dépend des droits : « Modèle » seulement si l'utilisateur a le droit *UserModelForm*, « Générique » seulement si *UserGenericForm* (BUNDLE `selectSingleItemsForCreation`; `enum: … UserGenericForm=11 UserModelForm=12`).
- [O] « Local » n'est sélectionnable que dans un projet (copie locale) ; « Autre » est une valeur héritée (API `Autre`) affichable mais non proposée à la création.
- [I] Usage métier :
  - **Modèle** (TEMPLATE) : formulaire destiné à être **lié à un bloc Formulaires** d'étape de flow (réponse en contexte flow) ; seul type supportant les questions « attribut d'objet » ([O] `HC:R97` « Nouvelle option pour les formulaires modèle, permettant d'ajouter des questions attribut liées à des objets techniques »).
  - **Générique** : répondable directement au niveau du projet (module Formulaires, MobileApp), ex. déclaration d'aléa / non-conformité ([O] `HC:R92` « créer une nouvelle réponse de formulaire générique dès qu'une valeur est non-conforme »), et liable aussi à un bloc (« Lier un formulaire générique » [O] `i18n:blocks.form.dialogs.import.genTitle`).
  - Statut personnalisé option « Visible depuis la MobileApp (uniquement type Générique) » [O] `i18n:status.dialog.options.downloadableForm`.

### 2.3 Statuts

Deux notions coexistent :
1. **Statut personnalisé** (`custom_status`, nature « Formulaire ») géré dans Paramètres > Statuts, avec options [O] `i18n:status.dialog.options.*` :
   - `is_default` « Rendre ce statut sélectionné par défaut à la création »
   - `visible_mobile` « Visible depuis la MobileApp (uniquement type Générique) »
   - `importable` « Visible dans les fenêtres d'importation depuis la WebApp » (un formulaire dont le statut n'est pas importable n'apparaît pas dans « Importer depuis la bibliothèque »)
   - `exportable` « Visible lors de l'exportation »
   - couleur, commentaire (affiché au survol), type de lien (défaut / famille parent / famille enfant).
   - [O] `i18n:status.alert.declaredAsDefault`, `alreadyInUse` : impossible de supprimer un statut utilisé ou par défaut.
2. **Liste héritée** `flowApp.formStatus.*` / `flowApp.ChoixStatusForm.*` : Actif, Inactif, À faire, En cours, En préparation, En rédaction, En vérification, En approbation, À disposition, Terminé, Fermé, Annulé, En attente, À traiter/Traité, Vide, Aucun. [O] `i18n:flowApp.form.info` « Uniquement les formulaires avec des status « Actif », « À faire » et « En cours » sont visibles ». → [I] à reprendre comme **jeu de statuts par défaut** semé à la création d'organisation, pas comme enum figé.

Historique des statuts : [O] `i18n:global.statusHistory.createEvent.form` « {{userName}} a créé le formulaire {{businessName}} avec le statut … ». Endpoint `forms/customStatus` (changement de statut, y compris en masse).

### 2.4 Écrans

| Écran | Contenu | Preuve |
|---|---|---|
| Bibliothèque des formulaires (`/library/forms`) | Liste paginée ; colonnes Famille, Nom, Référence, Indice, Modification, Statut, Société, Action ; recherche ; filtres Applicabilité, Société, Famille, Statut, Type ; compteur « {{ current }} élément(s) / {{ total }} au total » ; sélection multiple « {{counter}} élément(s) sélectionné(s) » | [O] `i18n:forms.title2`, `forms.table.header.*`, `forms.filters.*`, `enum: bR Family Name Reference Index LastUpdate Status Company Actions` |
| Formulaires du projet (`/…/forms`) | Liste ; mêmes colonnes + Provenance/État/Flow en filtres ; chip type (M/G/L) ; icône « Formulaire avec trame personnalisée » ; « Formulaire à lier avec un objet » | [O] `i18n:forms.title` « Liste des formulaires », `forms.filters.flow/provenance/state`, `forms.tooltips.formWeft`, `forms.tooltips.toBeLinkedToObject` |
| Dialogue Créer/Éditer | onglets Général / Options ; navigation « Formulaire précédent/suivant » | [O] `i18n:forms.dialogs.createOrEdit.*` |
| Propriétés | Nom, Type, Famille, Applicabilité, Réf. interne/externe, création/dernière modif par, flows où il est utilisé, attributs d'objet | [O] `i18n:forms.dialogs.properties.*` |
| Éditeur (builder) plein écran | menu de navigation latéral (rubriques/questions, redimensionnable, repliable), en-tête (nom, famille, mention, flèches rubrique précédente/suivante, aperçu PDF, bascule de mode) | [O] `i18n:forms.previousRubric/nextRubric`, `rubrics.previewFormPdf`, enum string `FormMenuCollapsed/FormMenuWidth` |

### 2.5 Actions sur un formulaire

[O] Enum menu (BUNDLE) : `Reply=1 Edit=2 Overview=3 Summarize=4 Duplicate=5 Export=6 Refresh=7 Delete=8 Property=9 LocalCopy=10 EditInfo=11 EditContent=12 History=13 Share=14 Activate=15 Deactivate=16` ; libellés `i18n:forms.table.actions.*` : Répondre, Editer, Aperçu, Résumé, Dupliquer, Exporter, Mettre à jour, Supprimer, Propriétés, Créer une copie locale, Editer les informations, Editer le contenu, Historique, Partager, Activer, Désactiver.

| Action | Où | Règles |
|---|---|---|
| Créer | bibliothèque | voir §2.2 ; [O] toasts `createSuccess` « Formulaire crée avec succès » / `createFail`. |
| Éditer les informations | biblio, projet | dialogue §2.1 |
| Éditer le contenu | biblio, copie locale | ouvre le builder (`BuildMode`). [O] Bascule édition/aperçu autorisée seulement si provenance = `library` ou `local` (BUNDLE `isSwitchModeAuthorized`), sinon `i18n:forms.mode.switchMode.error` « Vous ne disposez pas des droits nécessaires à cette action ». ⇒ **un formulaire importé n'est pas éditable dans le projet** ; on édite en bibliothèque puis on met à jour, ou on crée une copie locale. |
| Aperçu | partout | `ViewMode` (lecture du formulaire vide). |
| Aperçu PDF | builder | génère un PDF du formulaire vide. [O] `forms.alerts.previewPdf.fail`, endpoint `forms/{id}/preview-pdf`. |
| Dupliquer | biblio | dialogue « Duplication du formulaire {{formName}} » : type source → **nouveau type cible** + nouveau nom (défaut « Copie … »). [O] `i18n:forms.dialogs.duplicate.*` (« Duplication du formulaire de type … nommée … en formulaire de type … »). [O] `rubrics.alerts.duplicate.title` « Les attributs d'objets ne seront pas dupliqués ». |
| Réorganiser (masse) | biblio | changer Famille ou Société de N formulaires sélectionnés ; confirmation « Êtes-vous certain.e.s de vouloir changer le.la "{{type}}" pour le(s) {{count}} formulaire(s) sélectionné(s)? ». [O] `i18n:forms.dialogs.reorganize.*` |
| Importer depuis la bibliothèque | projet | sélection multiple, **max 10** [O] `forms.dialogs.import.sizeLimitExceeded` « Impossible de sélectionner plus de 10 éléments. Veuillez faire le traitement par lots » ; conflit « Formulaire(s) déjà affecté » [O] `forms.dialogs.import.conflict` ; seuls les formulaires à statut *importable*. Endpoint `forms/import-list` (`formsUuidEntity` ou `allSelected + filtres`, `confirmed`). |
| Créer une copie locale | projet (sur importé) | crée un formulaire `origin=local`, `nature=local`, indépendant [O] `forms.dialogs.response.createFormLocalCopySuccess` « Formulaire local crée avec succès ». |
| Mettre à jour | projet (importé) | réimporte la dernière version bibliothèque. Confirmation [O] `forms.alerts.refreshForm.title` « Êtes-vous certain.e.s de vouloir mettre à jour le formulaire? » + sous-titre « Les réponses à l'etat « En cours » et « Terminé » faisant appel à ce formulaire ne seront pas affectées par la mise à jour. » ; [O] `flowApp.form.response.sweetAlert.updateFormText` « Tous les appels à ce formulaire dans le(s) flow(s) seront mis à jour ; Si une réponse est en cours de remplissage avec une version précédente du form, aucun changement ne sera effectué sur celle-ci ». Mise à jour **en masse** possible (« Mettre à jour tous les formulaires déjà importés » [O] `forms.tooltips.refreshForms`). Interdit sur élément désactivé [O] `forms.toaster.refresh.disabled`. [O] `HC:R2.21` icône orange dans la colonne Actions quand une mise à jour est disponible. [O] `HC:R2.12` « Cliquer sur Annuler au moment de mettre à jour un formulaire ne met plus à jour le formulaire ». |
| Activer / Désactiver | projet | désactivé ⇒ impossible d'ajouter une réponse [O] `blocks.form.dialogs.reply.isDisabled` « Élément désactivé, impossible d'ajouter une réponse ». |
| Archiver | biblio | statut/nature `archived`, réversible (endpoint archive `{archived:bool}`). |
| Supprimer | biblio | **refusé si utilisé dans un projet** [O] `flowApp.form.deleteForm.title` « Impossible de supprimer un formulaire déjà affecté à un projet » + liste des projets. |
| Supprimer | projet | refusé si lié à des étapes [O] `flowApp.form.deleteError.bodyP2` « est déjà affecté aux différentes étapes ci-dessous » (Flow/Phase/Étape), à des documents [O] `bodyP3`, ou s'il a des réponses [O] `flowApp.form.deleteError.warning.message` « Impossible de supprimer ce formulaire car il contient des réponses en-cours et/ou terminés ». Pas de corbeille. |
| Exporter | biblio | export XLSX de toutes les réponses du formulaire (par `lineage_id`, tous projets) [O] endpoint `forms/export/xslx/{formUuidType}/all`. |
| Historique | biblio/projet | journal d'événements (création, modification, statut) [I] (endpoint `forms/event/log`). |
| Partager | projet | §9. |
| Résumé | projet, bloc | §8.4. |
| Répondre | projet (générique), bloc | §6.2. |

---

## 3. Builder

### 3.1 Modes du formulaire

[O] `enum: ResponseMode=1 BuildMode=2 ViewMode=3 ResponseViewMode=4` ; libellés `i18n:forms.mode.*` : « Mode réponse », « Mode édition », « Mode aperçu », « Mode aperçu réponse ».
[O] Type de chargement `enum: Response=1 Builder=2 ResponseDone=3 Other=4` (API `RESPONSE / FORM / RESPONSEDONE / AUTRE`) : `Builder` → BuildMode ; `Response`, `ResponseDone`, `Other` → ResponseMode.
- `library_modes = {BuildMode, ViewMode}` ; `value_visible_modes = {ResponseMode, ResponseViewMode}` ; `read_only_modes = {ViewMode, ResponseViewMode}` [O] BUNDLE.
- Boutons [O] `i18n:forms.button.goToBuildMode` « Passer en mode édition », `goToViewMode` « Passer en mode aperçu ».

### 3.2 Rubriques

#### 3.2.1 Types

| Code proposé | Siteflow (num / API / HC) | Libellé FR | Contenu de 2e niveau |
|---|---|---|---|
| `question` | Normal=1 / `NORMAL` / `QUESTION` | « Rubrique question » | questions |
| `table_row` | TableRow=2 / `TABLE` / `ROW_BASED_TABLE` | « Tableau par lignes » | lignes (chaque ligne = une question ; ses cellules = options) |
| `table_column` | TableColumn=3 / `TABLECOLUMN` / `COLUMN_BASED_TABLE` | « Tableau par colonnes » | colonnes (chaque colonne = une question ; ses cellules = options) |

[O] `enum: Normal=1 TableRow=2 TableColumn=3 Table=4` (Table=4 n'est qu'un regroupement d'IHM « Rubrique tableau » ; jamais persisté). [O] `i18n:rubrics.dialog.rubricTypes.*`, `rubrics.dialog.tableTypes.*`. [O] `HC:Structural` « A Table Form Rubric is composed of a list of aggregated form fields ».

Dans un tableau, toutes les questions (lignes/colonnes) ont le **même nombre d'options** (cellules) ; le front comble les manques par des cellules factices [O] BUNDLE `fixFirstQuestionOptionsLengthGap`. Une **première colonne d'en-têtes** porte le nom de chaque ligne (tableau colonnes : `option_name` des options de la 1re question ; tableau lignes : nom des questions) [O] `i18n:flowApp.rubricOption.option.infoForOptionName` « Pour les tableaux, si votre ligne / colonne est situé en 1ere position vous pouvez définir son nom », `option.optionName` « Nom ligne / colonne ».

#### 3.2.2 Champs d'une rubrique

| Champ | Type | Défaut | Applicable | Libellé FR | Preuve |
|---|---|---|---|---|---|
| `id`, `lineage_id`, `form_id` | uuid | | | | |
| `type` | enum | | | « Type de tableau » | [O] |
| `position` | int (1..n) | fin | | « Position de la rubrique dans le formulaire » | [O] `rubricOrder` |
| `name` | text | | | « Nom de la rubrique question » / « Nom du tableau colonne » / « Nom du tableau ligne » | [O] `i18n:rubrics.dialog.name.*` |
| `description` | text ≤ 255 | | | « Description » | [O] `rubrics.alerts.updateRubric.failDescription` « Le champs description doit avoir une longueur maximale de 255 caractères » |
| `additional_comment` | text | | | « Mention complémentaire » | [O] `rubrics.dialog.additionalComment` |
| `additional_observation` | text | | | « Observation complémentaire » (tooltip) | [O] |
| `images` | fichiers[] | | | « Ajouter une/des image(s) », « Voir l'/les image(s) » | [O] `rubrics.seeImages`, endpoint `application-files/rubric/{id}` |
| `hidden_in_mobile` | bool | false | tous | « Masquer sur la MobileApp » ; badge « Masqué sur la MobileApp » | [O] `rubrics.dialog.hiddenInMobile` |
| `hide_in_pdf` | bool | false | tous | « Masquer sur l'export PDF » | [O] `rubrics.dialog.hideInPdfExport` |
| `pdf_landscape` | bool | false (portrait) | tous | « Format de l'export PDF » : « Portrait (vertical) » / « Paysage (horizontal) » | [O] `rubrics.dialog.pdfHorizontal`, `pdf.vertical/horizontal` |
| `export_images_in_appendix` | bool | | tous | « Exporter les images en annexe lors de l'export PDF » | [O] `rubrics.dialog.allowAddImage` ; [O] `HC:R110` photo ajoutée aussi en grand format après le tableau sauf si l'option (question) « Masquer les images en dessous du tableau » est cochée |
| `attachment_width`, `attachment_height` | enum taille | | | taille image PDF | [O] BUNDLE `attachementWidth/Height` |
| `allow_add_row` | bool | false | tableaux | « Activer l'ajout de lignes sur le terrain » | [O] |
| `allow_add_column` | bool | false | tableaux | « Activer l'ajout de colonnes sur le terrain » | [O] |
| `first_column_hidden` | bool | false | tableaux | « Masquer cette colonne » (colonne d'en-têtes) | [O] `rubrics.hideColumn`, `forms.fail.toToggle.firstColumn` « Impossible de basculer la première colonne » |
| `import_xlsx_enabled` | bool | false | **tableau par colonnes dont toutes les colonnes sont « réponse courte »** | « Activer l'importation de valeur (XLS) » + info | [O] `rubrics.dialog.importXLS`, `rubrics.dialog.importXLSInfo` |

Mapping DB ↔ métier [O] `HC:Concordance` : `allowAddQuestion` = ajout de **colonnes** pour un tableau par colonnes / de **lignes** pour un tableau par lignes ; `allowAddOption` = l'inverse. On stocke directement `allow_add_row` / `allow_add_column` (plus lisible).

#### 3.2.3 Règles et actions

- Ajouter : « Ajouter une rubrique », « Ajouter un tableau par colonnes », « Ajouter un tableau par lignes » [O] `flowApp.rubric.home.*`. Insertion après une rubrique sœur (`sibling + relativePosition`) [O] BUNDLE. Nom par défaut « Question 1 » pour la 1re question, « Colonne n », « Ligne n », « Option n », « Collaborateur n » [O] `rubrics.default*Name`.
- Une rubrique doit contenir ≥1 question ; un tableau ≥1 ligne et ≥1 colonne [O] `questions.atLeastOneQuestion/Row/Column`.
- Déplacer : dialogue « Déplacer la rubrique » / « Positionné avant la rubrique » ; drag & drop dans le menu [O] `rubrics.dialog.move.*`.
- Dupliquer [O] `rubrics.alerts.duplicateRubric.success` ; avertissement attributs d'objet non dupliqués.
- Supprimer : « Il n'y a pas de corbeille pour cet élément » [O].
- [O] `HC:R2.19` : une rubrique créée ou dupliquée **n'est plus ajoutée automatiquement** aux « flows de navigation » existants (cf. §6.7 : permissions de remplissage par bloc) ; l'ajout est manuel.
- Badges d'état en réponse : « Cette rubrique est sans réponse », « Cette rubrique a au moins une réponse verrouillée » [O] `rubrics.without.response`, `rubrics.has.locked.responses`.
- Import XLS (réponse) : « Télécharger la trame du tableau » (XLSX de structure) puis « Importer les valeurs » ; confirmation « Attention, toutes les données remplies vont être remplacées par les nouvelles. » ; succès « Le contenu du tableau a été remplacé avec succès » [O] `rubrics.downloadXLS`, `rubrics.rubrics.uploadXLS`, `rubrics.replaceRubricTable`, `forms.rubrics.alerts.uploadXlsx.success`. Endpoints `rubrics/{id}/download-xlsx-structure`, `rubrics/{id}/fill-rubric-response`.
- Agrandir/Réduire toutes les rubriques/questions [O] `flowApp.rubric.enlargeAll/reduceAll`.

### 3.3 Questions

#### 3.3.1 Natures (17)

| # | Code proposé | API Siteflow (`TypeEnum`) | HC / API v2 | Libellé FR | Simple/composite | Rubrique question | Tableau (WebApp) |
|---|---|---|---|---|---|---|---|
| 1 | `short_answer` | `Text` | TEXT | Réponse courte | simple | ✅ | ✅ |
| 2 | `long_answer` | `TextLong` | LONG_TEXT | Réponse longue | simple | ✅ | ✅ |
| 3 | `multiple_answers` | `TextMultiple` | MULTIPLE_TEXT | Réponse multiple | composite | ✅ | ❌ |
| 4 | `unique_choice` | `RadioSelect` | SINGLE_CHOICE_LIST | Choix unique | composite | ✅ | ✅ |
| 5 | `multiple_choices` | `CheckBox` | MULTIPLE_CHOICE_LIST | Choix multiple (en tableau : « Case à cocher ») | composite | ✅ | ✅ |
| 6 | `single_choice_list` | `EnumSelection` | SINGLE_CHOICE_DROPDOWN | Liste de choix unique | composite | ✅ | ✅ |
| 7 | `multiple_choice_list` | `EnumMultipleSelections` | MULTIPLE_CHOICE_DROPDOWN | Liste choix multiple | composite | ✅ | ✅ |
| 8 | `date` | `Date` | DATE | Date | simple | ✅ | ✅ |
| 9 | `datetime` | `DateTime` | DATETIME | Date et heure | simple | ✅ | ✅ |
| 10 | `duration` | `Time` | DURATION | Durée | simple | ✅ | ✅ |
| 11 | `value_unit` | `ValueUnit` | VALUE_AND_UNIT | Valeur et unité | composite | ✅ | ✅ |
| 12 | `photo` | `File` | TAKE_PICTURE | Prise de photo | simple | ✅ | ✅ |
| 13 | `collaborator` | `Contributor` | SIGNATORY / SIGNATURE | Collaborateur et signature | composite | ✅ | ✅ |
| 14 | `location` | `Localisation` | LOCATION | Localisation | simple | ✅ | ✅ |
| 15 | `formula` | `Formulas` | FORMULA | Formule | simple | ✅ | ✅ |
| 16 | `file` | `FileDocument` | FILE | Fichier (PDF) | simple | ✅ | ❌ |
| 17 | `text_editor` | `TextEditor` | RICH_TEXT_EDITOR | Editeur de texte | simple | ✅ | ❌ |

[O] `enum: ShortAnswer=1 … TextEditorAnswer=17` ; [O] BUNDLE liste des types proposés par type de rubrique : `MultipleAnswers`, `File`, `TextEditorAnswer` seulement en rubrique question ; [O] `HC:Structural` « Types FILE and RICH_TEXT_EDITOR are not applicable to SimpleFormField within AggregateFormField. Type MULTIPLE_TEXT is not applicable to CompositeFormField within AggregateFormField. » ; [O] `i18n:questions.types.*`.
Remarque : `HC:APIv2-2025` (build-form) limite la **création par API** à un sous-ensemble ; ce n'est pas une limite IHM.
[O] `i18n:questions.subtitle` « La réponse à ce type de question n'est possible que depuis la WebApp » — affiché pour `file` et `text_editor` (BUNDLE `displaySubtitle=[File, TextEditorAnswer]`).

Changer la nature d'une question existante : confirmation « Êtes-vous certain.e de vouloir modifier le type de la question ? » / « … de la colonne ? » / « … de la ligne ? » + « Cette modification entraîne la perte de données » [O] `questions.alerts.changeQuestionType.*`.

#### 3.3.2 Champs d'une question

| Champ | Type | Défaut | Applicable | Libellé FR | Preuve |
|---|---|---|---|---|---|
| `id`, `lineage_id`, `rubric_id` | uuid | | | | |
| `position` | int | | | « Position de la question dans la rubrique » | [O] `questionOrder` |
| `type` | enum §3.3.1 | `short_answer` | | « Type de question » / « Type de colonne » / « Type de ligne » / « Type de cellule » | [O] |
| `name` | text | | | « Nom de la question » / « Nom de la colonne » / « Nom de la ligne » | [O] |
| `description` | text | | | « Description (optionnel) » | [O] `questions.labels.description.title` |
| `additional_comment` | text | | | « Mention complémentaire (optionnel) » | [O] |
| `additional_observation` | text | | | « Observation complémentaire (optionnel) » (affichée en tooltip) | [O] |
| `mandatory` | bool | false | tous sauf `text_editor` | « Rendre obligatoire » | [O] `questions.labels.mandatory` ; BUNDLE `displayRequiredOption` exclut TextEditorAnswer |
| `with_observation` | bool | false | | « Possibilité d'ajouter une observation » (le répondant saisit un commentaire libre par question) | [O] `questions.labels.withObservation`, `flowApp.responseForm.label.observation` « Ajouter une observation si besoin » |
| `lockable` | bool | false | | « Activer le verrouillage de la réponse » ; désactivé si le formulaire a `lock_responses` | [O] `questions.labels.lockable` |
| `allow_backdating` | bool | **false** | `date`, `datetime` | « Autoriser l'antidatage » | [O] `questions.labels.allowBackDating`, BUNDLE `displayAntiBackdatingOption` |
| `shared` | bool | false | | « Autoriser la réponse lors du partage » (seules ces questions sont saisissables par un externe, §9) | [O] `questions.labels.shared` |
| `hide_in_pdf` | bool | false | | « Masquer sur l'export PDF » | [O] |
| `hide_images_below_table` | bool | false | questions de tableau | « Masquer les images en dessous du tableau dans l'export PDF » | [O] |
| `unify_cells` | bool | false | tableau | « Unifier toutes les cellules » | [O] `questions.labels.unifyCells` |
| `photo_size` | enum `xs,s,m,l,xl` → px 60/90/180/360/490 | `s` | `photo` (et option) | « Taille de l'image lors de l'export: » (XS…XL) | [O] BUNDLE `J2` 60/90/180/360/490 |
| `background_color` | hex | `#ffffff` (sans couleur) | | « Modifier le style » → « Couleur » | [O] `questions.labels.block.modifyStyle`, `flowApp.rubricQuestion.questionStyle.*` |
| `icon` | enum | aucun | | « Modifier l'icône » : question, clock, exclamation-triangle, wrench, flag, info-circle, bell, key, hand-paper, lightbulb, calendar-alt, eye | [O] `enum: Question=1 … Eye=12 Default=13`, BUNDLE `iconStyle` |
| `images` | fichiers[] | | | « Ajouter une/des image(s) », compteur « {{ count }} image(s) ajoutée(s) » | [O] |
| `object_attribute_id` | uuid | | formulaires modèle avec attributs d'objet | « Ajouter un attribut d'objet » | [O] `questions.addQuestionTechnicalObject`, BUNDLE `technicalObjectAttributeUuidEntity` |

Palette du style [I] : libellés hérités « Alerte / Attention / Succès / Mise en valeur — Niveau 1/2 » (`flowApp.rubricQuestion.questionStyle.color.*`) ; implémenter 8 couleurs sémantiques + « sans couleur ».

#### 3.3.3 Actions sur question

[O] `i18n:questions.actions.*` : Ajouter une option, Ajouter une demande de collaborateur, Paramétrer, Paramétrer en masse, Dupliquer, Déplacer, Supprimer, Modifier, Diviser, Unifier, Agrandir, Annoter.
[O] Enum menu tableau `InsertAbove=1 InsertBelow=2 Duplicate=3 Enable=4 Disable=5 Delete=6 HideWhenExportingPdf=7 ShowWhenExportingPdf=8`.

- **Déplacer** : vers une autre rubrique (« Vers la rubrique ») et avant une question (« Positionné avant la question » / « En dernière position ») [O] `questions.dialog.move.*`. Interdit de déplacer/dupliquer une question **vers** une rubrique tableau [O] `flowApp.rubricQuestion.toaster.moveQuestionError`.
- **Dupliquer** : ligne/colonne/question [O] `questions.alerts.duplicateQuestion.*`. Dupliquer la dernière cellule : refusé [O] `forms.fail.toDuplicate.lastCell` « Impossible de dupliquer la dernière cellule ».
- **Paramétrer en masse** (« Paramétrage de la question/colonne/ligne en masse ») : applique un paramétrage d'option à **toutes les options** de la question ; écrase le paramétrage existant [O] `questions.alerts.genericParameterize.subtitle.normal` « … tout paramétrage appliqué au préalable sera perdu ». Natures éligibles [O] BUNDLE `displayGenericParams` : en rubrique question : `multiple_answers`, `unique_choice`, `multiple_choices`, `value_unit`, `collaborator` ; en tableau : toutes sauf `file`, `text_editor`, `multiple_answers`. Endpoint `library-questions/generic-params`.
- **Diviser** (tableau, cellules unifiées) : « Les paramètres de la cellule seront appliqués à toutes les autres cellules » [O] `questions.alerts.devisedCells.*`.
- **Unifier** : « Uniquement les paramètres appliqués sur la première cellule seront conservés » [O] `questions.alerts.unifyCells.*`. [I] Effet : toutes les cellules de la ligne/colonne partagent un paramétrage unique (édité une fois) ; la valeur reste par cellule.
- **Supprimer** : pas de corbeille ; libellés distincts colonne/ligne [O].
- Création en masse de questions [O] endpoint `library-questions/bulk-create` [I] (usage IHM non identifié : probablement création depuis attributs d'objet).
- Une question créée à partir d'un attribut d'objet : [O] `questions.dialog.fromTechnicalObjectAttribute.fail`.

### 3.4 Options de réponse

Chaque question possède 1..n options (pour `collaborator` : 1..n **signataires**, §3.6). Pour les natures « simples » il y a exactement 1 option (sauf tableau : 1 option par cellule).

#### 3.4.1 Identifiant d'option (`customCode` / cellule)

- [O] Affichage dans le menu du builder : colonne « Identifiant d'option » (rubrique) / « Identifiant de cellule » (tableau) [O] `i18n:rubrics.navbar.rubric.identifier`, `rubrics.navbar.table.identifier`, `option.label.cellIdentifier`, action « Copier » → « Copié dans le presse-papier » [O] `option.clipboard`.
- [O] Format positionnel **`RxQyOz`** (rubrique x / question y / option z) : `HC:APIv2-2025` « Il est désormais possible d'extraire l'identifiant d'une option de réponse sous format "RxQyOz" ». Utilisé dans les formules sous la forme `$$RxQyOz` (§5).
- [O] `HC:Structural` « Field Option having the following attributes: An identifier (required). And a custom code (optional). » ; « The FormFieldOption could be referenced by its customCode (specified by the user). » Le *custom code* n'apparaît **pas** dans le bundle WebApp (aucune occurrence `customCode`) ⇒ [I] champ exposé/renseigné par l'API v2 uniquement.

Décision de reconstruction : stocker
- `code` (custom code libre, unique par formulaire, optionnel, éditable dans le builder — amélioration assumée) ;
- `coord` calculé `R{rubric.position}Q{question.position}O{option.position}` (non stocké ou matérialisé à la publication), recalculé à chaque réordonnancement. **Attention** : comme dans Siteflow, une formule positionnelle se casse si l'on réordonne ; voir §5.6.

#### 3.4.2 Champs d'une option

| Champ | Type | Applicable (BUNDLE) | Libellé FR | Preuve |
|---|---|---|---|---|
| `id`, `lineage_id`, `question_id` | uuid | | | |
| `position` | int | | | `optionOrder` |
| `name` | text | `unique_choice`, `multiple_choices`, `multiple_answers` (+ `collaborator`) ; en tableau : nom de ligne/colonne pour la 1re position | « Nom de l'option » / « Option {{order}} » | [O] `option.label.optionName`, `displayNameBlock` |
| `option_name` | text | tableau (libellé d'en-tête de ligne) | « Nom ligne / colonne » | [O] `optionName` |
| `description` | text | `multiple_answers`, `unique_choice`, `multiple_choices`, `date`, `datetime` (+ `short/long_answer`, `value_unit` [O] `descriptionBlock`) | « Description » | [O] `option.label.description` |
| `placeholder` | text | `short_answer`, `long_answer`, `multiple_answers` | « Champ indicatif » | [O] `option.label.indicativeField`, `displayPlaceholderBlock` |
| `choices` | text[] (stocké `"a__b__c"`) | `single_choice_list`, `multiple_choice_list` | « Texte des options » ; « Veuillez séparer vos options avec "__" (2 tirets du bas, sans espace) » | [O] `option.label.evaluationEnums`, `option.validation.evaluationEnums`, BUNDLE `preEvaluationEnums`/`enums` split `"__"` |
| `unit` | text ≤ 20 | `value_unit`, `formula` | « Unité » (placeholder « U ») | [O] `option.alerts.updateOption.tooLong` « L'unité ne peut dépasser 20 caractères » |
| `value_hint` | text | `value_unit` | « Texte indicatif » | [O] `option.label.valueUnit` [I] = placeholder de la valeur |
| `formula` | text | `formula` | « Formule » / « Saisissez votre formule ici » | [O] `option.label.formula` ; BUNDLE : stockée dans `preEvaluationValue` |
| `frozen` | bool | voir liste ci-dessous | « Figer l'option » / « Figer la cellule » ; « Figer l'option afin de ne plus la rendre modifiable » | [O] `option.label.freezeOption`, `freezeCell`, `flowApp.rubricOption.option.checkedDisabledValue` → BUNDLE `checkedDisabledValue` |
| `prefill_enabled` + `prefill_value` | bool + text/json | §3.5.1 | « Pré-remplissage » | [O] |
| `validation_enabled` + `validation` | bool + json | `date`, `datetime`, `value_unit`, `formula` | « Validation des données » | [O] §3.5.3 |
| `alert_enabled` + `alert` | bool + json | §3.5.4 | « Alerte » | [O] |
| `redirect_enabled` + `redirect` | bool + json | §3.5.5 | « Conditions de redirection » | [O] |
| `export_key_enabled` + `export_key` | bool + enum | §3.5.6 | « Valeur exportable » / « Lien de la valeur exportable » | [O] |
| `pdf_field_enabled` + `pdf_field_name` | bool + text | tous sauf `file`, `text_editor` | « Champ PDF » / « Nom du champ PDF » ; unique par formulaire | [O] `option.alerts.existingPdfName` « Ce champ PDF est déjà utilisé dans ce formulaire », BUNDLE `hideExportXlsPdf=[TextEditorAnswer, File]` |
| `xls_export_enabled` + `xls_label` | bool + text | idem | « Export XLS » / « Libellé (optionnel) » | [O] `option.label.xls`, `option.xls.label` |
| `photo_size` | enum xs..xl | `photo` | « Dimension image PDF » | [O] `option.label.photo` |
| `images` | fichiers[] | `multiple_answers`, `unique_choice`, `multiple_choices` | « Ajouter une image » | [O] `displayUploadImagesBlock`, endpoint `application-files/rubric-option/{id}` |
| `disable_signature` | bool | `collaborator` (signataire) | « Désactiver la demande de date et signature » | [O] |

`frozen` applicable [O] BUNDLE `displayDisableOption` : `short_answer`, `long_answer`, `multiple_answers`, `unique_choice`, `multiple_choices`, `single_choice_list`, `date`, `datetime`, `duration`, `text_editor`, `value_unit`, `location`, `formula` ; en tableau colonne : toutes les natures. Une option figée affiche sa valeur pré-remplie en lecture seule (aucune saisie possible).

Libellé du détail d'option : « Question {{ questionOrder }} / Option {{ optionOrder }} », « Colonne {{ questionOrder }} / Ligne {{ optionOrder }} », « Ligne {{ questionOrder }} / Colonne {{ optionOrder }} » [O] `option.title`, `option.tableColumnTitle`, `option.tableRowTitle`. Chaque bloc d'option a un lien « Détail de l'option … » vers l'aide [O] `flowApp.rubricOption.option.detail*`.

### 3.5 Options avancées

#### 3.5.1 Pré-remplissage et variables dynamiques

- Natures éligibles au pré-remplissage [O] BUNDLE `displayPreFillBlock` : `short_answer`, `long_answer`, `multiple_answers`, `multiple_choices`, `date`, `datetime`, `duration`, `value_unit`, `location`, `photo`, `text_editor`. (`formula` utilise le même champ pour sa formule.)
- Boutons [O] `option.modal.edition.empty` « Pré-remplir » / `option.modal.edition` « Modifier ».
- **Texte** (`short/long/multiple_answers`) : la valeur peut contenir des variables `@@Nom` insérées par auto-complétion après saisie de `@@` [O] `flowApp.rubricOption.option.infoPreEvaluation` « Tapper « @@ » pour sélectionner une variable dynamique de pré-remplissage » ; « Pour ajouter un champ dynamique il suffit de copier / coller le nom de la variable dans un champ de réponse » [O] `flowApp.form.VariableInformation.info`.
- **Non-texte** (`date`, `datetime`, `location`, `value_unit`, `photo`) : case « Pré-remplir avec une variable dynamique » [O] `option.preFillWithDynamicVariable` ; la valeur est alors un unique token `@@…` (BUNDLE `filledWithDynamicVariable = preEvaluationValue.startsWith("@@")`). Sinon, valeur statique typée.
- **Photo + variable** [O] `HC:R2.16` : variable pointant vers un attribut **image** (≤ 6 images par attribut) ; à l'ouverture l'image est affichée dans la question ; les images ajoutées manuellement au pré-remplissage sont supprimées quand on active la variable ; si la variable ne retourne rien → question vide.
- Pré-remplissage doit respecter la validation bloquante [O] `flowApp.rubricOption.PreFillToasterTitle` « La valeur de pré-remplissage ne correspond pas aux limitations de validation des données. »
- [O] `HC:R2.20` pré-remplissage visible en mode lecture sur MobileApp.
- En réponse, les options pré-remplies non modifiées sont tout de même enregistrées comme valeurs (BUNDLE `getUntouchedPrefilledOptions`) [O].
- Résolution [I] : à la **création de la réponse** (snapshot des valeurs du projet/flow/étape) ; bouton « Evaluer » (`forms.option.label.evaluate`) + endpoint `rubric-options/{id}/evaluate` + flag `canEvaluate` ⇒ réévaluation à la demande.

Fenêtre « Détails des variables dynamiques » [O] `questions.dynamicVariable.title`, onglets **Projet / Flow / Formulaire / Attribut** [O] `questions.dynamicVariable.tabs.*`, colonnes Nom de la variable / Description / Action (Copier).

Liste complète [O] (enum `ProjectDesignation=1 … AdditionalStatementForm=66`, tokens API `@@…` lus dans BUNDLE, libellés `questions.dynamicVariable.variables.*`) :

| Onglet | Token | Libellé FR |
|---|---|---|
| Projet | `@@ProjectDesignation` | Nom du projet |
| Projet | `@@ProjectNoCase` | Référence du projet |
| Projet | `@@ProjectNoContract` | N° de contrat du projet |
| Projet | `@@ProjectClientName1` / `2` / `3` | Nom 1/2/3 du client du projet |
| Projet | `@@ProjectLocation` | Localisation du projet |
| Projet | `@@ProjectDescription` | Description du projet |
| Projet | `@@ProjectSupervision1` / `2` / `3` | Surveillant externe 1/2/3 du projet |
| Projet | `@@ProjectInternalSupervision1` / `2` / `3` | Surveillant interne 1/2/3 du projet |
| Projet | `@@ProjectInternalOrder` | N° de commande interne du projet |
| Projet | `@@ProjectExternalOrder` | N° de commande externe du projet |
| Projet | `@@ProjectNoMarket` | N° de marché du projet |
| Projet | `@@ProjectTechnicalCase` | Affaire technique du projet |
| Projet | `@@ProjectKeywords` | Mots-clés du projet |
| Projet | `@@ProjectBusinessField` | Domaine métier du projet |
| Projet | `@@ProjectNationalProgram` | Programme national du projet |
| Projet | `@@ProjectFamily` | Famille du projet |
| Flow | `@@FlowName` | Nom du flow |
| Flow | `@@FlowDescription` | Description du flow |
| Flow | `@@FlowFamily` | Famille du flow |
| Flow | `@@FlowCategory` | Catégorie du flow |
| Flow | `@@FlowStatus` | Status du flow |
| Flow | `@@FlowSite` | Site du flow |
| Flow | `@@FlowUnit` | Tranche du flow |
| Flow | `@@FlowLocal` | Local du flow |
| Flow | `@@FlowElementarySystem` | Système élémentaire du flow |
| Flow | `@@FlowFunctionalLandmark` | Repère fonctionnel du flow |
| Flow | `@@FlowTechnicalObject` | Objet technique du flow |
| Flow | `@@FlowChrono` | Référence du flow |
| Flow | `@@FlowEpsilonFolderRef` | Référence PGAC du flow |
| Flow | `@@FlowRapporteur` | Rapporteur affecté au flow |
| Flow | `@@FlowResponsable` | Responsable affecté au flow |
| Flow | `@@FlowTablette1` / `2` / `3` | Tablette 1/2/3 affectée au flow |
| Flow | `@@FlowDateDebut` / `@@FlowDateFin` | Date de début / de fin du flow |
| Flow | `@@FlowGeometryCoordinateLat` / `Lng` / `Alt` | Latitude / Longitude / Altitude liée au flow |
| Flow | `@@FlowInternalSupervision1..3` | Surveillant interne 1/2/3 du flow |
| Flow | `@@FlowExternalSupervision1..3` | Surveillant externe 1/2/3 du flow |
| Flow | `@@CurrPhaseNumber` / `@@CurrPhaseName` / `@@CurrPhaseDescription` | Numéro / Nom / Information de la phase actuelle |
| Flow | `@@CurrStepNumber` / `@@CurrStepName` / `@@CurrStepDescription` | Numéro / Nom / Information de l'étape actuelle |
| Flow | `@@AdditionalStatementPhase` / `@@AdditionalStatementStep` | Mention complémentaire phase / étape |
| Formulaire | `@@refResponse` | Référence de la réponse |
| Formulaire | `@@currentCollaborator` | Collaborateur actuel |
| Formulaire | `@@externalCollaboratorLastName` / `FirstName` / `Company` / `Job` | Nom / Prénom / Entreprise / Fonction du collaborateur externe (partage, §9) |
| Formulaire | `@@AdditionalStatementForm` | Mention complémentaire formulaire |
| Attribut | `@@<variableName>` d'un attribut personnalisé (projet/flow) | « Attribut {{name}} » |

[O] Attribut : `questions.dynamicVariable.variables.customField` « Attribut {{name}} », endpoint `custom-field/variable-name` ⇒ chaque attribut personnalisé possède un nom de variable unique [I] (format exact non observé). [O] Note `flowApp.form.dynamicVariable.currPhaseNumber` « (si custom alors afficher custom) ». `projectComplementRef1/2` existent en i18n mais pas de token observé → [I] non exposés.

#### 3.5.2 Champs « Figer », « Verrouiller »
Voir `frozen` (§3.4.2) et verrouillage de réponse (§6.10). Ne pas confondre : *figer* = constante définie au builder ; *verrouiller* = action du répondant après saisie.

#### 3.5.3 Validation des données

Natures [O] BUNDLE `displayValidationBlock` : `date`, `datetime`, `value_unit`, `formula`.

| Opérateur (num) | Code | Libellé builder | Natures | Bornes |
|---|---|---|---|---|
| MoreThan=1 | `gt` | Supérieur à | value_unit, formula | min |
| MoreThanEqual=2 | `gte` | Supérieur ou égal à | value_unit, formula | min |
| LessThen=3 | `lt` | Inférieur à | value_unit, formula | min |
| LessThanEqual=4 | `lte` | Inférieur ou égal à | value_unit, formula | min |
| Equal=5 | `eq` | Egal à | toutes 4 | min |
| NotEqual=6 | `neq` | Différente de | toutes 4 | min |
| Between=7 | `between` | Entre | value_unit, formula | min, max |
| NotIncludedBetween=8 | `not_between` | Non inclus entre | value_unit, formula | min, max |
| BeforeDate=9 | `before` | Avant le | date, datetime | min |
| AfterDate=10 | `after` | Après le | date, datetime | min |
| IncludedBetweenDates=11 | `between_dates` | Entre | date, datetime | min, max |
| NotIncludedBetweenDates=12 | `not_between_dates` | Non inclus entre | date, datetime | min, max |

[O] `enum: MoreThan=1 … NotIncludedBetweenDates=12`, `i18n:forms.builder.label.*`, `forms.builder.validationInfo.*` (« Valeur attendue: supérieur à {{min}} », « … entre {{min}} et {{max}}. »).

Champs : `operator`, `min` (`valueOne`), `max` (`valueTwo`), `error_message` (« Message d'erreur personnalisé », défaut « La valeur saisie n'est pas comprise dans la plage de données attendue »), `block_out_of_range` (« Bloquer la saisie hors limite », `checkedBlockingControl`). [O]

Sémantique [O] BUNDLE :
- valeur vide ⇒ valide.
- Nombres : comparaison numérique après normalisation décimale ; `between` inclusif `[min,max]`.
- Dates : `eq/neq` = même jour/minute ; `between_dates` inclusif ; comparaison à la granularité jour (`date`) ou minute (`datetime`).
- `block_out_of_range=true` ⇒ le composant de saisie reçoit des bornes min/max : pour `gt` min = min+1 (entiers), `lt` max = min−1, `lte` max=min, `neq`/`not_between` pas de borne ; pour dates `after` ⇒ min = min+1 jour, `before` ⇒ max = min−1 jour, `eq` ⇒ max=min. La saisie hors bornes est impossible.
- `block_out_of_range=false` ⇒ saisie acceptée mais marquée **non conforme** (message d'erreur sous le champ) ; la non-conformité alimente la « fenêtre de vérification des données non-conformes » et un bandeau de déclaration d'aléa [O] `HC:R92`.
- Saisie des décimales selon le format numérique utilisateur : FR « , » / EN « . » [O] `option.validation.info-fr/en`.

Messages côté réponse [O] `flowApp.responseForm.validation.*` : « La date saisie doit être après le … », « La valeur calculée doit être comprise entre … », « La valeur saisie doit être supérieure ou égale à … », « La donnée saisie n'est pas la plage de données attendues ».

**Anti-antidatage** (indépendant de la validation) : si `allow_backdating=false` (défaut) pour `date`/`datetime`, une valeur antérieure à la **date de création de la réponse** est refusée [O] BUNDLE (`errorType: backdating`), message front « Vous ne pouvez saisir une date antérieure à la date du jour » [O] `flowApp.rubricOption.option.dataValidation.backDatingError` et erreur serveur `rubricOption.invalidDate` ⇒ toast « Vous avez saisi une date antérieure à la date de création de la réponse » / « Veuillez modifier cette date et réessayer » [O] `forms.rubrics.alerts.saveResponse.backdatingFail.*`. En mode bloquant, la borne min du sélecteur = max(min validation, date de création).

#### 3.5.4 Alerte

Natures [O] BUNDLE `displayAlertBlock` : toutes sauf `photo`, `collaborator`, `file`, `text_editor`.
Champs : `alert_type` ∈ {`error` « Blocage », `warning` « Danger », `info` « Information », `trace` « Trace »} [O] `flowApp.ChoixNatureAlert.*` (API `ERROR/WARN/INFO/TRACE`), `alert_text` « Texte d'alerte » [O] `option.alert.*`. Aperçu dans le builder « Déclencher un aperçu de l'alerte » [O] `option.alert.dispatch`.
Comportement [O] BUNDLE : en réponse, lorsque l'option est **renseignée** (et non figée), un toast du type correspondant affiche le texte, **une seule fois** par affichage du composant. [I] « Blocage » n'empêche pas l'enregistrement (aucune logique de blocage observée) — c'est seulement le style « erreur ».

#### 3.5.5 Conditions de redirection

Natures [O] BUNDLE `displayRedirectionBlock` : `short_answer`, `long_answer`, `multiple_answers`, `unique_choice`, `multiple_choices`, `single_choice_list`, `multiple_choice_list`, `date`, `datetime`, `duration`, `value_unit`, `location`, `formula`.
Champs : `target_rubric_id` (obligatoire), `target_question_id` (optionnel ; liste filtrée sur la rubrique choisie ; réinitialisée quand on change de rubrique) [O] BUNDLE. Stocker aussi les `lineage_id` (Siteflow envoie `uuidTypeNextRubric/uuidTypeNextQuestion`) pour survivre aux copies/imports.
Sémantique « si cette option est remplie (valeur non vide / choix coché), alors au passage à la rubrique suivante l'opérateur est redirigé vers la rubrique cible, et la vue défile jusqu'à la question cible ». Algorithme §6.6.

#### 3.5.6 Valeur exportable

Natures [O] BUNDLE `displayExportableValueBlock` : `short_answer`, `long_answer`, `multiple_answers`, `unique_choice`, `multiple_choices`, `date`, `datetime`, `duration`, `value_unit`.
Champ : `export_key` choisi dans une liste fermée [O] `exportableValue.*` (≈ 170 codes clients EDF/PGAC : `epsilonAn…`, `calo*`, `echaf*`, `mds*`, `ouvrage*`, `rambarde*`, `deport*`, `prestationRealisee`, `repliRealisee`, chacun « libellé - type (OUTnn) »). Unicité par formulaire [O] `option.alerts.existingExportableValue` « Cette valeur exportable a déjà été sélectionnée ».
[I] Usage : alimenter un export de fichier « Epsilon OUT » vers un SI client (endpoint `epsilonOut/export`). Reconstruction : table de référence `export_keys(code, label, data_type, out_code)` paramétrable par organisation, au lieu d'un enum codé en dur.

#### 3.5.7 Caractères spéciaux

Menu contextuel des champs texte : Copier / Couper / Coller / « Caractères spéciaux » : α β γ π ρ µ ⌀ Ω Σ Δ ∑ × ÷ ± ≠ ² ³ ¼ ½ ¾ ≥ ≤ ← → ↑ ↓ ↔ ↕ [O] `enum: Alpha=1 … UpDown=28`, `i18n:flowApp.form.contextMenu.character.*`.

### 3.6 Collaborateur et signature (signataires)

Une question `collaborator` contient 1..n **demandes de collaborateur** (« Ajouter une demande de collaborateur » [O] `questions.actions.addContributor`), libellées « Collaborateur {{order}} » / « Identification Collaborateur {{order}} ».

Paramétrage builder par signataire : `name`, `description`, `disable_signature` (« Désactiver la demande de date et signature » : seule l'identification est demandée), `pdf_field_name`, `xls_label` [O] BUNDLE `mapFromOptionSignatoryValue`.

Valeur saisie (réponse) par signataire [O] `HC:Concordance optionSignatories.*`, BUNDLE `mapToRubricOptionSignatoryReplayDTOV15` :

| Champ | Type | Libellé FR |
|---|---|---|
| `contributor_type` | enum `intern` (utilisateur listé), `extern` (saisie libre), `not_listed_intern` | « Sélectionnez un collaborateur » / « Non présent dans la liste » |
| `user_id` | uuid | si intern |
| `first_name`, `last_name`, `email`, `function`, `company_name` | text | « Prénom », « Nom », « Email », « Fonction » |
| `signature_image` | image (PNG/base64) | « Signer » / « Voir la signature » |
| `signature_hash` | text | [O] `hashSignature` |
| `signed_at` | timestamptz | « Date de signature » |
| `local_created_at` | timestamptz | date de signature saisie hors ligne / « Non présent sur la liste » [O] |
| `proxied` | bool | « Signature par procuration » |
| `principal` / `proxy` | text | « Mandant » (« La personne donnant procuration ») / « Mandataire » (« vous-même ») [O] `flowApp.signatory.dialog.byProxy.*` |
| `proxy_date` | timestamptz | « Date de procuration » |
| `signature_comment` | text | « Commentaire (Optionnel) » / « Voir le commentaire » |
| `deletion_reason` | text | motif de suppression de signature [O] BUNDLE `deletionMotive` |
| `locked` | bool | |

Règles [O] :
- « renseigné » = `disable_signature` ? (utilisateur choisi **ou** nom+prénom+fonction) : `signature_image` présente (BUNDLE `checkForEmptyValue`).
- Supprimer une signature : confirmation « Êtes-vous sûr de vouloir supprimer cette signature ? » / « Retour en arrière » [O] `option.answers.contributor.*`.
- Résumé : « {{ name }} signé le {{ date }} » [O] `forms.summary.messages.collaborator`.
- Restrictions : collaborateurs listés = collaborateurs du projet, éventuellement restreints par l'affectation du flow [O] `HC:R101`.
- Type « Device » / tablette : [I] signature sur tablette partagée = `not_listed_intern`.

### 3.7 Attributs d'objet technique (formulaires modèle)

[O] `HC:R97`, `HC:R105` : si `object_attributes_link ≠ disabled`, le builder propose « Ajouter un attribut d'objet » (« Liste des attributs », « Ajout d'attribut d'objet » [O] `forms.dialogs.add-technical-objects.*`) ; chaque question créée est liée à un attribut. Dans un flow, le formulaire doit être lié à un objet réel du bloc Objet de l'étape [O] `blocks.form.dialogs.import.tooltips.linkFormWithObjectAttribute`. Les valeurs de réponse **lisent/écrivent** l'attribut de l'objet [I : écriture annoncée « livraison future » dans `HC:R105`]. Hors périmètre MVP recommandé ; garder `object_attribute_id` dans le schéma.

---

## 4. Forme des valeurs stockées par nature

Siteflow stocke chaque valeur dans des colonnes typées de l'option (`textValue`, `dateValue`, `dateTimeValue`, `timeValue`, `checkedValue`, `content`, `latitude/longitude/altitude`, `applicationFiles`) [O] BUNDLE `setOptionValue`/`getOptionValue` ; l'API publique expose `valueType` ∈ STRING | DATE | DATETIME | INTEGER | BOOLEAN | TEXT | COORDINATES | FILE | VALUE_AND_UNIT | SIGNATURE, avec `values: string[]` ou `objectValue` [O] `HC:Structural`.

| Nature | 1 valeur = | Colonne Siteflow | `value_type` proposé | Forme JSON canonique proposée | « Renseigné » si |
|---|---|---|---|---|---|
| short_answer | par option | textValue (ou dateTimeValue si date tapée) | `string` | `"texte"` | non vide |
| long_answer | par option | textValue | `text` | `"texte\nmultiligne"` | non vide |
| multiple_answers | par option (n options texte) | textValue | `string` | `"texte"` | non vide |
| unique_choice | par option (booléen ; une seule à true dans la question) | checkedValue | `boolean` | `true` | true |
| multiple_choices | par option (booléen) | checkedValue | `boolean` | `true` | true |
| single_choice_list | 1 option | textValue = choix | `string` | `"Choix B"` | non vide |
| multiple_choice_list | 1 option | textValue = `"A__C"` | `string_list` | `["A","C"]` | ≥1 |
| date | 1 option | dateValue (date locale) | `date` | `"2026-10-23"` | non vide |
| datetime | 1 option | dateTimeValue (zoned) | `datetime` | `"2026-10-23T14:05:00+02:00"` | non vide |
| duration | 1 option | timeValue `"HH:mm"` | `duration` | `{"hours":2,"minutes":30}` (stocker aussi `minutes_total`) | heures **et** minutes saisies |
| value_unit | par option (n couples) | textValue (+ unité figée `textValueUnit` côté builder) | `value_and_unit` | `{"value":12.5,"unit":"mm"}` | valeur non vide |
| photo | 1 option | applicationFiles[] | `file_list` | `[{"file_id":"…","name":"…","position":1}]` (ordre d'ajout conservé [O] `HC:R92`) | ≥1 fichier |
| file | 1 option | applicationFiles[] (PDF uniquement, ≤ 40 Mo [O] `HC:2025`, `questions.toaster.file.type.error`) | `file_list` | idem | ≥1 |
| location | 1 option | latitude, longitude, altitude | `coordinates` | `{"lat":45.1,"lng":5.7,"alt":210}` | lat **et** lng |
| formula | 1 option | textValue = résultat calculé (unité dans textValueUnit) | `number` ou `boolean` ou `string` | `{"result":42.5,"unit":"m3"}` | non vide |
| text_editor | 1 option | content (HTML nettoyé) | `rich_text` | `"<p>…</p>"` | non vide |
| collaborator | par signataire | optionSignatory* | `signature` | objet §3.6 | voir §3.6 |

Valeur par question : `observation` (texte libre si `with_observation`) [O] BUNDLE `questionResponses[].observation`.
Booléen de formule : afficher « Vrai » / « Faux » [O] `forms.option.answers.formula.true/false`.
Fichiers : suppression = marquage `deleted` puis envoi de `deletedApplicationFilesUuides` [O].

---

## 5. Formules

### 5.1 Syntaxe observée

[O] BUNDLE (service de parsing de formule) + `HC:R2.19` + `i18n:option.label.note`.

| Élément | Syntaxe | Sens |
|---|---|---|
| Référence absolue | `$$R{r}Q{q}O{o}` (insensible à la casse : la formule est passée en minuscules avant traitement) | valeur de l'option n°o de la question n°q de la rubrique n°r (positions 1-based) |
| Référence relative | `h`, `i`, `j` à la place d'un numéro, avec décalage optionnel : `Rh`, `Rh-1`, `Qi+2`, `Oj`, `Oj-1` | h = rubrique courante, i = question courante, j = option courante |
| Valeur précédente | `$$previousvalueqo` | même rubrique, question précédente (q−1), même option |
| | `$$previousvalueo` | même question, option précédente (o−1) |
| Référence encadrée | `$R1Q2O3$` | forme acceptée par le parseur (masquée comme référence) [I : usage d'affichage/legacy] |
| Variable dynamique | `@@NomVariable` | valeur d'une variable §3.5.1 |
| Chaîne | `'texte'` | littéral chaîne (comparaisons) |
| Nombres | décimales selon le format utilisateur : FR `1,5`, EN `1.5` (séparateur de milliers EN `1,000.5` accepté) | |
| Séparateur d'arguments | `;` — ex. `min(2;6)` | [O] `HC:R2.19` « Les paramètres d'une fonction doivent être séparés par un point-virgule ";" » |
| Opérateurs/fonctions | ceux de **math.js** (le bundle embarque math.js complet : `+ - * / ^ %`, comparaisons `== != < <= > >=`, `and or not xor`, ternaire `a ? b : c`, `abs round ceil floor fix sqrt cbrt pow exp log log10 log2 min max sum mean median mode std variance prod mod sign gcd lcm sin cos tan asin acos atan atan2 pi e…`) | [O] BUNDLE ; [O] évaluation via `evaluate()` de math.js |

Exemple officiel [O] `option.label.note` : « dans un tableau par colonne, vous pouvez additionner les valeurs des 2 premières colonnes de chaque ligne avec la formule : `$$R1Q1OJ+$$R1Q2OJ` ».
Aide [O] `questions.formula.helpcenter.link` (article 14686195812370, non disponible localement).

### 5.2 Pipeline d'évaluation (comportement WebApp observé)

1. `formula.toLowerCase()`.
2. Remplacer `$$previousvalueqo` → `$$r{h}q{i-1}o{j}` (si i>1) et `$$previousvalueo` → `$$r{h}q{i}o{j-1}` (si j>1).
3. Remplacer `rh[±n]`, `qi[±n]`, `oj[±n]` par l'ordre courant ± n.
4. Normaliser les nombres : FR ⇒ supprimer les espaces, virgule décimale → point (hors virgules d'arguments) ; EN ⇒ supprimer les séparateurs de milliers.
5. Collecter les références `$$r\d+q\d+o\d+` ; résoudre localement (arbre des valeurs de la réponse en cours) sinon appel serveur `options/value` (corps `{formUuidEntity, optionsTreeOrder:[{rubricNodeOrder, questionNodeOrder, optionNodeOrder}]}`) ⇒ **formules inter-rubriques** (valeurs déjà enregistrées d'autres rubriques). Valeur absente ⇒ remplacée par vide ⇒ erreur.
6. `math.evaluate()` ; si résultat numérique : arrondi anti-flottant `toFixed(9)` puis `parseFloat` (entiers inchangés).
7. Résultat `true/false` ⇒ « Vrai/Faux » ; sinon `String(result)` ; affiché avec l'unité.
8. Déclenchement : **manuel** via bouton « Calculer » [O] `forms.option.label.calculate` (pas de recalcul automatique observé côté WebApp). Le champ résultat est en lecture seule.

Erreurs [O] :
- « Erreur lors de l'évaluation de la formule » / « Une ou plusieurs valeurs présentes dans la formule ne sont pas encore renseignées » (`forms.questions.alerts.evaluationFail.*`).
- « Une erreur s'est produite lors de l'évaluation de l'option » (`questions.alerts.interRubricEvaluationFail`).

### 5.3 Validation à la saisie (builder) — R2.19

[O] `HC:R2.19` : validation avant sauvegarde ; formule invalide bloquée, message sous le champ ; contrôle « après une courte pause dans la saisie » (debounce ≈ 500 ms observé) ; stockage **normalisé** (point décimal, sans espaces superflus, arguments séparés par `,` en base) ; affichage reformaté selon le format utilisateur (` ; ` entre arguments, nombres localisés). Feature flags [O] `SFP_19962_VALIDATE_AND_PARSE_FORMULAS`, `SFP_21185_BACKEND_FORMULA_VALIDATION` (validation déportée côté serveur quand actif).

Règles du validateur front [O] BUNDLE :
1. Formule vide ⇒ valide.
2. Format FR et présence d'un `.` hors chaîne ⇒ `invalidSyntax`.
3. Remplacer toutes les références valides (`$$…`, `$…$`, `@@…`) par `1.1` ; s'il reste un `$$` ⇒ `invalidVariable`.
4. Format EN et nombre mal formé (groupes de milliers incorrects) ⇒ `invalidSyntax` ; une virgule entourée d'espace ⇒ `invalidSyntax`.
5. Normaliser puis évaluer ; exception ou résultat qui n'est ni nombre, ni booléen, ni chaîne ⇒ `invalidSyntax`.
6. `invalidParameters` (« Les paramètres d'une fonction de la formule sont invalides ») : [I] renvoyé par la validation serveur (arité/type d'argument incorrect).

Messages [O] `questions.labels.formula.error.invalidSyntax` « La syntaxe de la formule est invalide », `invalidVariable` « Une référence utilisée dans la formule est invalide », `invalidParameters` « Les paramètres d'une fonction de la formule sont invalides ».

### 5.4 Implémentation proposée (math.js, partagée client/serveur)

```ts
// lib/formula/engine.ts — exécutable dans Next (client) et Edge/Node (serveur)
import { create, all, type MathJsInstance } from 'mathjs';

const math: MathJsInstance = create(all, { number: 'number', precision: 14 });
// Sandbox : neutraliser les fonctions dangereuses / inutiles
const blocked = ['import', 'createUnit', 'evaluate', 'parse', 'simplify', 'derivative', 'compile', 'chain', 'reviver', 'resolve'];
const safeEvaluate = math.evaluate.bind(math);
math.import(Object.fromEntries(blocked.map(n => [n, () => { throw new Error(`fn ${n} disabled`); }])), { override: true });

export type Locale = 'fr' | 'en';
export type Ctx = { r: number; q: number; o: number };            // positions courantes
export type Resolver = (ref: { r: number; q: number; o: number } | { variable: string }) => number | string | boolean | null;

const REF = /\$\$r(\d+|h(?:[+-]\d+)?)q(\d+|i(?:[+-]\d+)?)o(\d+|j(?:[+-]\d+)?)/g;

export function toCanonical(src: string, locale: Locale): string { /* §5.3 normalisation : ';'→',', décimales → '.', trim */ }
export function toDisplay(canonical: string, locale: Locale): string { /* inverse : ',' d'arguments → ' ; ', nombres localisés */ }

export function validate(src: string, locale: Locale): null | 'invalidSyntax' | 'invalidVariable' | 'invalidParameters' {
  // règles 1..5 §5.3 ; distinguer les erreurs math.js d'arité/type → 'invalidParameters'
}

export function evaluate(canonical: string, ctx: Ctx, resolve: Resolver): { ok: true; value: number | boolean | string } | { ok: false; error: 'missingValue' | 'evalError' } {
  let f = canonical.toLowerCase()
    .replace('$$previousvalueqo', `$$r${ctx.r}q${ctx.q - 1}o${ctx.o}`)
    .replace('$$previousvalueo', `$$r${ctx.r}q${ctx.q}o${ctx.o - 1}`);
  const scope: Record<string, unknown> = {};
  let missing = false;
  f = f.replace(REF, (_m, r, q, o) => {
    const pos = { r: rel(r, ctx.r, 'h'), q: rel(q, ctx.q, 'i'), o: rel(o, ctx.o, 'j') };
    const v = resolve(pos);
    if (v === null || v === '') missing = true;
    const key = `ref_${pos.r}_${pos.q}_${pos.o}`; scope[key] = v; return key;
  }).replace(/@@([a-z0-9._-]+)/gi, (_m, name) => {
    const v = resolve({ variable: name }); const key = `var_${name.replace(/\W/g, '_')}`; scope[key] = v; return key;
  });
  if (missing) return { ok: false, error: 'missingValue' };
  try {
    const out = math.evaluate(f, scope);
    return { ok: true, value: typeof out === 'number' && !Number.isInteger(out) ? parseFloat(out.toFixed(9)) : out };
  } catch { return { ok: false, error: 'evalError' }; }
}
const rel = (tok: string, cur: number, letter: string) => tok.startsWith(letter) ? cur + Number(tok.slice(1) || 0) : Number(tok);
```

Choix :
- Utiliser un **scope** plutôt qu'une substitution textuelle (évite les injections et les problèmes de décimales dans les valeurs).
- Évaluer côté serveur (RPC / route handler) à l'enregistrement de la rubrique pour garantir `result` en base ; côté client pour le bouton « Calculer ».
- Option d'amélioration (non Siteflow) : accepter `$$CODE` (custom code) en plus de `$$RxQyOz`, résolu vers l'`option_id`, pour que les formules survivent au réordonnancement.

### 5.5 Références stockées
À la sauvegarde d'une formule, extraire et stocker la liste des options référencées (`formula_refs`) en **identifiants stables** (`option.lineage_id`) en plus du texte positionnel ⇒ permet (a) de détecter les références cassées après déplacement, (b) d'invalider/recalculer.

### 5.6 Risque
Formules positionnelles : réordonner/insérer une rubrique, question ou option décale les références. Siteflow n'offre pas de réécriture automatique (aucune trace). Recommandation : réécrire automatiquement le texte positionnel à partir de `formula_refs` lors d'un déplacement.

---

## 6. Remplissage (moteur de réponse)

### 6.1 Contextes de réponse

| Contexte | Point d'entrée | Formulaires | Preuve |
|---|---|---|---|
| `project` | module Formulaires du projet → « Répondre » ; MobileApp | importés/locaux (génériques visibles mobile selon statut) | [O] `HC:Structural`, `HC:R92` « Les réponses de formulaire créées au niveau du projet apparaissent désormais dans le module remontées terrain » |
| `flow` | bloc Formulaires d'une étape (liaison `form_business_link`) | formulaires du projet liés au bloc | [O] |
| `share` | lien externe (§9) | réponse créée/complétée par un externe | [O] |

Provenance de saisie [O] `enum: Mobile=1 WebApp=2 APIEXT=3` (événements) et filtre `Web=1 Mobile=2 Project=3 Flow=4` (« WebApp », « MobileApp », « Projet », « Flow ») [O] `i18n:flowApp.responseProvenance.*`.

### 6.2 Création d'une réponse (« Répondre à un formulaire »)

Dialogue [O] `i18n:blocks.form.dialogs.reply.*`, `forms.dialogs.reply.*` :
- Choix (contexte flow) : « Créer une nouvelle réponse » ou « Continuer une réponse en cours (?) » — liste « Réponse » des réponses **à l'état En cours** uniquement (« Seules les réponses à l'état « en cours » sont visibles »).
- Champ « Référence de la réponse » pré-rempli, modifiable (« Vous pouvez modifier la référence de la réponse si besoin »), **≥ 3 caractères** [O] `flowApp.responseForm.messageAlert` « La référence doit contenir au moins 3 caractères ».
- Référence par défaut [O] :
  - projet : `{{reference}}{{indice}}{{todayDate}} - R{{count}}` (`forms.dialogs.reply.defaultReference`)
  - flow : `{{reference}}{{indice}}{{objectName}}{{chrono}}P{{phaseOrder}} - E{{stepOrder}} - {{todayDate}} R{{count}}` (`blocks.form.dialogs.reply.defaultReference`, préfixes `P`/`E`)
  - `count` = rang de la nouvelle réponse pour ce formulaire dans ce contexte (endpoint `form-responses/{formId}/by-project/{projectId}`) [I : séparateurs exacts entre segments ; tokens vides omis].
  - [O] `HC:R2.17` la référence d'une réponse créée via « déclarer un aléa » est correctement générée.
- Refus : formulaire désactivé (« Élément désactivé, impossible d'ajouter une réponse ») ; réponse unique déjà existante (« Impossible d'ajouter une autre réponse Ce formulaire est à réponse unique ») [O].
- À la création : snapshot de la **version** du formulaire (index + référence + id bibliothèque source) [O] `HC:Structural` ; résolution des pré-remplissages [I] ; ouverture sur la **rubrique initiale** (§6.7) [O] endpoint `bloc-forms/initial-rubric/{formId}`.
- Événement « {{userName}} a créé la réponse {{businessName}} avec le statut … » [O] `global.statusHistory.createEvent.formResponse`.

### 6.3 Paramètres de la liaison bloc ↔ formulaire (contexte flow)

| Paramètre | Valeurs | Libellé FR | Preuve |
|---|---|---|---|
| `enabled` | bool | Activer / Désactiver | [O] `blocks.form.table.actions.enable/disable` |
| `mandatory` | bool | « Activer réponse obligatoire » — « Permet de rendre l'ajout d'au moins une réponse obligatoire » | [O] `blocks.form.tooltips.activateMandatory` |
| `unique_response` | bool | « Activer réponse unique » — « Permet de rendre impossible l'ajout de plusieurs réponses » | [O] |
| `unique_mode` | `new_or_resume`(1) / `new_response`(2) / `resume_response`(3) | « Nouvelle réponse et reprendre une réponse autorisées » / « Nouvelle réponse uniquement » / « Reprendre une réponse uniquement » ; bandeau « Réponse unique activée : {{mode}} sur le terrain » ; « Ces autorisations s'appliquent uniquement à l'application mobile. Sur l'application web, les deux actions restent toujours possibles. » ; modifiable seulement si le bloc est au statut Rédaction | [O] `enum: NewOrResume=1 NewResponse=2 ResumeResponse=3`, `blocks.form.uniqueMode.*` |
| `initial_rubric_lineage_id` | rubrique | « Navigation » / « Guider le collaborateur vers » / « Ouvrir la réponse à la rubrique … » — « Lors de la création d'une nouvelle réponse, vous avez la possibilité de choisir la rubrique visible à l'ouverture » ; badge « Guider actif » | [O] `blocks.form.dialogs.navigate.*`, `flowApp.form.guide.*` (y compris « Veuillez sélectionner une question » ⇒ [I] cible question possible) |
| `fillable_rubric_lineage_ids` | rubrique[] | « Autoriser le remplissage de » ; les autres rubriques sont en lecture seule ; « Attention toutes les rubriques sont en lecture seule » | [O] `blocks.form.dialogs.restrict.title`, `blocks.form.readOnly.alert`, endpoint `form-businesslinks/{id}/rubric-permissions` |
| `object_id` | objet technique | « Objet lié au formulaire » | [O] |
| `form_version` | indice | « Sélectionner un indice différent » | [O] `blocks.form.table.actions.optionIndex` [I : choisir un indice antérieur de la bibliothèque] |

Conflit [O] `blocks.form.navigation.conflict.*` : « Les deux paramètres "Guider vers" et "Autoriser le remplissage de" sont en conflits — l'utilisateur sera guidé, dès l'ouverture du formulaire, vers une rubrique qu'il ne pourra pas remplir. » ⇒ avertissement (non bloquant [I]).
[O] `HC:R2.19` « flows de navigation » = cette liste de rubriques autorisées par flow : une rubrique nouvelle/dupliquée n'y est pas ajoutée automatiquement.
Contrôle d'étape [O] `HC:R105` : valider une étape exige que les formulaires obligatoires du bloc aient au moins une réponse (endpoint `validate-flow-form-blocs`). [I] Exiger aussi l'état « Terminé » ? Non observé ; retenir « ≥ 1 réponse ».

Actions du bloc [O] `enum: Reply=1 Overview=2 Navigate=3 ActivateMandatory=4 DisableMandatory=5 ActivateUnique=6 DisableUnique=7 History=8 Replace=9 Delete=10 Disable=11 Enable=12 Share=13 Summarize=14 ImportResponses=15`.

### 6.4 Écran de réponse

- En-tête : nom du formulaire, référence de réponse, famille, mention complémentaire, flow (nom + référence) si contexte flow, chip « Mode réponse », flèches rubrique précédente/suivante, aperçu PDF [O] BUNDLE `sfx-form-header`.
- Menu latéral : arbre rubriques → questions (titre, type, obligatoire, verrouillé) ; navigation clavier Alt/⌘ + flèches [O] BUNDLE. En mode réponse, la navigation par le menu peut être bloquée pendant une édition verrouillée.
- Rubrique : nom, type, description (« Voir plus / Voir moins »), images, fichiers, bouton mention/observation (« Mention et observation complémentaires »).
- Bas de rubrique : **« Sauvegarder et continuer plus tard »** et **« Sauvegarder et passer à la rubrique suivante »** ; sur la dernière rubrique ce dernier devient **« Terminer la réponse »** (ou **« Envoyer la réponse »** pour un contributeur externe) [O] `rubrics.saveAndContinueLater`, `rubrics.saveAndPassToNextRubric`, `rubrics.terminateAnswer`, `rubrics.sendAnswer`.
- Quitter une rubrique non sauvegardée : « Les informations saisies dans cette rubrique ne seront pas sauvegardées — Souhaitez-vous continuer? » [O] `forms.alerts.navigateBack.*`.
- Tableaux en réponse : boutons « + Ligne » / « + Colonne » si `allow_add_row/column` [O] `rubrics.addLine/addColumn` ; nouvelle ligne/colonne créée avec le type de la précédente (endpoint `rubric-options/add-new-option` / `rubric-questions/add-new-question` avec l'id de liaison) [O] ⇒ [I] les lignes ajoutées sur le terrain sont propres à la liaison/réponse, pas au formulaire bibliothèque.

### 6.5 Sauvegarde

Unité de sauvegarde = **la rubrique** [O] BUNDLE : payload `[{rubric_id, today, questionResponses:[{question_id, observation, locked, rubricOptionResponses|optionSignatoryReplays}]}]`, envoyé à `responses` (PUT/POST).

| Action | Contrôle | Suite |
|---|---|---|
| Sauvegarder et continuer plus tard | **sans contrôle** d'obligation | toast « La réponse a été enregistrée avec succès » ; retour à l'URL d'origine (ou écran de fin « continuer plus tard » en partage) ; message « Toutes vos réponses sont sauvegardées, vous pourrez venir les compléter plus tard » [O] |
| Sauvegarder et passer à la rubrique suivante | enregistre, puis contrôle de la rubrique (`rubrics/{id}/check`) | si valide → rubrique suivante (§6.6) ; sinon fenêtre « Questions échouées » listant les questions **obligatoire** / **invalide** [O] `questions.dialog.validation.*`, `rubrics.questionsToComplete` « Afin de sauvegarder ce(s) rubrique(s), veuillez renseigner les informations ci-dessous : » |
| Flèches précédente/suivante, menu | sauvegarde silencieuse sans contrôle (en mode réponse) [O] BUNDLE `ae({withoutCheck:true})` | navigation |
| Terminer la réponse | enregistre, contrôle **toute la réponse** (`forms/responses/{id}/check`) | si OK → état « Terminé » (`forms/responses` validate) ; sinon fenêtre « Questions échouées » groupée par rubrique ; confirmation héritée « Êtes-vous certain de vouloir compléter la réponse? » [O] |

Règles de contrôle [O] / [I] :
- `mandatory` : au moins une option renseignée (règles §4) [I : pour les natures multi-options, « au moins une »] ; `collaborator` : chaque signataire requis ? [I] retenir « tous les signataires non optionnels » — non tranché.
- `invalid` : validation de données non respectée (si bloquant impossible ; si non bloquant, [I] la valeur hors plage est **acceptée** et ne bloque pas la terminaison — à confirmer).
- Rubriques en lecture seule (permissions §6.3) et masquées MobileApp (côté mobile) ignorées [I].
- Erreur serveur antidatage → toast §3.5.3.
- Envoi réseau instable : message de non-sauvegarde par champ [O] `HC:R97` (MobileApp/online).

### 6.6 Navigation entre rubriques et redirections

Algorithme [O] BUNDLE :
1. État de réponse : `active_redirect = {target_rubric, target_question, source_question_position, source_option_position} | null`, **une seule redirection active**.
2. À chaque changement de valeur d'une option ayant `redirect_enabled` :
   - si la valeur devient vide (`reset`) et que la redirection active est celle-ci ⇒ `active_redirect = null` ;
   - sinon la nouvelle redirection remplace l'active si aucune n'est active, **ou** si elle provient d'une question **antérieure** (position plus petite), **ou** de la même question et d'une option antérieure ; pour un **choix unique** (ou un reset) elle remplace aussi à position de question égale (dernier choix gagnant).
   ⇒ priorité à la **première question** (dans l'ordre) qui déclenche une redirection.
3. Action « suivant » (step +1) : si `active_redirect` ⇒ aller à `target_rubric` ; sinon rubrique suivante dans l'ordre. « Précédent » (step −1) : rubrique précédente dans l'ordre (pas de pile de retour).
4. À l'arrivée sur la rubrique cible : défilement vers `target_question` (ligne/colonne pour un tableau), puis `active_redirect = null`.
5. Reprise d'une réponse : recalculer `active_redirect` depuis les valeurs enregistrées de la rubrique courante [O] `HC:R2.15 Ticket #2115`.
6. [I] Une rubrique « sautée » n'est pas contrôlée par « Terminer » ? Non observé : Siteflow contrôle **toute** la réponse à la terminaison ⇒ les questions obligatoires d'une rubrique sautée bloquent. Recommandation : conserver ce comportement (fidélité), signaler dans la fenêtre d'échec.

### 6.7 Rubrique initiale et lecture seule

- Ouverture : rubrique demandée dans l'URL, sinon rubrique initiale de la liaison (`initial_rubric_lineage_id` → résolue par `lineage_id`), sinon première [O] BUNDLE.
- Rubriques non autorisées par `fillable_rubric_lineage_ids` : lecture seule [O].
- Rubriques `hidden_in_mobile` : invisibles sur mobile seulement [O] (« Non visible sur la MobileApp »).

### 6.8 États et statuts d'une réponse

| Notion | Valeurs | Preuve |
|---|---|---|
| `state` | `in_progress` « En cours » (API `RESPONSE`), `done` « Terminé » (API `RESPONSEDONE`) ; filtre « Tous les états » | [O] BUNDLE `_2`, `i18n:forms.response.state.*` |
| `custom_status_id` | statut personnalisé de nature « Réponse de formulaire » ; option `exportable` conditionne exports et génération documentaire | [O] `status.filter.nature.formResponse`, `fieldFeedbacks.messages.unauthorizedExportation` « Veuillez d'abord sélectionner un statut autorisant l'exportation avant de continuer » |

Transitions :
- `in_progress → done` : « Terminer la réponse » (§6.5).
- `done → in_progress` : action « Revenir à l'état « En cours » » + confirmation [O] `responses.table.actions.updateStatus`, `forms.alerts.resetResponse.title` ; endpoint `responses/reset-validation`.
- Réponse `done` : non modifiable [O] `forms.dialogs.response.editResponseStatusFail` « Vous ne pouvez modifier une réponse à l'état terminé » ; paramètre d'organisation « Les réponses à l'état terminé ne peuvent pas être modifiées sur la MobileApp » [O] `generalSettings.organizationConfig.blockFormResponseEdition.title` ⇒ [I] sur WebApp, « Editer » une réponse terminée la repasse d'abord en cours.
- Changement de statut personnalisé : popover « Editer le statut » (Statut + Commentaire) [O] `forms.popovers.editStatus.*` ; modification en masse (nom, statut, état) [O] `HC:R97` (API).

### 6.9 Actions sur une réponse

[O] `i18n:responses.table.actions.*` / `blocks.form.dialogs.response.table.actions.*` : Editer, Editer la référence, Revenir à l'état « En cours », Dupliquer, Générer un document, Historique, Partager, Supprimer.

| Action | Règles | Preuve |
|---|---|---|
| Editer la référence | popover « Référence réponse » | [O] `forms.popovers.editResponse.*`, `HC:R2.12` modifiable aussi sur mobile |
| Dupliquer | interdit si réponse unique | [O] `duplicateResponseWarning` « Impossible de dupliquer la réponse car l'option réponse unique est activée » |
| Supprimer | confirmation ; corbeille (nature « Réponse de formulaire ») | [O] `trash.filter.trashNatureEnum.formResponse` |
| Historique (réponse) | événements « {{userName}} {{actionName}} la réponse « {{responseReference}} » le {{eventDate}} à {{eventTime}} depuis la {{eventSource}} » ; actions : a créé / a édité / a renseigné / a supprimé / exporte… | [O] `blocks.form.dialogs.history.event`, `flowApp.applicationEvent.actions.pastTense.*` |
| Générer un document | §8.3 | |
| Partager | §9 ; refusé si `done` : « Cette réponse est terminée : veuillez passer la réponse à l'état "en cours" avant de la partager » | [O] |

Colonnes de la table « Gestion des réponses de formulaire » [O] : Référence réponse, Indice, Provenance, Date de création / Date de modification, Statut, Action ; navigation « Réponse précédente / suivante ».

### 6.10 Verrouillage et historique des modifications

Deux déclencheurs [O] :
- **question `lockable`** : le répondant clique « Verrouiller » sur une option renseignée et valide (sinon « Veuillez saisir une valeur valide avant de verrouiller ») [O] `forms.option.validation.lock` ; « Êtes-vous sûr.e de vouloir verrouiller la réponse ? Cette action est irréversible » [O] `forms.dialogs.response.lockAlert`. Pour les natures multi-options (`multiple_answers`, `multiple_choices`, `value_unit`) le verrou porte sur la question entière [O] `lockableQuestionsWithMultipleOptions`.
- **formulaire `lock_responses`** : verrouillage automatique de chaque valeur enregistrée [I : au moment de la sauvegarde de la rubrique].

Modifier une valeur verrouillée [O] BUNDLE :
1. Nécessite le droit `Form.Unlock` (« Déverrouiller » ; « Êtes-vous sûr.e de vouloir déverrouiller la réponse ? »).
2. Passage en « édition verrouillée » (navigation de rubrique bloquée).
3. Validation par la fenêtre **« Signature des changements »** [O] `forms.response.changes.modal.title` : signature de l'utilisateur courant (nom, prénom, image de signature, date) + commentaire optionnel ; envoi `{signatory, versionOptions[]}` à `version/rubric-option`.
4. Chaque option modifiée produit une **version** : utilisateur, date, provenance, ancienne valeur, nouvelle valeur, nom d'option, type, commentaire de signature, fichiers ajoutés/supprimés.

Fenêtre « Historique des modifications » par question (icône « Historique des modifications de la réponse », visible si `versionHistoryCount > 0`) [O] `questions.dialog.changes.history.*` :
- « **{{ name }}** a changé la réponse le **{{ date }}** depuis la **{{ provenance }}** » ; « de {{ oldValue }} à {{ newValue }} » ; « (vide) » ; « puis a ajouté le commentaire << {{ comment }} >> » ; « {{ fileName }} ajouté. » / « {{ fileName }} supprimé. » ; vide : « Aucune modification n'a encore été effectuée ».
- Provenance affichée « WebApp » / « MobileApp » [O] `questions.response.provenance.*`.
- Natures historisées [O] BUNDLE `convertFromLockedQuestionType` : toutes sauf `photo`, `file` (pour ces deux, l'historique est en lignes « fichier ajouté/supprimé ») et `collaborator`.

Recommandation de reconstruction : historiser **toutes** les modifications de valeur (pas seulement les verrouillées) dans `form_response_value_history`, et réserver la signature des changements aux valeurs verrouillées (fidèle + utile pour l'audit).

Réparation [O] endpoint `repair-locked-options` (outil d'admin) — hors MVP.

### 6.11 Remplacement de formulaire dans un flow, réponses orphelines, import de réponses

**Gérer / remplacer** (bloc) [O] `blocks.form.dialogs.replace.*`, `enum: Deactivate=1 Delete=2 DeactivateAndReplace=3 DeleteAndReplace=4` :
- « Gestion du formulaire {{value}} - Indice {{indice}} » ; actions Désactiver / Supprimer / Désactiver et remplacer / Supprimer et remplacer ; périmètre « Toutes les étapes du flow » ou « Uniquement les étapes de la phase actuelle » ; remplaçant = un formulaire du projet (« par le formulaire de type … nommé … »).
- Confirmation par saisie du mot « DESACTIVER » / « SUPPRIMER » / « REMPLACER » [O] `blocks.form.alerts.*.confirm.label`.
- Règle : « Les formulaires contenant déjà au moins une réponse seront uniquement désactivés sur les étapes concernées » ; avertissement de perte pour les réponses hors ligne non synchronisées [O] `management.warning`.
- Historique flow : « a désactivé le formulaire … et la remplacé par … » [O] `flowContentNavigation.dialog.history.content.actions.*`.

**Réponses orphelines** [O] `flowContentNavigation.dialog.orphanResponses.*` (« Gestion des réponses orphelines », « Réparer la réponse », « Choisir le formulaire ») ; endpoints `forms/orphans-responses`, `…/formBusinessLinks`, `…/repair`, filtre statut :
- Orpheline = réponse de contexte flow dont la liaison bloc ↔ formulaire n'existe plus (contenu de flow réinitialisé, formulaire détaché…) [I].
- Réparer = rattacher la réponse à une liaison existante du même formulaire, choisie dans « Nom - Phase - Étape » [O] BUNDLE `mapFormRepairToSingleSelectItemData`.

**Importer des réponses** (bloc) [O] `blocks.form.dialogs.importResponses.*`, `HC:R92` : depuis un autre flow du projet (« Cliquez pour sélectionner un flow », recherche avancée), table Référence réponse / Indice / Statut / Date, sélection multiple ; rattache (copie [I]) les réponses existantes du **même formulaire** à l'étape courante.

**Contenu de flow** : impossible de réimporter/mettre à jour le contenu d'un flow ayant des réponses [O] `flowContentNavigation.haveResponseError`, `alertModal.updateFlowContent.error`.

### 6.12 Mode hors ligne (MobileApp)
Hors périmètre WebApp ; contraintes à respecter par le schéma : identifiants générés côté client, `local_created_at` sur signatures, provenance `mobile`, idempotence des sauvegardes de rubrique [I].

---

## 7. Résumé des messages clés (catalogue)

| Contexte | Clé | Texte FR |
|---|---|---|
| Sauvegarde OK | `forms.rubrics.alerts.saveResponse.success` | La réponse a été enregistrée avec succès |
| Sauvegarde KO | `forms.rubrics.alerts.saveResponse.fail` | Une erreur est survenue lors de l'enregistrement de la réponse |
| Antidatage | `forms.rubrics.alerts.saveResponse.backdatingFail.title` | Vous avez saisi une date antérieure à la date de création de la réponse |
| Contrôle | `questions.dialog.validation.title` | Questions échouées (`obligatoire` / `invalide`) |
| Formule | `questions.labels.formula.error.invalidSyntax` | La syntaxe de la formule est invalide |
| Formule | `questions.labels.formula.error.invalidVariable` | Une référence utilisée dans la formule est invalide |
| Formule | `questions.labels.formula.error.invalidParameters` | Les paramètres d'une fonction de la formule sont invalides |
| Formule | `forms.questions.alerts.evaluationFail.subtitle` | Une ou plusieurs valeurs présentes dans la formule ne sont pas encore renseignées |
| Validation | `option.validation.defaultText` | La valeur saisie n'est pas comprise dans la plage de données attendue |
| Verrou | `forms.option.validation.lock` | Veuillez saisir une valeur valide avant de verrouiller |
| Unicité | `blocks.form.dialogs.reply.hasUniqueResponse` | Impossible d'ajouter une autre réponse Ce formulaire est à réponse unique |
| Référence | `flowApp.responseForm.messageAlert` | La référence doit contenir au moins 3 caractères |
| Builder | `option.alerts.existingPdfName` | Ce champ PDF est déjà utilisé dans ce formulaire |
| Builder | `option.alerts.existingExportableValue` | Cette valeur exportable a déjà été sélectionnée |
| Builder | `option.alerts.updateOption.tooLong` | L'unité ne peut dépasser 20 caractères |
| Builder | `rubrics.alerts.updateRubric.failDescription` | Le champs description doit avoir une longueur maximale de 255 caractères |
| Builder | `questions.alerts.deleteQuestion.subtitle` | Il n'y a pas de corbeille pour cet élément. Vous ne pourrez pas le restaurer par la suite. |
| Import | `forms.dialogs.import.sizeLimitExceeded` | Impossible de sélectionner plus de 10 éléments. Veuillez faire le traitement par lots |
| Fichier | `questions.toaster.file.type.error` | Le fichier sélectionné doit être au format PDF |
| Partage | `share.dialogs.loginFail` | Le code saisi est incorrect |

---

## 8. Remontées terrain, exports, documents, résumé

### 8.1 Liste « Remontées terrain »

[O] `i18n:fieldFeedbacks.title` « Liste des réponses de(s) formulaire(s) » ; route projet `fields-feedback` (`enum-string fieldFeedbackPath`).
- Vide initial : « Aucun flow sélectionné pour le moment — Veuillez utiliser les filtres pour commencer » ; filtré vide : « Aucun élément dans la liste — Revoyez vos filtres » [O].
- Filtres [O] `fieldFeedbacks.filters.*` : **Flow** (sélecteur « Cliquez pour sélectionner une provenance » + recherche avancée), **Formulaire**, **Source** (WebApp / MobileApp / Projet / Flow), **Etat** (En cours / Terminé), **Statut** (statuts personnalisés réponse), **Date** (création, modification… [O] enum dates `ResponseDate=3 SubmissionResponseDate=4 ModificationDate=5 ModificationStatusDate=6`), recherche texte.
- Colonnes [O] `enum: uR Provenance Reference Status Index ModificationDate Actions`.
- Actions de ligne : Editer (« Êtes-vous certain.e.s de vouloir éditer la réponse? »), Revenir à l'état En cours, Dupliquer, Supprimer (« … supprimer la réponse {{ fieldFeedbackName }}? »), Générer un document, Historique, Partager [O] `fieldFeedbacks.alerts.*`, `fieldFeedbacks.dialogs.response.*`.
- Sélection multiple + actions de masse (export, génération).

### 8.2 Exports

| Export | Contenu | Règles | Preuve |
|---|---|---|---|
| Excel (XLSX) | popover « Exportation XLS » : « Toutes les données » ou « Uniquement les valeurs XLS » (options ayant `xls_export_enabled`, colonne = `xls_label` ou nom) | sélection requise (« Veuillez sélectionner le(s) élément(s) à exporter depuis la liste ») ; statut exportable requis ; si aucune valeur XLS : « Les réponses sélectionnées ne contiennent pas de valeurs XLS » ; plusieurs formulaires ⇒ ZIP de fichiers | [O] `forms.popovers.generateXls.*`, `fieldFeedbacks.messages.formRespEmpty`, endpoints `responses/export-many/zip`, `export-many/by-project/zip` |
| Photos ZIP | toutes les images des réponses sélectionnées | [O] `HC:R2.23 Ticket #2679` ZIP corrompu corrigé | [O] `fieldFeedbacks.tooltips.exportImage`, endpoint `responses/export/images` |
| Export bibliothèque | toutes les réponses d'un formulaire (tous projets) | | [O] §2.5 |

[I] Format XLSX recommandé : 1 ligne par réponse, colonnes méta (référence, indice, statut, état, provenance, flow, phase, étape, dates, auteur) puis 1 colonne par option (`RxQyOz – nom` ou `xls_label`), valeurs formatées (dates locales, `value_unit` en « 12,5 mm », listes jointes par « ; »). Lignes de tableau ajoutées sur le terrain : colonnes supplémentaires.

### 8.3 Générer un document de formulaire

Popover « Générer un document » [O] `forms.popovers.generateDocument.*` : Nom du document (défaut « Référence réponse par défaut »), Famille, Référence interne, Référence externe, « Catégorie Liste des documents », « Catégorie Dossier de clôture », bouton « Voir PDF ». Messages : « Le document formulaire a bien été généré », « Les documents ont bien été générés », « Documents déjà générés ! ». Statut exportable requis [O]. Génération asynchrone possible (flag `SFP_19671_ASYNC_DOC_GEN`).
Contenu PDF (règles portées par les options) [O] : rubriques/questions `hide_in_pdf` exclues ; `pdf_landscape` par rubrique ; tailles d'images ; images en annexe ; trame PDF personnalisée + champs PDF nommés (`pdf_field_name`) ; option documentaire « Afficher le(s) choix non renseigné(s) des réponses » (masquer les questions sans réponse : « une question est considérée comme non renseignée lorsqu'elle ne contient aucune réponse utilisateur, aucune valeur calculée, aucun commentaire et aucune pièce jointe ») [O] `HC:R2.13`. Détail du rendu → spec Documents.

### 8.4 Résumé (synthèse statistique)

[O] `i18n:forms.summary.*`, `flowApp.form.recap.*` : « Résumé des réponses - {{ name }} », par question « Question {{ order }} », « {{ count }} réponses à la question », « Réponse vide ({{ count }}) », « - Réponse obligatoire », « Unité: … », graphiques téléchargeables (« Télécharger le graphique »), filtrage par statut ; natures avec graphique [O] BUNDLE `displayChartsBlock` : `unique_choice`, `multiple_choices`, `single_choice_list`, `multiple_choice_list`, `date`, `datetime`, `duration`, `value_unit` ; autres : « Ce type de question n'est pas encore pris en charge par l'outil "Résumé" ». Endpoints `forms/recap-rubrics`, `rubrics/{id}/recaps`.

---

## 9. Partage externe

### 9.1 Partager (interne → externe)

Dialogues [O] `share.dialogs.*` : « Partage de formulaire » (formulaire vierge ⇒ l'externe crée une réponse) et « Partager une réponse de formulaire » (réponse existante à compléter).
Champs : e-mails (« Ajouter un e-mail »), Commentaire (« Le commentaire saisi sera visible dans le mail de partage »), Langue. Historique « Personnes ayant accès » : « Envoyé le {{ date }} », « En attente de réponse », « Réponse reçue le: {{ datetime }} », « Bloqué » ; actions Renvoyer / Supprimer (« Le lien de partage ne sera plus valide »).
Règles [O] : un seul partage actif par e-mail (« Vous avez déjà effectué ce partage avec cette adresse mail ») ; e-mail d'utilisateur inactif refusé ; réponse terminée non partageable ; seules les questions `shared=true` sont saisissables, les autres en lecture (observation désactivée) [O] BUNDLE `disableObservation = atLeastOneSharedQuestion && !shared`, endpoint `forms/{id}/at-least-one-question-shared`.

### 9.2 Parcours de l'externe

Routes [O] `enum-string: loginPath=login initFormPath=init-form initDocPath=init-document contributorInfoPath=contributor-info` + `FinishShare`, `FinishAndContinueLater` :
1. **init-form** : « {{ firstName }} {{ lastName }} vous a envoyé un formulaire à remplir sur Siteflow », référence ; bouton « Commencer ma réponse » (formulaire) / « Compléter ma réponse » (réponse) [O] `share.formInitTitle`, `share.formSubmit`, `share.formResponseSubmit`.
2. **login** : code secret envoyé par un second e-mail (« Un second email vient de vous être envoyé contenant un code secret… »), « Renvoyer le code », erreur « Le code saisi est incorrect » [O]. Endpoints `shared-links/init-auth/{id}`, `shared-links/auth/{id}`, `shared-links/check/{id}`.
3. **contributor-info** : « Veuillez compléter le formulaire ci-dessous afin d'y accéder. » : Prénom, Nom, Email, Entreprise, Fonction [O] — alimente `@@externalCollaborator*`.
4. Remplissage : écran de réponse en mode partagé (pas de menu de partage, bouton final « Envoyer la réponse ») ; création de la réponse `shared-links/{id}/form/create-contribution`.
5. **finish** : « Votre réponse a bien été envoyée. Veuillez cliquer sur le lien ci-dessous pour télécharger le document récapitulatif de votre réponse. » (`form/finish`, `form/validate`).
6. **finish and continue later** : « Cliquez sur le lien ci-dessous pour télécharger un résumé de votre réponse » (PDF pré-généré `form/pregenerate`) ; si génération en cours : « Document en cours de génération: veuillez réessayer dans quelques instants ».

Profil technique : utilisateur de nature `ExternalContributor` (`enum Gi … ExternalContributor=7`), mot de passe = « Code secret » [O].

---

## 10. Proposition de schéma SQL (Supabase / Postgres)

### 10.1 Arbitrage relationnel vs JSONB

| Besoin | Choix | Justification |
|---|---|---|
| Structure **éditable** du formulaire (builder) | **Relationnel** : `forms`, `form_rubrics`, `form_questions`, `form_options`, `form_signatory_slots` | éditions fines et concurrentes (renommer une option, déplacer une question), contraintes d'unicité (`code`, `pdf_field_name`, `export_key` par formulaire), FK pour redirections, réordonnancement, RLS simple, compteurs. |
| Paramétrage avancé d'option (validation, alerte, redirection, pré-remplissage) | colonnes JSONB **typées par CHECK** sur `form_options` (`validation`, `alert`, `redirect`, `prefill`) | configuration lue d'un bloc, rarement filtrée ; évite 4 tables 1-1. La redirection garde en plus des colonnes FK dédiées pour l'intégrité. |
| Version figée utilisée par une réponse | **JSONB snapshot** dans `form_versions.structure` (immuable) | Siteflow garantit que les réponses en cours/terminées ne sont pas affectées par une mise à jour ⇒ chaque réponse pointe une version ; un snapshot JSONB est simple, rapide à charger en entier par le moteur, et immuable. Les ids (`option_id`, `lineage_id`) du snapshot restent ceux des tables relationnelles au moment de la publication. |
| Valeurs de réponse | **Relationnel, 1 ligne par option** : `form_response_values` avec colonnes typées + `value_json` | requêtes analytiques « toutes les valeurs du code X », exports XLS, index par `code`/`lineage_id`, historique ligne à ligne, verrou par option, mises à jour partielles par rubrique sans réécrire un gros document. |
| Historique | table append-only `form_response_value_history` | audit, provenance, signature des changements. |

### 10.2 DDL (extrait)

```sql
-- Enums
create type form_location   as enum ('library','project');
create type form_origin     as enum ('imported','local');
create type form_nature     as enum ('model','generic','other','local','archived');
create type rubric_type     as enum ('question','table_row','table_column');
create type question_type   as enum ('short_answer','long_answer','multiple_answers','unique_choice','multiple_choices',
  'single_choice_list','multiple_choice_list','date','datetime','duration','value_unit','photo','collaborator',
  'location','formula','file','text_editor');
create type size_enum       as enum ('xs','s','m','l','xl');           -- 60/90/180/360/490 px
create type question_icon   as enum ('question','clock','exclamation_triangle','wrench','flag','info_circle','bell','key',
  'hand_paper','lightbulb','calendar','eye');
create type validation_op   as enum ('gt','gte','lt','lte','eq','neq','between','not_between','before','after','between_dates','not_between_dates');
create type alert_type      as enum ('error','warning','info','trace');
create type object_attr_link as enum ('disabled','default_family','other_family');
create type response_context as enum ('project','flow','share');
create type response_state  as enum ('in_progress','done');
create type provenance      as enum ('web','mobile','api');
create type value_type      as enum ('string','text','boolean','string_list','date','datetime','duration','number',
  'value_and_unit','coordinates','file_list','rich_text','signature');
create type contributor_type as enum ('intern','extern','not_listed_intern');
create type unique_mode     as enum ('new_or_resume','new_response','resume_response');

-- Formulaire
create table forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  lineage_id uuid not null,                         -- = id du formulaire bibliothèque d'origine
  location form_location not null,
  origin form_origin,                               -- null en bibliothèque
  project_id uuid references projects(id),
  sourced_from_form_id uuid references forms(id),   -- importé : form bibliothèque source
  sourced_from_version_id uuid,                     -- version bibliothèque importée (mise à jour)
  nature form_nature not null,
  name text not null,
  description text,
  reference text,
  index_label text,
  family_id uuid references label_families(id),
  applicability_id uuid references applicabilities(id),
  custom_status_id uuid references custom_statuses(id),
  additional_comment text,
  additional_observation text,
  lock_responses boolean not null default false,
  object_attributes_link object_attr_link not null default 'disabled',
  object_family_id uuid references label_families(id),
  pdf_template jsonb,          -- {enabled, file_id, page_number_x, page_number_y}
  hide_in_exports jsonb not null default '{}'::jsonb, -- {control_doc, forms_doc, multi_instr_doc, instr_doc}
  enabled boolean not null default true,
  archived boolean not null default false,
  current_version_id uuid,     -- dernière version publiée
  structure_rev int not null default 0,             -- incrémenté à chaque modif du builder
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz,
  check ((location='library' and project_id is null and origin is null)
      or (location='project' and project_id is not null and origin is not null))
);
create table form_companies (form_id uuid references forms(id) on delete cascade, company_id uuid references companies(id),
  primary key (form_id, company_id));

create table form_rubrics (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  lineage_id uuid not null,
  position int not null,
  type rubric_type not null,
  name text not null,
  description varchar(255),
  additional_comment text, additional_observation text,
  hidden_in_mobile boolean not null default false,
  hide_in_pdf boolean not null default false,
  pdf_landscape boolean not null default false,
  export_images_in_appendix boolean not null default false,
  attachment_width size_enum, attachment_height size_enum,
  allow_add_row boolean not null default false,
  allow_add_column boolean not null default false,
  first_column_hidden boolean not null default false,
  import_xlsx_enabled boolean not null default false,
  unique (form_id, position) deferrable initially deferred
);

create table form_questions (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null references form_rubrics(id) on delete cascade,
  lineage_id uuid not null,
  position int not null,
  type question_type not null default 'short_answer',
  name text not null,
  description text, additional_comment text, additional_observation text,
  mandatory boolean not null default false,
  with_observation boolean not null default false,
  lockable boolean not null default false,
  allow_backdating boolean not null default false,
  shared boolean not null default false,
  hide_in_pdf boolean not null default false,
  hide_images_below_table boolean not null default false,
  unify_cells boolean not null default false,
  photo_size size_enum default 's',
  background_color text check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  icon question_icon,
  object_attribute_id uuid references custom_fields(id),
  unique (rubric_id, position) deferrable initially deferred
);

create table form_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references form_questions(id) on delete cascade,
  form_id uuid not null references forms(id) on delete cascade,  -- dénormalisé pour unicités/requêtes
  lineage_id uuid not null,
  position int not null,
  code text,                                     -- custom code optionnel
  name text, option_name text, description text, placeholder text,
  choices text[],                                -- listes
  unit varchar(20), value_hint text,
  formula text,                                  -- forme canonique (§5.3)
  formula_refs uuid[] not null default '{}',     -- lineage_id des options référencées
  frozen boolean not null default false,
  prefill jsonb,       -- {mode:'static'|'dynamic'|'template', value:<json>, variable:'@@X'}
  validation jsonb,    -- {op, min, max, message, block}
  alert jsonb,         -- {type, text}
  redirect_rubric_id uuid references form_rubrics(id) on delete set null,
  redirect_question_id uuid references form_questions(id) on delete set null,
  export_key text references export_keys(code),
  pdf_field_name text,
  xls_export boolean not null default false, xls_label text,
  photo_size size_enum,
  unique (question_id, position) deferrable initially deferred,
  unique (form_id, code),
  unique (form_id, pdf_field_name),
  unique (form_id, export_key),
  check (validation is null or (validation ? 'op')),
  check (alert is null or (alert ? 'type' and alert ? 'text'))
);

create table form_signatory_slots (            -- question 'collaborator'
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references form_questions(id) on delete cascade,
  form_id uuid not null references forms(id) on delete cascade,
  lineage_id uuid not null, position int not null,
  name text, description text,
  disable_signature boolean not null default false,
  pdf_field_name text, xls_export boolean not null default false, xls_label text,
  unique (question_id, position) deferrable initially deferred
);

create table form_files (                      -- images/fichiers attachés au builder
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  owner_kind text not null check (owner_kind in ('rubric','question','option')),
  owner_id uuid not null, storage_path text not null, name text, position int);

create table form_versions (                   -- snapshot immuable
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id),
  version_no int not null,
  index_label text, reference text,
  library_form_id uuid,                        -- form bibliothèque source au moment de la publication
  structure jsonb not null,                    -- FormDefinition (§11)
  created_at timestamptz not null default now(), created_by uuid,
  unique (form_id, version_no)
);

-- Liaison bloc formulaire d'une étape (contexte flow)
create table form_block_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, project_id uuid not null,
  flow_id uuid not null, step_id uuid not null, block_id uuid not null,
  form_id uuid not null references forms(id),
  pinned_version_id uuid references form_versions(id),   -- « indice différent »
  position int not null,
  enabled boolean not null default true,
  mandatory boolean not null default false,
  unique_response boolean not null default false,
  unique_mode unique_mode not null default 'new_or_resume',
  initial_rubric_lineage_id uuid,
  fillable_rubric_lineage_ids uuid[],          -- null = toutes
  object_id uuid
);

-- Réponses
create table form_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, project_id uuid not null references projects(id),
  form_id uuid not null references forms(id),
  form_version_id uuid not null references form_versions(id),
  form_lineage_id uuid not null,               -- requêtes « toutes réponses d'un formulaire bibliothèque »
  form_index_label text, form_reference text,  -- figés à la réponse
  context response_context not null,
  block_link_id uuid references form_block_links(id) on delete set null,  -- null ⇒ orpheline si context='flow'
  flow_id uuid, phase_id uuid, step_id uuid,   -- dénormalisés (survivent à l'orphelinage)
  reference text not null check (char_length(reference) >= 3),
  state response_state not null default 'in_progress',
  custom_status_id uuid references custom_statuses(id),
  provenance provenance not null,
  dynamic_context jsonb not null default '{}', -- valeurs @@ résolues à la création
  active_redirect jsonb,                       -- état de navigation (§6.6)
  last_rubric_lineage_id uuid,
  done_at timestamptz, done_by uuid,
  created_at timestamptz not null default now(), created_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  deleted_at timestamptz
);
create index on form_responses (project_id, form_lineage_id, state);
create index on form_responses (block_link_id);

-- Items ajoutés sur le terrain (lignes/colonnes de tableau, réponses multiples)
create table form_response_dynamic_items (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references form_responses(id) on delete cascade,
  rubric_lineage_id uuid not null,
  kind text not null check (kind in ('question','option')),
  parent_lineage_id uuid,                      -- question parente si kind='option'
  template_lineage_id uuid not null,           -- élément dupliqué (type/paramétrage hérités)
  position int not null, name text
);

create table form_response_values (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references form_responses(id) on delete cascade,
  organization_id uuid not null,
  rubric_lineage_id uuid not null,
  question_lineage_id uuid not null,
  option_lineage_id uuid not null,             -- option, slot signataire ou item dynamique
  option_code text,                            -- copie du custom code (requêtes par code)
  coord text not null,                         -- 'R2Q3O1' figé selon la version
  question_type question_type not null,
  value_type value_type not null,
  value_text text, value_number numeric, value_bool boolean,
  value_date date, value_ts timestamptz,
  value_json jsonb,                            -- forme canonique §4 (toujours renseignée)
  observation text,                            -- (porté sur la 1re option de la question)
  is_valid boolean,                            -- résultat validation de données
  locked boolean not null default false, locked_at timestamptz, locked_by uuid,
  updated_at timestamptz not null default now(), updated_by uuid,
  provenance provenance not null,
  unique (response_id, option_lineage_id)
);
create index on form_response_values (organization_id, option_code) where option_code is not null;
create index on form_response_values (option_lineage_id);
create index on form_response_values using gin (value_json jsonb_path_ops);

create table form_response_files (
  id uuid primary key default gen_random_uuid(),
  value_id uuid not null references form_response_values(id) on delete cascade,
  storage_path text not null, name text, mime text, size_bytes bigint, position int,
  deleted_at timestamptz);

create table form_response_signatures (
  value_id uuid primary key references form_response_values(id) on delete cascade,
  contributor_type contributor_type not null,
  user_id uuid, first_name text, last_name text, email text, function text, company_name text,
  signature_path text, signature_hash text, signed_at timestamptz, local_created_at timestamptz,
  proxied boolean not null default false, principal text, proxy text, proxy_date timestamptz,
  comment text, deletion_reason text);

create table form_response_value_history (     -- append-only
  id bigint generated always as identity primary key,
  response_id uuid not null, value_id uuid, option_lineage_id uuid not null,
  changed_at timestamptz not null default now(), changed_by uuid, provenance provenance not null,
  old_value jsonb, new_value jsonb,
  files_added jsonb, files_removed jsonb,
  change_signature jsonb,                      -- {user_id, image_path, signed_at, comment} si valeur verrouillée
  reason text);

create table form_response_events (            -- « Historique » de la réponse
  id bigint generated always as identity primary key,
  response_id uuid not null, action text not null,  -- created|updated|filled|deleted|exported|status_changed|state_changed|shared
  actor_id uuid, provenance provenance, at timestamptz not null default now(), payload jsonb);

create table form_shares (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null, form_id uuid, response_id uuid,
  email citext not null, language text, comment text,
  code_hash text, sent_at timestamptz, blocked boolean not null default false,
  responded_at timestamptz, revoked_at timestamptz,
  contributor jsonb                            -- {first_name,last_name,email,company,function}
);
-- un seul partage actif par e-mail et par cible
create unique index form_shares_active_uq on form_shares (email, coalesce(response_id, form_id)) where revoked_at is null;
```

Règles d'implémentation :
- **Publication de version** : fonction `publish_form_version(form_id)` qui sérialise les tables relationnelles en `FormDefinition` et crée `form_versions` si `structure_rev` a changé. Appelée à l'import, à la mise à jour, et à la première réponse après modification (copie locale/bibliothèque).
- **Import bibliothèque → projet** : copie relationnelle (nouveaux `id`, mêmes `lineage_id`), `sourced_from_form_id`, `sourced_from_version_id` ; *mise à jour* = remplacer la structure du formulaire projet par celle de la dernière version bibliothèque ; les réponses existantes gardent leur `form_version_id`.
- **Copie locale** : copie relationnelle avec **nouveaux** `lineage_id` (indépendance totale, cf. HC) [I : Siteflow ne garde pas de relation].
- **Sauvegarde de rubrique** : RPC `save_rubric_values(response_id, rubric_lineage_id, values jsonb, provenance)` transactionnelle : upsert `form_response_values`, insert `form_response_value_history` pour chaque diff, refus si `state='done'`, refus des valeurs `locked` sans `change_signature`, contrôle antidatage côté serveur.
- **Contrôles** : RPC `check_rubric` / `check_response` renvoyant `[{rubric, questions:[{name, type, icon, error:'mandatory'|'invalid'}]}]`.
- **RLS** : toutes les tables filtrées par `organization_id` + appartenance projet ; partage externe via JWT dédié limité à `form_shares.response_id` et aux questions `shared`.
- **Requêtes par code** : `select r.reference, v.value_json from form_response_values v join form_responses r … where v.organization_id=$1 and v.option_code='TEMP_MAX'` ; par position : `coord`.

---

## 11. Proposition de modèle TypeScript

```ts
// types/forms.ts
export type QuestionType =
  | 'short_answer' | 'long_answer' | 'multiple_answers' | 'unique_choice' | 'multiple_choices'
  | 'single_choice_list' | 'multiple_choice_list' | 'date' | 'datetime' | 'duration' | 'value_unit'
  | 'photo' | 'collaborator' | 'location' | 'formula' | 'file' | 'text_editor';
export type RubricType = 'question' | 'table_row' | 'table_column';
export type Size = 'xs' | 's' | 'm' | 'l' | 'xl';
export type ValidationOp = 'gt'|'gte'|'lt'|'lte'|'eq'|'neq'|'between'|'not_between'|'before'|'after'|'between_dates'|'not_between_dates';

export interface FormDefinition {          // = form_versions.structure
  formId: string; lineageId: string; versionNo: number;
  nature: 'model' | 'generic' | 'other' | 'local';
  name: string; reference?: string; indexLabel?: string;
  additionalComment?: string; additionalObservation?: string;
  lockResponses: boolean;
  pdf?: { templateFileId?: string; pageNumberX?: number; pageNumberY?: number };
  rubrics: RubricDef[];
}

export interface RubricDef {
  id: string; lineageId: string; position: number; type: RubricType;
  name: string; description?: string; additionalComment?: string; additionalObservation?: string;
  hiddenInMobile: boolean; hideInPdf: boolean; pdfLandscape: boolean; exportImagesInAppendix: boolean;
  allowAddRow: boolean; allowAddColumn: boolean; firstColumnHidden: boolean; importXlsxEnabled: boolean;
  images: FileRef[];
  questions: QuestionDef[];                // table_row : lignes ; table_column : colonnes
}

export interface QuestionDef {
  id: string; lineageId: string; position: number; type: QuestionType;
  name: string; description?: string; additionalComment?: string; additionalObservation?: string;
  mandatory: boolean; withObservation: boolean; lockable: boolean; allowBackdating: boolean;
  shared: boolean; hideInPdf: boolean; hideImagesBelowTable: boolean; unifyCells: boolean;
  photoSize?: Size; backgroundColor?: string; icon?: string; objectAttributeId?: string;
  images: FileRef[];
  options: OptionDef[];                    // vide si type === 'collaborator'
  signatories: SignatorySlotDef[];         // seulement si type === 'collaborator'
}

export interface OptionDef {
  id: string; lineageId: string; position: number;
  coord: `R${number}Q${number}O${number}`;
  code?: string; name?: string; optionName?: string; description?: string; placeholder?: string;
  choices?: string[]; unit?: string; valueHint?: string;
  formula?: { canonical: string; refs: string[] };          // refs = lineageId d'options
  frozen: boolean;
  prefill?: { mode: 'static' | 'dynamic' | 'template'; value?: unknown; variable?: string };
  validation?: { op: ValidationOp; min?: string; max?: string; message?: string; block: boolean };
  alert?: { type: 'error' | 'warning' | 'info' | 'trace'; text: string };
  redirect?: { rubricLineageId: string; questionLineageId?: string };
  exportKey?: string; pdfFieldName?: string; xls?: { enabled: boolean; label?: string };
  photoSize?: Size; images: FileRef[];
}

export interface SignatorySlotDef {
  id: string; lineageId: string; position: number; coord: string;
  name?: string; description?: string; disableSignature: boolean;
  pdfFieldName?: string; xls?: { enabled: boolean; label?: string };
}

export interface FileRef { fileId: string; name?: string; position: number }

// ---------- Réponse ----------
export type ResponseState = 'in_progress' | 'done';
export type Provenance = 'web' | 'mobile' | 'api';

export interface FormResponse {
  id: string; projectId: string; formId: string; formVersionId: string; formLineageId: string;
  formIndexLabel?: string; formReference?: string;
  context: 'project' | 'flow' | 'share';
  blockLinkId?: string | null; flowId?: string; phaseId?: string; stepId?: string;
  reference: string; state: ResponseState; customStatusId?: string; provenance: Provenance;
  dynamicContext: Record<string, string | number | null>;   // '@@FlowName' -> valeur
  activeRedirect?: { rubricLineageId: string; questionLineageId?: string; fromQuestionPos: number; fromOptionPos: number } | null;
  dynamicItems: DynamicItem[];
  values: Record<string /* optionLineageId */, ResponseValue>;
  createdAt: string; updatedAt: string;
}

export interface DynamicItem { id: string; rubricLineageId: string; kind: 'question' | 'option'; parentLineageId?: string; templateLineageId: string; position: number; name?: string }

export type ResponseValue =
  | Base<'string' | 'text' | 'rich_text', string>
  | Base<'boolean', boolean>
  | Base<'string_list', string[]>
  | Base<'date' | 'datetime', string>                       // ISO
  | Base<'duration', { hours: number; minutes: number }>
  | Base<'number', { result: number | boolean | string; unit?: string }>   // formule
  | Base<'value_and_unit', { value: number | null; unit?: string }>
  | Base<'coordinates', { lat: number; lng: number; alt?: number }>
  | Base<'file_list', FileRef[]>
  | Base<'signature', SignatureValue>;

interface Base<T extends string, V> {
  valueType: T; value: V | null;
  optionCode?: string; coord: string; questionLineageId: string; rubricLineageId: string;
  observation?: string; isValid?: boolean; locked: boolean;
  updatedAt?: string; updatedBy?: string; provenance?: Provenance;
}

export interface SignatureValue {
  contributorType: 'intern' | 'extern' | 'not_listed_intern';
  userId?: string; firstName?: string; lastName?: string; email?: string; function?: string; companyName?: string;
  signaturePath?: string; signedAt?: string; localCreatedAt?: string;
  proxied?: boolean; principal?: string; proxy?: string; proxyDate?: string; comment?: string;
}

export interface ValueHistoryEntry {
  optionLineageId: string; changedAt: string; changedBy: { id: string; name: string };
  provenance: Provenance; oldValue: unknown; newValue: unknown;
  filesAdded?: FileRef[]; filesRemoved?: FileRef[];
  changeSignature?: { imagePath: string; signedAt: string; comment?: string };
}

export interface CheckResult {                 // rubrics/{id}/check, responses/{id}/check
  rubricLineageId: string; name: string; position: number; type: RubricType; valid: boolean;
  questions: { name: string; type: QuestionType; icon?: string; error: 'mandatory' | 'invalid' }[];
}
```

---

## 12. Incertitudes

| # | Sujet | Statut | Proposition |
|---|---|---|---|
| U1 | **customCode** : aucune occurrence dans le bundle WebApp ; seulement `HC:Structural`/API v2. Saisie IHM inexistante ? | non observé en IHM | ajouter un champ « Code » optionnel dans le détail d'option (amélioration) ; garder `coord` RxQyOz. |
| U2 | Sémantique exacte de `$R1Q1O1$` (référence encadrée simple-dollar) | regex observée, usage inconnu | l'accepter au parsing, ne pas la générer. |
| U3 | Fonctions math.js réellement autorisées : le bundle embarque math.js complet ; l'aide officielle (article 14686195812370) n'est pas disponible localement ; la validation serveur (flag `SFP_21185`) peut restreindre | partiel | whitelister un sous-ensemble (arithmétique, comparaisons, logique, ternaire, `min max sum mean round ceil floor abs sqrt pow mod`), documenter. |
| U4 | `invalidParameters` : déclencheur exact | serveur [I] | mapper les erreurs d'arité/type de math.js. |
| U5 | Recalcul des formules : uniquement manuel (« Calculer ») côté WebApp ; comportement MobileApp inconnu ; recalcul à la sauvegarde côté serveur ? | [I] | recalcul serveur à la sauvegarde + bouton client. |
| U6 | Une alerte de type « Blocage » bloque-t-elle la sauvegarde ? | non observé | non bloquante. |
| U7 | Validation non bloquante : la terminaison est-elle refusée pour une valeur hors plage (`invalid` dans la fenêtre « Questions échouées ») ? | contradictoire (l'erreur `invalid` existe) | `invalid` = valeur non conforme **et** bloquante (format impossible) ; non conforme non bloquant = avertissement + indicateur. À confirmer sur instance. |
| U8 | `mandatory` sur natures multi-options et `collaborator` : « au moins une » ou « toutes » ? | [I] | au moins une option ; pour collaborateur, tous les slots. |
| U9 | Moment du verrouillage automatique (`lock_responses`) : à la sauvegarde de rubrique ou à la terminaison ? | [I] | à la sauvegarde de la rubrique. |
| U10 | Lignes/colonnes ajoutées sur le terrain : stockées au niveau liaison (Siteflow : endpoint avec `uuideFormBusinessLink`) ou réponse ? | [I] | au niveau **réponse** (`form_response_dynamic_items`), plus sûr. |
| U11 | Format exact de la référence par défaut (espaces, segments vides, format `todayDate`) et paramétrage via module Références | partiel | reproduire les gabarits §6.2 ; permettre une règle de chrono par organisation. |
| U12 | « Sélectionner un indice différent » sur un bloc : choix d'une version bibliothèque antérieure ? | [I] | `pinned_version_id`. |
| U13 | Copie locale : nouveaux `lineage_id` ou conservation ? Impacte redirections/navigation de bloc | HC dit « indépendant » | nouveaux `lineage_id`. |
| U14 | Import de réponses : copie ou déplacement de la réponse source | [I] | copie (nouvelle réponse liée à la liaison cible, même version). |
| U15 | Nom de variable des attributs personnalisés (`@@…`) | non observé | `@@Attr_<slug>` généré + éditable. |
| U16 | Palette de couleurs de style de question (8 niveaux hérités) : hex non observés | [I] | définir 8 tokens sémantiques. |
| U17 | Liste `exportableValue.*` spécifique client (EDF) | observé | table de référence paramétrable par organisation ; ne pas coder en dur. |
| U18 | Pré-remplissage : résolution des `@@` à la création (snapshot) vs à l'affichage ; bouton « Evaluer » (`canEvaluate`) | partiel | snapshot à la création + réévaluation à la demande. |
| U19 | Statuts hérités `flowApp.formStatus.*` : encore utilisés ou remplacés par les statuts personnalisés | [I] | semer comme statuts personnalisés par défaut. |
| U20 | Rubriques sautées par redirection et contrôle d'obligation à la terminaison | non observé | contrôler toute la réponse (fidélité). |
| U21 | Historique formulaire (action « Historique » bibliothèque) : contenu exact | endpoint `forms/event/log` seulement | journal d'événements générique. |
| U22 | `hidden_in_mobile` vs partage externe et MobileApp hors ligne | hors WebApp | à traiter dans la spec mobile. |
