import { getTranslations } from "next-intl/server";
import { NoAccess } from "@/components/common/no-access";
import { ClearFiltersButton, FilterBar, SearchFilter } from "@/components/data-table/filter-bar";
import { PageHeader } from "@/components/shell/page-header";
import { ExternalUsersTable } from "@/features/collaborators/components/external-users-table";
import { listExternalUsers } from "@/features/collaborators/queries";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

export async function generateMetadata() {
  const t = await getTranslations("collaborators.menu");
  return { title: t("externalUsers") };
}

export default async function ExternalUsersPage({ searchParams }: PageProps<"/explore/collaborators/external-users">) {
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  if (!can("ContributorExternalUsers", "read", ctx)) return <NoAccess />;
  const sp = await searchParams;
  const t = await getTranslations("collaborators");
  const { items, total } = await listExternalUsers(typeof sp.textSearch === "string" ? sp.textSearch : undefined);
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6 shadow-[0_3px_6px_#00000029]">
      <PageHeader crumbs={[{ label: t("menu.title"), href: "/explore/collaborators" }, { label: t("menu.externalUsers") }]}
        title={t("pages.externalUsers")} subtitle={t("external.createInfo")} />
      <FilterBar end={<ClearFiltersButton params={["textSearch"]} />}><SearchFilter /></FilterBar>
      <ExternalUsersTable items={items} total={total} permissions={{
        edit: can("ContributorExternalUsers", "edit", ctx),
        delete: can("ContributorExternalUsers", "delete", ctx),
        convert: can("ContributorUsers", "add", ctx),
      }} />
    </main>
  );
}
