// Formes minimales des lignes manipulées : compatibles avec les types Supabase (WebApp) et les lignes
// SQLite de l'app mobile, où les booléens arrivent en 0/1 et les colonnes absentes en null.

export type Bool = boolean | number | null | undefined;

/** Vrai pour true / 1 ; faux pour false / 0 / null. */
export const on = (b: Bool): boolean => b === true || b === 1;

export type FlowType =
  | "specific" | "generic" | "group" | "flow_form" | "template"
  | "referential" | "referential_generic" | "group_referential" | "referential_intervention" | "local_referential";

export type BlockType = "pr" | "emm" | "adr" | "dsi" | "form" | "txt" | "rhp" | "multi_pr" | "object";
export type SequencingType = "linear" | "parallel";
export type SignatureState = "signed" | "waiting" | "free" | "not_possible";

export type SignatureNature =
  | "realisation" | "tech_control"
  | "breakpoint_int_1" | "breakpoint_int_2" | "breakpoint_int_3"
  | "convocation_int_1" | "convocation_int_2" | "convocation_int_3"
  | "breakpoint_ext_1" | "breakpoint_ext_2" | "breakpoint_ext_3"
  | "convocation_ext_1" | "convocation_ext_2" | "convocation_ext_3";

export type SupervisionFlow = {
  simplified_signature_mode: Bool;
  supervision_intern_1: Bool; supervision_intern_2: Bool; supervision_intern_3: Bool;
  supervision_extern_1: Bool; supervision_extern_2: Bool; supervision_extern_3: Bool;
  internal_supervisor_name_1: string | null; internal_supervisor_name_2: string | null; internal_supervisor_name_3: string | null;
  external_supervisor_name_1: string | null; external_supervisor_name_2: string | null; external_supervisor_name_3: string | null;
};

export type DsiConfig = {
  block_id: string;
  signatories_status: "enabled" | "disabled" | "required" | "optional" | string | null;
  technical_control: Bool;
  breakpoint_int_1: Bool; breakpoint_int_2: Bool; breakpoint_int_3: Bool;
  convocation_int_1: Bool; convocation_int_2: Bool; convocation_int_3: Bool;
  breakpoint_ext_1: Bool; breakpoint_ext_2: Bool; breakpoint_ext_3: Bool;
  convocation_ext_1: Bool; convocation_ext_2: Bool; convocation_ext_3: Bool;
};

export type PhaseRow = {
  id: string; position: number; sequence_id: string | null; sequence_type: SequencingType | string | null;
  mandatory: Bool; disabled: Bool; read_only_on_mobile_app?: Bool;
  custom_number: string | null; exclude_numbering: Bool;
};

export type StepRow = {
  id: string; phase_id: string; position: number; disabled: Bool; read_only_on_mobile_app?: Bool;
  custom_number: string | null; exclude_numbering: Bool;
  validated_at?: string | null; first_opened_at?: string | null;
};

export type SequenceRow = { id: string; position: number; type: SequencingType | string | null };

export type BlockRow = {
  id: string; step_id: string; type: BlockType | string; enabled: Bool;
  txt_visibility?: string | null;
  multi_pr_requires_status?: Bool; multi_pr_requires_signature?: Bool;
};
