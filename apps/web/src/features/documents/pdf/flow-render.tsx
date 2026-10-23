/**
 * Documents de flow (spec 04 §3.4.1, spec 02 §5) : Instructions, Moyens, Risques, Contrôles,
 * Instructions multiples, Objets, Formulaires. Chaque fonction renvoie les pages de contenu et les annexes.
 */
import { Text, View } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { applicableSupervisors, expectedNatures, natureCode, supervisorName, type SignatureNature, type SupervisionFlow } from "@/features/flows/meta";
import { pdfDate } from "@/lib/pdf/i18n";
import type { PdfImage } from "@/lib/pdf/images";
import { Band, DocPage, Muted, SignatureCell, SubBand, Table } from "@/lib/pdf/primitives";
import { collectImageSources, isRichEmpty, parseRichContent, type RichBlock } from "@/lib/pdf/rich-text";
import { renderRichBlocks } from "@/lib/pdf/rich-text-pdf";
import { A4, DEFAULT_MARGINS, PDF_COLORS, s } from "@/lib/pdf/theme";
import { contentLayout, type GenContext } from "./context";
import { loadFormDefinition, loadResponses, type FormEntry } from "./form-data";
import { loadFlowTree, type BlockNode, type FlowTree, type StepNode } from "./flow-data";
import { prepareFormImages, renderFormEntry, type PageEnv } from "./form-render";

export type Annex =
  | { title: string; kind: "pages"; pages: ReactElement[] }
  | { title: string; kind: "pdf"; bucket: string; path: string };

export type NatureOutput = {
  /** Types de trame. */
  types: { cover: string; follow: string; portrait: string; landscape: string };
  pages: ReactElement[];
  annexes: Annex[];
  /** Message si le contenu est vide (le document reste généré). */
  empty?: boolean;
};

const DOC_TYPES = { cover: "COVER_PAGE", follow: "PAGE_CONTENT_SUIVI", portrait: "PAGE_CONTENT_V", landscape: "PAGE_CONTENT_H" };

type Env = PageEnv & { ctx: GenContext; tree: FlowTree; images: Map<string, PdfImage>; width: number; opt: (k: string) => boolean };

function envFor(ctx: GenContext, tree: FlowTree, types: NatureOutput["types"], images: Map<string, PdfImage>): Env {
  const layout = contentLayout(ctx, types.portrait, types.landscape);
  const m = layout.marginsFor(false) ?? DEFAULT_MARGINS;
  return {
    ctx, tree, images, t: ctx.t, font: ctx.font, marginsFor: layout.marginsFor, frameFor: layout.frameFor,
    width: A4.width - m.left - m.right, opt: (k) => !!ctx.options[k],
  };
}

const richOf = (b: { content_json: unknown; content_html: string | null }): RichBlock[] => parseRichContent(b.content_json ?? b.content_html);

async function preloadImages(ctx: GenContext, tree: FlowTree): Promise<Map<string, PdfImage>> {
  const srcs = new Set<string>();
  for (const p of tree.phases) for (const st of p.steps) for (const b of Object.values(st.blocks)) {
    if (!b) continue;
    collectImageSources(richOf(b)).forEach((x) => srcs.add(x));
    for (const it of b.multi) {
      collectImageSources(richOf(it)).forEach((x) => srcs.add(x));
      if (it.signature?.signature_path) srcs.add(it.signature.signature_path);
    }
    for (const sg of b.signatures) if (sg.signature_path) srcs.add(sg.signature_path);
  }
  const out = new Map<string, PdfImage>();
  await Promise.all([...srcs].map(async (src) => {
    const img = await ctx.assets.image(src, "documents");
    if (img) out.set(src, img);
  }));
  return out;
}

// ===== Fragments communs ===========================================================
function phaseTitle(env: Env, p: FlowTree["phases"][number], numbers = true) {
  return numbers && p.number ? `${p.number} - ${p.name}` : p.name;
}
function stepTitle(env: Env, st: StepNode, numbers = true) {
  return numbers && st.number ? `${st.number} - ${st.name}` : st.name;
}

function Rich({ env, blocks }: { env: Env; blocks: RichBlock[] }) {
  if (isRichEmpty(blocks)) return null;
  return <View style={{ marginBottom: 4 }}>{renderRichBlocks(blocks, { images: env.images, maxWidth: env.width })}</View>;
}

/** Renvois vers les documents liés (PDF avec version : référence + indice). */
function DocRefs({ env, block, label }: { env: Env; block: BlockNode; label: string }) {
  const refs = block.documents.filter((d) => d.document && d.document.nature !== "pdf_unversioned");
  const attachments = block.documents.filter((d) => d.is_attachment);
  if (!refs.length && !attachments.length) return null;
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={[s.small, s.bold]}>{label}</Text>
      {refs.map((d) => (
        <Text key={d.id} style={s.small}>• {[d.document!.ref_int, d.document!.name].filter(Boolean).join(" — ")}{d.version ? ` (${env.t("cover.index")} ${d.version.index_label})` : ""}</Text>
      ))}
      {attachments.map((d) => <Text key={d.id} style={s.small}>• {d.attachment_name ?? env.t("flow.attachment")}</Text>)}
    </View>
  );
}

