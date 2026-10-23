import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { ObjectsTable } from "@/features/library/objects/objects-table";
import { getLibraryOptions, getObjectStatuses, listObjects, parseLibraryFilters } from "@/features/library/queries";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

export async function generateMetadata() {
  const t = await getTranslations("nav.library");
  return { title: t("objects") };
}

/** Bibliothèque › Objets › Vue tableau (spec 02 §5.10) : arborescence parent / enfant. */
export default async function LibraryObjectsPage({ searchParams }: PageProps<"/explore/library/object-management/list-vue">) {
  const sp = await searchParams;
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  if (!can("LibraryObjectManagement", "read", ctx)) notFound();
  const t = await getTranslations("technicalObjects");
  const tn = await getTranslations("nav.library");
  const [{ items, current, total }, options, statuses] = await Promise.all([
    listObjects(parseLibraryFilters(sp, "status")), getLibraryOptions("technical_object"), getObjectStatuses(),
  ]);
  const perm = (a: Parameters<typeof can>[1]) => can("LibraryObjectManagement", a, ctx);
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6">
      <PageHeader crumbs={[{ label: tn("title"), href: "/explore/library/forms" }, { label: tn("objects") }]} title={t("title")} />
      <ObjectsTable items={items} current={current} total={total} options={options} statuses={statuses}
        permissions={{ add: perm("add"), edit: perm("edit"), duplicate: perm("duplicate"), delete: perm("delete") }} />
    </main>
  );
}
