import { getTranslations } from "next-intl/server";
import { ShareCard } from "./share-card";

export async function ShareUnavailable({ reason }: { reason: "not_found" | "expired" | "revoked" | "blocked" }) {
  const t = await getTranslations("share.public.unavailable");
  return <ShareCard title={t("title")} description={t(reason)} />;
}
