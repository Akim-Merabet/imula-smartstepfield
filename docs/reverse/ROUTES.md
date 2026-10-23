# Carte des écrans — exhibit.siteflow.co

_Build Angular du 21 oct. 2026 (`main-J76XDDLA.js`). Extrait par analyse statique du bundle : 315 identifiants d'écran (`routeId`) + 159 segments d'URL. Les composants sont chargés en lazy-loading (`loadChildren`/`loadComponent`), protégés par des gardes `canActivate`._

## Arborescence des URLs (segments principaux)
```
/explore                         (mainPath — racine de l'app)
  /projects                      liste des projets  ·  /families  ·  /metrics  ·  /kpi
  /dashboard                     tableau de bord d'un projet
    /flow-management             gestion des flux
        /vue-list                vue liste
        /vue-plan                vue plan
        /vue-diagram             vue diagramme (GoJS)
        /vue-kanban              vue kanban
        /vue-map                 vue carte (Leaflet)
        /vue-temporal            vue temporelle (signatures)
    /documents  /forms  /risks  /categories  /sections  /references
    /collaborators  /equipments  /trams  /tags  /custom-fields  /custom-files
    /closing-folder  /backups  /trash  /history
  /library                       bibliothèque (documents, formulaires, risques, listes…)
  /settings                      paramètres
    /general-organization  /general-account  /users  /operators  /external-users
    /clients  /companies  /tablets  /authorized-devices
    /access-api (v1)  /access-api-v2 (v2)  /external-api  /background-tasks
    /schedule-tasks  /wording-configuration  /geo-map-management  /object-management
  /object-management  /pgac  /file-processing

Auth & cycle de vie du compte :
  /auth · /login · /sign-up/<token> · /reset-password · /reset/finish
  /activate · /onboarding/finish · /callback · /404 (**)

Partage externe (lien public) :
  /share → /init-document · /init-form · /login · /finish
```

## Écrans par domaine fonctionnel (routeId)

### Dashboard (42)
```
DashboardAddCategory		     DashboardEmmListEditModal		  DashboardListAddModal
DashboardAdrListEditModal	     DashboardFieldFeedback		  DashboardListDialogContentTabModal
DashboardCategories		     DashboardFlowPgacDetailsModal	  DashboardListDialogGeneralTabModal
DashboardClosingFolder		     DashboardFlowReferential		  DashboardListDialogImportationTabMod
DashboardCollaboratorsImportModal    DashboardFlowReferentialDiagramView  DashboardLists
DashboardCollaboratorsReorganizeModa DashboardFlowReferentialEditModal	  DashboardMetrics
DashboardCollaboratorsSkillsModal    DashboardFlowReferentialListView	  DashboardScheduleTasks
DashboardContributorEditModal	     DashboardFlowReferentialManagementIm DashboardSignature
DashboardContributors		     DashboardForms			  DashboardSignatureFlow
DashboardDocuments		     DashboardFormsImportModal		  DashboardSignatureList
DashboardDocumentsImportFromLibraryD DashboardFormsPropertiesModal	  DashboardSignatureTemporal
DashboardDocumentsPropertiesDialog   DashboardFormsReplyModal		  DashboardTablets
DashboardDocumentsReorganizeDialog   DashboardFormsResponseModal	  DashboardTabletsImportModal
DashboardEditCategory		     DashboardInformation		  DashboardTabletsQuickConnectionModal
```

### Flow (26)
```
FlowContent			     FlowManagementDuplicateModal	  FlowManagementPlan
FlowEventsHistoryModal		     FlowManagementEditModal		  FlowManagementPropertiesModal
FlowManagement			     FlowManagementExecuteListModal	  FlowManagementReorganizeModal
FlowManagementAddModal		     FlowManagementExecuteModal		  FlowManagementScheduleModal
FlowManagementAffectation	     FlowManagementGeoMapModal		  FlowSourceInfoModal
FlowManagementAffectationEdit	     FlowManagementKanban		  FlowValidationModal
FlowManagementContributorsModal	     FlowManagementList			  FlowsForPlanModal
FlowManagementCustomizeColumnsModal  FlowManagementMap			  FlowsToLinkForPlanModal
FlowManagementDiagram		     FlowManagementPgacDuplicateModal
```

### Block (22)
```
BlockAdrContent			     BlockMultiPrCreateSignatory	  BlockObjectViewModal
BlockContent			     BlockMultiPrEditObservation	  BlockPrContent
BlockDsiContent			     BlockMultiPrUpdateSignatory	  BlockPropertiesModal
BlockDsiHistoryModal		     BlockObjectContent			  BlockRhpContent
BlockEmmContent			     BlockObjectEditModal		  BlockStatusHistoryModal
BlockFormContent		     BlockObjectImportModal		  BlockTxtContent
BlockMultiPrAddObservation	     BlockObjectLinkFormContent		  BlockValidationModal
BlockMultiPrContent
```

### Library (35)
```
Library				     LibraryFormsEditModal		  LibraryRiskPropertiesDialog
LibraryDocuments		     LibraryFormsPropertiesModal	  LibraryRiskReorganizeDialog
LibraryDocumentsAddModal	     LibraryFormsReorganizeModal	  LibraryRisks
LibraryDocumentsEditModal	     LibraryObjectList			  LibraryRisksAddDialogue
LibraryDocumentsPropertyModal	     LibraryObjectManagement		  LibraryRisksEditDialogue
LibraryDocumentsReorganizeModal	     LibraryObjectManagementAddModal	  LibraryRisksImportDialogue
LibraryEquipmentReorganizeDialog     LibraryObjectManagementAssignModal	  LibraryRisksViewDialogue
LibraryEquipments		     LibraryObjectManagementDuplicateModa LibraryTagLinksDialog
LibraryForms			     LibraryObjectManagementEditModal	  LibraryTags
LibraryFormsAddModal		     LibraryObjectManagementGenerateModal LibraryTagsAddDialog
LibraryFormsDuplicateModal	     LibraryObjectPropertiesModal	  LibraryTagsEditDialog
LibraryFormsEditLocalModal	     LibraryRiskDialog
```

