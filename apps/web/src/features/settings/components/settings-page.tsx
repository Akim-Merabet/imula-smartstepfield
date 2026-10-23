import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { NoAccess } from "@/components/common/no-access";
import { PageHeader } from "@/components/shell/page-header";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

/** Gabarit d'une page Paramètres : garde de droit + fil d'Ariane « Paramètres › écran ». */
export async function SettingsPage({ routeId, title, subtitle, actions, children }: {
  routeId: string; title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode;
}) {
  const session = await requireSession();
  if (!can(routeId, "read", { authority: session.collaborator.authority })) return <NoAccess />;
  const t = await getTranslations("settings");
  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6 shadow-[0_3px_6px_#00000029]">
      <PageHeader crumbs={[{ label: t("menu.title"), href: "/explore/settings" }, { label: title }]} title={title} subtitle={subtitle} actions={actions} />
      {children}
    </main>
  );
}

/** Contexte de droits de la page courante (pour les composants clients). */
export async function settingsCan(routeId: string) {
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  return {
    session,
    can: (action: Parameters<typeof can>[1]) => can(routeId, action, ctx),
  };
}
