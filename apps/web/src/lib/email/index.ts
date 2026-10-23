import "server-only";
import { APP_NAME } from "@/lib/app-config";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Envoi d'e-mails transactionnels.
 * Transport 1 (toujours) : journal `outbound_emails` (consultable par l'Admin Siteflow : /explore/settings/emails).
 * Transport 2 (si `SMTP_URL` est défini) : envoi réel via nodemailer ; le contenu des e-mails
 * sensibles (codes secrets, liens d'accès) est alors masqué dans le journal.
 */
export type OutboundEmail = {
  organizationId: string | null;
  kind: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Contient un secret (code, lien d'accès) : masqué dans le journal si un transport réel est utilisé. */
  sensitive?: boolean;
};

export type SendResult = { ok: true; id: string | null; transport: "log" | "smtp" } | { ok: false; error: string };

const REDACTED_HTML = "<p>[contenu masqué / content redacted]</p>";
const REDACTED_TEXT = "[contenu masqué / content redacted]";

let transporter: { sendMail: (m: Record<string, unknown>) => Promise<unknown> } | null = null;
async function smtp() {
  const url = process.env.SMTP_URL;
  if (!url) return null;
  if (!transporter) {
    const nodemailer = await import("nodemailer");
    transporter = nodemailer.createTransport(url);
  }
  return transporter;
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM ?? `${APP_NAME} <no-reply@localhost>`;
}

export async function sendEmail(mail: OutboundEmail): Promise<SendResult> {
  const db = createAdminClient();
  const transport = await smtp();
  const redact = !!transport && !!mail.sensitive;
  const { data: row, error } = await db.from("outbound_emails").insert({
    organization_id: mail.organizationId, kind: mail.kind, to_email: mail.to, subject: mail.subject,
    html: redact ? REDACTED_HTML : mail.html, text_body: redact ? REDACTED_TEXT : mail.text,
    status: transport ? "sending" : "logged", transport: transport ? "smtp" : "log", redacted: redact,
  }).select("id").single();
  if (error) console.error("[email] journal", error.message);
  if (!transport) return error ? { ok: false, error: "log_failed" } : { ok: true, id: row?.id ?? null, transport: "log" };

  try {
    await transport.sendMail({ from: emailFrom(), to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
    if (row) await db.from("outbound_emails").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: true, id: row?.id ?? null, transport: "smtp" };
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 500) : "smtp_error";
    if (row) await db.from("outbound_emails").update({ status: "failed", error: message }).eq("id", row.id);
    return { ok: false, error: "smtp_failed" };
  }
}
