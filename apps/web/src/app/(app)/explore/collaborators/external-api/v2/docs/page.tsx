import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { NoAccess } from "@/components/common/no-access";
import { PageHeader } from "@/components/shell/page-header";
import { ApiDocs } from "@/features/api-access/components/api-docs";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

export async function generateMetadata() {
  const t = await getTranslations("apiAccess.menu");
  return { title: t("docs") };
}

export default async function ExternalApiV2DocsPage() {
  const session = await requireSession();
  if (!can("ExternalAccessApiV2", "read", { authority: session.collaborator.authority })) return <NoAccess />;
  const t = await getTranslations("apiAccess");
  const tc = await getTranslations("collaborators.menu");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost"}`;
  const locale = (await getLocale()) === "en" ? "en" : "fr";
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6">
      <PageHeader crumbs={[
        { label: tc("title"), href: "/explore/collaborators" }, { label: t("menu.api") },
        { label: t("menu.v2"), href: "/explore/collaborators/external-api/v2" }, { label: t("docs.title") },
      ]} title={t("docs.title")} subtitle={t("docs.subtitle")} />
      <div className="min-h-0 flex-1 overflow-y-auto pr-2">
        <ApiDocs origin={origin} locale={locale} />
      </div>
    </main>
  );
}
