import { getTranslations } from "next-intl/server";
import { remainingCooldownMs } from "@/features/share/crypto";
import { LoginForm } from "@/features/share/components/login-form";
import { ShareCard } from "@/features/share/components/share-card";
import { ShareUnavailable } from "@/features/share/components/share-unavailable";
import { guardSharePage } from "@/features/share/server/guard";

export default async function ShareLoginPage({ params }: PageProps<"/share/[shareId]/login">) {
  const { shareId: token } = await params;
  const g = await guardSharePage(token, "public");
  if (!g.ok) return <ShareUnavailable reason={g.reason} />;
  const t = await getTranslations("share.public.login");
  return (
    <ShareCard title={t("title")} description={t("sent", { email: g.share.email })}>
      <LoginForm token={token} cooldownMs={remainingCooldownMs(g.share.codeSentAt)} />
    </ShareCard>
  );
}
