import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { LibraryFormsFilters } from "@/features/forms/components/library-forms-filters";
import { LibraryFormsTable } from "@/features/forms/components/library-forms-table";
import { FORM_NATURES } from "@/features/forms/meta";
import { creatableNatures } from "@/features/forms/permissions";
import { getFormFilterOptions, LIBRARY_PAGE_SIZE, listLibraryForms, type FormNature } from "@/features/forms/queries";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { ADMIN_AUTHORITIES } from "@/lib/permissions/types";

export async function generateMetadata() {
  const t = await getTranslations("nav.library");
  return { title: t("forms") };
}

const list = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export default async function LibraryFormsPage({ searchParams }: PageProps<"/explore/library/forms">) {
  const sp = await searchParams;
  const t = await getTranslations("forms");
  const tn = await getTranslations("nav.library");
  const session = await requireSession();
  const { collaborator } = session;
  const ctx = { authority: collaborator.authority };
  const limit = Math.min(Number(sp.limit ?? LIBRARY_PAGE_SIZE) || LIBRARY_PAGE_SIZE, 1000);
  const archived = sp.archived === "archived" || sp.archived === "all" ? sp.archived : "active";

  const [{ items, total, hasMore }, options] = await Promise.all([
    listLibraryForms({
      textSearch: typeof sp.textSearch === "string" ? sp.textSearch : undefined,
      natures: list(sp.type).filter((x): x is FormNature => (FORM_NATURES as readonly string[]).includes(x)),
      families: list(sp.family), statuses: list(sp.status), companies: list(sp.company), accounts: list(sp.account),
      archived, limit,
    }),
    getFormFilterOptions(),
  ]);
  const isAdmin = !!collaborator.authority && ADMIN_AUTHORITIES.includes(collaborator.authority);
  const rights = { isAdmin, model: isAdmin || collaborator.additional_rights.includes("model_form"), generic: isAdmin || collaborator.additional_rights.includes("generic_form") };

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6 shadow-[0_3px_6px_#00000029]">
      <PageHeader crumbs={[{ label: tn("title"), href: "/explore/library/forms" }, { label: tn("forms") }]} title={t("libraryTitle")} />
      <LibraryFormsFilters options={options} showAccounts={options.accounts.length > 1} />
      <LibraryFormsTable
        items={items}
        total={total}
        hasMore={hasMore}
        limit={limit}
        rights={rights}
        permissions={{
          add: can("LibraryForms", "add", ctx) && creatableNatures(collaborator).length > 0,
          edit: can("LibraryForms", "edit", ctx),
          duplicate: can("LibraryForms", "duplicate", ctx) && creatableNatures(collaborator).length > 0,
          archive: can("LibraryForms", "archive", ctx),
          delete: can("LibraryForms", "delete", ctx),
        }}
      />
    </main>
  );
}
