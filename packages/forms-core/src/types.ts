/**
 * Modèle TypeScript des formulaires et réponses (spec 03 §11).
 * `FormDefinition` = contenu de `form_versions.structure` (snapshot immuable).
 */
export type QuestionType =
  | "short_answer" | "long_answer" | "multiple_answers" | "unique_choice" | "multiple_choices"
  | "single_choice_list" | "multiple_choice_list" | "date" | "datetime" | "duration" | "value_unit"
  | "photo" | "collaborator" | "location" | "formula" | "file" | "text_editor";
export type RubricType = "question" | "table_row" | "table_column";
export type Size = "xs" | "s" | "m" | "l" | "xl";
export type ValidationOp =
  | "gt" | "gte" | "lt" | "lte" | "eq" | "neq" | "between" | "not_between" | "before" | "after" | "between_dates" | "not_between_dates";
export type AlertType = "error" | "warning" | "info" | "trace";
export type FormNature = "model" | "generic" | "other" | "local" | "archived";

export interface FileRef { fileId: string; name?: string; position: number; mime?: string }

export interface FormDefinition {
  formId: string; lineageId: string; versionNo: number;
  nature: FormNature;
  name: string; reference?: string; indexLabel?: string;
  additionalComment?: string; additionalObservation?: string;
  lockResponses: boolean;
  family?: { id: string; shortName: string; longName?: string; color?: string };
  pdf?: { templateFileId?: string; pageNumberX?: number; pageNumberY?: number };
  rubrics: RubricDef[];
}

export interface RubricDef {
  id: string; lineageId: string; position: number; type: RubricType;
  name: string; description?: string; additionalComment?: string; additionalObservation?: string;
  hiddenInMobile: boolean; hideInPdf: boolean; pdfLandscape: boolean; exportImagesInAppendix: boolean;
  allowAddRow: boolean; allowAddColumn: boolean; firstColumnHidden: boolean; importXlsxEnabled: boolean;
  images: FileRef[];
  /** table_row : lignes ; table_column : colonnes. */
  questions: QuestionDef[];
}

export interface QuestionDef {
  id: string; lineageId: string; position: number; type: QuestionType;
  name: string; description?: string; additionalComment?: string; additionalObservation?: string;
  mandatory: boolean; withObservation: boolean; lockable: boolean; allowBackdating: boolean;
  shared: boolean; hideInPdf: boolean; hideImagesBelowTable: boolean; unifyCells: boolean;
  photoSize?: Size; backgroundColor?: string; icon?: string; objectAttributeId?: string;
  images: FileRef[];
  /** Vide si type === 'collaborator'. */
  options: OptionDef[];
  /** Seulement si type === 'collaborator'. */
  signatories: SignatorySlotDef[];
}

export interface PrefillDef { mode: "static" | "dynamic"; value?: unknown; variable?: string }
export interface ValidationDef { op: ValidationOp; min?: string; max?: string; message?: string; block: boolean }
export interface AlertDef { type: AlertType; text: string }

export interface OptionDef {
  id: string; lineageId: string; position: number;
  coord: string;
  code?: string; name?: string; optionName?: string; description?: string; placeholder?: string;
  choices?: string[]; unit?: string; valueHint?: string;
  /** refs = lineageId des options référencées. */
  formula?: { canonical: string; refs: string[] };
  frozen: boolean;
  prefill?: PrefillDef;
  validation?: ValidationDef;
  alert?: AlertDef;
  redirect?: { rubricLineageId: string; questionLineageId?: string };
  exportKey?: string; pdfFieldName?: string; xls?: { enabled: boolean; label?: string };
  photoSize?: Size; images: FileRef[];
}

export interface SignatorySlotDef {
  id: string; lineageId: string; position: number; coord: string;
  name?: string; description?: string; disableSignature: boolean;
  pdfFieldName?: string; xls?: { enabled: boolean; label?: string };
}

// ---------- Réponse ----------
export type ResponseState = "in_progress" | "done";
export type Provenance = "webapp" | "mobile" | "api";
export type ResponseContextKind = "project" | "flow" | "share";

export interface DynamicItem {
  id: string; rubricLineageId: string; kind: "question" | "option";
  parentLineageId?: string | null; templateLineageId: string; lineageId: string; position: number; name?: string | null;
}

export interface ActiveRedirect {
  rubricLineageId: string; questionLineageId?: string; fromQuestionPos: number; fromOptionPos: number;
}

export interface SignatureValue {
  contributorType: "intern" | "extern" | "not_listed_intern";
  userId?: string; firstName?: string; lastName?: string; email?: string; function?: string; companyName?: string;
  signaturePath?: string; signedAt?: string; localCreatedAt?: string;
  proxied?: boolean; principal?: string; proxy?: string; proxyDate?: string; comment?: string;
}

export interface CheckQuestionError {
  rubricLineageId: string; questionLineageId: string; name: string; type: QuestionType; icon?: string;
  error: "mandatory" | "invalid";
}

export interface CheckResult {
  rubricLineageId: string; name: string; position: number; type: RubricType; valid: boolean;
  questions: CheckQuestionError[];
}
