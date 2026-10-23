import { requireSession } from "@/lib/auth/session";

/** Éditeur de formulaire plein écran : hors shell « explore », session exigée. */
export default async function FormEditorLayout({ children }: LayoutProps<"/form/[formId]">) {
  await requireSession();
  return <div className="h-screen overflow-hidden">{children}</div>;
}
