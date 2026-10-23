import { getTranslations } from "next-intl/server";
import { NoAccess } from "@/components/common/no-access";
import { PageHeader } from "@/components/shell/page-header";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import type { CollaboratorKind } from "../meta";
import { getCollaboratorOptions, listCollaborators } from "../queries";
import { CollaboratorsFilters } from "./collaborators-filters";
import { CollaboratorsTable } from "./collaborators-table";

export const listParam = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v.join(",") : v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Page liste Utilisateurs / Opérateurs (spec 01 §4.3). */
export async function CollaboratorsPage({ kind, searchParams }: {
  kind: CollaboratorKind; searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  const routeId = kind === "user" ? "ContributorUsers" : "ContributorOperators";
  if (!can(routeId, "read", ctx)) return <NoAccess />;
  const t = await getTranslations("collaborators");
  const sp = searchParams;
  const [{ items, total }, options] = await Promise.all([
    listCollaborators(kind, {
      textSearch: typeof sp.textSearch === "string" ? sp.textSearch : undefined,
      accounts: listParam(sp.account), authorities: listParam(sp.authority), statuses: listParam(sp.status),
      companies: listParam(sp.company), functions: listParam(sp.function), groups: listParam(sp.group),
      hierarchies: listParam(sp.hierarchy), skills: listParam(sp.skill), domains: listParam(sp.domain),
      legals: listParam(sp.legal), contracts: listParam(sp.contract),
    }),
    getCollaboratorOptions(),
  ]);
  const page = kind === "user" ? "users" : "operators";

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6 shadow-[0_3px_6px_#00000029]">
      <PageHeader
        crumbs={[{ label: t("menu.title"), href: "/explore/collaborators" }, { label: t(`menu.${page}`) }]}
        title={t(`pages.${page}`)}
      />
      <CollaboratorsFilters kind={kind} options={options} />
      <CollaboratorsTable
        kind={kind}
        items={items}
        total={total}
        currentId={session.collaborator.id}
        options={options}
        permissions={{
          add: can(routeId, "add", ctx),
          edit: can(routeId, "edit", ctx),
          delete: can(routeId, "delete", ctx),
          restore: can(routeId, "restore", ctx),
          unlock: kind === "user" && can(routeId, "unlock", ctx),
          move: can("MoveApplicability", "read", ctx),
          skills: can("ContributorSkills", "read", ctx),
        }}
      />
    </main>
  );
}
