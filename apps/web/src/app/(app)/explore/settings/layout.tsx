import { NoAccess } from "@/components/common/no-access";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { SettingsMenu } from "@/features/settings/components/settings-menu";

export default async function SettingsLayout({ children }: LayoutProps<"/explore/settings">) {
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  if (!can("Settings", "read", ctx)) return <NoAccess />;
  const r = (routeId: string) => can(routeId, "read", ctx);
  return (
    <>
      <SettingsMenu access={{
        account: r("SettingsAccount"), clients: r("SettingsClientBook"), companies: r("SettingsCompanies"),
        families: r("SettingsFamilies"), categories: r("DefaultCategories"), statuses: r("CustomStatus"),
        references: r("SettingsReferences"), customFields: r("SettingsCustomField"), filesModels: r("SettingsCustomFile"),
        filesCells: r("SettingsCustomCell"), sections: r("SettingsSections"), backgroundTasks: r("SettingsBackgroundTasks"),
        platform: r("SettingsGeneralAccount"),
      }} />
      {children}
    </>
  );
}
