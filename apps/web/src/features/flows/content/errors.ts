/** Codes d'erreur applicatifs → messages (namespace flowContent.errors). */
const KNOWN = new Set([
  "has_signatures", "has_responses", "has_redirections", "comment_required", "dsi_required_group", "missing_mandatory",
  "step_disabled", "role_conflict", "invalid_state", "no_valid_block", "no_selection", "not_redaction", "too_large",
  "item_disabled", "control_signed", "nature_not_available", "already_signed", "sign_twice", "not_in_restricted_list",
  "proxy_date_after", "signature_required", "no_dsi", "max_items", "last_item", "signature_requires_status",
  "object_bloc_not_in_redaction", "form_bloc_not_in_redaction", "linked_forms_have_responses", "in_use", "duplicate", "invalid",
  "flow_locked", "sequence_first_phase", "sequence_first",
]);

type T = (key: string, values?: Record<string, string | number>) => string;

export function contentError(t: T, tg: T, code: string | undefined, context?: string): string {
  if (code === "forbidden") return tg("toast.forbidden");
  if (code === "has_signatures" && context === "reset") return t("errors.resetHasSignatures");
  if (code && KNOWN.has(code)) return t(`errors.${code}`);
  return tg("toast.error");
}
