import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShieldCheckIcon } from "lucide-react";
import { APP_NAME } from "@/lib/app-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Mise en page publique sobre du parcours externe (hors shell, sans compte). */
export default async function ShareLayout({ children }: LayoutProps<"/share/[shareId]">) {
  const t = await getTranslations("share.public");
  return (
    <div className="flex min-h-full flex-col bg-muted">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-6">
        <div className="flex items-center gap-2 font-medium">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground">{APP_NAME.slice(0, 1)}</span>
          {APP_NAME}
        </div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheckIcon className="size-4" />{t("secured")}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
