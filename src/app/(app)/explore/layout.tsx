import { Suspense } from "react";
import { NavRail } from "@/components/shell/nav-rail";
import { PageActionsProvider } from "@/components/shell/page-actions";
import { DialogHost } from "@/components/shell/dialog-host";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

export default async function ExploreLayout({ children }: LayoutProps<"/explore">) {
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  const { collaborator } = session;

  return (
    <PageActionsProvider>
      <div className="flex h-screen min-w-[990px] overflow-hidden">
        <NavRail
          access={{
            library: can("Library", "read", ctx),
            contributors: can("Contributors", "read", ctx),
            settings: can("Settings", "read", ctx),
          }}
          user={{ id: collaborator.id, name: `${collaborator.first_name} ${collaborator.last_name}`, company: session.account.name }}
        />
        <div className="flex min-w-0 flex-1 overflow-hidden">{children}</div>
      </div>
      <Suspense>
        <DialogHost />
      </Suspense>
    </PageActionsProvider>
  );
}
