import "server-only";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { canEditFormContent } from "../permissions";
import { loadFormStructure } from "../server/structure";
import type { BForm, BuilderStructure } from "./model";

export type BuilderVariable = { token: string; name: string; description: string | null; nature: string };

export type BuilderData = {
  form: BForm;
  structure: BuilderStructure;
  canEdit: boolean;
  numberFormat: "fr" | "en";
  family: { short_name: string; long_name: string | null; color: string } | null;
  project: { id: string; designation: string } | null;
  exportKeys: { code: string; label: string }[];
  attributeVariables: BuilderVariable[];
  lastVersion: { version_no: number; structure_rev: number } | null;
};

export async function getBuilderData(formId: string): Promise<BuilderData | null> {
  const session = await requireSession();
  const supabase = await createClient();
  const structure = await loadFormStructure(supabase, formId);
  if (!structure || structure.form.deleted_at) return null;
  const { form } = structure;
  const [role, family, project, exportKeys, fields, version] = await Promise.all([
    form.project_id
      ? supabase.from("project_members").select("role").eq("project_id", form.project_id).eq("collaborator_id", session.collaborator.id).maybeSingle()
      : Promise.resolve({ data: null }),
    form.family_id
      ? supabase.from("label_families").select("short_name, long_name, color").eq("id", form.family_id).maybeSingle()
      : Promise.resolve({ data: null }),
    form.project_id
      ? supabase.from("projects").select("id, designation").eq("id", form.project_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("export_keys").select("code, label").order("label"),
    supabase.from("custom_fields").select("variable_name, name, description, nature")
      .not("variable_name", "is", null).is("deleted_at", null).in("nature", ["project", "flow", "phase", "step"]).order("name"),
    supabase.from("form_versions").select("version_no, structure_rev").eq("form_id", formId)
      .order("version_no", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const projectRole = (role.data as { role: Parameters<typeof canEditFormContent>[2] } | null)?.role ?? null;
  return {
    form,
    structure: { rubrics: structure.rubrics, questions: structure.questions, options: structure.options, slots: structure.slots, files: structure.files },
    canEdit: canEditFormContent(form, session.collaborator, projectRole),
    numberFormat: session.organization.number_format,
    family: family.data,
    project: project.data,
    exportKeys: exportKeys.data ?? [],
    attributeVariables: (fields.data ?? []).map((f) => ({ token: `@@${f.variable_name}`, name: f.name, description: f.description, nature: f.nature })),
    lastVersion: version.data,
  };
}
