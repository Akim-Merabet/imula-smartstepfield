import { getTranslations } from "next-intl/server";
import { ShieldOffIcon } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";

/** Écran « accès refusé » d'une page (spec 01 §3.4). */
export async function NoAccess() {
  const t = await getTranslations("global");
  return (
    <main className="flex min-w-0 flex-1 items-center justify-center px-8">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><ShieldOffIcon /></EmptyMedia>
          <EmptyDescription>{t("permissionPage")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
