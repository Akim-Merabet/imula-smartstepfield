import { getTranslations } from "next-intl/server";
import { NoAccess } from "@/components/common/no-access";
import { PageHeader } from "@/components/shell/page-header";
import { listParam } from "@/features/collaborators/components/collaborators-page";
import { TabletsFilters, TabletsTable } from "@/features/collaborators/components/tablets-table";
import { getTabletFilterOptions, listTablets } from "@/features/collaborators/queries";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

export async function generateMetadata() {
  const t = await getTranslations("collaborators.menu");
  return { title: t("tablets") };
}

export default async function TabletsPage({ searchParams }: PageProps<"/explore/collaborators/tablets">) {
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  if (!can("ContributorTablets", "read", ctx)) return <NoAccess />;
  const sp = await searchParams;
  const t = await getTranslations("collaborators");
  const [{ items, total }, options] = await Promise.all([
    listTablets({
      textSearch: typeof sp.textSearch === "string" ? sp.textSearch : undefined,
      accounts: listParam(sp.account), companies: listParam(sp.company), families: listParam(sp.family),
      natures: listParam(sp.nature), statuses: listParam(sp.status), profileStatuses: listParam(sp.state),
    }),
    getTabletFilterOptions(),
  ]);
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6 shadow-[0_3px_6px_#00000029]">
      <PageHeader crumbs={[{ label: t("menu.title"), href: "/explore/collaborators" }, { label: t("menu.tablets") }]} title={t("pages.tablets")} />
      <TabletsFilters options={options} />
      <TabletsTable items={items} total={total} permissions={{
        add: can("ContributorTablets", "add", ctx),
        edit: can("ContributorTablets", "edit", ctx),
        delete: can("ContributorTablets", "delete", ctx),
      }} />
    </main>
  );
}
