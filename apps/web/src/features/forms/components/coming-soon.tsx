import { getTranslations } from "next-intl/server";
import { ConstructionIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** Page « bientôt disponible » d'un module de la bibliothèque non encore livré. */
export async function LibraryComingSoon({ section }: { section: "risks" | "equipments" | "documents" | "objects" | "tags" }) {
  const t = await getTranslations("library");
  const tn = await getTranslations("nav.library");
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6">
      <PageHeader crumbs={[{ label: tn("title"), href: "/explore/library/forms" }, { label: tn(section) }]} title={tn(section)} />
      <Empty className="flex-1 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><ConstructionIcon /></EmptyMedia>
          <EmptyTitle>{t("comingSoon.title")}</EmptyTitle>
          <EmptyDescription>{t("comingSoon.description")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
