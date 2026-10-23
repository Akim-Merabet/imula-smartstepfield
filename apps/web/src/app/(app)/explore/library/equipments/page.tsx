import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { EquipmentsTable } from "@/features/library/equipments/equipments-table";
import { getLibraryOptions, listEquipments, parseLibraryFilters } from "@/features/library/queries";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

export async function generateMetadata() {
  const t = await getTranslations("nav.library");
  return { title: t("equipments") };
}

/** Bibliothèque › Moyens (spec 02 §5.4) : équipements, matériels, matériaux. */
export default async function LibraryEquipmentsPage({ searchParams }: PageProps<"/explore/library/equipments">) {
  const sp = await searchParams;
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  if (!can("LibraryEquipments", "read", ctx)) notFound();
  const t = await getTranslations("libraryEquipments");
  const tn = await getTranslations("nav.library");
  const [{ items, current, total }, options] = await Promise.all([
    listEquipments(parseLibraryFilters(sp, "verification")), getLibraryOptions("equipment"),
  ]);
  const perm = (a: Parameters<typeof can>[1]) => can("LibraryEquipments", a, ctx);
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6">
      <PageHeader crumbs={[{ label: tn("title"), href: "/explore/library/forms" }, { label: tn("equipments") }]} title={t("title")} />
      <EquipmentsTable items={items} current={current} total={total} options={options}
        permissions={{ add: perm("add"), edit: perm("edit"), duplicate: perm("duplicate"), delete: perm("delete"), deactivate: perm("deactivate"), import: perm("import") }} />
    </main>
  );
}
