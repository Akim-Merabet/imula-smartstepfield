import type { z } from "zod";
import type { ServiceClass } from "../meta";
import { authenticateSchema } from "./authenticate";
import { addPhasesSchema, addStepsSchema, PHASE_EMBEDS } from "./resources/content";
import { DOCUMENT_EMBEDS } from "./resources/documents";
import {
  attributesBulkUpdateSchema, FLOW_EMBEDS, flowBulkCreateSchema, flowBulkUpdateSchema, flowCreateSchema, flowPatchSchema, flowPutSchema,
} from "./resources/flows";
import { FORM_EMBEDS, RESPONSE_EMBEDS } from "./resources/forms";
import { PROJECT_EMBEDS, projectCreateSchema } from "./resources/projects";

/**
 * Catalogue des endpoints de l'API v2 : source unique de la documentation OpenAPI 3.1 et de la page de documentation.
 *
 * Classes de service (« API-key-Scope », L1 ⊂ L2 ⊂ L3) — choix de cette reconstruction :
 *  - L1 (Base) : toutes les lectures (GET) ;
 *  - L2 (Avancé) : créations / modifications unitaires et exports (réponse JSON, URL signée du PDF) ;
 *  - L3 (Expert) : opérations en masse (bulk create / update, mise à jour d'attributs en masse).
 */
export type ParamDef = { name: string; in: "query" | "path"; type: "string" | "uuid" | "integer" | "boolean" | "datetime" | "enum"; required?: boolean; enum?: readonly string[]; description: string };
export type Endpoint = {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  tag: string;
  level: ServiceClass | null;
  summary: { fr: string; en: string };
  params?: ParamDef[];
  embed?: readonly string[];
  body?: z.ZodType;
  paginated?: boolean;
  /** Paramètre accountId requis pour une clé organisation (défaut : true). */
  accountScoped?: boolean;
  created?: boolean;
};

const uuid = (name: string, description: string, required = false): ParamDef => ({ name, in: "query", type: "uuid", required, description });
const path = (name: string, description: string): ParamDef => ({ name, in: "path", type: "uuid", required: true, description });
const text = (name: string, description: string): ParamDef => ({ name, in: "query", type: "string", description });
const bool = (name: string, description: string): ParamDef => ({ name, in: "query", type: "boolean", description });
const enumP = (name: string, values: readonly string[], description: string): ParamDef => ({ name, in: "query", type: "enum", enum: values, description });

