import { InitScreen } from "@/features/share/components/init-screen";
import { ShareUnavailable } from "@/features/share/components/share-unavailable";
import { guardSharePage } from "@/features/share/server/guard";

export default async function ShareInitDocumentPage({ params }: PageProps<"/share/[shareId]/init-document">) {
  const { shareId: token } = await params;
  const g = await guardSharePage(token, "public", "document");
  if (!g.ok) return <ShareUnavailable reason={g.reason} />;
  return <InitScreen token={token} share={g.share} target={g.target} />;
}
