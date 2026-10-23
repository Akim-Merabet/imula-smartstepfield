import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ClockIcon, TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Bascule Vue liste (tableau) / Vue temporelle des signatures (dans la page, pas dans le menu). */
export async function SignaturesViewSwitch({ projectId, current }: { projectId: string; current: "list" | "temporal" }) {
  const t = await getTranslations("signatures");
  const base = `/explore/projects/${projectId}/dashboard/signatures`;
  return (
    <div className="flex gap-1">
      <Button variant={current === "list" ? "default" : "secondary"} size="sm" asChild><Link href={`${base}/vue-list`}><TableIcon data-icon="inline-start" />{t("list.view")}</Link></Button>
      <Button variant={current === "temporal" ? "default" : "secondary"} size="sm" asChild><Link href={`${base}/vue-temporal`}><ClockIcon data-icon="inline-start" />{t("temporal.title")}</Link></Button>
    </div>
  );
}
