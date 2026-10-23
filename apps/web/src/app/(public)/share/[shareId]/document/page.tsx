import { getFormatter, getTranslations } from "next-intl/server";
import { FileTextIcon } from "lucide-react";
import { DownloadLink } from "@/features/share/components/download-link";
import { ShareCard } from "@/features/share/components/share-card";
import { ShareUnavailable } from "@/features/share/components/share-unavailable";
import { sharedDocumentPdfs } from "@/features/share/server/document";
import { guardSharePage, shareBase } from "@/features/share/server/guard";

/** Consultation / téléchargement d'un document partagé (spec 04 §5.8). */
export default async function ShareDocumentPage({ params }: PageProps<"/share/[shareId]/document">) {
  const { shareId: token } = await params;
  const g = await guardSharePage(token, "contributor", "document");
  if (!g.ok) return <ShareUnavailable reason={g.reason} />;
  const t = await getTranslations("share.public.document");
  const format = await getFormatter();
  const pdfs = await sharedDocumentPdfs(g.share);
  const href = (key: string) => `${shareBase(token)}/download?f=${encodeURIComponent(key)}`;
  return (
    <ShareCard title={g.target.name} description={pdfs.length ? t("text") : t("noPdf")}>
      {pdfs[0] && <DownloadLink href={href(pdfs[0].key)} label={t("download")} />}
      {pdfs.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">{t("versions")}</div>
          <ul className="flex flex-col divide-y rounded-md border">
            {pdfs.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <FileTextIcon className="size-4 text-muted-foreground" />
                  {p.index ? t("index", { index: p.index }) : p.label}
                  {p.date && <span className="text-muted-foreground">· {t("diffusedOn", { date: format.dateTime(new Date(p.date), { dateStyle: "medium" }) })}</span>}
                </span>
                <a className="text-info hover:underline" href={href(p.key)} download>{t("download")}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ShareCard>
  );
}
