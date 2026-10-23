/**
 * Documents de formulaire (project_form, block_form, multi_flow_form, field_feedback) et de module
 * (lfa, lda, listes de moyens / risques, lca, diagramme) — rendus simples en tableaux.
 */
import { Text, View } from "@react-pdf/renderer";
import { pdfDate } from "@/lib/pdf/i18n";
import { Band, DocPage, Muted, SubBand, Table } from "@/lib/pdf/primitives";
import { PDF_COLORS, s } from "@/lib/pdf/theme";
import { contentLayout, stateLabel, type GenContext } from "./context";
import { loadFormDefinition, loadResponses, type FormEntry } from "./form-data";
import { prepareFormImages, renderFormEntry } from "./form-render";
import type { NatureOutput } from "./flow-render";

const FORM_TYPES = { cover: "COVER_PAGE", follow: "PAGE_CONTENT_SUIVI", portrait: "FORM_GENERIC", landscape: "FORM_GENERIC_H" };
const DOC_TYPES = { cover: "COVER_PAGE", follow: "PAGE_CONTENT_SUIVI", portrait: "PAGE_CONTENT_V", landscape: "PAGE_CONTENT_H" };

async function selections(ctx: GenContext, kind: "flow" | "document" | "skill" | "form_response") {
  const { data } = await ctx.db.from("document_selections").select("ref_id").eq("document_id", ctx.doc.id).eq("kind", kind).order("position");
  return (data ?? []).map((x) => x.ref_id);
}

/** Documents de formulaire : réponse(s) sélectionnée(s), toutes les réponses ou formulaire vierge. */
export async function renderFormDocument(ctx: GenContext): Promise<NatureOutput> {
  const { doc, db } = ctx;
  const strategy = doc.responses_strategy ?? "all";
  const env = { ...contentLayout(ctx, FORM_TYPES.portrait, FORM_TYPES.landscape), t: ctx.t, font: ctx.font };
  const entries: FormEntry[] = [];
  let responseIds: string[] = [];
  if (doc.nature === "field_feedback") {
    const { data } = await db.from("form_responses").select("id").eq("project_id", doc.project_id!).is("deleted_at", null).order("created_at");
    responseIds = (data ?? []).map((r) => r.id);
  } else if (doc.linked_form_id && strategy !== "none" && !ctx.withoutFieldData) {
    if (strategy === "selected") {
      responseIds = await selections(ctx, "form_response");
      if (!responseIds.length && doc.linked_response_id) responseIds = [doc.linked_response_id];
    } else {
      let q = db.from("form_responses").select("id").eq("form_id", doc.linked_form_id).is("deleted_at", null).order("created_at");
      if (doc.nature === "block_form" && doc.linked_flow_id) q = q.eq("flow_id", doc.linked_flow_id);
      else if (doc.nature === "multi_flow_form") q = q.in("flow_id", await selections(ctx, "flow"));
      else if (doc.project_id) q = q.eq("project_id", doc.project_id);
      const { data } = await q;
      responseIds = (data ?? []).map((r) => r.id);
    }
  }
  const responses = await loadResponses(db, responseIds);
  const wantBlank = doc.linked_form_id && (strategy === "none" || ctx.withoutFieldData || ctx.options.include_skeleton_form || !responses.length);
  if (wantBlank && doc.linked_form_id) {
    const def = await loadFormDefinition(db, doc.linked_form_id);
    if (def) entries.push({ definition: def.definition, formName: def.name, response: null });
  }
  entries.push(...responses);
  const images = await prepareFormImages(entries, ctx.assets);
  const includeEmpty = !!ctx.options.include_empty_option;
  const pages = entries.flatMap((e, i) => renderFormEntry(e, env, { includeEmpty: e.response ? includeEmpty : true }, images, `f${i}`));
  if (!pages.length) {
    pages.push(<DocPage key="empty" frame={env.frameFor(false)} margins={env.marginsFor(false)} font={ctx.font}><Muted>{ctx.t("form.noResponse")}</Muted></DocPage>);
  }
  return { types: FORM_TYPES, pages, annexes: [] };
}

function simplePage(ctx: GenContext, key: string, title: string, body: React.ReactNode, landscape = false) {
  const layout = contentLayout(ctx, DOC_TYPES.portrait, DOC_TYPES.landscape);
  return (
    <DocPage key={key} landscape={landscape} frame={layout.frameFor(landscape)} margins={layout.marginsFor(landscape)} font={ctx.font}>
      <Band>{title}</Band>
      {body}
    </DocPage>
  );
}

