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
  },
  DashboardForms: {
    read: {},
    add: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    share: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
  },
  DashboardFieldFeedback: {
    read: {},
    edit: { rights: [...ADMIN_AUTHORITIES], roles: [...REWO] },
    delete: { rights: [...ADMIN_AUTHORITIES], roles: [...RE] },
    export: { rights: [...ADMIN_AUTHORITIES], roles: [...REW] },
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
  DashboardInformation: { read: {}, edit: { rights: [...ADMIN_AUTHORITIES], roles: [...R] } },
  DashboardMetrics: { read: {} },
  DashboardSignatureList: { read: {} },

  // Bibliothèque
  Library: { read: { rights: [...ALL_USERS] } },
  LibraryForms: {
    read: { rights: [...ALL_USERS] },
    add: { rights: [...ADMIN_OR_ADVANCED] },
    edit: { rights: [...ADMIN_OR_ADVANCED] },
    delete: { rights: [...ADMIN_AUTHORITIES] },
    duplicate: { rights: [...ADMIN_OR_ADVANCED] },
    archive: { rights: [...ADMIN_AUTHORITIES] },
    export: { rights: [...ADMIN_OR_ADVANCED] },
  },
  LibraryRisks: { read: { rights: [...ADMIN_OR_ADVANCED, "normal"] }, edit: { rights: [...ADMIN_OR_ADVANCED] } },
  LibraryEquipments: { read: { rights: [...ADMIN_OR_ADVANCED, "normal"] }, edit: { rights: [...ADMIN_OR_ADVANCED] } },
  LibraryTags: { read: { rights: [...ADMIN_OR_ADVANCED, "normal"] }, edit: { rights: [...ADMIN_OR_ADVANCED] } },
  LibraryObjectManagement: { read: { rights: [...ADMIN_OR_ADVANCED, "normal"] }, edit: { rights: [...ADMIN_OR_ADVANCED] } },

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
  ContributorExternalUsers: { read: { rights: [...SFA] } },
  ContributorTablets: {
    read: { rights: [...ADMIN_OR_ADVANCED, "normal"] },
    edit: { rights: [...ADMIN_OR_ADVANCED] },
    delete: { rights: [...ADMIN_AUTHORITIES] },
  },
  ContributorAuthorizedDevices: { read: { rights: [...ADMIN_OR_ADVANCED] }, edit: { rights: [...ADMIN_OR_ADVANCED] } },
  MoveApplicability: { read: { rights: [...SFA_GA] } },

  // Paramètres
  Settings: { read: { rights: [...ADMIN_OR_ADVANCED] } },
  SettingsAccount: { read: { rights: [...ADMIN_OR_ADVANCED] }, edit: { rights: [...ADMIN_AUTHORITIES] } },
  SettingsClientBook: {
    read: { rights: [...ADMIN_OR_ADVANCED] },
    edit: { rights: [...ADMIN_OR_ADVANCED] },
    delete: { rights: [...ADMIN_AUTHORITIES] },
  },
  SettingsCompanies: { read: { rights: [...SFA_GA] }, edit: { rights: [...SFA_GA] } },
  SettingsFamilies: { read: { rights: [...ADMIN_OR_ADVANCED] }, edit: { rights: [...ADMIN_AUTHORITIES] }, delete: { rights: [...ADMIN_AUTHORITIES] } },
  DefaultCategories: { read: { rights: [...ADMIN_AUTHORITIES] }, edit: { rights: [...ADMIN_AUTHORITIES] } },
  CustomStatus: { read: { rights: [...ADMIN_AUTHORITIES] }, edit: { rights: [...ADMIN_AUTHORITIES] } },
  SettingsReferences: { read: { rights: [...ADMIN_AUTHORITIES] }, edit: { rights: [...ADMIN_AUTHORITIES] } },
  SettingsCustomField: { read: { rights: [...ADMIN_AUTHORITIES] }, edit: { rights: [...ADMIN_AUTHORITIES] } },
  SettingsSections: { read: { rights: [...ADMIN_OR_ADVANCED] }, edit: { rights: [...ADMIN_OR_ADVANCED] } },
  SettingsTrash: { read: { rights: [...ADMIN_OR_ADVANCED] }, restore: { rights: [...ADMIN_OR_ADVANCED] } },
  SettingsBackgroundTasks: { read: { rights: [...SFA_GA] } },
  SettingsGeneralAccount: { read: { rights: [...SFA] } },
  SettingsGeneralOrganization: { read: { rights: [...SFA] } },
  SettingsWordingConfiguration: { read: { rights: [...SFA] } },
  SettingsKpis: { read: { rights: [...SFA] } },

  Profile: { read: {} },
};
