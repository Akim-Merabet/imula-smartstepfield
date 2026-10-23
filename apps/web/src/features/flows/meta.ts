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

export const SIGNATURE_NATURES: SignatureNature[] = [
  "realisation", "tech_control",
  "breakpoint_int_1", "breakpoint_int_2", "breakpoint_int_3",
  "convocation_int_1", "convocation_int_2", "convocation_int_3",
  "breakpoint_ext_1", "breakpoint_ext_2", "breakpoint_ext_3",
  "convocation_ext_1", "convocation_ext_2", "convocation_ext_3",
];

/** Trigramme de nature (R / CT / PA / PC). */
export function natureCode(n: SignatureNature): "R" | "CT" | "PA" | "PC" {
  if (n === "realisation") return "R";
  if (n === "tech_control") return "CT";
  return n.startsWith("breakpoint") ? "PA" : "PC";
}

/** Colonne du tableau récapitulatif (§6.4). */
export function natureGroup(n: SignatureNature): "execution" | "supervision" {
  return n === "realisation" || n === "tech_control" ? "execution" : "supervision";
}

export type SupervisionFlow = Pick<Tables<"flows">,
  | "simplified_signature_mode"
  | "supervision_intern_1" | "supervision_intern_2" | "supervision_intern_3"
  | "supervision_extern_1" | "supervision_extern_2" | "supervision_extern_3"
  | "internal_supervisor_name_1" | "internal_supervisor_name_2" | "internal_supervisor_name_3"
  | "external_supervisor_name_1" | "external_supervisor_name_2" | "external_supervisor_name_3">;

export type DsiConfig = Tables<"block_dsi_configs">;

/** Surveillants applicables : index 1..3 ; sans surveillant défini → mode « mono » (index 1 seul). */
export function applicableSupervisors(flow: SupervisionFlow, kind: "int" | "ext"): { n: 1 | 2 | 3; name: string | null; mono: boolean }[] {
  const flags = kind === "int"
    ? [flow.supervision_intern_1, flow.supervision_intern_2, flow.supervision_intern_3]
    : [flow.supervision_extern_1, flow.supervision_extern_2, flow.supervision_extern_3];
  const names = kind === "int"
    ? [flow.internal_supervisor_name_1, flow.internal_supervisor_name_2, flow.internal_supervisor_name_3]
    : [flow.external_supervisor_name_1, flow.external_supervisor_name_2, flow.external_supervisor_name_3];
  if (!flags.some(Boolean)) return [{ n: 1, name: null, mono: true }];
  return ([1, 2, 3] as const).filter((n) => flags[n - 1]).map((n) => ({ n, name: names[n - 1], mono: false }));
}

/** Natures de signature attendues pour un bloc Contrôle (miroir de private.dsi_expected_natures). */
export function expectedNatures(config: DsiConfig | null | undefined, flow: SupervisionFlow): SignatureNature[] {
  if (!config || config.signatories_status === "disabled") return [];
  const out: SignatureNature[] = ["realisation"];
  if (config.technical_control) out.push("tech_control");
  if (flow.simplified_signature_mode) return out;
  const c = config as unknown as Record<string, boolean>;
  for (const kind of ["int", "ext"] as const) {
    for (const { n } of applicableSupervisors(flow, kind)) {
      if (c[`breakpoint_${kind}_${n}`]) out.push(`breakpoint_${kind}_${n}` as SignatureNature);
      if (c[`convocation_${kind}_${n}`]) out.push(`convocation_${kind}_${n}` as SignatureNature);
    }
  }
  return out;
}

export function supervisorName(n: SignatureNature, flow: SupervisionFlow): string | null {
  const m = /^(breakpoint|convocation)_(int|ext)_(\d)$/.exec(n);
  if (!m) return null;
  const key = `${m[2] === "int" ? "internal" : "external"}_supervisor_name_${m[3]}` as keyof SupervisionFlow;
  return (flow[key] as string | null) ?? null;
}

/** Numéro affiché : numéro personnalisé, sinon préfixe + rang (hors éléments exclus de la numérotation). */
export function numberItems<T extends { id: string; custom_number: string | null; exclude_numbering: boolean }>(
  items: T[], prefix: string,
): Map<string, string> {
  const out = new Map<string, string>();
  let n = 0;
  for (const it of items) {
    if (!it.exclude_numbering) n += 1;
    out.set(it.id, it.custom_number?.trim() || (it.exclude_numbering ? "—" : `${prefix}${n}`));
  }
  return out;
}

/** Champs d'affectation pour la réorganisation en masse (§2.7). */
export const REORGANIZE_FIELDS = [
  "category", "status", "reporter", "assignee", "tablet1", "tablet2", "tablet3",
  "plannedStart", "plannedEnd", "estimatedStart", "estimatedEnd", "achievedStart", "achievedEnd",
] as const;
export type ReorganizeField = (typeof REORGANIZE_FIELDS)[number];

export const FLOWS_PAGE_SIZE = 100;
export const MULTI_PR_MAX_ITEMS = 50;
