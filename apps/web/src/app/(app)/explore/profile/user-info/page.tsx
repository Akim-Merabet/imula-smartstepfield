import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { ProfileInfoForm } from "@/features/profile/components/profile-info-form";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  const t = await getTranslations("profile.info");
  return { title: t("title") };
}

export default async function ProfileInfoPage() {
  const { collaborator: c } = await requireSession();
  const t = await getTranslations("profile");
  const supabase = await createClient();
  const { data: functions } = await supabase.from("label_families").select("id, short_name, long_name, color")
    .eq("kind", "family").eq("nature", "function").eq("relative_nature", "child").eq("active", true).is("deleted_at", null)
    .order("priority").order("short_name");

  return (
    <>
      <PageHeader crumbs={[{ label: t("title"), href: "/explore/profile" }, { label: t("info.title") }]} title={t("info.title")} />
      <ProfileInfoForm
        initial={{
          first_name: c.first_name, last_name: c.last_name, trigram: c.trigram, function_id: c.function_id,
          complement: c.complement ?? "", profession: c.profession ?? "",
          language: c.language === "en" ? "en" : "fr", signature_path: c.signature_path,
        }}
        email={c.email}
        sso={c.sso_identifier}
        functions={(functions ?? []).map((f) => ({ id: f.id, color: f.color, label: f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name }))}
      />
    </>
  );
}
