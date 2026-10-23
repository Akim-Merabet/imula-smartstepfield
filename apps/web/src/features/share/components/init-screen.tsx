import { getTranslations } from "next-intl/server";
import type { ResolvedShare } from "../server/access";
import type { TargetInfo } from "../server/target";
import { RequestCodeButton } from "./request-code-button";
import { ShareCard } from "./share-card";

/** Écran d'accueil « {expéditeur} vous a envoyé … » (spec 03 §9.2 étape 1, spec 04 §5.8). */
export async function InitScreen({ token, share, target }: { token: string; share: ResolvedShare; target: TargetInfo }) {
  const t = await getTranslations("share.public.init");
  const sender = target.sender ? `${target.sender.firstName} ${target.sender.lastName}` : t("someone");
  const key = target.type === "document" ? "documentTitle" : target.type === "response" ? "responseTitle" : "formTitle";
  const action = target.type === "document" ? "startDocument" : target.type === "response" ? "startResponse" : "startForm";
  return (
    <ShareCard title={t(key, { sender })} description={target.name}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {target.reference && <><dt className="text-muted-foreground">{t("reference")}</dt><dd>{target.reference}</dd></>}
        {target.projectName && <><dt className="text-muted-foreground">{t("project")}</dt><dd>{target.projectName}</dd></>}
      </dl>
      {share.comment && (
        <div className="rounded-md border-l-2 border-border bg-muted px-3 py-2 text-sm">
          <div className="mb-1 font-medium">{t("message")}</div>
          <p className="whitespace-pre-wrap text-muted-foreground">{share.comment}</p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">{t("explain", { email: share.email })}</p>
      <RequestCodeButton token={token} label={t(action)} />
    </ShareCard>
  );
}
