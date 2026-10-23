import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { DownloadLink } from "@/features/share/components/download-link";
import { ShareCard } from "@/features/share/components/share-card";
import { ShareUnavailable } from "@/features/share/components/share-unavailable";
import { guardSharePage, shareBase } from "@/features/share/server/guard";

/** « Sauvegarder et continuer plus tard » (spec 03 §9.2 étape 6). */
export default async function ShareLaterPage({ params }: PageProps<"/share/[shareId]/later">) {
  const { shareId: token } = await params;
  const g = await guardSharePage(token, "contributor", "form");
  if (!g.ok) return <ShareUnavailable reason={g.reason} />;
  const t = await getTranslations("share.public.later");
  return (
    <ShareCard title={t("title")} description={t("text")}>
      <p className="text-sm text-muted-foreground">{t("summary")}</p>
      <div className="flex flex-wrap gap-2">
        <DownloadLink href={`${shareBase(token)}/pdf`} label={t("download")} variant="outline" />
        {!g.share.respondedAt && <Button asChild><Link href={`${shareBase(token)}/form`}>{t("resume")}</Link></Button>}
      </div>
    </ShareCard>
  );
}
