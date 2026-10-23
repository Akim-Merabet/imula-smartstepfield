import { getTranslations } from "next-intl/server";
import { ContributorForm } from "@/features/share/components/contributor-form";
import { ShareCard } from "@/features/share/components/share-card";
import { ShareUnavailable } from "@/features/share/components/share-unavailable";
import { guardSharePage } from "@/features/share/server/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function ShareContributorPage({ params }: PageProps<"/share/[shareId]/contributor-info">) {
  const { shareId: token } = await params;
  const g = await guardSharePage(token, "session");
  if (!g.ok) return <ShareUnavailable reason={g.reason} />;
  const t = await getTranslations("share.public.contributor");
  let initial = g.share.contributor
    ? { firstName: g.share.contributor.firstName, lastName: g.share.contributor.lastName, company: g.share.contributor.company, job: g.share.contributor.job }
    : null;
  if (!initial) {
    // Contributeur déjà connu de l'organisation (même e-mail) : pré-remplissage.
    const { data } = await createAdminClient().from("external_users").select("first_name, last_name, company_name, profession")
      .eq("organization_id", g.share.organizationId).ilike("email", g.share.email.replace(/[\\%_]/g, "\\$&")).maybeSingle();
    initial = { firstName: data?.first_name ?? "", lastName: data?.last_name ?? "", company: data?.company_name ?? "", job: data?.profession ?? "" };
  }
  return (
    <ShareCard title={t("title")} description={t("subtitle")}>
      <ContributorForm token={token} email={g.share.email} initial={initial} />
    </ShareCard>
  );
}
