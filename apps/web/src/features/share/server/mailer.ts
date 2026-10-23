import "server-only";
import { headers } from "next/headers";
import { createFormatter } from "next-intl";
import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/lib/app-config";
import { sendEmail, type SendResult } from "@/lib/email";
import { renderEmail, type EmailBlock } from "@/lib/email/templates";
import { CODE_TTL_MS } from "../crypto";

/** URL publique de l'application (APP_URL en production ; sinon origine de la requête interne). */
export async function appBaseUrl(): Promise<string> {
  const env = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3030";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export const shareLink = (base: string, token: string) => `${base}/share/${token}`;

type LinkMail = {
  organizationId: string;
  to: string;
  language: "fr" | "en";
  type: "form" | "response" | "document";
  targetName: string;
  reference: string | null;
  sender: string;
  comment: string | null;
  link: string;
  expiresAt: string;
};

/** E-mail de partage (lien personnel). */
export async function sendShareLinkEmail(m: LinkMail): Promise<SendResult> {
  const t = await getTranslations({ locale: m.language, namespace: "email" });
  const format = createFormatter({ locale: m.language, timeZone: "Europe/Paris" });
  const blocks: EmailBlock[] = [
    { type: "paragraph", text: t(`share.intro.${m.type}`, { sender: m.sender, name: m.targetName }) },
  ];
  if (m.reference) blocks.push({ type: "facts", items: [{ label: t("share.reference"), value: m.reference }] });
  if (m.comment) blocks.push({ type: "quote", label: t("share.commentFrom", { sender: m.sender }), text: m.comment });
  blocks.push({ type: "button", label: t(`share.button.${m.type}`), href: m.link });
  blocks.push({ type: "paragraph", text: t("share.validity", { date: format.dateTime(new Date(m.expiresAt), { dateStyle: "long" }) }) });
  const title = t(`share.subject.${m.type}`, { sender: m.sender });
  const { html, text } = renderEmail({ appName: APP_NAME, lang: m.language, title, blocks, footer: t("footer", { app: APP_NAME }) });
  return sendEmail({ organizationId: m.organizationId, kind: `share_${m.type}`, to: m.to, subject: title, html, text, sensitive: true });
}

/** Second e-mail : code secret à 6 chiffres. */
export async function sendShareCodeEmail(m: { organizationId: string; to: string; language: "fr" | "en"; targetName: string; code: string }): Promise<SendResult> {
  const t = await getTranslations({ locale: m.language, namespace: "email" });
  const title = t("code.subject", { app: APP_NAME });
  const blocks: EmailBlock[] = [
    { type: "paragraph", text: t("code.intro", { name: m.targetName }) },
    { type: "code", text: m.code },
    { type: "paragraph", text: t("code.validity", { minutes: Math.round(CODE_TTL_MS / 60_000) }) },
  ];
  const { html, text } = renderEmail({ appName: APP_NAME, lang: m.language, title, blocks, footer: t("footer", { app: APP_NAME }) });
  return sendEmail({ organizationId: m.organizationId, kind: "share_code", to: m.to, subject: title, html, text, sensitive: true });
}
