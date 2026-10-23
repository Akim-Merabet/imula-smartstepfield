import { ProfileMenu } from "@/features/profile/components/profile-menu";
import { requireSession } from "@/lib/auth/session";

export default async function ProfileLayout({ children }: LayoutProps<"/explore/profile">) {
  const { collaborator } = await requireSession();
  return (
    <>
      <ProfileMenu name={`${collaborator.first_name} ${collaborator.last_name}`} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-8 pb-6 shadow-[0_3px_6px_#00000029]">{children}</main>
    </>
  );
}
