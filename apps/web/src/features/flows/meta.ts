import type { Enums, Tables } from "@/lib/supabase/database.types";

export type FlowType = Enums<"flow_type">;
export type BlockType = Enums<"block_type">;
export type BlockState = Enums<"block_state">;
export type SignatureNature = Enums<"signature_nature">;
export type ProjectType = Enums<"project_type">;

/** Types de flow « métier » (spec 02 §2.1). */
export const FLOW_TYPES: FlowType[] = [
  "specific", "generic", "group", "flow_form", "template",
  "referential", "referential_generic", "group_referential", "referential_intervention", "local_referential",
];

/** R-TYPE-2 : types proposés à la création selon le type d'entité. */
export function creatableFlowTypes(projectType: ProjectType): FlowType[] {
  if (projectType === "template") return ["template"];
  if (projectType === "referential" || projectType === "folder") {
    return ["referential", "referential_generic", "group_referential", "referential_intervention"];
  }
  return ["specific", "generic", "group", "flow_form"];
}

/** Types utilisables pour un flow lié à une étape (générique ou flows liés d'un chapeau). */
export const LINKABLE_FLOW_TYPES: FlowType[] = ["generic", "specific", "flow_form", "referential_generic", "referential"];

export const BLOCK_TYPES: BlockType[] = ["pr", "emm", "adr", "dsi", "form", "txt", "rhp", "multi_pr", "object"];
export const BLOCK_STATES: BlockState[] = ["redaction", "verification", "approbation", "validated"];

export function nextBlockState(state: BlockState): BlockState | null {
  const i = BLOCK_STATES.indexOf(state);
  return i >= 0 && i < BLOCK_STATES.length - 1 ? BLOCK_STATES[i + 1] : null;
}

// Natures, surveillants et numérotation : logique partagée avec l'app terrain (@imula/flow-core).
export {
  applicableSupervisors, expectedNatures, natureCode, natureGroup, numberItems, SIGNATURE_NATURES, supervisorName,
} from "@imula/flow-core";

export type SupervisionFlow = Pick<Tables<"flows">,
  | "simplified_signature_mode"
  | "supervision_intern_1" | "supervision_intern_2" | "supervision_intern_3"
  | "supervision_extern_1" | "supervision_extern_2" | "supervision_extern_3"
  | "internal_supervisor_name_1" | "internal_supervisor_name_2" | "internal_supervisor_name_3"
  | "external_supervisor_name_1" | "external_supervisor_name_2" | "external_supervisor_name_3">;

export type DsiConfig = Tables<"block_dsi_configs">;

/** Champs d'affectation pour la réorganisation en masse (§2.7). */
export const REORGANIZE_FIELDS = [
  "category", "status", "reporter", "assignee", "tablet1", "tablet2", "tablet3",
  "plannedStart", "plannedEnd", "estimatedStart", "estimatedEnd", "achievedStart", "achievedEnd",
] as const;
export type ReorganizeField = (typeof REORGANIZE_FIELDS)[number];

export const FLOWS_PAGE_SIZE = 100;
export const MULTI_PR_MAX_ITEMS = 50;
