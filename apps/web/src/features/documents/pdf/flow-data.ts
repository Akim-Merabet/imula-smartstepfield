/**
 * Arbre complet d'un flow pour les documents de flow (spec 02 §5) : phases → étapes → blocs actifs
 * et leurs éléments (moyens, risques + parades, équipe, contrôles + signatures, instructions multiples,
 * objets, formulaires liés, documents liés).
 */
import { numberItems } from "@/features/flows/meta";
import type { Database, Tables } from "@/lib/supabase/database.types";
import { loadPeople, type People } from "./context";
import type { DB } from "./service-client";

type T<N extends keyof Database["public"]["Tables"]> = Tables<N>;

export type LinkedDoc = {
  id: string; document_id: string | null; is_attachment: boolean; attachment_path: string | null; attachment_name: string | null;
  document: { id: string; name: string; nature: string; ref_int: string | null; ref_ext: string | null; is_large_file: boolean } | null;
  /** Indice affiché (figé > choisi > dernier). */
  version: { id: string; index_label: string; pdf_path: string | null; state: string } | null;
  /** Fichiers d'un PDF sans version (annexes). */
  files: { storage_path: string; name: string }[];
};

export type BlockNode = T<"blocks"> & {
  emm: (T<"block_emm_items"> & { family: string | null; library: Pick<T<"library_equipments">, "subject_to_verification" | "validity_date" | "certificate_document_path" | "reference_document_path"> | null })[];
  adr: (T<"block_adr_items"> & { risk: T<"library_risks"> | null; family: string | null; parades: { name: string; description: string | null; specific: boolean; pictogram: number | null }[] })[];
  rhp: (T<"block_rhp_items"> & { fn: string | null; skills: string[] })[];
  dsi: T<"block_dsi_configs"> | null;
  signatures: T<"signatures">[];
  multi: (T<"block_multi_pr_items"> & { status: { name: string; color: string } | null; signature: T<"block_multi_pr_signatures"> | null })[];
  objects: (T<"technical_objects"> & { family: string | null })[];
  forms: (T<"form_block_links"> & { form: { id: string; name: string; reference: string | null; index_label: string | null } | null })[];
  documents: LinkedDoc[];
};

export type StepNode = T<"steps"> & { number: string; blocks: Partial<Record<T<"blocks">["type"], BlockNode>> };
export type PhaseNode = T<"phases"> & { number: string; steps: StepNode[] };
export type FlowTree = { flow: T<"flows">; phases: PhaseNode[]; people: People; responses: { id: string; reference: string; block_link_id: string | null; form_id: string; step_id: string | null; state: string }[] };

const groupBy = <X, K>(list: X[], key: (x: X) => K) => {
  const m = new Map<K, X[]>();
  for (const x of list) { const k = key(x); m.set(k, [...(m.get(k) ?? []), x]); }
  return m;
};

