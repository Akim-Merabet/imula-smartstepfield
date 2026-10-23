import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { PasswordForm } from "@/features/profile/components/password-form";

export async function generateMetadata() {
  const t = await getTranslations("profile.password");
  return { title: t("title") };
}

export default async function ProfilePasswordPage() {
  const t = await getTranslations("profile");
  return (
    <>
      <PageHeader crumbs={[{ label: t("title"), href: "/explore/profile" }, { label: t("password.title") }]} title={t("password.title")} />
      <PasswordForm />
    </>
  );
}
