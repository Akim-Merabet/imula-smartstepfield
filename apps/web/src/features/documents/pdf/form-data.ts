/**
 * Données des documents de formulaire : structure figée (form_versions.structure), réponses (valeurs,
 * observations, items dynamiques) et métadonnées d'en-tête.
 */
import type { DynamicItem, FormDefinition } from "@/features/forms/types";
import type { DB } from "./service-client";

export type ResponseMeta = {
  id: string;
  reference: string;
  state: "in_progress" | "done";
  status: string | null;
  formIndex: string | null;
  createdAt: string;
  doneAt: string | null;
  author: string | null;
  flow: string | null;
  location: string | null;
};

export type FormEntry = {
  definition: FormDefinition;
  formName: string;
  /** null = formulaire vierge. */
  response: (ResponseMeta & {
    values: Record<string, unknown>;
    observations: Record<string, string>;
    items: DynamicItem[];
  }) | null;
};

/** Structure de la version courante (ou la plus récente) d'un formulaire. */
export async function loadFormDefinition(db: DB, formId: string): Promise<{ definition: FormDefinition; name: string } | null> {
  const { data: form } = await db.from("forms").select("id, name, current_version_id").eq("id", formId).maybeSingle();
  if (!form) return null;
  let structure: unknown = null;
  if (form.current_version_id) {
    const { data } = await db.from("form_versions").select("structure").eq("id", form.current_version_id).maybeSingle();
    structure = data?.structure ?? null;
  }
  if (!structure) {
    const { data } = await db.from("form_versions").select("structure").eq("form_id", formId).order("version_no", { ascending: false }).limit(1).maybeSingle();
    structure = data?.structure ?? null;
  }
  return structure ? { definition: structure as FormDefinition, name: form.name } : null;
}

/** Réponses complètes (ordre donné ; réponses supprimées ignorées). */
export async function loadResponses(db: DB, responseIds: string[]): Promise<FormEntry[]> {
  if (!responseIds.length) return [];
  const { data: responses } = await db.from("form_responses")
    .select("id, form_id, form_version_id, reference, state, created_at, done_at, form_index_label, custom_status_id, created_by, flow_id, phase_id, step_id")
    .in("id", responseIds).is("deleted_at", null);
  if (!responses?.length) return [];
  const versionIds = [...new Set(responses.map((r) => r.form_version_id))];
  const formIds = [...new Set(responses.map((r) => r.form_id))];
  const statusIds = [...new Set(responses.map((r) => r.custom_status_id).filter((x): x is string => !!x))];
  const authorIds = [...new Set(responses.map((r) => r.created_by).filter((x): x is string => !!x))];
  const flowIds = [...new Set(responses.map((r) => r.flow_id).filter((x): x is string => !!x))];
  const stepIds = [...new Set(responses.map((r) => r.step_id).filter((x): x is string => !!x))];
  const [{ data: versions }, { data: forms }, { data: statuses }, { data: authors }, { data: flows }, { data: steps }, { data: values }, { data: items }] = await Promise.all([
    db.from("form_versions").select("id, structure").in("id", versionIds),
    db.from("forms").select("id, name").in("id", formIds),
    statusIds.length ? db.from("custom_statuses").select("id, name").in("id", statusIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    authorIds.length ? db.from("collaborators").select("id, first_name, last_name").in("id", authorIds) : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    flowIds.length ? db.from("flows").select("id, name, ref_int").in("id", flowIds) : Promise.resolve({ data: [] as { id: string; name: string; ref_int: string | null }[] }),
    stepIds.length ? db.from("steps").select("id, name, phase:phases(name)").in("id", stepIds) : Promise.resolve({ data: [] as { id: string; name: string; phase: { name: string } | null }[] }),
    db.from("form_response_values").select("response_id, option_lineage_id, question_lineage_id, value_json, observation").in("response_id", responses.map((r) => r.id)),
    db.from("form_response_dynamic_items").select("*").in("response_id", responses.map((r) => r.id)).order("position"),
  ]);
  const byId = new Map(responses.map((r) => [r.id, r]));
  return responseIds.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r).flatMap((r) => {
    const v = versions?.find((x) => x.id === r.form_version_id);
    if (!v) return [];
    const vals: Record<string, unknown> = {};
    const obs: Record<string, string> = {};
    for (const row of values ?? []) {
      if (row.response_id !== r.id) continue;
      vals[row.option_lineage_id] = row.value_json;
      if (row.observation) obs[row.question_lineage_id] = row.observation;
    }
    const a = authors?.find((x) => x.id === r.created_by);
    const f = flows?.find((x) => x.id === r.flow_id);
    const st = steps?.find((x) => x.id === r.step_id) as { name: string; phase: { name: string } | null } | undefined;
    return [{
      definition: v.structure as unknown as FormDefinition,
      formName: forms?.find((x) => x.id === r.form_id)?.name ?? (v.structure as unknown as FormDefinition).name,
      response: {
        id: r.id, reference: r.reference, state: r.state, status: statuses?.find((s) => s.id === r.custom_status_id)?.name ?? null,
        formIndex: r.form_index_label, createdAt: r.created_at, doneAt: r.done_at, author: a ? `${a.first_name} ${a.last_name}` : null,
        flow: f ? [f.ref_int, f.name].filter(Boolean).join(" - ") : null,
        location: st ? [st.phase?.name, st.name].filter(Boolean).join(" › ") : null,
        values: vals, observations: obs,
        items: (items ?? []).filter((i) => i.response_id === r.id).map((i) => ({
          id: i.id, rubricLineageId: i.rubric_lineage_id, kind: i.kind as "question" | "option", parentLineageId: i.parent_lineage_id,
          templateLineageId: i.template_lineage_id, lineageId: i.lineage_id, position: i.position, name: i.name,
        })),
      },
    }];
  });
}