export async function loadFlowTree(db: DB, flowId: string, prefixes: { phase: string; step: string }): Promise<FlowTree | null> {
  const { data: flow } = await db.from("flows").select("*").eq("id", flowId).maybeSingle();
  if (!flow) return null;
  const f = flowId;
  const [phases, steps, blocks, emm, adr, rhp, dsi, sigs, multi, multiSigs, objects, links, bdocs, responses] = await Promise.all([
    db.from("phases").select("*").eq("flow_id", f).order("position"), db.from("steps").select("*").eq("flow_id", f).order("position"),
    db.from("blocks").select("*").eq("flow_id", f), db.from("block_emm_items").select("*").eq("flow_id", f).order("position"),
    db.from("block_adr_items").select("*").eq("flow_id", f).order("position"), db.from("block_rhp_items").select("*").eq("flow_id", f).order("position"),
    db.from("block_dsi_configs").select("*").eq("flow_id", f), db.from("signatures").select("*").eq("flow_id", f).order("signed_at"),
    db.from("block_multi_pr_items").select("*").eq("flow_id", f).order("position"), db.from("block_multi_pr_signatures").select("*").eq("flow_id", f),
    db.from("block_object_items").select("*").eq("flow_id", f).order("position"), db.from("form_block_links").select("*").eq("flow_id", f).order("position"),
    db.from("block_documents").select("*").eq("flow_id", f).order("position"),
    db.from("form_responses").select("id, reference, block_link_id, form_id, step_id, state").eq("flow_id", flowId).is("deleted_at", null).order("created_at"),
  ]);
  const ids = <X,>(list: X[] | null, f: (x: X) => string | null | undefined) => [...new Set((list ?? []).map(f).filter((x): x is string => !!x))];
  const familyIds = [...ids(emm.data, (x) => x.family_id), ...ids(rhp.data, (x) => x.function_family_id)];
  const riskIds = ids(adr.data, (x) => x.library_risk_id);
  const eqIds = ids(emm.data, (x) => x.library_equipment_id);
  const objIds = ids(objects.data, (x) => x.technical_object_id);
  const formIds = ids(links.data, (x) => x.form_id);
  const docIds = ids(bdocs.data, (x) => x.document_id);
  const statusIds = ids(multi.data, (x) => x.custom_status_id);
  const rhpIds = ids(rhp.data, (x) => x.id);
  const [risks, parades, specific, eqs, objs, forms, docs, statuses, skills] = await Promise.all([
    riskIds.length ? db.from("library_risks").select("*").in("id", riskIds) : Promise.resolve({ data: [] as T<"library_risks">[] }),
    riskIds.length ? db.from("library_risk_parades").select("*").in("risk_id", riskIds).order("position") : Promise.resolve({ data: [] as T<"library_risk_parades">[] }),
    db.from("block_adr_specific_parades").select("*").eq("flow_id", flowId).order("position"),
    eqIds.length ? db.from("library_equipments").select("id, subject_to_verification, validity_date, certificate_document_path, reference_document_path").in("id", eqIds) : Promise.resolve({ data: [] }),
    objIds.length ? db.from("technical_objects").select("*").in("id", objIds) : Promise.resolve({ data: [] as T<"technical_objects">[] }),
    formIds.length ? db.from("forms").select("id, name, reference, index_label").in("id", formIds) : Promise.resolve({ data: [] }),
    docIds.length ? db.from("documents").select("id, name, nature, ref_int, ref_ext, is_large_file").in("id", docIds) : Promise.resolve({ data: [] }),
    statusIds.length ? db.from("custom_statuses").select("id, name, color").in("id", statusIds) : Promise.resolve({ data: [] }),
    rhpIds.length ? db.from("block_rhp_item_skills").select("item_id, skill_family_id").in("item_id", rhpIds) : Promise.resolve({ data: [] as { item_id: string; skill_family_id: string }[] }),
  ]);
  const allFamilyIds = [...new Set([...familyIds, ...ids(risks.data, (x) => x.family_id), ...ids(objs.data, (x) => x.family_id), ...ids(skills.data, (x) => x.skill_family_id)])];
  const [{ data: families }, { data: versions }, { data: files }] = await Promise.all([
    allFamilyIds.length ? db.from("label_families").select("id, short_name, long_name").in("id", allFamilyIds) : Promise.resolve({ data: [] as { id: string; short_name: string; long_name: string | null }[] }),
    docIds.length ? db.from("document_versions").select("id, document_id, index_label, pdf_path, state, seq, is_last").in("document_id", docIds) : Promise.resolve({ data: [] as { id: string; document_id: string; index_label: string; pdf_path: string | null; state: string; seq: number; is_last: boolean }[] }),
    docIds.length ? db.from("document_files").select("document_id, storage_path, name, position").in("document_id", docIds).is("version_id", null).order("position") : Promise.resolve({ data: [] as { document_id: string; storage_path: string; name: string; position: number }[] }),
  ]);
  const fam = (id: string | null | undefined) => {
    const f = families?.find((x) => x.id === id);
    return f ? f.short_name : null;
  };

  const blocksByStep = groupBy(blocks.data ?? [], (b) => b.step_id);
  const nodeOf = (b: T<"blocks">): BlockNode => ({
    ...b,
    emm: (emm.data ?? []).filter((x) => x.block_id === b.id && !x.disabled).map((x) => ({
      ...x, family: fam(x.family_id),
      library: ((eqs.data ?? []) as BlockNode["emm"][number]["library"][]).find((e) => (e as { id?: string } | null)?.id === x.library_equipment_id) ?? null,
    })),
    adr: (adr.data ?? []).filter((x) => x.block_id === b.id && !x.disabled).map((x) => {
      const risk = risks.data?.find((r) => r.id === x.library_risk_id) ?? null;
      return {
        ...x, risk, family: fam(risk?.family_id),
        parades: [
          ...(parades.data ?? []).filter((p) => p.risk_id === x.library_risk_id).map((p) => ({ name: p.name, description: p.description, specific: false, pictogram: p.pictogram })),
          ...(specific.data ?? []).filter((p) => p.block_adr_item_id === x.id).map((p) => ({ name: p.name, description: null, specific: true, pictogram: p.pictogram })),
        ],
      };
    }),
    rhp: (rhp.data ?? []).filter((x) => x.block_id === b.id && !x.disabled).map((x) => ({
      ...x, fn: fam(x.function_family_id), skills: (skills.data ?? []).filter((s) => s.item_id === x.id).map((s) => fam(s.skill_family_id) ?? "").filter(Boolean),
    })),
    dsi: dsi.data?.find((x) => x.block_id === b.id) ?? null,
    signatures: (sigs.data ?? []).filter((x) => x.block_id === b.id && !x.disabled),
    multi: (multi.data ?? []).filter((x) => x.block_id === b.id && !x.disabled && !x.hide_on_export).map((x) => ({
      ...x, status: (statuses.data ?? []).find((st) => st.id === x.custom_status_id) ?? null,
      signature: multiSigs.data?.find((sg) => sg.item_id === x.id) ?? null,
    })),
    objects: (objects.data ?? []).filter((x) => x.block_id === b.id).map((x) => objs.data?.find((o) => o.id === x.technical_object_id))
      .filter((o): o is T<"technical_objects"> => !!o).map((o) => ({ ...o, family: fam(o.family_id) })),
    forms: (links.data ?? []).filter((x) => x.block_id === b.id && x.enabled).map((x) => ({ ...x, form: forms.data?.find((f) => f.id === x.form_id) ?? null })),
    documents: (bdocs.data ?? []).filter((x) => x.block_id === b.id).map((x) => {
      const doc = docs.data?.find((d) => d.id === x.document_id) ?? null;
      const vs = (versions ?? []).filter((v) => v.document_id === x.document_id).sort((a, z) => z.seq - a.seq);
      const pick = vs.find((v) => v.id === x.frozen_version_id) ?? vs.find((v) => v.id === x.pinned_version_id) ?? vs.find((v) => v.is_last) ?? null;
      return {
        id: x.id, document_id: x.document_id, is_attachment: x.is_attachment, attachment_path: x.attachment_path, attachment_name: x.attachment_name,
        document: doc, version: pick ? { id: pick.id, index_label: pick.index_label, pdf_path: pick.pdf_path, state: pick.state } : null,
        files: (files ?? []).filter((f) => f.document_id === x.document_id).map((f) => ({ storage_path: f.storage_path, name: f.name })),
      };
    }),
  });

  const activePhases = (phases.data ?? []).filter((p) => !p.disabled);
  const phaseNumbers = numberItems(activePhases, prefixes.phase);
  const tree: PhaseNode[] = activePhases.map((p) => {
    const ps = (steps.data ?? []).filter((s) => s.phase_id === p.id && !s.disabled);
    const stepNumbers = numberItems(ps, prefixes.step);
    return {
      ...p, number: phaseNumbers.get(p.id) ?? "",
      steps: ps.map((s) => {
        const blocksOf: StepNode["blocks"] = {};
        for (const b of blocksByStep.get(s.id) ?? []) if (b.enabled) blocksOf[b.type] = nodeOf(b);
        return { ...s, number: `${phaseNumbers.get(p.id) ?? ""}${stepNumbers.get(s.id) ?? ""}`, blocks: blocksOf };
      }),
    };
  });
  const people = await loadPeople(db, [...(sigs.data ?? []).map((x) => x.signatory_id), ...(multiSigs.data ?? []).map((x) => x.signatory_id)]);
  return { flow, phases: tree, people, responses: responses.data ?? [] };
}
