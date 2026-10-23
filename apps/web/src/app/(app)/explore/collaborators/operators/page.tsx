import { getTranslations } from "next-intl/server";
import { CollaboratorsPage } from "@/features/collaborators/components/collaborators-page";

export async function generateMetadata() {
  const t = await getTranslations("collaborators.menu");
  return { title: t("operators") };
}

export default async function OperatorsPage({ searchParams }: PageProps<"/explore/collaborators/operators">) {
  return <CollaboratorsPage kind="operator" searchParams={await searchParams} />;
}
