import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { getLibraryOptions, listTags, parseLibraryFilters } from "@/features/library/queries";
import { TagsView } from "@/features/library/tags/tags-view";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

export async function generateMetadata() {
  const t = await getTranslations("nav.library");
  return { title: t("tags") };
}

/** Bibliothèque › Étiquettes : arborescence, couleurs, flows liés. */
export default async function LibraryTagsPage({ searchParams }: PageProps<"/explore/library/tags">) {
  const sp = await searchParams;
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  if (!can("LibraryTags", "read", ctx)) notFound();
  const t = await getTranslations("tags");
  const tn = await getTranslations("nav.library");
  const [{ items, current, total }, options] = await Promise.all([listTags(parseLibraryFilters(sp)), getLibraryOptions("flow")]);
  const perm = (a: Parameters<typeof can>[1]) => can("LibraryTags", a, ctx);
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6">
      <PageHeader crumbs={[{ label: tn("title"), href: "/explore/library/forms" }, { label: tn("tags") }]} title={t("title")} />
      <TagsView items={items} current={current} total={total} accounts={options.accounts}
        permissions={{ add: perm("add"), edit: perm("edit"), delete: perm("delete") }} />
    </main>
  );
}
