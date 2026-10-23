import { NoAccess } from "@/components/common/no-access";
import { CollaboratorsMenu } from "@/features/collaborators/components/collaborators-menu";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

/** Layout du module Collaborateurs et tablettes : menu latéral filtré par droits (dont API V1 / V2, ASF). */
export default async function CollaboratorsLayout({ children }: LayoutProps<"/explore/collaborators">) {
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  if (!can("Contributors", "read", ctx)) return <NoAccess />;
  return (
    <>
      <CollaboratorsMenu access={{
        users: can("ContributorUsers", "read", ctx),
        operators: can("ContributorOperators", "read", ctx),
        externalUsers: can("ContributorExternalUsers", "read", ctx),
        tablets: can("ContributorTablets", "read", ctx),
        authorizedDevices: can("ContributorAuthorizedDevices", "read", ctx),
        api: can("ExternalAccessApiV2", "read", ctx),
      }} />
      {children}
    </>
  );
}
