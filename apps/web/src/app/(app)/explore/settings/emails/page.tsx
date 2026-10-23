import { getTranslations } from "next-intl/server";
import { EmailsLog, type EmailLogRow } from "@/features/share/components/emails-log";
import { SettingsPage, settingsCan } from "@/features/settings/components/settings-page";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("share.emails");
  return { title: t("title") };
}

/** Journal des e-mails sortants (outil de développement) — réservé Admin Siteflow (RLS + matrice). */
export default async function EmailsPage() {
  const t = await getTranslations("share.emails");
  const { can } = await settingsCan("SettingsEmails");
  const supabase = await createClient();
  const { data } = can("read")
    ? await supabase.from("outbound_emails").select("id, created_at, to_email, subject, kind, status, transport, error, redacted, html, text_body")
      .order("created_at", { ascending: false }).limit(200)
    : { data: [] };
  return (
    <SettingsPage routeId="SettingsEmails" title={t("title")} subtitle={<>{t("subtitle")} {process.env.SMTP_URL ? t("smtpOn") : t("smtpOff")}</>}>
      <EmailsLog rows={(data ?? []) as EmailLogRow[]} />
    </SettingsPage>
  );
}