export const ENDPOINTS: Endpoint[] = [
  { id: "authenticate", method: "POST", path: "/authenticate", tag: "Authentication", level: null, accountScoped: false, body: authenticateSchema,
    summary: { fr: "Obtenir un jeton d'accès (24 h) à partir de l'identifiant et du secret client", en: "Get a 24 h access token from client identifier and secret" } },

  { id: "applicabilities", method: "GET", path: "/label-applicabilities", tag: "Organization", level: "L1", accountScoped: false, paginated: true,
    params: [text("name", "Account name contains")],
    summary: { fr: "Rechercher les comptes (applicabilités) de l'organisation", en: "List the accounts (applicabilities) of the organization" } },
  { id: "applicabilities-post", method: "POST", path: "/label-applicabilities", tag: "Organization", level: "L1", accountScoped: false, paginated: true,
    summary: { fr: "Rechercher les comptes (variante POST compatible v1.5)", en: "List accounts (POST variant, v1.5 compatible)" } },

  { id: "projects-list", method: "GET", path: "/projects", tag: "Projects", level: "L1", paginated: true, embed: PROJECT_EMBEDS,
    params: [text("name", "Name contains"), enumP("type", ["PROJECT", "REFERENTIAL", "TEMPLATE", "PGAC", "FOLDER"], "Entity type(s), comma separated"),
      uuid("statusId", "Status identifier"), uuid("clientId", "Client identifier"), uuid("labelFamilyId", "Family identifier"),
      bool("deletedOnly", "Only deleted entities")],
    summary: { fr: "Rechercher des entités", en: "Search entities" } },
  { id: "projects-create", method: "POST", path: "/projects", tag: "Projects", level: "L2", body: projectCreateSchema, created: true,
    summary: { fr: "Créer une entité", en: "Create an entity" } },
  { id: "projects-get", method: "GET", path: "/projects/{projectId}", tag: "Projects", level: "L1", embed: PROJECT_EMBEDS,
    params: [path("projectId", "Entity uuidEntity"), bool("isDeleted", "Target a deleted entity")],
    summary: { fr: "Rechercher une entité par son uuidEntity", en: "Get an entity by uuidEntity" } },

  { id: "flows-list", method: "GET", path: "/flows", tag: "Flows", level: "L1", paginated: true, embed: FLOW_EMBEDS,
    params: [text("name", "Name contains"), uuid("projectId", "Entity identifier"), text("statusId", "Status identifier(s), comma separated"),
      enumP("type", ["SPECIFIC", "GENERIC", "GROUP", "FLOW_FORM", "TEMPLATE", "REFERENTIAL", "REFERENTIAL_GENERIC", "GROUP_REFERENTIAL", "REFERENTIAL_INTERVENTION", "LOCAL_REFERENTIAL"], "Flow type(s)"),
      text("refInt", "Chrono number (exact)"), text("refExt", "External reference (exact)"), uuid("labelFamilyId", "Family identifier"),
      bool("deletedOnly", "Only deleted flows")],
    summary: { fr: "Rechercher des flows (nom, entité, statut, type, n° chrono)", en: "Search flows (name, entity, status, type, chrono number)" } },
  { id: "flows-create", method: "POST", path: "/flows", tag: "Flows", level: "L2", body: flowCreateSchema, created: true,
    summary: { fr: "Créer un flow", en: "Create a flow" } },
  { id: "flows-bulk-create", method: "POST", path: "/flows/bulk/create", tag: "Flows", level: "L3", body: flowBulkCreateSchema, created: true,
    summary: { fr: "Créer des flows en masse (≤ 100, tout ou rien)", en: "Bulk create flows (≤ 100, all or nothing)" } },
  { id: "flows-bulk-update", method: "PATCH", path: "/flows/bulk/update", tag: "Flows", level: "L3", body: flowBulkUpdateSchema,
    summary: { fr: "Éditer des flows en masse (hors attributs)", en: "Bulk update flows (except attributes)" } },
  { id: "flows-attributes-bulk", method: "PATCH", path: "/flows/custom-attributes/bulk-update", tag: "Flows", level: "L3", body: attributesBulkUpdateSchema,
    summary: { fr: "Éditer des attributs de flows en masse", en: "Bulk update flow custom attributes" } },
  { id: "flows-get", method: "GET", path: "/flows/{flowId}", tag: "Flows", level: "L1", embed: FLOW_EMBEDS,
    params: [path("flowId", "Flow uuidEntity"), bool("isDeleted", "Target a deleted flow")],
    summary: { fr: "Rechercher un flow par son uuidEntity", en: "Get a flow by uuidEntity" } },
  { id: "flows-put", method: "PUT", path: "/flows/{flowId}", tag: "Flows", level: "L2", body: flowPutSchema, params: [path("flowId", "Flow uuidEntity")],
    summary: { fr: "Éditer un flow (remplacement des propriétés)", en: "Update a flow (replace properties)" } },
  { id: "flows-patch", method: "PATCH", path: "/flows/{flowId}", tag: "Flows", level: "L2", body: flowPatchSchema, params: [path("flowId", "Flow uuidEntity")],
    summary: { fr: "Éditer partiellement un flow", en: "Partially update a flow" } },
  { id: "flows-history", method: "GET", path: "/flows/{flowId}/history-status-changes", tag: "Flows", level: "L1", paginated: true,
    params: [path("flowId", "Flow uuidEntity")],
    summary: { fr: "Historique des changements de statut d'un flow", en: "Status change history of a flow" } },

  { id: "phases-list", method: "GET", path: "/flows/{flowId}/phases", tag: "Phases & steps", level: "L1", paginated: true, embed: PHASE_EMBEDS,
    params: [path("flowId", "Flow uuidEntity")],
    summary: { fr: "Rechercher les phases (et optionnellement les étapes) d'un flow", en: "List the phases (and optionally steps) of a flow" } },
  { id: "phases-add", method: "POST", path: "/flows/{flowId}/add-phases", tag: "Phases & steps", level: "L2", body: addPhasesSchema, created: true,
    params: [path("flowId", "Flow uuidEntity")],
    summary: { fr: "Créer des phases dans un flow", en: "Create phases in a flow" } },
  { id: "steps-list", method: "GET", path: "/flows/{flowId}/phases/{phaseId}/steps", tag: "Phases & steps", level: "L1", paginated: true,
    params: [path("flowId", "Flow uuidEntity"), path("phaseId", "Phase uuidEntity")],
    summary: { fr: "Rechercher les étapes d'une phase", en: "List the steps of a phase" } },
  { id: "steps-add", method: "POST", path: "/flows/{flowId}/phases/{phaseId}/add-steps", tag: "Phases & steps", level: "L2", body: addStepsSchema, created: true,
    params: [path("flowId", "Flow uuidEntity"), path("phaseId", "Phase uuidEntity")],
    summary: { fr: "Créer des étapes dans une phase", en: "Create steps in a phase" } },

  { id: "forms-list", method: "GET", path: "/forms", tag: "Forms", level: "L1", paginated: true, embed: FORM_EMBEDS,
    params: [text("name", "Name contains"), enumP("nature", ["MODEL", "GENERIC", "OTHER", "LOCAL", "ARCHIVED"], "Nature(s)"),
      enumP("location", ["LIBRARY", "PROJECT"], "Library or entity forms"), uuid("projectId", "Entity identifier"), uuid("statusId", "Status identifier"),
      bool("deletedOnly", "Only deleted forms")],
    summary: { fr: "Rechercher des formulaires (statut, nature, nom…)", en: "Search forms (status, nature, name…)" } },
  { id: "forms-get", method: "GET", path: "/forms/{formId}", tag: "Forms", level: "L1", embed: FORM_EMBEDS,
    params: [path("formId", "Form uuidEntity"), bool("isDeleted", "Target a deleted form")],
    summary: { fr: "Rechercher un formulaire par son uuidEntity", en: "Get a form by uuidEntity" } },
  { id: "responses-list", method: "GET", path: "/form-responses", tag: "Forms", level: "L1", paginated: true, embed: RESPONSE_EMBEDS,
    params: [uuid("projectId", "Entity identifier"), uuid("formId", "Form identifier"), uuid("uuidType", "Original form (lineage) identifier"),
      uuid("flowId", "Flow identifier"), enumP("state", ["IN_PROGRESS", "DONE"], "Response state"), uuid("statusId", "Status identifier"),
      text("reference", "Response reference contains"), bool("isDeleted", "Only deleted responses")],
    summary: { fr: "Rechercher des réponses de formulaire", en: "Search form responses" } },
  { id: "responses-get", method: "GET", path: "/form-responses/{responseId}", tag: "Forms", level: "L1", embed: RESPONSE_EMBEDS,
    params: [path("responseId", "Response uuidEntity"), bool("isDeleted", "Target a deleted response")],
    summary: { fr: "Propriétés d'une réponse de formulaire", en: "Properties of a form response" } },
  { id: "responses-export", method: "GET", path: "/form-responses/{responseId}/export", tag: "Forms", level: "L2",
    params: [path("responseId", "Response uuidEntity")],
    summary: { fr: "Exporter une réponse en JSON (values / objectValue selon valueType, identifiants RxQyOz)", en: "Export a response as JSON (values / objectValue by valueType, RxQyOz identifiers)" } },

  { id: "label-families", method: "GET", path: "/label-families", tag: "Dictionaries", level: "L1", paginated: true, embed: ["MANAGEMENT_PROPERTIES"],
    params: [text("nature", "Nature(s), e.g. FLOW,PROJECT"), enumP("kind", ["FAMILY", "CATEGORY"], "Family or category"),
      enumP("relativeNature", ["PARENT", "CHILD"], "Parent or child"), uuid("parentId", "Parent identifier"), bool("includeInactive", "Include archived items")],
    summary: { fr: "Rechercher des familles", en: "Search label families" } },
  { id: "statuses", method: "GET", path: "/dictionary/statuses", tag: "Dictionaries", level: "L1", paginated: true,
    params: [enumP("nature", ["PROJECT", "FLOW", "FORM", "FORM_RESPONSE", "TECHNICAL_OBJECT", "MULTI_PR"], "Nature(s)")],
    summary: { fr: "Rechercher les statuts", en: "Search statuses" } },
  { id: "custom-attributes", method: "GET", path: "/dictionary/custom-attributes", tag: "Dictionaries", level: "L1", paginated: true,
    params: [enumP("nature", ["PROJECT", "FLOW", "PHASE", "STEP", "DOCUMENT", "TECHNICAL_OBJECT"], "Nature(s)")],
    summary: { fr: "Rechercher des attributs personnalisés", en: "Search custom attributes" } },
  { id: "clients", method: "GET", path: "/clients", tag: "Dictionaries", level: "L1", paginated: true,
    params: [text("name", "Name contains"), text("reference", "Reference (exact)")],
    summary: { fr: "Rechercher un client dans le carnet clients", en: "Search the client book" } },
  { id: "users", method: "GET", path: "/users", tag: "Users", level: "L1", paginated: true,
    params: [enumP("type", ["USER", "OPERATOR", "DEVICE"], "Type(s)"), text("status", "Status, e.g. ACTIVE"), text("email", "Email (exact, case insensitive)"), text("name", "Name contains")],
    summary: { fr: "Rechercher des utilisateurs, opérateurs et profils tablettes", en: "Search users, operators and tablet profiles" } },

  { id: "documents-list", method: "GET", path: "/document-flows", tag: "Documents", level: "L1", paginated: true, embed: DOCUMENT_EMBEDS,
    params: [uuid("projectId", "Entity identifier"), uuid("flowId", "Linked flow"), text("name", "Name contains"), text("refInt", "Internal reference"),
      text("refExt", "External reference"), text("nature", "Nature(s)"), enumP("source", ["FLOW", "FORM", "MODULE", "EXTERN", "CLOSING_FOLDER"], "Source(s)"),
      enumP("scope", ["LIBRARY", "PROJECT"], "Library or entity documents"), bool("isDeleted", "Only deleted documents")],
    summary: { fr: "Rechercher des documents", en: "Search documents" } },
  { id: "documents-get", method: "GET", path: "/document-flows/{documentId}", tag: "Documents", level: "L1", embed: DOCUMENT_EMBEDS,
    params: [path("documentId", "Document uuidEntity")],
    summary: { fr: "Rechercher un document par son uuidEntity", en: "Get a document by uuidEntity" } },
  { id: "documents-versions", method: "GET", path: "/document-flows/{documentId}/versions", tag: "Documents", level: "L1", paginated: true,
    params: [path("documentId", "Document uuidEntity")],
    summary: { fr: "Versions (lignes du suivi) d'un document", en: "Versions (tracking rows) of a document" } },
  { id: "documents-last", method: "GET", path: "/document-flows/{documentId}/last-versions", tag: "Documents", level: "L1",
    params: [path("documentId", "Document uuidEntity")],
    summary: { fr: "Dernière version d'un document", en: "Last version of a document" } },
  { id: "documents-last-pdf", method: "GET", path: "/document-flows/{documentId}/last-versions-pdf", tag: "Documents", level: "L2",
    params: [path("documentId", "Document uuidEntity")],
    summary: { fr: "URL signée (10 min) du PDF de la dernière version", en: "Signed URL (10 min) of the last version PDF" } },

  { id: "kpi-projects", method: "GET", path: "/kpi/projects", tag: "KPI", level: "L1",
    summary: { fr: "Nombre d'entités par type", en: "Number of entities by type" } },
  { id: "kpi-flows", method: "GET", path: "/kpi/flows", tag: "KPI", level: "L1", params: [uuid("projectId", "Entity identifier")],
    summary: { fr: "Nombre de flows par type et catégorie de statut", en: "Number of flows by type and status category" } },
  { id: "kpi-users", method: "GET", path: "/kpi/users", tag: "KPI", level: "L1",
    summary: { fr: "Nombre d'utilisateurs, d'opérateurs et de tablettes", en: "Number of users, operators and tablets" } },
  { id: "kpi-tablets", method: "GET", path: "/kpi/tablets", tag: "KPI", level: "L1",
    summary: { fr: "Nombre de profils tablettes par statut", en: "Number of tablet profiles by status" } },
  { id: "kpi-progression-flows", method: "GET", path: "/kpi-progression/{projectId}/flows", tag: "KPI", level: "L1",
    params: [path("projectId", "Entity uuidEntity")],
    summary: { fr: "Pourcentage de réalisation des flows d'une entité", en: "Flow completion percentage of an entity" } },
];

export const COMMON_LIST_PARAMS: ParamDef[] = [
  { name: "limit", in: "query", type: "integer", description: "Max items (1..100, default 20)" },
  { name: "offset", in: "query", type: "integer", description: "Start index (default 0)" },
  { name: "createdAfterAt", in: "query", type: "datetime", description: "Items created after this ISO datetime" },
  { name: "modifiedAfterAt", in: "query", type: "datetime", description: "Items modified after this ISO datetime" },
];

export const ACCOUNT_PARAM: ParamDef = {
  name: "accountId", in: "query", type: "uuid",
  description: "Target account (required with an organization key, optional and must match with an account key). Header X-Account-Id also accepted.",
};
