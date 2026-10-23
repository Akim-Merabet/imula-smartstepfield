import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FormBuilder } from "@/features/forms/builder/form-builder";
import { getBuilderData } from "@/features/forms/builder/queries";

export async function generateMetadata({ params }: PageProps<"/form/[formId]">) {
  const { formId } = await params;
  const t = await getTranslations("formBuilder");
  const data = await getBuilderData(formId);
  return { title: data ? `${data.form.name} · ${t("title")}` : t("title") };
}

export default async function FormEditorPage({ params, searchParams }: PageProps<"/form/[formId]">) {
  const { formId } = await params;
  const sp = await searchParams;
  const data = await getBuilderData(formId);
  if (!data) notFound();
  const raw = typeof sp.returnTo === "string" ? sp.returnTo : null;
  const fallback = data.form.project_id ? `/explore/projects/${data.form.project_id}/dashboard/forms` : "/explore/library/forms";
  const returnTo = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
  return <FormBuilder data={data} returnTo={returnTo} viewMode={sp.mode === "view"} />;
}
