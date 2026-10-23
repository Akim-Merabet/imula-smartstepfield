import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { getLibraryOptions, listRisks, parseLibraryFilters } from "@/features/library/queries";
import { RisksTable } from "@/features/library/risks/risks-table";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

export async function generateMetadata() {
  const t = await getTranslations("nav.library");
  return { title: t("risks") };
}

/** Bibliothèque › Risques (spec 02 §5.5) : risques, parades génériques, pictogrammes. */
export default async function LibraryRisksPage({ searchParams }: PageProps<"/explore/library/risks">) {
  const sp = await searchParams;
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  if (!can("LibraryRisks", "read", ctx)) notFound();
  const t = await getTranslations("libraryRisks");
  const tn = await getTranslations("nav.library");
  const [{ items, current, total }, options] = await Promise.all([listRisks(parseLibraryFilters(sp)), getLibraryOptions("risk")]);
  const perm = (a: Parameters<typeof can>[1]) => can("LibraryRisks", a, ctx);
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6">
      <PageHeader crumbs={[{ label: tn("title"), href: "/explore/library/forms" }, { label: tn("risks") }]} title={t("title")} />
      <RisksTable items={items} current={current} total={total} options={options}
        permissions={{ add: perm("add"), edit: perm("edit"), duplicate: perm("duplicate"), delete: perm("delete"), deactivate: perm("deactivate"), import: perm("import") }} />
    </main>
  );
}
