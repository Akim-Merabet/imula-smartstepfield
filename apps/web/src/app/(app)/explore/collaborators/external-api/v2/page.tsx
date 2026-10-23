import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookOpenIcon, FileJsonIcon } from "lucide-react";
import { NoAccess } from "@/components/common/no-access";
import { ClearFiltersButton, FilterBar, SearchFilter } from "@/components/data-table/filter-bar";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ApiClientsTable } from "@/features/api-access/components/api-clients-table";
import { listApiClients } from "@/features/api-access/queries";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

export async function generateMetadata() {
  const t = await getTranslations("apiAccess.menu");
  return { title: t("v2") };
}

export default async function ExternalApiV2Page({ searchParams }: PageProps<"/explore/collaborators/external-api/v2">) {
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  if (!can("ExternalAccessApiV2", "read", ctx)) return <NoAccess />;
  const sp = await searchParams;
  const t = await getTranslations("apiAccess");
  const tc = await getTranslations("collaborators.menu");
  const { items, total } = await listApiClients(typeof sp.textSearch === "string" ? sp.textSearch : undefined);
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6">
      <PageHeader crumbs={[{ label: tc("title"), href: "/explore/collaborators" }, { label: t("menu.api") }, { label: t("menu.v2") }]}
        title={t("v2.title")} subtitle={t("v2.subtitle")}
        actions={<>
          <Button asChild variant="outline"><Link href="/explore/collaborators/external-api/v2/docs"><BookOpenIcon data-icon="inline-start" />{t("v2.docs")}</Link></Button>
          <Button asChild variant="outline"><a href="/api/ext/v2/openapi.json" target="_blank" rel="noreferrer"><FileJsonIcon data-icon="inline-start" />{t("v2.openapi")}</a></Button>
        </>} />
      <FilterBar end={<ClearFiltersButton params={["textSearch"]} />}><SearchFilter /></FilterBar>
      <ApiClientsTable items={items} total={total} permissions={{
        add: can("ExternalAccessApiV2", "add", ctx),
        edit: can("ExternalAccessApiV2", "edit", ctx),
        delete: can("ExternalAccessApiV2", "delete", ctx),
      }} />
    </main>
  );
}
