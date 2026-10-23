import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookOpenIcon, InfoIcon, KeyRoundIcon } from "lucide-react";
import { NoAccess } from "@/components/common/no-access";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

export async function generateMetadata() {
  const t = await getTranslations("apiAccess.menu");
  return { title: t("v1") };
}

/** Accès API V1 : non reconstruit, renvoi vers la v2. */
export default async function ExternalApiV1Page() {
  const session = await requireSession();
  if (!can("ExternalAccessApiV1", "read", { authority: session.collaborator.authority })) return <NoAccess />;
  const t = await getTranslations("apiAccess");
  const tc = await getTranslations("collaborators.menu");
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6">
      <PageHeader crumbs={[{ label: tc("title"), href: "/explore/collaborators" }, { label: t("menu.api") }, { label: t("menu.v1") }]}
        title={t("v1.title")} subtitle={t("v1.subtitle")} />
      <div className="flex max-w-3xl flex-col gap-4">
        <Alert>
          <InfoIcon />
          <AlertTitle>{t("v1.notRebuilt")}</AlertTitle>
          <AlertDescription>{t("v1.explanation")}</AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button asChild><Link href="/explore/collaborators/external-api/v2"><KeyRoundIcon data-icon="inline-start" />{t("v1.goV2")}</Link></Button>
          <Button asChild variant="outline"><Link href="/explore/collaborators/external-api/v2/docs"><BookOpenIcon data-icon="inline-start" />{t("v1.goDocs")}</Link></Button>
        </div>
      </div>
    </main>
  );
}
