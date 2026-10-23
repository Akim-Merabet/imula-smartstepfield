import { ADMIN_AUTHORITIES, ADMIN_OR_ADVANCED, CONTRACTORS, type Action, type Rule } from "./types";

const SFA = ["siteflow_admin"] as const;
const SFA_GA = ["siteflow_admin", "global_admin"] as const;
const ALL_USERS = [...ADMIN_OR_ADVANCED, "normal", "co_contractor_user"] as const;
const R = ["responsible"] as const;
const RE = ["responsible", "expert"] as const;
const REW = ["responsible", "expert", "writer"] as const;
const REWO = ["responsible", "expert", "writer", "operator"] as const;

type Matrix = Record<string, Partial<Record<Action, Rule>>>;

/**
 * Matrice de permissions par écran (routeId) et action — spec 01 §3.5 et spec 00 §2.3.
 * L'interface s'appuie dessus ; la sécurité réelle reste la RLS Postgres.
 */
export const PERMISSIONS: Matrix = {
  // Entités
  Projects: {
    read: {},
    add: { rights: [...ALL_USERS] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...R] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...R] },
    duplicate: { rights: [...ADMIN_AUTHORITIES], roles: [...R] },
    publish: { rights: [...SFA_GA] },
  },
  ProjectDashboard: { read: {} },
  // Dossiers référentiels (spec 01 §5.7) : sous-dossiers, conversion d'un référentiel, préparation (executeFlowRef).
  ProjectFolder: {
    read: {},
    add: { rights: [...ADMIN_AUTHORITIES], roles: [...R] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...R] },
    duplicate: { rights: [...ADMIN_AUTHORITIES], roles: [...R] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...R] },
    executeFlowRef: { rights: [...ALL_USERS] },
  },
  FlowManagement: {
    read: {},
    add: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    duplicate: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    editStatus: { rights: [...ADMIN_AUTHORITIES], roles: [...REWO] },
    executeFlowRef: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    unlock: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    editFlowContributors: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
  },
  FlowContent: {
    read: {},
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    validateStep: { rights: [...ADMIN_AUTHORITIES], roles: [...REWO] },
    devalidateStep: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    deleteSignature: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    reset: { rights: [...ADMIN_AUTHORITIES], roles: [...R] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    deactivate: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
  },
  // Validation interne des blocs (§5.1 R-BL-4) et validation interne globale du flow (§4.9).
  FlowBlockValidation: {
    read: {},
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    reset: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
  },
  // Signatures du bloc Contrôle (§6) et des instructions multiples.
  FlowSignatures: {
    read: {},
    add: { rights: [...ADMIN_AUTHORITIES], roles: [...REWO] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REWO] },
    deleteSignature: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
  },
  FlowManagementList: { read: {} },
  // Vue plan (Gantt, §3.4) : plans, jalons, dépendances ; déplacer une barre = dates prévues (FlowManagement.edit).
  FlowManagementPlan: {
    read: {},
    add: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
  },
  // Vue carte (§3.3) : géométries et couches GeoJSON.
  FlowManagementMap: {
    read: {},
    add: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
  },
  // Vue diagramme (§3.5).
  FlowManagementDiagram: {
    read: {},
    add: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
  },
  // Vue kanban (§3.2) : le glisser-déposer applique FlowManagement.editStatus.
  FlowManagementKanban: { read: {} },
  // Séquencement du flow (§4.5) ; unlock = déverrouiller une étape bloquée (R-SEQ-3).
  FlowSequence: {
    read: {},
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    unlock: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
  },
  // Module Référentiels d'une entité projet / PGAC (§3.6).
  FlowReferential: {
    read: {},
    import: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    executeFlowRef: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    unlock: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
  },
  DashboardSignatureTemporal: { read: {} },
  DashboardForms: {
    read: {},
    add: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    import: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    duplicate: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    deactivate: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    share: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    view: {},
  },
  DashboardFieldFeedback: {
    read: {},
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REWO] },
    duplicate: { rights: [...ADMIN_AUTHORITIES], roles: [...REWO] },
    editStatus: { rights: [...ADMIN_AUTHORITIES], roles: [...REWO] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    export: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
  },
  // Réponse de formulaire (saisie, verrouillage) — RLS : opérateur+ sur l'entité.
  FormResponse: {
    read: {},
    add: { rights: [...ADMIN_AUTHORITIES], roles: [...REWO] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REWO] },
    editRef: { rights: [...ADMIN_AUTHORITIES], roles: [...REWO] },
    editStatus: { rights: [...ADMIN_AUTHORITIES], roles: [...REWO] },
    unlock: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    // Partage externe d'une réponse (spec 03 §9.1) — RLS form_shares : rédacteur+.
    share: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
  },
  // Bloc Formulaires d'une étape de flow (liaisons).
  BlockForm: {
    read: {},
    link: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    unlink: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    share: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
  },
  DashboardContributors: {
    read: {},
    add: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...R], forbidden: [...CONTRACTORS] },
  },
  DashboardTablets: {
    read: {},
    add: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...R] },
  },
  DashboardCategories: {
    read: {},
    add: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...R], forbidden: [...CONTRACTORS] },
  },
  // Documents d'une entité (spec 04 §7.1) ; controlDiffusion complété par le droit additionnel manage_diffusion.
  DashboardDocuments: {
    read: {},
    add: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...RE], forbidden: [...CONTRACTORS] },
    import: { rights: [...ADMIN_AUTHORITIES], roles: [...RE], forbidden: [...CONTRACTORS] },
    controlDiffusion: { rights: [...SFA] },
    editRef: { rights: [...ADMIN_AUTHORITIES] },
    share: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
  },
  // Dossier de clôture (spec 04 §5.9) ; le rôle rédacteur édite (R2.x).
  DashboardClosingFolder: {
    read: {},
    add: { rights: [...ADMIN_OR_ADVANCED], roles: [...REW] },
    edit: { rights: [...ADMIN_OR_ADVANCED], roles: [...REW] },
    delete: { rights: [...ADMIN_OR_ADVANCED], roles: [...RE] },
    generateDocument: { rights: [...ADMIN_OR_ADVANCED], roles: [...REW] },
    controlDiffusion: { rights: [...SFA] },
    editRef: { rights: [...ADMIN_OR_ADVANCED] },
  },
  DashboardInformation: { read: {}, edit: { rights: [...ADMIN_AUTHORITIES], roles: [...R] } },
  DashboardMetrics: { read: {} },
  DashboardSignatureList: { read: {} },

  // Bibliothèque
  Library: { read: { rights: [...ALL_USERS] } },
  // Création/édition : en plus, droit complémentaire « Formulaire générique / modèle » pour les non-admins (spec 03 §2.2).
  LibraryForms: {
    read: { rights: [...ALL_USERS] },
    add: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    edit: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    delete: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    duplicate: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    archive: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    export: { rights: [...ADMIN_OR_ADVANCED] },
    view: { rights: [...ALL_USERS] },
  },
  LibraryDocuments: {
    read: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    add: { rights: [...ADMIN_OR_ADVANCED] },
    edit: { rights: [...ADMIN_OR_ADVANCED] },
    delete: { rights: [...ADMIN_OR_ADVANCED] },
    controlDiffusion: { rights: [...SFA] },
  },
  // Risques / moyens / objets / étiquettes : lecture Normal+, écriture Avancé+ (miroir RLS is_admin_or_advanced).
  LibraryRisks: {
    read: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    add: { rights: [...ADMIN_OR_ADVANCED] }, edit: { rights: [...ADMIN_OR_ADVANCED] }, duplicate: { rights: [...ADMIN_OR_ADVANCED] },
    delete: { rights: [...ADMIN_OR_ADVANCED] }, deactivate: { rights: [...ADMIN_OR_ADVANCED] },
    import: { rights: [...ADMIN_OR_ADVANCED] }, export: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
  },
  LibraryEquipments: {
    read: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    add: { rights: [...ADMIN_OR_ADVANCED] }, edit: { rights: [...ADMIN_OR_ADVANCED] }, duplicate: { rights: [...ADMIN_OR_ADVANCED] },
    delete: { rights: [...ADMIN_OR_ADVANCED] }, deactivate: { rights: [...ADMIN_OR_ADVANCED] },
    import: { rights: [...ADMIN_OR_ADVANCED] }, export: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
  },
  LibraryTags: {
    read: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    add: { rights: [...ADMIN_OR_ADVANCED] }, edit: { rights: [...ADMIN_OR_ADVANCED] }, delete: { rights: [...ADMIN_OR_ADVANCED] },
  },
  LibraryObjectManagement: {
    read: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    add: { rights: [...ADMIN_OR_ADVANCED] }, edit: { rights: [...ADMIN_OR_ADVANCED] }, duplicate: { rights: [...ADMIN_OR_ADVANCED] },
    delete: { rights: [...ADMIN_OR_ADVANCED] },
  },

  // Collaborateurs et tablettes
  Contributors: { read: { rights: [...ADMIN_OR_ADVANCED, "normal"] } },
  ContributorUsers: {
    read: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    add: { rights: [...ADMIN_OR_ADVANCED] },
    edit: { rights: [...ADMIN_OR_ADVANCED] },
    delete: { rights: [...ADMIN_AUTHORITIES] },
    restore: { rights: [...ADMIN_AUTHORITIES] },
    export: { rights: [...ADMIN_AUTHORITIES] },
    unlock: { rights: [...SFA] },
  },
  ContributorOperators: {
    read: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    add: { rights: [...ADMIN_OR_ADVANCED] },
    edit: { rights: [...ADMIN_OR_ADVANCED] },
    delete: { rights: [...ADMIN_AUTHORITIES] },
    restore: { rights: [...ADMIN_AUTHORITIES] },
  },
  ContributorExternalUsers: { read: { rights: [...SFA] }, edit: { rights: [...SFA] }, delete: { rights: [...SFA] } },
  ContributorTablets: {
    read: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    add: { rights: [...ADMIN_OR_ADVANCED] },
    edit: { rights: [...ADMIN_OR_ADVANCED] },
    view: { rights: [...ADMIN_OR_ADVANCED] },
    delete: { rights: [...ADMIN_AUTHORITIES] },
    unlock: { rights: [...SFA] },
  },
  ContributorAuthorizedDevices: {
    read: { rights: [...ADMIN_OR_ADVANCED] },
    add: { rights: [...ADMIN_OR_ADVANCED] },
    edit: { rights: [...ADMIN_OR_ADVANCED] },
    delete: { rights: [...ADMIN_OR_ADVANCED] },
  },
  ContributorSkills: {
    read: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    add: { rights: [...ADMIN_AUTHORITIES] },
    edit: { rights: [...ADMIN_AUTHORITIES] },
    delete: { rights: [...ADMIN_AUTHORITIES] },
  },
  ExternalAccessApi: { read: { rights: [...SFA] } },
  // Journal des e-mails sortants (outil de développement, partage externe).
  SettingsEmails: { read: { rights: [...SFA] } },
  ExternalAccessApiV1: { read: { rights: [...SFA] } },
  ExternalAccessApiV2: { read: { rights: [...SFA] }, add: { rights: [...SFA] }, edit: { rights: [...SFA] }, delete: { rights: [...SFA] } },
  MoveApplicability: { read: { rights: [...SFA_GA] } },

  // Paramètres
  Settings: { read: { rights: [...ADMIN_OR_ADVANCED] } },
  SettingsAccount: { read: { rights: [...ADMIN_OR_ADVANCED] }, edit: { rights: [...ADMIN_AUTHORITIES] } },
  SettingsClientBook: {
    read: { rights: [...ADMIN_OR_ADVANCED] },
    edit: { rights: [...ADMIN_OR_ADVANCED] },
    delete: { rights: [...ADMIN_AUTHORITIES] },
  },
  SettingsCompanies: { read: { rights: [...SFA_GA] }, add: { rights: [...SFA_GA] }, edit: { rights: [...SFA_GA] }, delete: { rights: [...SFA_GA] } },
  SettingsFamilies: {
    read: { rights: [...ADMIN_OR_ADVANCED] },
    add: { rights: [...ADMIN_AUTHORITIES] },
    edit: { rights: [...ADMIN_AUTHORITIES] },
    delete: { rights: [...ADMIN_AUTHORITIES] },
    archive: { rights: [...ADMIN_AUTHORITIES] },
  },
  DefaultCategories: {
    read: { rights: [...ADMIN_AUTHORITIES] }, add: { rights: [...ADMIN_AUTHORITIES] },
    edit: { rights: [...ADMIN_AUTHORITIES] }, delete: { rights: [...ADMIN_AUTHORITIES] },
  },
  CustomStatus: {
    read: { rights: [...ADMIN_AUTHORITIES] }, add: { rights: [...ADMIN_AUTHORITIES] },
    edit: { rights: [...ADMIN_AUTHORITIES] }, delete: { rights: [...ADMIN_AUTHORITIES] },
  },
  SettingsReferences: {
    read: { rights: [...ADMIN_AUTHORITIES] }, add: { rights: [...ADMIN_AUTHORITIES] },
    edit: { rights: [...ADMIN_AUTHORITIES] }, delete: { rights: [...ADMIN_AUTHORITIES] },
  },
  SettingsCustomField: {
    read: { rights: [...ADMIN_AUTHORITIES] }, add: { rights: [...ADMIN_AUTHORITIES] },
    edit: { rights: [...ADMIN_AUTHORITIES] }, delete: { rights: [...ADMIN_AUTHORITIES] },
  },
  SettingsCustomFile: { read: { rights: [...ADMIN_OR_ADVANCED] }, delete: { rights: [...ADMIN_AUTHORITIES] } },
  SettingsCustomCell: { read: { rights: [...ADMIN_OR_ADVANCED] }, delete: { rights: [...ADMIN_AUTHORITIES] } },
  SettingsSections: { read: { rights: [...ADMIN_OR_ADVANCED] }, edit: { rights: [...ADMIN_OR_ADVANCED] }, delete: { rights: [...ADMIN_AUTHORITIES] } },
  SettingsTrash: { read: { rights: [...ADMIN_OR_ADVANCED] }, restore: { rights: [...ADMIN_OR_ADVANCED] } },
  SettingsBackgroundTasks: { read: { rights: [...SFA_GA] } },
  SettingsGeneralAccount: { read: { rights: [...SFA] } },
  SettingsGeneralOrganization: { read: { rights: [...SFA] }, edit: { rights: [...SFA] } },
  SettingsTrams: { read: { rights: [...SFA] }, edit: { rights: [...SFA] }, delete: { rights: [...SFA] } },
  SettingsWordingConfiguration: { read: { rights: [...SFA] }, edit: { rights: [...SFA] }, delete: { rights: [...SFA] } },
  SettingsBackups: { read: { rights: [...SFA] } },
  SettingsLogsPush: { read: { rights: [...SFA] } },
  SettingsKpis: { read: { rights: [...SFA] } },

  Profile: { read: {} },
};