function EmmTable({ env, items }: { env: Env; items: BlockNode["emm"] }) {
  const { t } = env;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Table
      columns={[
        { key: "family", label: t.b("emm.family"), flex: 1 }, { key: "name", label: t.b("emm.name"), flex: 2 },
        { key: "ref", label: t.b("emm.reference"), flex: 1.2 }, { key: "provider", label: t.b("emm.provider"), flex: 1.2 },
        { key: "qty", label: t.b("emm.quantity"), width: 48, align: "right" }, { key: "unit", label: t.b("emm.unit"), width: 46 },
        { key: "cons", label: t.b("emm.consumable"), width: 52, align: "center" },
      ]}
      emptyLabel={t("flow.noItem")}
      rows={items.map((x) => [
        x.family ?? "",
        <View key="n">
          <Text>{x.name}</Text>
          {x.library?.subject_to_verification ? <Text style={{ fontSize: 7, color: PDF_COLORS.warning }}>{t("emm.verification")}</Text> : null}
          {x.library?.validity_date && x.library.validity_date < today ? <Text style={{ fontSize: 7, color: PDF_COLORS.danger }}>{t("emm.expired")}</Text> : null}
          {x.display_comment && x.comment ? <Text style={{ fontSize: 7, color: PDF_COLORS.muted }}>{x.comment}</Text> : null}
        </View>,
        x.reference ?? "", x.provider ?? "", x.quantity === null ? "" : String(x.quantity).replace(".", t.locale === "fr" ? "," : "."), x.unit ?? "",
        x.consumable ? t("form.yes") : t("form.no"),
      ])}
    />
  );
}

function AdrTable({ env, items }: { env: Env; items: BlockNode["adr"] }) {
  const { t } = env;
  return (
    <Table
      columns={[
        { key: "family", label: t.b("adr.family"), flex: 1 }, { key: "risk", label: t.b("adr.risk"), flex: 1.8 },
        { key: "source", label: t.b("adr.source"), flex: 1.2 }, { key: "major", label: t.b("adr.major"), width: 44, align: "center" },
        { key: "parades", label: t.b("adr.parades"), flex: 2.6 },
      ]}
      emptyLabel={t("flow.noItem")}
      rows={items.map((x) => [
        x.family ?? "", x.risk?.name ?? "", x.risk?.source ?? "", x.major ? t("form.yes") : t("form.no"),
        <View key="p">
          {x.parades.length ? x.parades.map((p, i) => (
            <Text key={i}>• {p.name}{p.specific ? <Text style={{ color: PDF_COLORS.muted, fontStyle: "italic" }}> ({t("adr.specific")})</Text> : null}
              {p.description ? <Text style={{ color: PDF_COLORS.muted }}>{` — ${p.description}`}</Text> : null}</Text>
          )) : <Text style={{ color: PDF_COLORS.faint }}>—</Text>}
        </View>,
      ])}
    />
  );
}

function RhpTable({ env, items }: { env: Env; items: BlockNode["rhp"] }) {
  const { t } = env;
  return (
    <Table
      columns={[{ key: "fn", label: t.b("rhp.function"), flex: 1.4 }, { key: "count", label: t.b("rhp.count"), width: 50, align: "right" },
        { key: "skills", label: t.b("rhp.skills"), flex: 2 }, { key: "obs", label: t.b("rhp.observation"), flex: 1.6 }]}
      rows={items.map((x) => [x.fn ?? "", String(x.count), x.skills.join(", "), x.observation ?? ""])}
    />
  );
}

function natureLabeler(env: Env) {
  const flow = env.tree.flow as SupervisionFlow;
  return (n: SignatureNature) => {
    if (n === "realisation" || n === "tech_control") return env.t(`dsi.natures.${n}`);
    const m = /^(breakpoint|convocation)_(int|ext)_(\d)$/.exec(n)!;
    const mono = applicableSupervisors(flow, m[2] as "int" | "ext")[0]?.mono;
    const base = env.t(`dsi.natures.${m[1]}_${m[2]}`);
    return mono ? base : `${base} - ${supervisorName(n, flow) ?? m[3]}`;
  };
}

/** Résumé d'un bloc Contrôle dans le contenu (Instructions : option « Bloc(s) Contrôle(s) dans le contenu »). */
function DsiSummary({ env, block }: { env: Env; block: BlockNode }) {
  const label = natureLabeler(env);
  const natures = expectedNatures(block.dsi, env.tree.flow as SupervisionFlow);
  if (!block.dsi) return null;
  return (
    <View style={{ borderWidth: 0.6, borderColor: PDF_COLORS.border, padding: 5, marginBottom: 5 }} wrap={false}>
      <Text style={[s.small, s.bold, { color: PDF_COLORS.primary }]}>{env.t("dsi.controls")}</Text>
      {natures.map((n) => {
        const sig = block.signatures.find((x) => x.nature === n);
        return (
          <Text key={n} style={s.small}>
            {natureCode(n)} — {label(n)}{!env.ctx.withoutFieldData && sig?.state === "signed" ? ` : ${[sig.first_name, sig.last_name].filter(Boolean).join(" ") || env.tree.people.get(sig.signatory_id ?? "")?.name || ""} (${pdfDate(sig.signed_at, env.t.locale)})` : ""}
          </Text>
        );
      })}
      {block.dsi.observation ? <Text style={s.small}>{env.t("dsi.observation")} : {block.dsi.observation}</Text> : null}
    </View>
  );
}