### Project (16)
```
ProjectAddModal			     ProjectEditModal			  ProjectPgacModal
ProjectDashboard		     ProjectFileProcessingModal		  ProjectPropertiesModal
ProjectDialogAttributeTabModal	     ProjectFolder			  ProjectStatusHistoryModal
ProjectDialogGeneralTabModal	     ProjectFolderDuplicateModal	  Projects
ProjectDialogOptionsTabModal	     ProjectPgacDetailsModal		  ProjectsCustomizeColumnsModal
ProjectDuplicateModal
```

### Contributor (9)
```
ContributorAuthorizedDeviceAddModal  ContributorExternalUsers		  ContributorUsers
ContributorAuthorizedDeviceEditModal ContributorOperators		  Contributors
ContributorAuthorizedDevices	     ContributorTablets			  contributorExternalAPI
```

### Settings (25)
```
Settings			     SettingsCompaniesAddModal		  SettingsGeneralOrganization
SettingsAccount			     SettingsCompaniesEditModal		  SettingsKpis
SettingsAddFamily		     SettingsCustomCell			  SettingsLogsPush
SettingsBackgroundTasks		     SettingsCustomField		  SettingsReferences
SettingsBackups			     SettingsCustomFile			  SettingsSections
SettingsClientBook		     SettingsEditFamily			  SettingsTrams
SettingsClientBookAddModal	     SettingsFamilies			  SettingsTrash
SettingsClientBookEditModal	     SettingsGeneralAccount		  SettingsWordingConfiguration
SettingsCompanies
```

### AccessApi (1)
```
AccessApiV2PropertiesModal
```

### Share (4)
```
Share				     ShareDialog			  ShareLogin
ShareContributorInfo
```

### Autres / transverses
```
Activate			     EditWordingConfiguration		  ProfileInformation
AddAccessApiModal		     EquipmentProperties		  ProfileResetPassword
AddAccessApiV2Modal		     EquipmentsAdd			  ProfileTablet
AddCustomCell			     EquipmentsEdit			  PropertiesTabletModal
AddCustomField			     EquipmentsUpload			  QuestionChangesHistory
AddCustomFile			     ExternalAccessApiV1		  QuestionDetailsModal
AddCustomStatus			     ExternalAccessApiV2		  QuestionGalleryModal
AddDefaultCategory		     FinishAndContinueLater		  ReferenceAdd
AddLanguageConfiguration	     FinishShare			  ReferenceEdit
AddPhaseModal			     FolderAdd				  ReplaceFormModal
AddRhpModal			     FolderEdit				  ResetBlocStatusModal
AddRubricModal			     Form				  ResetPwd
AddStepModal			     FormHistoryModal			  ResponseManagementModal
AddTabletModal			     FormNavigationModal		  RevisionModal
AddTram				     FormResponseModal			  RubricGalleryModal
AddWordingConfiguration		     FormsSummaryModal			  SectionAdd
AnnotateOptionImageModal	     ImageEditorModal			  SectionEdit
AnnotateOptionTmpImageModal	     ImportAdrModal			  SequenceView
AnnotateQuestionImageModal	     ImportEmmModal			  SignModal
AnnotateRubricImageModal	     ImportFlowModal			  SignUp
ContentView			     ImportFormModal			  StatusHistoryModal
CustomStatus			     ImportFormResponsesModal		  StepContent
DashDocumentsAddModal		     InitDocShare			  TeamRolesForPlanModal
DashDocumentsEditModal		     InitFormShare			  TechnicalObjectQuestionDetailsModal
DefaultCategories		     LinkDocumentModal			  UniqueResponseModeModal
DiagramImportFlow		     Login				  UnlockFlowModal
EditAccessApiModal		     Main				  UserAddModal
EditAccessApiV2Modal		     MileStoneAddModal			  UserEditModal
EditControlModal		     MileStoneEditModal			  UserMoveApplicabilityModal
EditCustomCell			     MultiPrHistoryModal		  UserPropertiesDialog
EditCustomField			     Onboarding				  UserReorganizeModal
EditCustomFile			     OperatorAddModal			  UserSkillModal
EditCustomStatus		     OperatorEditModal			  UserUploadModal
EditDefaultCategory		     OperatorMoveApplicabilityModal	  UsersQuickConnectionModal
EditExternalUser		     OperatorPropertiesDialog		  ViewAdrModal
EditFlowContentModal		     OperatorReorganizeModal		  ViewEmmModal
EditFolderModal			     OperatorSkillsModal		  ViewEquipments
EditLanguageConfiguration	     OperatorUploadModal		  ViewImageModal
EditPhaseModal			     OptionDetailsModal			  ViewRhpModal
EditRhpModal			     OptionGalleryModal			  ViewSignatureModal
EditRubricModal			     OrphanResponsesModal		  ViewTmpImageModal
EditSignatureModal		     PlanAddModal			  data
EditStepModal			     PlanEditModal			  isReferentialFlowTable
EditTabletModal			     PrepareFolderModal			  quickConnectionModal
EditTram			     Profile				  routeId
```
