import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type DB = SupabaseClient<Database>;
export type DynamicContext = Record<string, string | number | null>;

const s = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const fullName = (c: { first_name: string; last_name: string } | null | undefined) => (c ? `${c.first_name} ${c.last_name}` : null);

/**
 * Résout les variables dynamiques (spec 03 §3.5.1) au moment de la création de la réponse.
 * Clés = jetons `@@Nom` (casse d'origine) ; attributs personnalisés = `@@<variable_name>`.
 */
export async function buildDynamicContext(supabase: DB, input: {
  projectId: string; flowId?: string | null; phaseId?: string | null; stepId?: string | null;
  form: { additional_comment: string | null }; reference: string; collaborator: { first_name: string; last_name: string };
}): Promise<DynamicContext> {
  const ctx: DynamicContext = {};
  const { data: p } = await supabase.from("projects").select(`*, family:label_families!projects_family_id_fkey(short_name),
    client:clients(name, name_2, name_3)`).eq("id", input.projectId).maybeSingle();
  if (p) {
    const client = p.client as { name: string; name_2: string | null; name_3: string | null } | null;
    Object.assign(ctx, {
      "@@ProjectDesignation": s(p.designation), "@@ProjectNoCase": s(p.business_ref), "@@ProjectNoContract": s(p.contract_ref),
      "@@ProjectClientName1": s(client?.name), "@@ProjectClientName2": s(client?.name_2), "@@ProjectClientName3": s(client?.name_3),
      "@@ProjectLocation": s(p.location_label), "@@ProjectDescription": s(p.description),
      "@@ProjectSupervision1": s(p.supervision_1), "@@ProjectSupervision2": s(p.supervision_2), "@@ProjectSupervision3": s(p.supervision_3),
      "@@ProjectInternalSupervision1": s(p.supervision_intern_1), "@@ProjectInternalSupervision2": s(p.supervision_intern_2),
      "@@ProjectInternalSupervision3": s(p.supervision_intern_3), "@@ProjectInternalOrder": s(p.internal_command),
      "@@ProjectExternalOrder": s(p.external_command), "@@ProjectNoMarket": s(p.market_number),
      "@@ProjectTechnicalCase": s(p.technical_deal), "@@ProjectKeywords": s(p.keywords), "@@ProjectBusinessField": s(p.business_domain),
      "@@ProjectNationalProgram": s(p.national_program), "@@ProjectFamily": s((p.family as { short_name: string } | null)?.short_name),
    });
  }

  if (input.flowId) {
    const { data: f } = await supabase.from("flows").select(`*,
      family:label_families!flows_family_id_fkey(short_name), category:label_families!flows_category_id_fkey(short_name),
      status:custom_statuses(name), reporter:collaborators!flows_reporter_id_fkey(first_name, last_name),
      object:technical_objects(name),
      t1:tablets!flows_tablet_1_id_fkey(name), t2:tablets!flows_tablet_2_id_fkey(name), t3:tablets!flows_tablet_3_id_fkey(name)`)
      .eq("id", input.flowId).maybeSingle();
    if (f) {
      const { data: assignees } = await supabase.from("flow_assignees").select("collaborator:collaborators(first_name, last_name)").eq("flow_id", f.id);
      const { data: geo } = await supabase.from("flow_geometries").select("kind, geojson, altitude").eq("flow_id", f.id).eq("kind", "point").limit(1).maybeSingle();
      const coords = (geo?.geojson as { coordinates?: number[] } | null)?.coordinates;
      const rel = (x: unknown) => (x as { name?: string; short_name?: string } | null);
      Object.assign(ctx, {
        "@@FlowName": s(f.name), "@@FlowDescription": s(f.description), "@@FlowFamily": s(rel(f.family)?.short_name),
        "@@FlowCategory": s(rel(f.category)?.short_name), "@@FlowStatus": s(rel(f.status)?.name),
        "@@FlowSite": s(f.location_site), "@@FlowUnit": s(f.location_area), "@@FlowLocal": s(f.location_local),
        "@@FlowElementarySystem": s(f.elementary_system), "@@FlowFunctionalLandmark": s(f.functional_marker),
        "@@FlowTechnicalObject": s(f.technical_object_label ?? rel(f.object)?.name), "@@FlowChrono": s(f.ref_int),
        "@@FlowEpsilonFolderRef": s(f.ref_ext),
        "@@FlowRapporteur": fullName(f.reporter as { first_name: string; last_name: string } | null),
        "@@FlowResponsable": s((assignees ?? []).map((a) => fullName(a.collaborator as { first_name: string; last_name: string } | null)).filter(Boolean).join(", ")),
        "@@FlowTablette1": s(rel(f.t1)?.name), "@@FlowTablette2": s(rel(f.t2)?.name), "@@FlowTablette3": s(rel(f.t3)?.name),
        "@@FlowDateDebut": s(f.start_date), "@@FlowDateFin": s(f.finish_date),
        "@@FlowGeometryCoordinateLng": coords?.[0] ?? null, "@@FlowGeometryCoordinateLat": coords?.[1] ?? null,
        "@@FlowGeometryCoordinateAlt": geo?.altitude ?? null,
        "@@FlowInternalSupervision1": s(f.internal_supervisor_name_1), "@@FlowInternalSupervision2": s(f.internal_supervisor_name_2),
        "@@FlowInternalSupervision3": s(f.internal_supervisor_name_3), "@@FlowExternalSupervision1": s(f.external_supervisor_name_1),
        "@@FlowExternalSupervision2": s(f.external_supervisor_name_2), "@@FlowExternalSupervision3": s(f.external_supervisor_name_3),
      });
    }
  }
  if (input.phaseId) {
    const { data: ph } = await supabase.from("phases").select("position, custom_number, name, description, additional_comment").eq("id", input.phaseId).maybeSingle();
    if (ph) Object.assign(ctx, {
      "@@CurrPhaseNumber": s(ph.custom_number ?? ph.position), "@@CurrPhaseName": s(ph.name),
      "@@CurrPhaseDescription": s(ph.description), "@@AdditionalStatementPhase": s(ph.additional_comment),
    });
  }
  if (input.stepId) {
    const { data: st } = await supabase.from("steps").select("position, custom_number, name, description, additional_comment").eq("id", input.stepId).maybeSingle();
    if (st) Object.assign(ctx, {
      "@@CurrStepNumber": s(st.custom_number ?? st.position), "@@CurrStepName": s(st.name),
      "@@CurrStepDescription": s(st.description), "@@AdditionalStatementStep": s(st.additional_comment),
    });
  }

  Object.assign(ctx, {
    "@@refResponse": input.reference, "@@currentCollaborator": fullName(input.collaborator),
    "@@externalCollaboratorLastName": null, "@@externalCollaboratorFirstName": null,
    "@@externalCollaboratorCompany": null, "@@externalCollaboratorJob": null,
    "@@AdditionalStatementForm": s(input.form.additional_comment),
  });

  // Attributs personnalisés (projet / flow / phase / étape) ayant un nom de variable.
  const objectIds = [input.projectId, input.flowId, input.phaseId, input.stepId].filter((x): x is string => !!x);
  const { data: fields } = await supabase.from("custom_fields").select("id, variable_name")
    .not("variable_name", "is", null).is("deleted_at", null);
  if (fields?.length) {
    const { data: values } = await supabase.from("custom_field_values").select("custom_field_id, value_text, value_json")
      .in("object_id", objectIds).in("custom_field_id", fields.map((f) => f.id));
    for (const f of fields) {
      const v = values?.find((x) => x.custom_field_id === f.id);
      const raw = v?.value_text ?? (Array.isArray(v?.value_json) ? (v!.value_json as string[]).join(", ") : null);
      ctx[`@@${f.variable_name}`] = s(raw);
    }
  }
  return ctx;
}
