import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { DocumentsFilters } from "@/features/documents/components/documents-filters";
import { DocumentsTable } from "@/features/documents/components/documents-table";
import { parseDocumentFilters } from "@/features/documents/filters";
import { getDocumentFilterOptions, getWordings, listLibraryDocuments } from "@/features/documents/queries";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

export async function generateMetadata() {
  const t = await getTranslations("nav.library");
  return { title: t("documents") };
}

/** Bibliothèque › Documents (spec 04 §5.4) : PDF avec / sans version par applicabilité. */
export default async function LibraryDocumentsPage({ searchParams }: PageProps<"/explore/library/documents">) {
  const sp = await searchParams;
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  if (!can("LibraryDocuments", "read", ctx)) notFound();
  const t = await getTranslations("documents");
  const tn = await getTranslations("nav.library");
  const [{ items, total }, options] = await Promise.all([listLibraryDocuments(parseDocumentFilters(sp)), getDocumentFilterOptions(null)]);
  const wordings = await getWordings(items.map((d) => d.family?.wording_configuration_id));
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6">
      <PageHeader crumbs={[{ label: tn("title"), href: "/explore/library/forms" }, { label: tn("documents") }]}
        title={t("libraryTitle")} subtitle={t("subtitle", { current: items.length })} />
      <DocumentsFilters mode="library" options={options} />
      <DocumentsTable mode="library" projectId={null} items={items} total={total} wordings={wordings} categories={options.categories}
        permissions={{
          add: can("LibraryDocuments", "add", ctx), edit: can("LibraryDocuments", "edit", ctx),
          delete: can("LibraryDocuments", "delete", ctx), import: false,
        }} />
    </main>
  );
}
