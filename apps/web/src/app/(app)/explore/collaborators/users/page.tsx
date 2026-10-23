import { getTranslations } from "next-intl/server";
import { CollaboratorsPage } from "@/features/collaborators/components/collaborators-page";

export async function generateMetadata() {
  const t = await getTranslations("collaborators.menu");
  return { title: t("users") };
}

export default async function UsersPage({ searchParams }: PageProps<"/explore/collaborators/users">) {
  return <CollaboratorsPage kind="user" searchParams={await searchParams} />;
}