// ===== Formulaires liés (contenu / annexe) ===========================================
async function linkedFormEntries(env: Env, mode: { blank: boolean; responses: boolean; skeleton?: boolean }): Promise<FormEntry[]> {
  const { db } = env.ctx;
  const links = env.tree.phases.flatMap((p) => p.steps.flatMap((st) => st.blocks.form?.forms ?? []));
  const out: FormEntry[] = [];
  const seenBlank = new Set<string>();
  const responsesOf = (linkId: string) => env.tree.responses.filter((r) => r.block_link_id === linkId);
  for (const l of links) {
    const resp = mode.responses && !env.ctx.withoutFieldData ? responsesOf(l.id) : [];
    const wantBlank = (mode.blank && !resp.length) || (mode.skeleton && resp.length);
    if (wantBlank && !seenBlank.has(l.form_id)) {
      seenBlank.add(l.form_id);
      const def = await loadFormDefinition(db, l.form_id);
      if (def) out.push({ definition: def.definition, formName: def.name, response: null });
    }
    if (resp.length) out.push(...await loadResponses(db, resp.map((r) => r.id)));
  }
  return out;
}

async function formAnnexes(env: Env): Promise<Annex[]> {
  if (env.ctx.doc.form_content_location !== "appendix") return [];
  const blank = env.opt("include_form_doc");
  const responses = env.opt("include_response_doc");
  if (!blank && !responses) return [];
  const entries = await linkedFormEntries(env, { blank, responses });
  const images = await prepareFormImages(entries, env.ctx.assets);
  return entries.map((e, i) => ({
    title: e.response ? `${e.formName} — ${e.response.reference}` : `${e.formName} — ${env.t("form.blank")}`,
    kind: "pages" as const,
    pages: renderFormEntry(e, env, { includeEmpty: !responses || env.opt("include_empty_option") }, images, `fa${i}`),
  }));
}

function FormRefs({ env, step }: { env: Env; step: StepNode }) {
  if (env.ctx.doc.form_content_location !== "content") return null;
  const links = step.blocks.form?.forms ?? [];
  if (!links.length) return null;
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={[s.small, s.bold]}>{env.t("flow.forms")}</Text>
      {links.map((l) => {
        const resp = env.opt("include_form_references") && !env.ctx.withoutFieldData ? env.tree.responses.filter((r) => r.block_link_id === l.id) : [];
        return (
          <Text key={l.id} style={s.small}>
            • {[l.form?.reference, l.form?.name].filter(Boolean).join(" — ")}{l.form?.index_label ? ` (${env.t("cover.index")} ${l.form.index_label})` : ""}
            {resp.length ? ` : ${resp.map((r) => r.reference).join(", ")}` : ""}
          </Text>
        );
      })}
    </View>
  );
}

/** Annexes PDF sans version liées aux blocs (hors documents volumineux). */
function unversionedAnnexes(env: Env, types: ("pr" | "multi_pr" | "txt")[]): Annex[] {
  const out: Annex[] = [];
  const seen = new Set<string>();
  for (const p of env.tree.phases) for (const st of p.steps) for (const ty of types) {
    for (const d of st.blocks[ty]?.documents ?? []) {
      if (d.document?.nature === "pdf_unversioned" && !d.document.is_large_file) {
        for (const f of d.files) {
          if (seen.has(f.storage_path)) continue;
          seen.add(f.storage_path);
          out.push({ title: `${d.document.name} — ${f.name}`, kind: "pdf", bucket: "documents", path: f.storage_path });
        }
      }
      if (d.is_attachment && d.attachment_path && !seen.has(d.attachment_path)) {
        seen.add(d.attachment_path);
        out.push({ title: d.attachment_name ?? env.t("flow.attachment"), kind: "pdf", bucket: "documents", path: d.attachment_path });
      }
    }
  }
  return out;
}

function emmAnnex(env: Env): Annex | null {
  const steps = env.tree.phases.flatMap((p) => p.steps).filter((st) => st.blocks.emm?.emm.length);
  if (!steps.length) return null;
  return {
    title: env.t("emm.title"), kind: "pages",
    pages: [(
      <DocPage key="emm-annex" frame={env.frameFor(false)} margins={env.marginsFor(false)} font={env.font}>
        <Band>{env.t.b("emm.title")}</Band>
        {steps.map((st) => <View key={st.id}><SubBand>{stepTitle(env, st)}</SubBand><EmmTable env={env} items={st.blocks.emm!.emm} /></View>)}
      </DocPage>
    )],
  };
}

function TextSection({ env, title, text }: { env: Env; title: string; text: string | null }) {
  if (!text?.trim()) return null;
  return <View><SubBand>{title}</SubBand><Rich env={env} blocks={parseRichContent(text)} /></View>;
}

// ===== Natures ======================================================================
async function prepare(ctx: GenContext, types: NatureOutput["types"]) {
  if (!ctx.doc.linked_flow_id) return null;
  const tree = await loadFlowTree(ctx.db, ctx.doc.linked_flow_id, { phase: ctx.t("flow.phasePrefix"), step: ctx.t("flow.stepPrefix") });
  if (!tree) return null;
  const images = await preloadImages(ctx, tree);
  return envFor(ctx, tree, types, images);
}

