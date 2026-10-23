const PUBLIC_ERRORS = [
  "invalid_code", "code_expired", "no_code", "blocked", "cooldown", "email_failed", "unauthenticated", "already_sent", "expired", "revoked",
] as const;

/** Clé i18n `share.public.errors.*` d'un code d'erreur d'action publique. */
export function publicErrorKey(code: string): (typeof PUBLIC_ERRORS)[number] | "generic" {
  return (PUBLIC_ERRORS as readonly string[]).includes(code) ? (code as (typeof PUBLIC_ERRORS)[number]) : "generic";
}

const DIALOG_ERRORS = ["already_shared", "inactive_email", "email_failed", "forbidden", "not_found"] as const;
export function dialogErrorKey(code: string): (typeof DIALOG_ERRORS)[number] | "generic" {
  return (DIALOG_ERRORS as readonly string[]).includes(code) ? (code as (typeof DIALOG_ERRORS)[number]) : "generic";
}
