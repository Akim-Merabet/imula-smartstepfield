import { getTranslations } from "next-intl/server";
import { TabletIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export async function generateMetadata() {
  const t = await getTranslations("profile.tablet");
  return { title: t("title") };
}

/** Profil › Tablette (lecture) : aucun lien utilisateur ↔ tablette n'existe encore dans le schéma (connexion rapide non livrée). */
export default async function ProfileTabletPage() {
  const t = await getTranslations("profile");
  return (
    <>
      <PageHeader crumbs={[{ label: t("title"), href: "/explore/profile" }, { label: t("tablet.title") }]} title={t("tablet.title")} />
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon"><TabletIcon /></EmptyMedia>
          <EmptyTitle>{t("tablet.empty")}</EmptyTitle>
          <EmptyDescription>{t("tablet.emptyHelp")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