function noFlow(ctx: GenContext, types: NatureOutput["types"]): NatureOutput {
  const layout = contentLayout(ctx, types.portrait, types.landscape);
  return {
    types, annexes: [], empty: true,
    pages: [<DocPage key="nf" frame={layout.frameFor(false)} margins={layout.marginsFor(false)} font={ctx.font}><Muted>{ctx.t("flow.noFlow")}</Muted></DocPage>],
  };
}

/** Document Instructions (pr). */
export async function renderInstructions(ctx: GenContext): Promise<NatureOutput> {
  const types = DOC_TYPES;
  const env = await prepare(ctx, types);
  if (!env) return noFlow(ctx, types);
  const { t, tree } = env;
  const numbers = env.opt("include_phase_number");
  const page = (
    <DocPage key="pr" frame={env.frameFor(false)} margins={env.marginsFor(false)} font={env.font}>
      <TextSection env={env} title={t.b("flow.subject")} text={ctx.doc.subject} />
      <TextSection env={env} title={t.b("flow.preamble")} text={ctx.doc.preamble} />
      <TextSection env={env} title={t.b("flow.glossary")} text={ctx.doc.glossary} />
      {tree.flow.description ? <Text style={[s.para, s.muted]}>{tree.flow.description}</Text> : null}
      {tree.phases.map((p) => (
        <View key={p.id}>
          {!p.hide_title_pdf ? <Band>{phaseTitle(env, p, numbers)}</Band> : null}
          {p.description ? <Text style={s.para}>{p.description}</Text> : null}
          {p.steps.map((st) => {
            const pr = st.blocks.pr;
            const txt = st.blocks.txt?.txt_visibility === "document" ? st.blocks.txt : undefined;
            return (
              <View key={st.id}>
                {!st.hide_title_pdf ? <SubBand>{stepTitle(env, st, numbers)}</SubBand> : null}
                {st.description ? <Text style={s.para}>{st.description}</Text> : null}
                {pr ? <Rich env={env} blocks={richOf(pr)} /> : null}
                {pr ? <DocRefs env={env} block={pr} label={t("flow.appliedDocuments")} /> : null}
                {txt ? <Rich env={env} blocks={richOf(txt)} /> : null}
                {env.opt("include_rh_content") && st.blocks.rhp?.rhp.length ? <RhpTable env={env} items={st.blocks.rhp.rhp} /> : null}
                {env.opt("include_control_block") && st.blocks.dsi ? <DsiSummary env={env} block={st.blocks.dsi} /> : null}
                <FormRefs env={env} step={st} />
              </View>
            );
          })}
        </View>
      ))}
      {!tree.phases.length ? <Muted>{t("flow.empty")}</Muted> : null}
    </DocPage>
  );
  const annexes: Annex[] = [];
  if (env.opt("show_annexes")) annexes.push(...unversionedAnnexes(env, ["pr", "txt"]));
  if (env.opt("include_emm_doc")) { const a = emmAnnex(env); if (a) annexes.push(a); }
  annexes.push(...await formAnnexes(env));
  return { types, pages: [page], annexes };
}

/** Document Moyens (emm) / Risques (adr). */
export async function renderItemsTable(ctx: GenContext, kind: "emm" | "adr"): Promise<NatureOutput> {
  const types = DOC_TYPES;
  const env = await prepare(ctx, types);
  if (!env) return noFlow(ctx, types);
  const steps = env.tree.phases.map((p) => ({ p, steps: p.steps.filter((st) => (kind === "emm" ? st.blocks.emm?.emm.length : st.blocks.adr?.adr.length)) }))
    .filter((x) => x.steps.length);
  const page = (
    <DocPage key={kind} frame={env.frameFor(false)} margins={env.marginsFor(false)} font={env.font}>
      <Band>{env.t.b(`${kind}.title`)}</Band>
      {steps.map(({ p, steps: list }) => (
        <View key={p.id}>
          <Text style={[s.h3, { marginTop: 4 }]}>{phaseTitle(env, p)}</Text>
          {list.map((st) => (
            <View key={st.id}>
              <SubBand>{stepTitle(env, st)}</SubBand>
              {kind === "emm" ? <EmmTable env={env} items={st.blocks.emm!.emm} /> : <AdrTable env={env} items={st.blocks.adr!.adr} />}
            </View>
          ))}
        </View>
      ))}
      {!steps.length ? <Muted>{env.t("flow.noItem")}</Muted> : null}
    </DocPage>
  );
  return { types, pages: [page], annexes: await formAnnexes(env) };
}

