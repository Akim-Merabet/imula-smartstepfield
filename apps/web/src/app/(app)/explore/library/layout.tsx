import { notFound } from "next/navigation";
import { LibraryMenu } from "@/features/forms/components/library-menu";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";

export default async function LibraryLayout({ children }: LayoutProps<"/explore/library">) {
  const session = await requireSession();
  const ctx = { authority: session.collaborator.authority };
  if (!can("Library", "read", ctx)) notFound();
  return (
    <>
      <LibraryMenu access={{
        risks: can("LibraryRisks", "read", ctx),
        equipments: can("LibraryEquipments", "read", ctx),
        documents: can("LibraryRisks", "read", ctx),
        forms: can("LibraryForms", "read", ctx),
        objects: can("LibraryObjectManagement", "read", ctx),
        tags: can("LibraryTags", "read", ctx),
      }} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </>
  );
}
