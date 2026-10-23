/**
 * Tables de capacités des formulaires (spec 03 §3) : natures, disponibilité par type de rubrique,
 * options applicables, opérateurs de validation, variables dynamiques. Partagé builder / réponse.
 */
import type { QuestionType, RubricType, Size, ValidationOp } from "./types";

export const QUESTION_TYPES: QuestionType[] = [
  "short_answer", "long_answer", "multiple_answers", "unique_choice", "multiple_choices", "single_choice_list",
  "multiple_choice_list", "date", "datetime", "duration", "value_unit", "photo", "collaborator", "location", "formula",
  "file", "text_editor",
];
export const RUBRIC_TYPES: RubricType[] = ["question", "table_column", "table_row"];

const set = (...t: QuestionType[]) => new Set<QuestionType>(t);

/** Natures non disponibles dans un tableau (WebApp). */
export const NOT_IN_TABLE = set("multiple_answers", "file", "text_editor");
export function questionTypesFor(rubricType: RubricType): QuestionType[] {
  return rubricType === "question" ? QUESTION_TYPES : QUESTION_TYPES.filter((t) => !NOT_IN_TABLE.has(t));
}
export const isTable = (t: RubricType) => t !== "question";

/** Natures composites (n options dans une rubrique question). */
export const MULTI_OPTION = set("multiple_answers", "unique_choice", "multiple_choices", "value_unit");
/** Natures dont le verrou porte sur toute la question. */
export const LOCK_WHOLE_QUESTION = set("multiple_answers", "multiple_choices", "value_unit");
/** Réponse possible uniquement depuis la WebApp. */
export const WEBAPP_ONLY = set("file", "text_editor");

export const CAN_MANDATORY = (t: QuestionType) => t !== "text_editor";
export const CAN_BACKDATING = set("date", "datetime");

export const OPT_NAME = set("unique_choice", "multiple_choices", "multiple_answers");
export const OPT_DESCRIPTION = set("multiple_answers", "unique_choice", "multiple_choices", "date", "datetime", "short_answer", "long_answer", "value_unit");
export const OPT_PLACEHOLDER = set("short_answer", "long_answer", "multiple_answers");
export const OPT_CHOICES = set("single_choice_list", "multiple_choice_list");
export const OPT_UNIT = set("value_unit", "formula");
export const OPT_VALUE_HINT = set("value_unit");
export const OPT_IMAGES = set("multiple_answers", "unique_choice", "multiple_choices");
export const OPT_FROZEN = set("short_answer", "long_answer", "multiple_answers", "unique_choice", "multiple_choices",
  "single_choice_list", "date", "datetime", "duration", "text_editor", "value_unit", "location", "formula");
export const OPT_PREFILL = set("short_answer", "long_answer", "multiple_answers", "multiple_choices", "date", "datetime",
  "duration", "value_unit", "location", "photo", "text_editor");
/** Pré-remplissage texte (variables `@@` insérées dans le texte). */
export const PREFILL_TEXT = set("short_answer", "long_answer", "multiple_answers");
/** Pré-remplissage par variable unique (case « Pré-remplir avec une variable dynamique »). */
export const PREFILL_VARIABLE = set("date", "datetime", "location", "value_unit", "photo");
export const OPT_VALIDATION = set("date", "datetime", "value_unit", "formula");
export const OPT_ALERT = new Set<QuestionType>(QUESTION_TYPES.filter((t) => !["photo", "collaborator", "file", "text_editor"].includes(t)));
export const OPT_REDIRECT = set("short_answer", "long_answer", "multiple_answers", "unique_choice", "multiple_choices",
  "single_choice_list", "multiple_choice_list", "date", "datetime", "duration", "value_unit", "location", "formula");
export const OPT_EXPORT_KEY = set("short_answer", "long_answer", "multiple_answers", "unique_choice", "multiple_choices",
  "date", "datetime", "duration", "value_unit");
export const OPT_PDF_XLS = new Set<QuestionType>(QUESTION_TYPES.filter((t) => t !== "file" && t !== "text_editor"));
export const OPT_PHOTO_SIZE = set("photo");

export function canFreeze(type: QuestionType, rubricType: RubricType) {
  return rubricType === "table_column" || OPT_FROZEN.has(type);
}

/** Paramétrage en masse (spec 03 §3.3.3). */
export function canGenericParams(type: QuestionType, rubricType: RubricType) {
  if (rubricType === "question") return ["multiple_answers", "unique_choice", "multiple_choices", "value_unit", "collaborator"].includes(type);
  return !["file", "text_editor", "multiple_answers"].includes(type);
}

export const NUMBER_OPS: ValidationOp[] = ["gt", "gte", "lt", "lte", "eq", "neq", "between", "not_between"];
export const DATE_OPS: ValidationOp[] = ["eq", "neq", "before", "after", "between_dates", "not_between_dates"];
export const validationOpsFor = (t: QuestionType) => (t === "date" || t === "datetime" ? DATE_OPS : NUMBER_OPS);
export const TWO_BOUNDS = new Set<ValidationOp>(["between", "not_between", "between_dates", "not_between_dates"]);

export const SIZES: Size[] = ["xs", "s", "m", "l", "xl"];
export const SIZE_PX: Record<Size, number> = { xs: 60, s: 90, m: 180, l: 360, xl: 490 };