/** Document Contrôles (dsi) : page d'explication, tableau paysage étapes × natures de signature, suivi des signatures. */
export async function renderControls(ctx: GenContext): Promise<NatureOutput> {
  const types = { cover: "COVER_PAGE_DSI", follow: "PAGE_CONTENT_SUIVI_DSI", portrait: "PAGE_V_DSI", landscape: "PAGE_H_DSI" };
  const env = await prepare(ctx, types);
  if (!env) return noFlow(ctx, types);
  const { t, tree } = env;
  const label = natureLabeler(env);
  const flow = tree.flow as SupervisionFlow;
  const rows = tree.phases.flatMap((p) => p.steps.map((st) => ({ p, st, block: st.blocks.dsi })));
  // Colonnes = union ordonnée des natures attendues dans le flow.
  const ORDER: SignatureNature[] = ["realisation", "tech_control", "breakpoint_int_1", "convocation_int_1", "breakpoint_int_2", "convocation_int_2",
    "breakpoint_int_3", "convocation_int_3", "breakpoint_ext_1", "convocation_ext_1", "breakpoint_ext_2", "convocation_ext_2", "breakpoint_ext_3", "convocation_ext_3"];
  const used = new Set(rows.flatMap((r) => expectedNatures(r.block?.dsi, flow)));
  const natures = ORDER.filter((n) => used.has(n));
  if (!natures.length) natures.push("realisation");
  const lm = env.marginsFor(true) ?? DEFAULT_MARGINS;
  const width = A4.height - lm.left - lm.right;
  const fixed = { num: 42, step: 120, docs: 100, obs: 110 };
  const sigW = Math.max(62, (width - fixed.num - fixed.step - fixed.docs - fixed.obs) / natures.length);
  const showIndex = !env.opt("hide_index_column");
  const nofield = ctx.withoutFieldData;

  const explanation = (
    <DocPage key="dsi-explain" frame={env.frameFor(false)} margins={env.marginsFor(false)} font={env.font} bookmark={t("dsi.explanationTitle")}>
      <Band>{t.b("dsi.explanationTitle")}</Band>
      <Text style={s.para}>{t("dsi.explanation")}</Text>
      <Table columns={[{ key: "code", label: t.b("dsi.code"), width: 60, align: "center" }, { key: "label", label: t.b("dsi.nature"), flex: 1 }]}
        rows={natures.map((n) => [natureCode(n), label(n)])} />
      <Text style={[s.h4]}>{t("dsi.legendTitle")}</Text>
      {["required", "aip", "documentRequired", "techControlStep"].map((k) => <Text key={k} style={s.small}>• {t(`dsi.legend.${k}`)}</Text>)}
      {nofield ? <Text style={[s.para, { color: PDF_COLORS.warning, marginTop: 8 }]}>{t("dsi.withoutFieldData")}</Text> : null}
    </DocPage>
  );

  const head = (txt: string, w: number, k: string) => <View key={k} style={[s.th, { width: w }]}><Text>{txt}</Text></View>;
  const table = (
    <DocPage key="dsi-table" landscape frame={env.frameFor(true)} margins={env.marginsFor(true)} font={env.font} bookmark={t("dsi.tableTitle")}>
      <Band>{t.b("dsi.tableTitle")}</Band>
      <View style={[s.table, { width }]}>
        <View style={s.tr} fixed>
          {head(t.b("dsi.number"), fixed.num, "n")}{head(t.b("dsi.step"), fixed.step, "s")}{head(t.b("dsi.documents"), fixed.docs, "d")}
          {natures.map((n) => head(`${natureCode(n)} — ${label(n)}`, sigW, n))}
          {head(t.b("dsi.observations"), fixed.obs, "o")}
        </View>
        {rows.map(({ p, st, block }, i) => {
          const isFirstOfPhase = i === 0 || rows[i - 1].p.id !== p.id;
          const expected = expectedNatures(block?.dsi, flow);
          const docs = block?.documents.filter((d) => d.document) ?? [];
          const formRefs = env.opt("include_ref_form") ? st.blocks.form?.forms.map((l) => [l.form?.reference, l.form?.name].filter(Boolean).join(" — ")) ?? [] : [];
          const respRefs = env.opt("include_form_references_obs") && !nofield
            ? env.tree.responses.filter((r) => r.step_id === st.id).map((r) => r.reference) : [];
          const comments = nofield ? [] : (block?.signatures ?? []).filter((x) => x.comment).map((x) => `${natureCode(x.nature)} : ${x.comment}`);
          return [
            isFirstOfPhase ? (
              <View key={`${p.id}-h`} style={[s.tr, { backgroundColor: PDF_COLORS.primarySoft }]} wrap={false}>
                <View style={[s.td, { width }]}><Text style={{ fontWeight: 700, color: PDF_COLORS.primary }}>{phaseTitle(env, p)}</Text></View>
              </View>
            ) : null,
            <View key={st.id} style={[s.tr, i % 2 ? { backgroundColor: PDF_COLORS.zebra } : {}]} wrap={false}>
              <View style={[s.td, { width: fixed.num }]}><Text style={s.bold}>{st.number}</Text></View>
              <View style={[s.td, { width: fixed.step }]}>
                <Text>{st.name}</Text>
                {block?.dsi?.aip ? <Text style={{ fontSize: 7, color: PDF_COLORS.danger }}>AIP</Text> : null}
                {block?.dsi?.technical_control_step ? <Text style={{ fontSize: 7, color: PDF_COLORS.muted }}>{t("dsi.legend.techControlStep")}</Text> : null}
                {block?.dsi?.technical_control_details ? <Text style={{ fontSize: 7, color: PDF_COLORS.muted }}>{block.dsi.technical_control_details}</Text> : null}
              </View>
              <View style={[s.td, { width: fixed.docs }]}>
                {docs.map((d) => (
                  <Text key={d.id} style={{ fontSize: 7.5 }}>{d.document!.ref_int ?? d.document!.name}{showIndex && d.version ? ` — ${t("cover.index")} ${d.version.index_label}` : ""}</Text>
                ))}
                {block?.dsi?.document_reference ? <Text style={{ fontSize: 7.5 }}>{block.dsi.document_reference}</Text> : null}
                {formRefs.map((r, k) => <Text key={`f${k}`} style={{ fontSize: 7.5, color: PDF_COLORS.muted }}>{r}</Text>)}
                {block?.dsi?.document_required ? <Text style={{ fontSize: 7, color: PDF_COLORS.warning }}>{t("dsi.legend.documentRequired")}</Text> : null}
              </View>
              {natures.map((n) => {
                if (!block || !block.dsi) return <View key={n} style={[s.td, { width: sigW, backgroundColor: PDF_COLORS.headBg }]}><Text style={{ color: PDF_COLORS.faint, textAlign: "center" }}>{st.blocks.dsi ? "" : "—"}</Text></View>;
                if (block.dsi.signatories_status === "disabled") return <View key={n} style={[s.td, { width: sigW, backgroundColor: PDF_COLORS.headBg }]}><Text style={{ fontSize: 7, color: PDF_COLORS.faint }}>{n === natures[0] ? t("dsi.disabled") : ""}</Text></View>;
                if (!expected.includes(n)) return <View key={n} style={[s.td, { width: sigW, backgroundColor: PDF_COLORS.headBg }]}><Text style={{ color: PDF_COLORS.faint, textAlign: "center" }}>—</Text></View>;
                const sig = nofield ? null : block.signatures.find((x) => x.nature === n);
                if (sig?.state === "not_possible") {
                  return <View key={n} style={[s.td, { width: sigW }]}><Text style={{ fontSize: 7.5, color: PDF_COLORS.muted }}>{t("dsi.notPossible")}</Text>
                    <Text style={{ fontSize: 7 }}>{[sig.first_name, sig.last_name].filter(Boolean).join(" ")}</Text><Text style={{ fontSize: 7, color: PDF_COLORS.muted }}>{pdfDate(sig.signed_at, t.locale)}</Text></View>;
                }
                const name = sig ? [sig.first_name, sig.last_name].filter(Boolean).join(" ") || env.tree.people.get(sig.signatory_id ?? "")?.name || "" : null;
                return (
                  <View key={n} style={[s.td, { width: sigW }]}>
                    <SignatureCell image={sig?.signature_path ? env.images.get(sig.signature_path) : null} name={name}
                      sub={sig ? [sig.company_name ?? env.tree.people.get(sig.signatory_id ?? "")?.company, sig.proxied ? t("dsi.proxied") : null].filter(Boolean).join(" · ") || null : null}
                      date={sig ? pdfDate(sig.signed_at, t.locale, true) : null} empty={block.dsi.signatories_status === "required" ? t("dsi.required") : null} height={22} />
                  </View>
                );
              })}
              <View style={[s.td, { width: fixed.obs }]}>
                {block?.dsi?.observation ? <Text style={{ fontSize: 7.5 }}>{block.dsi.observation}</Text> : null}
                {comments.map((c, k) => <Text key={k} style={{ fontSize: 7 }}>{c}</Text>)}
                {respRefs.length ? <Text style={{ fontSize: 7, color: PDF_COLORS.muted }}>{t("dsi.responses")} : {respRefs.join(", ")}</Text> : null}
                {block?.dsi?.signatory_disabled_comment ? <Text style={{ fontSize: 7, color: PDF_COLORS.muted }}>{block.dsi.signatory_disabled_comment}</Text> : null}
              </View>
            </View>,
          ];
        })}
      </View>
      {!rows.length ? <Muted>{t("flow.empty")}</Muted> : null}
    </DocPage>
  );

  const allSigs = nofield ? [] : rows.flatMap(({ st, block }) => (block?.signatures ?? []).map((sg) => ({ st, sg })));
  const tracking = (
    <DocPage key="dsi-track" frame={env.frameFor(false)} margins={env.marginsFor(false)} font={env.font} bookmark={t("dsi.trackingTitle")}>
      <Band>{t.b("dsi.trackingTitle")}</Band>
      <Table
        columns={[{ key: "step", label: t.b("dsi.step"), flex: 1.6 }, { key: "nature", label: t.b("dsi.nature"), flex: 1.6 },
          { key: "who", label: t.b("dsi.signatory"), flex: 1.4 }, { key: "company", label: t.b("dsi.company"), flex: 1 },
          { key: "date", label: t.b("dsi.date"), width: 70 }, { key: "state", label: t.b("dsi.state"), width: 62 }, { key: "source", label: t.b("dsi.source"), width: 52 }]}
        emptyLabel={t("dsi.noSignature")}
        rows={allSigs.map(({ st, sg }) => [
          `${st.number} ${st.name}`, label(sg.nature),
          [sg.first_name, sg.last_name].filter(Boolean).join(" ") || env.tree.people.get(sg.signatory_id ?? "")?.name || "",
          sg.company_name ?? env.tree.people.get(sg.signatory_id ?? "")?.company ?? "", pdfDate(sg.signed_at, t.locale, true),
          t(`dsi.states.${sg.state}`), t(`dsi.sources.${sg.source}`),
        ])}
      />
    </DocPage>
  );
  return { types, pages: [explanation, table, tracking], annexes: await formAnnexes(env) };
}

