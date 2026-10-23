import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("global.notFound");
  return (
    <div className="flex h-full flex-col items-center justify-end gap-6 bg-rail pb-24 text-rail-foreground">
      <p className="text-8xl font-light">404</p>
      <p className="text-xl">{t("title")}</p>
      <Button asChild variant="secondary"><Link href="/explore/projects">{t("back")}</Link></Button>
    </div>
  );
}