/** Natures de module : tableaux simples. */
export async function renderModuleDocument(ctx: GenContext): Promise<NatureOutput> {
  const { doc, db, t } = ctx;
  const title = t.doc(`natures.${doc.nature}`);
  switch (doc.nature) {
    case "lfa": {
      const ids = await selections(ctx, "flow");
      const { data } = ids.length ? await db.from("flows").select("id, name, ref_int, flow_type, start_date, finish_date, family:label_families!flows_family_id_fkey(short_name), status:custom_statuses(name)").in("id", ids) : { data: [] };
      const rows = (data ?? []) as unknown as { id: string; name: string; ref_int: string | null; flow_type: string; start_date: string | null; finish_date: string | null; family: { short_name: string } | null; status: { name: string } | null }[];
      return {
        types: DOC_TYPES, annexes: [],
        pages: [simplePage(ctx, "lfa", title, (
          <Table columns={[{ key: "ref", label: t.b("module.reference"), flex: 1 }, { key: "name", label: t.b("module.name"), flex: 2 }, { key: "family", label: t.b("emm.family"), flex: 1 },
            { key: "status", label: t.b("form.status"), flex: 1 }, { key: "start", label: t.b("module.start"), width: 60 }, { key: "end", label: t.b("module.end"), width: 60 }]}
            emptyLabel={t("flow.noItem")}
            rows={ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r)
              .map((r) => [r.ref_int ?? "", r.name, r.family?.short_name ?? "", r.status?.name ?? "", pdfDate(r.start_date, t.locale), pdfDate(r.finish_date, t.locale)])} />
        ))],
      };
    }
    case "lda": {
      const ids = await selections(ctx, "document");
      const [{ data: docs }, { data: versions }] = await Promise.all([
        ids.length ? db.from("documents").select("id, name, ref_int, ref_ext, nature").in("id", ids) : Promise.resolve({ data: [] as { id: string; name: string; ref_int: string | null; ref_ext: string | null; nature: string }[] }),
        ids.length ? db.from("document_versions").select("document_id, index_label, state, step, diffusion_date").in("document_id", ids).eq("is_last", true) : Promise.resolve({ data: [] as { document_id: string; index_label: string; state: "prel"; step: null; diffusion_date: string | null }[] }),
      ]);
      const hide = !!ctx.options.lda_hide_index_column;
      return {
        types: { ...DOC_TYPES, cover: "COVER_PAGE_LDA" }, annexes: [],
        pages: [simplePage(ctx, "lda", title, (
          <Table columns={[{ key: "ref", label: t.b("cover.refInt"), flex: 1.2 }, { key: "ext", label: t.b("cover.refExt"), flex: 1 }, { key: "name", label: t.b("module.name"), flex: 2 },
            { key: "type", label: t.b("module.type"), flex: 1.2 }, { key: "index", label: t.b("cover.index"), width: 40 }, { key: "state", label: t.b("cover.state"), width: 56 },
            { key: "date", label: t.b("cover.date"), width: 56 }]}
            emptyLabel={t("flow.noItem")}
            rows={ids.map((id) => docs?.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => !!d).map((d) => {
              const v = versions?.find((x) => x.document_id === d.id);
              return [d.ref_int ?? "", d.ref_ext ?? "", d.name, t.doc(`natures.${d.nature}`), hide || !v ? "" : v.index_label,
                hide || !v ? "" : stateLabel(ctx, v as never).label, hide || !v ? "" : pdfDate(v.diffusion_date, t.locale)];
            })} />
        ))],
      };
    }
    case "list_emm": case "list_adr": case "list_emm_flow": case "list_adr_flow": {
      const emm = doc.nature.startsWith("list_emm");
      let items: { family: string; name: string; ref: string; extra: string; qty: string }[] = [];
      if (doc.nature === "list_emm" || doc.nature === "list_adr") {
        const { data } = doc.linked_list_id ? await db.from("project_list_items").select("quantity, unit, comment, display_comment, equipment:library_equipments(name, reference, provider), risk:library_risks(name, source, reference)").eq("list_id", doc.linked_list_id).order("position") : { data: [] };
        items = ((data ?? []) as unknown as { quantity: number | null; unit: string | null; equipment: { name: string; reference: string | null; provider: string | null } | null; risk: { name: string; source: string | null; reference: string | null } | null }[])
          .map((x) => ({ family: "", name: x.equipment?.name ?? x.risk?.name ?? "", ref: x.equipment?.reference ?? x.risk?.reference ?? "", extra: x.equipment?.provider ?? x.risk?.source ?? "", qty: [x.quantity, x.unit].filter((v) => v !== null).join(" ") }));
      } else {
        const flows = await selections(ctx, "flow");
        if (flows.length && emm) {
          const { data } = await db.from("block_emm_items").select("name, reference, provider, quantity, unit").in("flow_id", flows).eq("disabled", false);
          items = (data ?? []).map((x) => ({ family: "", name: x.name, ref: x.reference ?? "", extra: x.provider ?? "", qty: [x.quantity, x.unit].filter((v) => v !== null).join(" ") }));
        } else if (flows.length) {
          const { data } = await db.from("block_adr_items").select("major, risk:library_risks(name, source, reference)").in("flow_id", flows).eq("disabled", false);
          items = ((data ?? []) as unknown as { major: boolean; risk: { name: string; source: string | null; reference: string | null } | null }[])
            .map((x) => ({ family: "", name: x.risk?.name ?? "", ref: x.risk?.reference ?? "", extra: x.risk?.source ?? "", qty: x.major ? t("adr.major") : "" }));
        }
      }
      return {
        types: DOC_TYPES, annexes: [],
        pages: [simplePage(ctx, "list", title, (
          <Table columns={[{ key: "name", label: t.b(emm ? "emm.name" : "adr.risk"), flex: 2 }, { key: "ref", label: t.b("emm.reference"), flex: 1 },
            { key: "extra", label: t.b(emm ? "emm.provider" : "adr.source"), flex: 1.2 }, { key: "qty", label: t.b(emm ? "emm.quantity" : "adr.major"), width: 70 }]}
            emptyLabel={t("flow.noItem")} rows={items.map((x) => [x.name, x.ref, x.extra, x.qty])} />
        ))],
      };
    }
    case "lca": {
      const { data } = await db.from("project_members").select("role, collaborator:collaborators(first_name, last_name, email, profession, company:companies(name))").eq("project_id", doc.project_id!);
      const rows = ((data ?? []) as unknown as { role: string; collaborator: { first_name: string; last_name: string; email: string | null; profession: string | null; company: { name: string } | null } | null }[])
        .filter((r) => r.collaborator);
      return {
        types: { ...DOC_TYPES, cover: "COVER_PAGE_LCA", landscape: "PAGE_H_LCA" }, annexes: [],
        pages: [simplePage(ctx, "lca", title, (
          <Table columns={[{ key: "name", label: t.b("module.name"), flex: 1.6 }, { key: "company", label: t.b("dsi.company"), flex: 1.2 },
            { key: "profession", label: t.b("module.profession"), flex: 1.2 }, { key: "email", label: t.b("module.email"), flex: 1.6 }, { key: "role", label: t.b("module.role"), width: 70 }]}
            emptyLabel={t("flow.noItem")}
            rows={rows.map((r) => [`${r.collaborator!.first_name} ${r.collaborator!.last_name}`, r.collaborator!.company?.name ?? "", r.collaborator!.profession ?? "", r.collaborator!.email ?? "", r.role])} />
        ))],
      };
    }
    case "diagram": {
      const { data: diagram } = doc.linked_diagram_id ? await db.from("diagrams").select("name, config").eq("id", doc.linked_diagram_id).maybeSingle() : { data: null };
      const { data: links } = doc.linked_diagram_id ? await db.from("diagram_flows").select("flow:flows(name, ref_int, flow_type)").eq("diagram_id", doc.linked_diagram_id) : { data: [] };
      const flows = ((links ?? []) as unknown as { flow: { name: string; ref_int: string | null; flow_type: string } | null }[]).map((l) => l.flow).filter((f): f is NonNullable<typeof f> => !!f);
      const config = (diagram?.config ?? { nodes: [], edges: [] }) as { nodes?: { id: string; data?: { label?: string } }[]; edges?: { source: string; target: string }[] };
      const labelOf = (id: string) => config.nodes?.find((n) => n.id === id)?.data?.label ?? id.slice(0, 8);
      return {
        types: { ...DOC_TYPES, cover: "COVER_PAGE_DIAGRAM", follow: "PAGE_CONTENT_SUIVI_DIAGRAM", landscape: "PAGE_H_DIAGRAM" }, annexes: [],
        pages: [simplePage(ctx, "diagram", `${title} — ${diagram?.name ?? ""}`, (
          <View>
            <SubBand>{t.b("module.diagramFlows")}</SubBand>
            <Table columns={[{ key: "ref", label: t.b("module.reference"), flex: 1 }, { key: "name", label: t.b("module.name"), flex: 2 }]}
              emptyLabel={t("flow.noItem")} rows={flows.map((f) => [f.ref_int ?? "", f.name])} />
            {config.edges?.length ? (
              <View>
                <SubBand>{t.b("module.diagramLinks")}</SubBand>
                {config.edges.map((e, i) => <Text key={i} style={s.small}>{labelOf(e.source)}  →  {labelOf(e.target)}</Text>)}
              </View>
            ) : null}
            <Text style={[s.small, { color: PDF_COLORS.muted, marginTop: 8 }]}>{t("module.diagramNote")}</Text>
          </View>
        ), true)],
      };
    }
    default:
      return { types: DOC_TYPES, annexes: [], pages: [simplePage(ctx, "na", title, <Muted>{t("flow.empty")}</Muted>)] };
  }
}