export const QUESTION_ICONS = ["question", "clock", "exclamation_triangle", "wrench", "flag", "info_circle", "bell", "key",
  "hand_paper", "lightbulb", "calendar", "eye"] as const;
export type QuestionIcon = (typeof QUESTION_ICONS)[number];

/** Palette de style de question (U16) : 8 couleurs sémantiques + « sans couleur ». */
export const QUESTION_COLORS = [
  { id: "alert1", hex: "#FBE4E4" }, { id: "alert2", hex: "#F3B9B9" },
  { id: "warning1", hex: "#FDF0E1" }, { id: "warning2", hex: "#F8D3A8" },
  { id: "success1", hex: "#E3F4E5" }, { id: "success2", hex: "#B5E0BA" },
  { id: "highlight1", hex: "#E3EDF7" }, { id: "highlight2", hex: "#B9D2EA" },
] as const;

export type ValueType =
  | "string" | "text" | "boolean" | "string_list" | "date" | "datetime" | "duration" | "number" | "value_and_unit"
  | "coordinates" | "file_list" | "rich_text" | "signature";

/** Type de valeur stockée par nature (spec 03 §4). */
export const VALUE_TYPE: Record<QuestionType, ValueType> = {
  short_answer: "string", long_answer: "text", multiple_answers: "string", unique_choice: "boolean",
  multiple_choices: "boolean", single_choice_list: "string", multiple_choice_list: "string_list", date: "date",
  datetime: "datetime", duration: "duration", value_unit: "value_and_unit", photo: "file_list", collaborator: "signature",
  location: "coordinates", formula: "number", file: "file_list", text_editor: "rich_text",
};

export const FORM_NATURES = ["model", "generic", "other", "local", "archived"] as const;
export const CREATABLE_NATURES = ["model", "generic"] as const;

/** Variables dynamiques (spec 03 §3.5.1) — onglets Projet / Flow / Formulaire ; Attribut = attributs personnalisés. */
export const DYNAMIC_VARIABLES = {
  project: [
    "ProjectDesignation", "ProjectNoCase", "ProjectNoContract", "ProjectClientName1", "ProjectClientName2", "ProjectClientName3",
    "ProjectLocation", "ProjectDescription", "ProjectSupervision1", "ProjectSupervision2", "ProjectSupervision3",
    "ProjectInternalSupervision1", "ProjectInternalSupervision2", "ProjectInternalSupervision3", "ProjectInternalOrder",
    "ProjectExternalOrder", "ProjectNoMarket", "ProjectTechnicalCase", "ProjectKeywords", "ProjectBusinessField",
    "ProjectNationalProgram", "ProjectFamily",
  ],
  flow: [
    "FlowName", "FlowDescription", "FlowFamily", "FlowCategory", "FlowStatus", "FlowSite", "FlowUnit", "FlowLocal",
    "FlowElementarySystem", "FlowFunctionalLandmark", "FlowTechnicalObject", "FlowChrono", "FlowEpsilonFolderRef",
    "FlowRapporteur", "FlowResponsable", "FlowTablette1", "FlowTablette2", "FlowTablette3", "FlowDateDebut", "FlowDateFin",
    "FlowGeometryCoordinateLat", "FlowGeometryCoordinateLng", "FlowGeometryCoordinateAlt",
    "FlowInternalSupervision1", "FlowInternalSupervision2", "FlowInternalSupervision3",
    "FlowExternalSupervision1", "FlowExternalSupervision2", "FlowExternalSupervision3",
    "CurrPhaseNumber", "CurrPhaseName", "CurrPhaseDescription", "CurrStepNumber", "CurrStepName", "CurrStepDescription",
    "AdditionalStatementPhase", "AdditionalStatementStep",
  ],
  form: [
    "refResponse", "currentCollaborator", "externalCollaboratorLastName", "externalCollaboratorFirstName",
    "externalCollaboratorCompany", "externalCollaboratorJob", "AdditionalStatementForm",
  ],
} as const;
export type DynamicVariableTab = keyof typeof DYNAMIC_VARIABLES | "attribute";
export const ALL_STATIC_VARIABLES: string[] = [...DYNAMIC_VARIABLES.project, ...DYNAMIC_VARIABLES.flow, ...DYNAMIC_VARIABLES.form];

/** Caractères spéciaux du menu contextuel (spec 03 §3.5.7). */
export const SPECIAL_CHARACTERS = ["α", "β", "γ", "π", "ρ", "µ", "⌀", "Ω", "Σ", "Δ", "∑", "×", "÷", "±", "≠", "²", "³", "¼", "½", "¾",
  "≥", "≤", "←", "→", "↑", "↓", "↔", "↕"];

/** Lettre de type (chip M/G/O/L/A). */
export const NATURE_LETTER: Record<string, string> = { model: "M", generic: "G", other: "O", local: "L", archived: "A" };

export const IMPORT_LIMIT = 10;
export const FORM_FILES_BUCKET = "form-files";
export const MAX_PDF_BYTES = 40 * 1024 * 1024;

/** Coordonnée positionnelle d'une option. */
export const coord = (r: number, q: number, o: number) => `R${r}Q${q}O${o}`;
