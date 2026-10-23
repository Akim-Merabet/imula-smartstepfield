import { getTranslations } from "next-intl/server";
import { DownloadLink } from "@/features/share/components/download-link";
import { ShareCard } from "@/features/share/components/share-card";
import { ShareUnavailable } from "@/features/share/components/share-unavailable";
import { guardSharePage, shareBase } from "@/features/share/server/guard";

/** Fin du parcours : réponse envoyée, téléchargement du récapitulatif PDF (spec 03 §9.2 étape 5). */
export default async function ShareFinishPage({ params }: PageProps<"/share/[shareId]/finish">) {
  const { shareId: token } = await params;
  const g = await guardSharePage(token, "contributor", "form");
  if (!g.ok) return <ShareUnavailable reason={g.reason} />;
  const t = await getTranslations("share.public.finish");
  return (
    <ShareCard title={t("title")} description={t("text")}>
      <DownloadLink href={`${shareBase(token)}/pdf`} label={t("download")} />
    </ShareCard>
  );
}