/** Document Instructions multiples (multi_pr). */
export async function renderMultiInstructions(ctx: GenContext): Promise<NatureOutput> {
  const types = { cover: "COVER_PAGE_MULTI_PR", follow: "PAGE_CONTENT_SUIVI_MULTI_PR", portrait: "PAGE_CONTENT_VERTICAL_MULTI_PR", landscape: "PAGE_CONTENT_H" };
  const env = await prepare(ctx, types);
  if (!env) return noFlow(ctx, types);
  const { t, tree } = env;
  const nofield = ctx.withoutFieldData;
  const steps = tree.phases.flatMap((p) => p.steps.map((st) => ({ p, st }))).filter(({ st }) => st.blocks.multi_pr || (env.opt("include_instruction_block") && st.blocks.pr));
  const titleOf = (it: BlockNode["multi"][number], i: number) => it.title || t("multiPr.item", { n: i + 1 });
  const summary = (
    <DocPage key="mpr-sum" frame={env.frameFor(false)} margins={env.marginsFor(false)} font={env.font} bookmark={t("multiPr.summary")}>
      <Band>{t.b("multiPr.summary")}</Band>
      {steps.map(({ st }) => (
        <View key={st.id} style={{ marginBottom: 3 }}>
          <Text style={s.bold}>{stepTitle(env, st)}</Text>
          {!env.opt("hide_multi_pr_title_on_summary") && !st.blocks.multi_pr?.multi_pr_title_hidden
            ? st.blocks.multi_pr?.multi.map((it, i) => <Text key={it.id} style={{ marginLeft: 12, fontSize: 8.5 }}>{i + 1}. {titleOf(it, i)}</Text>) : null}
        </View>
      ))}
    </DocPage>
  );
  const content = (
    <DocPage key="mpr" frame={env.frameFor(false)} margins={env.marginsFor(false)} font={env.font}>
      {tree.phases.map((p) => {
        const list = steps.filter((x) => x.p.id === p.id);
        if (!list.length) return null;
        return (
          <View key={p.id}>
            {!p.hide_title_pdf ? <Band>{phaseTitle(env, p)}</Band> : null}
            {list.map(({ st }) => {
              const b = st.blocks.multi_pr;
              return (
                <View key={st.id}>
                  {!st.hide_title_pdf ? <SubBand>{stepTitle(env, st)}</SubBand> : null}
                  {env.opt("include_instruction_block") && st.blocks.pr ? <Rich env={env} blocks={richOf(st.blocks.pr)} /> : null}
                  {env.opt("include_txt_content") && st.blocks.txt?.txt_visibility === "document" ? <Rich env={env} blocks={richOf(st.blocks.txt)} /> : null}
                  {env.opt("include_rh_content") && st.blocks.rhp?.rhp.length ? <RhpTable env={env} items={st.blocks.rhp.rhp} /> : null}
                  {env.opt("include_control_block") && st.blocks.dsi ? <DsiSummary env={env} block={st.blocks.dsi} /> : null}
                  {b?.multi.map((it, i) => {
                    const sig = nofield ? null : it.signature;
                    return (
                      <View key={it.id} style={{ borderWidth: 0.6, borderColor: PDF_COLORS.border, marginBottom: 6 }}>
                        {!b.multi_pr_title_hidden ? (
                          <View style={{ backgroundColor: PDF_COLORS.zebra, padding: 4, borderBottomWidth: 0.6, borderBottomColor: PDF_COLORS.borderSoft }}>
                            <Text style={s.bold}>{i + 1}. {titleOf(it, i)}</Text>
                          </View>
                        ) : null}
                        {!isRichEmpty(richOf(it)) ? <View style={{ padding: 5 }}><Rich env={env} blocks={richOf(it)} /></View> : null}
                        <View style={{ flexDirection: "row", borderTopWidth: 0.6, borderTopColor: PDF_COLORS.borderSoft }} wrap={false}>
                          <View style={{ flex: 1, padding: 4, borderRightWidth: 0.6, borderRightColor: PDF_COLORS.borderSoft }}>
                            <Text style={[s.small, s.bold]}>{t("multiPr.status")}</Text>
                            {it.status && !nofield ? (
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <View style={{ width: 7, height: 7, backgroundColor: it.status.color, marginRight: 3 }} /><Text>{it.status.name}</Text>
                              </View>
                            ) : <Text style={{ color: PDF_COLORS.faint }}>{b.multi_pr_requires_status ? t("multiPr.required") : "—"}</Text>}
                          </View>
                          <View style={{ flex: 1.3, padding: 4, borderRightWidth: env.opt("include_multi_pr_obs") ? 0.6 : 0, borderRightColor: PDF_COLORS.borderSoft }}>
                            <Text style={[s.small, s.bold]}>{t("multiPr.signature")}</Text>
                            <SignatureCell image={sig?.signature_path ? env.images.get(sig.signature_path) : null} name={sig ? env.tree.people.get(sig.signatory_id ?? "")?.name ?? "" : null}
                              date={sig ? pdfDate(sig.signed_at, t.locale, true) : null} empty={b.multi_pr_requires_signature ? t("multiPr.required") : null} height={24} />
                          </View>
                          {env.opt("include_multi_pr_obs") ? (
                            <View style={{ flex: 1.6, padding: 4 }}>
                              <Text style={[s.small, s.bold]}>{t("form.observation")}</Text>
                              <Text>{nofield ? "" : it.observation ?? ""}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                  {b ? <DocRefs env={env} block={b} label={t("flow.appliedDocuments")} /> : null}
                </View>
              );
            })}
          </View>
        );
      })}
      {!steps.length ? <Muted>{t("flow.empty")}</Muted> : null}
    </DocPage>
  );
  const annexes: Annex[] = [];
  if (env.opt("show_annexes")) annexes.push(...unversionedAnnexes(env, ["multi_pr", "pr"]));
  if (env.opt("include_emm_doc")) { const a = emmAnnex(env); if (a) annexes.push(a); }
  annexes.push(...await formAnnexes(env));
  return { types, pages: [summary, content], annexes };
}

/** Document Objets (object) : rendu en liste/tableau + attributs sélectionnés (≤ 3) + certificats en annexe. */
export async function renderObjects(ctx: GenContext): Promise<NatureOutput> {
  const types = DOC_TYPES;
  const env = await prepare(ctx, types);
  if (!env) return noFlow(ctx, types);
  const { t, tree } = env;
  const { data: sel } = await ctx.db.from("document_selections").select("ref_id, position").eq("document_id", ctx.doc.id).eq("kind", "technical_object_attribute").order("position");
  const attrIds = (sel ?? []).map((x) => x.ref_id).slice(0, 3);
  const objects = tree.phases.flatMap((p) => p.steps.flatMap((st) => (st.blocks.object?.objects ?? []).map((o) => ({ st, o }))));
  const [{ data: fields }, { data: values }] = await Promise.all([
    attrIds.length ? ctx.db.from("custom_fields").select("id, name").in("id", attrIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    attrIds.length && objects.length
      ? ctx.db.from("custom_field_values").select("custom_field_id, object_id, value_text, value_json").in("custom_field_id", attrIds).in("object_id", objects.map((x) => x.o.id))
      : Promise.resolve({ data: [] as { custom_field_id: string; object_id: string; value_text: string | null; value_json: unknown }[] }),
  ]);
  const attrs = attrIds.map((id) => fields?.find((f) => f.id === id)).filter((f): f is { id: string; name: string } => !!f);
  const valueOf = (objId: string, fieldId: string) => {
    const v = values?.find((x) => x.object_id === objId && x.custom_field_id === fieldId);
    if (!v) return "";
    return v.value_text ?? (Array.isArray(v.value_json) ? (v.value_json as unknown[]).join(", ") : v.value_json ? String(v.value_json) : "");
  };
  const page = (
    <DocPage key="obj" frame={env.frameFor(false)} margins={env.marginsFor(false)} font={env.font}>
      <Band>{t.b("object.title")}</Band>
      <Table
        columns={[{ key: "step", label: t.b("dsi.step"), flex: 1.4 }, { key: "family", label: t.b("emm.family"), flex: 1 }, { key: "name", label: t.b("emm.name"), flex: 1.6 },
          { key: "code", label: t.b("object.code"), flex: 1 }, { key: "index", label: t.b("cover.index"), width: 40 },
          ...attrs.map((a) => ({ key: a.id, label: a.name, flex: 1 }))]}
        emptyLabel={t("flow.noItem")}
        rows={objects.map(({ st, o }) => [`${st.number} ${st.name}`, o.family ?? "", o.name, o.item_code ?? o.external_reference ?? "", o.object_index ?? "",
          ...attrs.map((a) => valueOf(o.id, a.id))])}
      />
    </DocPage>
  );
  const annexes: Annex[] = [];
  if (env.opt("include_conformity_certificates")) {
    const certIds = [...new Set(objects.map((x) => x.o.certificate_document_id).filter((x): x is string => !!x))];
    if (certIds.length) {
      const { data: vs } = await ctx.db.from("document_versions").select("document_id, pdf_path, seq, document:documents(name)").in("document_id", certIds).not("pdf_path", "is", null).order("seq", { ascending: false });
      for (const id of certIds) {
        const v = vs?.find((x) => x.document_id === id);
        if (v?.pdf_path) annexes.push({ title: (v.document as { name: string } | null)?.name ?? t("object.certificate"), kind: "pdf", bucket: "documents", path: v.pdf_path });
      }
    }
  }
  return { types, pages: [page], annexes: [...annexes, ...await formAnnexes(env)] };
}

/** Document Formulaires (flow_form) : réponses des formulaires liés au flow (ou formulaires vierges). */
export async function renderFlowForms(ctx: GenContext): Promise<NatureOutput> {
  const types = { cover: "COVER_PAGE", follow: "PAGE_CONTENT_SUIVI", portrait: "FORM_GENERIC", landscape: "FORM_GENERIC_H" };
  const env = await prepare(ctx, types);
  if (!env) return noFlow(ctx, types);
  const strategy = ctx.doc.responses_strategy ?? "all";
  const responses = strategy !== "none";
  const entries = await linkedFormEntries(env, { blank: !responses, responses, skeleton: responses && env.opt("include_skeleton_form") });
  const images = await prepareFormImages(entries, ctx.assets);
  const includeEmpty = !responses || env.opt("include_empty_option");
  const pages = entries.flatMap((e, i) => renderFormEntry(e, env, { includeEmpty: e.response ? includeEmpty : true }, images, `ff${i}`));
  if (!pages.length) {
    pages.push(<DocPage key="ff-empty" frame={env.frameFor(false)} margins={env.marginsFor(false)} font={env.font}><Muted>{env.t("form.noResponse")}</Muted></DocPage>);
  }
  return { types, pages, annexes: [] };
}
