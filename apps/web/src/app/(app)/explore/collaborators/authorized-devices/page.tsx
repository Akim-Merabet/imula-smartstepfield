import { getTranslations } from "next-intl/server";
import { NoAccess } from "@/components/common/no-access";
import { ClearFiltersButton, FilterBar, SearchFilter } from "@/components/data-table/filter-bar";
import { PageHeader } from "@/components/shell/page-header";
import { AuthorizedDevicesTable } from "@/features/collaborators/components/authorized-devices-table";
import { listAuthorizedDevices } from "@/features/collaborators/queries";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

export async function generateMetadata() {
  const t = await getTranslations("collaborators.menu");
  return { title: t("authorizedDevices") };
}

export default async function AuthorizedDevicesPage({ searchParams }: PageProps<"/explore/collaborators/authorized-devices">) {
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  if (!can("ContributorAuthorizedDevices", "read", ctx)) return <NoAccess />;
  const sp = await searchParams;
  const t = await getTranslations("collaborators");
  const { items, total } = await listAuthorizedDevices(typeof sp.textSearch === "string" ? sp.textSearch : undefined);
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6 shadow-[0_3px_6px_#00000029]">
      <PageHeader crumbs={[{ label: t("menu.title"), href: "/explore/collaborators" }, { label: t("menu.authorizedDevices") }]}
        title={t("pages.authorizedDevices")} subtitle={t("pages.authorizedDevicesHelp")} />
      <FilterBar end={<ClearFiltersButton params={["textSearch"]} />}><SearchFilter /></FilterBar>
      <AuthorizedDevicesTable items={items} total={total} permissions={{
        add: can("ContributorAuthorizedDevices", "add", ctx),
        edit: can("ContributorAuthorizedDevices", "edit", ctx),
        delete: can("ContributorAuthorizedDevices", "delete", ctx),
      }} />
    </main>
  );
}
