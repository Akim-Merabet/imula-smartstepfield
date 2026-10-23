/**
 * Orchestration d'une génération (spec 04 §6.1 / §10) : collecte → rendu @react-pdf par nature →
 * habillage pdf-lib (trames, page de garde, suivi des indices, annexes, numérotation, filigrane).
 * Utilisé par le worker (file `background_tasks`) et par les aperçus synchrones (route handlers).
 */
import { Document, Text, View, type DocumentProps } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import type { ReactElement } from "react";
import { assemblePdf, fillTemplateFields, loadPdf, textPagePdf, type PdfPart } from "@/lib/pdf/assemble";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { pdfDate } from "@/lib/pdf/i18n";
import { Band, CoverPage, DocPage, IndexTrackingTable, KeyValues, Muted, SubBand, Table } from "@/lib/pdf/primitives";
import { renderPdf } from "@/lib/pdf/render";
import { PDF_COLORS, s } from "@/lib/pdf/theme";
import { contentLayout, coverInfo, frameOf, loadGenContext, personName, stateLabel, templateFieldValues, versionRows, type GenContext } from "./context";
import {
  renderControls, renderFlowForms, renderInstructions, renderItemsTable, renderMultiInstructions, renderObjects, type Annex, type NatureOutput,
} from "./flow-render";
import { renderFormDocument, renderModuleDocument } from "./module-render";
import type { DB } from "./service-client";

export type GenerationAction =
  | "preview" | "freeze" | "regenerate" | "refresh_config" | "refresh_last_index" | "without_field_data" | "closing_folder" | "closing_section";

export type GeneratedPdf = { bytes: Uint8Array; pageCount: number; fileName: string; warnings: string[] };

export type GenerateOptions = {
  uiLocale?: "fr" | "en";
  /** Client service pour les trames / fichiers (aperçus synchrones : données via le client utilisateur). */
  serviceDb?: DB;
  depth?: number;
};

const safeName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(0, 80);

async function hasFormFields(bytes: Uint8Array) {
  const doc = await loadPdf(bytes);
  try { return !!doc && doc.getForm().getFields().length > 0; } catch { return false; }
}

async function natureOutput(ctx: GenContext): Promise<NatureOutput> {
  switch (ctx.doc.nature) {
    case "pr": return renderInstructions(ctx);
    case "emm": return renderItemsTable(ctx, "emm");
    case "adr": return renderItemsTable(ctx, "adr");
    case "dsi": return renderControls(ctx);
    case "multi_pr": return renderMultiInstructions(ctx);
    case "object": return renderObjects(ctx);
    case "flow_form": return renderFlowForms(ctx);
    case "project_form": case "block_form": case "multi_flow_form": case "field_feedback": return renderFormDocument(ctx);
    default: return renderModuleDocument(ctx);
  }
}

/** Page de suivi des évolutions (+ contributeurs si option). */
function followPages(ctx: GenContext, followType: string): { element: ReactElement<DocumentProps>; background: Uint8Array | null } {
  const tpl = ctx.templates.get(followType);
  const { t } = ctx;
  const v = ctx.version;
  const contributors = [
    ["redactor", v.redactor_id, v.redactor_date], ["checker", v.checker_id, v.checker_date], ["approver", v.approver_id, v.approver_date],
    ["quality", v.quality_supervisor_id, v.quality_date], ["safety", v.safety_supervisor_id, v.safety_date],
  ] as const;
  const element = (
    <Document>
      <DocPage frame={tpl ? null : frameOf(ctx)} margins={tpl?.margins} font={ctx.font} bookmark={t("cover.tracking")}>
        <Band>{t.b("cover.tracking")}</Band>
        <IndexTrackingTable t={t} versions={versionRows(ctx, tpl?.row.index_max)} />
        {ctx.options.include_contributors_page ? (
          <View>
            <Band>{t.b("contributors.title")}</Band>
            <Table columns={[{ key: "role", label: t.b("contributors.role"), flex: 1.2 }, { key: "who", label: t.b("contributors.name"), flex: 2 },
              { key: "date", label: t.b("cover.date"), width: 80 }]}
              rows={contributors.filter(([, id]) => id).map(([role, id, date]) => [t(`contributors.${role}`), personName(ctx, id), pdfDate(date, t.locale)])}
              emptyLabel={t("contributors.none")} />
          </View>
        ) : null}
      </DocPage>
    </Document>
  );
  return { element, background: tpl?.bytes ?? null };
}

/** Page de garde : PDF client, trame à champs remplis, ou page composée (sur trame de fond éventuelle). */
async function coverPart(ctx: GenContext, coverType: string, typeLabel?: string): Promise<PdfPart> {
  if (ctx.doc.client_cover_page && ctx.client?.cover_page_enabled && ctx.client.cover_page_pdf_path) {
    const bytes = await ctx.assets.file("documents", ctx.client.cover_page_pdf_path);
    if (bytes) {
      const filled = await hasFormFields(bytes) ? (await fillTemplateFields(bytes, templateFieldValues(ctx))).bytes : bytes;
      return { bytes: filled, numbered: false, label: "cover" };
    }
  }
  const tpl = ctx.templates.get(coverType);
  if (tpl && await hasFormFields(tpl.bytes)) {
    return { bytes: (await fillTemplateFields(tpl.bytes, templateFieldValues(ctx))).bytes, numbered: false, label: "cover" };
  }
  const info = await coverInfo(ctx, typeLabel);
  const bytes = await renderPdf(<Document><CoverPage t={ctx.t} info={info} font={ctx.font} margins={tpl?.margins} withTracking={false} /></Document>);
  return { bytes, background: tpl?.bytes ?? null, numbered: false, label: "cover" };
}

async function annexParts(ctx: GenContext, annexes: Annex[], interlayers: boolean, warnings: string[]): Promise<PdfPart[]> {
  const parts: PdfPart[] = [];
  const annexTpl = ctx.templates.get("PAGE_ANNEXE");
  let n = 0;
  for (const a of annexes) {
    n += 1;
    let bytes: Uint8Array | null = null;
    if (a.kind === "pdf") {
      bytes = await ctx.assets.file(a.bucket, a.path);
      if (!bytes || !(await loadPdf(bytes))) {
        warnings.push("annex_unreadable");
        bytes = await textPagePdf([{ text: ctx.t("annex.title", { n }), bold: true, size: 16 }, { text: a.title }, { text: ctx.t("annex.unreadable"), size: 10 }]);
      }
    } else {
      bytes = await renderPdf(<Document>{a.pages}</Document>);
    }
    if (interlayers) {
      const inter = await renderPdf(
        <Document>
          <DocPage frame={null} margins={annexTpl?.margins} font={ctx.font}>
            <View style={{ marginTop: 300, alignItems: "center" }}>
              <Text style={{ fontSize: 12, color: PDF_COLORS.muted, letterSpacing: 1 }}>{ctx.t.b("annex.title", { n }).toUpperCase()}</Text>
              <Text style={{ fontSize: 18, fontWeight: 700, color: PDF_COLORS.primary, marginTop: 8, textAlign: "center" }}>{a.title}</Text>
            </View>
          </DocPage>
        </Document>,
      );
      parts.push({ bytes: inter, background: annexTpl?.bytes ?? null, label: `annex-${n}-interlayer` });
    }
    parts.push({ bytes, label: `annex-${n}` });
  }
  return parts;
}

function pageNumberOptions(ctx: GenContext, position: { x: number; y: number } | null) {
  const client = ctx.client?.page_number_x !== null && ctx.client?.page_number_x !== undefined && ctx.client?.page_number_y !== null
    ? { x: Number(ctx.client.page_number_x), y: Number(ctx.client.page_number_y) } : null;
  return { label: (n: number, total: number) => ctx.t("page", { n, total }), position: position ?? client };
}

/** Génère le PDF d'une version de document (toutes natures générées, dossier de clôture compris). */
export async function generateDocumentPdf(db: DB, versionId: string, action: GenerationAction, extra: Record<string, unknown> = {}, opts: GenerateOptions = {}):
  Promise<GeneratedPdf | null> {
  const font = registerPdfFonts();
  const ctx = await loadGenContext(db, versionId, {
    font, uiLocale: opts.uiLocale, withoutFieldData: action === "without_field_data", templatesDb: opts.serviceDb, assetsDb: opts.serviceDb,
  });
  if (!ctx) return null;
  const warnings: string[] = [];
  if (ctx.doc.nature === "rfi") return generateClosingFolder(ctx, action === "closing_section" ? String(extra.section_id ?? "") : null, warnings, opts);
  if (ctx.doc.nature === "pdf_versioned" || ctx.doc.nature === "pdf_unversioned") return null;

  const out = await natureOutput(ctx);
  const parts: PdfPart[] = [];
  if (!ctx.options.hide_cover_page) {
    parts.push(await coverPart(ctx, out.types.cover));
    const follow = followPages(ctx, out.types.follow);
    parts.push({ bytes: await renderPdf(follow.element), background: follow.background, label: "follow" });
  }
  const layout = contentLayout(ctx, out.types.portrait, out.types.landscape);
  parts.push({ bytes: await renderPdf(<Document title={ctx.doc.name} language={ctx.t.locale}>{out.pages}</Document>), background: layout.background, label: "content" });
  parts.push(...await annexParts(ctx, out.annexes, !!ctx.options.include_annex_interlayer, warnings));

  const res = await assemblePdf(parts, {
    title: ctx.doc.name, author: ctx.account.name, language: ctx.t.locale, subject: ctx.t.doc(`natures.${ctx.doc.nature}`),
    watermark: ctx.account.doc_watermark, pageNumbers: pageNumberOptions(ctx, layout.pageNumber),
  });
  if (res.failed.length) warnings.push("part_failed");
  const suffix = action === "without_field_data" ? "-sans-donnees-terrain" : "";
  return { bytes: res.bytes, pageCount: res.pageCount, fileName: `${safeName(ctx.doc.ref_int ?? ctx.doc.name)}-${safeName(ctx.version.index_label)}${suffix}.pdf`, warnings };
}

// ===== Dossier de clôture ============================================================
type SectionContent = { title: string; ref: string; index: string; state: string; part: PdfPart | null };

const DIFFUSED_STATES = new Set(["bpo", "bpe", "temp", "bpa"]);

async function sectionContents(ctx: GenContext, section: { id: string; type: string; flow_id: string | null; include_previous_versions: boolean; all_emm_elements: boolean },
  warnings: string[], opts: GenerateOptions): Promise<{ contents: SectionContent[]; excluded: string[] }> {
  const { db, t } = ctx;
  const contents: SectionContent[] = [];
  const excluded: string[] = [];
  const { data: items } = await db.from("closing_section_items").select("document_id, version_id, emm_element_id, position").eq("section_id", section.id).order("position");
  if (["document", "document_large_file", "client_response", "closing_folder"].includes(section.type)) {
    const docIds = [...new Set((items ?? []).map((i) => i.document_id).filter((x): x is string => !!x))];
    if (!docIds.length) return { contents, excluded };
    const [{ data: docs }, { data: versions }, { data: files }] = await Promise.all([
      db.from("documents").select("id, name, ref_int, nature, source, family_id, is_large_file").in("id", docIds),
      db.from("document_versions").select("*").in("document_id", docIds).order("seq"),
      db.from("document_files").select("document_id, storage_path, name").in("document_id", docIds).is("version_id", null).order("position"),
    ]);
    for (const it of items ?? []) {
      const d = docs?.find((x) => x.id === it.document_id);
      if (!d) continue;
      if (section.type === "document" && d.is_large_file) { excluded.push(`${d.name} (> 20 Mo)`); continue; }
      const vs = (versions ?? []).filter((v) => v.document_id === d.id);
      if (d.nature === "pdf_unversioned") {
        for (const f of (files ?? []).filter((x) => x.document_id === d.id)) {
          const bytes = await ctx.assets.file("documents", f.storage_path);
          contents.push({ title: `${d.name} — ${f.name}`, ref: d.ref_int ?? "", index: "-", state: "", part: bytes ? { bytes } : null });
        }
        continue;
      }
      const diffused = vs.filter((v) => (v.diffusion_date || DIFFUSED_STATES.has(v.state)) && (d.source !== "extern" || v.pdf_path));
      const chosen = it.version_id ? vs.filter((v) => v.id === it.version_id)
        : section.include_previous_versions ? diffused : diffused.slice(-1);
      if (!chosen.length) { excluded.push(d.name); continue; }
      const seen = new Set<string>();
      for (const v of chosen) {
        const st = stateLabel(ctx, v).label;
        if (section.type === "client_response") {
          if (!v.response_file_path) continue;
          const bytes = await ctx.assets.file("documents", v.response_file_path);
          contents.push({ title: `${d.name} — ${t("closing.clientResponse")}`, ref: d.ref_int ?? "", index: v.index_label, state: st, part: bytes ? { bytes } : null });
          continue;
        }
        let bytes: Uint8Array | null = null;
        if (v.pdf_path) {
          if (seen.has(v.pdf_path)) continue;
          seen.add(v.pdf_path);
          bytes = await ctx.assets.file("documents", v.pdf_path);
        } else if (d.source !== "extern" && d.nature !== "rfi" && (opts.depth ?? 0) < 1) {
          // Document généré diffusé sans PDF figé : génération à la volée.
          const gen = await generateDocumentPdf(db, v.id, "preview", {}, { ...opts, depth: (opts.depth ?? 0) + 1 });
          bytes = gen?.bytes ?? null;
        }
        if (!bytes) { warnings.push("missing_pdf"); excluded.push(`${d.name} (${v.index_label})`); continue; }
        contents.push({ title: d.name, ref: d.ref_int ?? "", index: v.index_label, state: st, part: { bytes } });
      }
    }
  } else if (section.type === "report" && section.flow_id) {
    const sub: GenContext = { ...ctx, doc: { ...ctx.doc, linked_flow_id: section.flow_id, nature: "dsi" }, options: {} };
    const out = await renderControls(sub);
    const bytes = await renderPdf(<Document>{out.pages.slice(1)}</Document>);
    contents.push({ title: t("closing.report"), ref: "", index: "", state: "", part: { bytes } });
  } else if ((section.type === "certificate" || section.type === "reference") && section.flow_id) {
    const { data: emm } = await db.from("block_emm_items").select("id, name, library:library_equipments(certificate_document_path, reference_document_path)").eq("flow_id", section.flow_id).eq("disabled", false);
    const selected = new Set((items ?? []).map((i) => i.emm_element_id).filter(Boolean));
    for (const e of (emm ?? []) as unknown as { id: string; name: string; library: { certificate_document_path: string | null; reference_document_path: string | null } | null }[]) {
      if (!section.all_emm_elements && !selected.has(e.id)) continue;
      const path = section.type === "certificate" ? e.library?.certificate_document_path : e.library?.reference_document_path;
      if (!path) { excluded.push(e.name); continue; }
      const bytes = (await ctx.assets.file("library", path)) ?? (await ctx.assets.file("documents", path)) ?? (await ctx.assets.file("form-files", path));
      contents.push({ title: e.name, ref: "", index: "", state: "", part: bytes ? { bytes } : null });
    }
  }
  return { contents, excluded };
}

async function generateClosingFolder(ctx: GenContext, onlySection: string | null, warnings: string[], opts: GenerateOptions): Promise<GeneratedPdf> {
  const { db, t } = ctx;
  const { data: sectionsRaw } = await db.from("closing_sections").select("*").eq("folder_document_id", ctx.doc.id).eq("disabled", false).order("position");
  const sections = (sectionsRaw ?? []).filter((x) => !onlySection || x.id === onlySection);
  const sectionTpl = ctx.templates.get("PAGE_SECTION_RFI");
  const contentTpl = ctx.templates.get("PAGE_CONTENT_RFI");
  const tocTpl = ctx.templates.get("PAGE_SOMMAIRE_RFI");

  // 1) Parties de chaque section : page de section puis contenus.
  const bySection: { section: (typeof sections)[number]; sectionPart: PdfPart; contents: SectionContent[] }[] = [];
  for (const section of sections) {
    const { contents, excluded } = await sectionContents(ctx, section, warnings, opts);
    const typeLabel = t(`closing.types.${section.type}`);
    const sectionPage = await renderPdf(
      <Document>
        <DocPage frame={sectionTpl ? null : frameOf(ctx)} margins={sectionTpl?.margins} font={ctx.font} bookmark={section.name}>
          <View style={{ marginTop: 120, borderLeftWidth: 4, borderLeftColor: PDF_COLORS.primary, paddingLeft: 14, marginBottom: 30 }}>
            <Text style={{ fontSize: 10, color: PDF_COLORS.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>{t.b("closing.section")} {section.position + 1} — {typeLabel}</Text>
            <Text style={{ fontSize: 20, fontWeight: 700, color: PDF_COLORS.primary, marginTop: 6 }}>{section.name}</Text>
            {section.description ? <Text style={{ marginTop: 6 }}>{section.description}</Text> : null}
          </View>
          <SubBand>{t.b("closing.contents")}</SubBand>
          <Table columns={[{ key: "name", label: t.b("module.name"), flex: 2.4 }, { key: "ref", label: t.b("cover.refInt"), flex: 1.2 },
            { key: "index", label: t.b("cover.index"), width: 44 }, { key: "state", label: t.b("cover.state"), width: 64 }]}
            emptyLabel={t("closing.emptySection")} rows={contents.map((c) => [c.title, c.ref, c.index, c.state])} />
          {section.observation ? <KeyValues columns={1} items={[{ label: t("closing.observation"), value: section.observation }]} /> : null}
          {excluded.length ? (
            <View style={{ borderLeftWidth: 3, borderLeftColor: PDF_COLORS.warning, backgroundColor: PDF_COLORS.callout.warning.bg, padding: 6, marginTop: 6 }}>
              <Text style={[s.small, s.bold]}>{t("closing.excluded")}</Text>
              {excluded.map((e, i) => <Text key={i} style={s.small}>• {e}</Text>)}
            </View>
          ) : null}
        </DocPage>
      </Document>,
    );
    bySection.push({ section, sectionPart: { bytes: sectionPage, background: sectionTpl?.bytes ?? null, label: `section-${section.id}` }, contents });
  }

  // 2) Pages de tête (garde, suivi) puis sommaire en deux passes (nombre de pages du sommaire, puis numéros définitifs).
  const head: PdfPart[] = [];
  if (!onlySection) {
    head.push(await coverPart(ctx, "COVER_PAGE_RFI", t.doc("natures.rfi")));
    const follow = followPages(ctx, "PAGE_CONTENT_SUIVI_RFI");
    head.push({ bytes: await renderPdf(follow.element), background: follow.background, label: "follow" });
  }
  const pageCountOf = async (b: Uint8Array) => (await PDFDocument.load(b)).getPageCount();
  const headPages = (await Promise.all(head.map((p) => pageCountOf(p.bytes)))).reduce((a, b) => a + b, 0);
  type TocLine = { level: 0 | 1; label: string; page: number };
  const renderToc = (lines: TocLine[]) => renderPdf(
    <Document>
      <DocPage frame={tocTpl ? null : frameOf(ctx)} margins={tocTpl?.margins} font={ctx.font} bookmark={t("closing.toc")}>
        <Band>{t.b("closing.toc")}</Band>
        {lines.map((l, i) => (
          <View key={i} style={{ flexDirection: "row", marginBottom: l.level ? 2 : 4, marginTop: l.level ? 0 : 4, paddingLeft: l.level * 14 }} wrap={false}>
            <Text style={{ flex: 1, fontWeight: l.level ? 400 : 700, fontSize: l.level ? 9 : 10 }}>{l.label}</Text>
            <Text style={{ width: 40, textAlign: "right", fontWeight: l.level ? 400 : 700 }}>{l.page || ""}</Text>
          </View>
        ))}
        {!lines.length ? <Muted>{t("closing.noSection")}</Muted> : null}
      </DocPage>
    </Document>,
  );
  const contentCounts = await Promise.all(bySection.map(async (x) => ({
    section: await pageCountOf(x.sectionPart.bytes),
    contents: await Promise.all(x.contents.map(async (c) => (c.part ? (await PDFDocument.load(c.part.bytes).catch(() => null))?.getPageCount() ?? 0 : 0))),
  })));
  const buildLines = (tocPages: number): TocLine[] => {
    let page = headPages + tocPages + 1;
    const lines: TocLine[] = [];
    bySection.forEach((x, i) => {
      lines.push({ level: 0, label: `${i + 1}. ${x.section.name}`, page });
      page += contentCounts[i].section;
      x.contents.forEach((c, k) => {
        lines.push({ level: 1, label: [c.ref, c.title, c.index ? `${t("cover.index")} ${c.index}` : ""].filter(Boolean).join(" — "), page: contentCounts[i].contents[k] ? page : 0 });
        page += contentCounts[i].contents[k];
      });
    });
    return lines;
  };
  let tocBytes = await renderToc(buildLines(1));
  const tocPages = await pageCountOf(tocBytes);
  if (tocPages !== 1) tocBytes = await renderToc(buildLines(tocPages));

  const parts: PdfPart[] = [...head, { bytes: tocBytes, background: tocTpl?.bytes ?? null, label: "toc" }];
  for (const x of bySection) {
    parts.push(x.sectionPart);
    for (const c of x.contents) if (c.part) parts.push({ ...c.part, background: null, label: c.title });
  }
  const res = await assemblePdf(parts, {
    title: ctx.doc.name, author: ctx.account.name, language: ctx.t.locale, subject: t.doc("natures.rfi"),
    watermark: ctx.account.doc_watermark, pageNumbers: pageNumberOptions(ctx, contentTpl?.pageNumber ?? null),
  });
  if (res.failed.length) warnings.push("part_failed");
  const sectionName = onlySection ? `-${safeName(sections[0]?.name ?? "section")}` : "";
  return { bytes: res.bytes, pageCount: res.pageCount, fileName: `${safeName(ctx.doc.ref_int ?? ctx.doc.name)}-${safeName(ctx.version.index_label)}${sectionName}.pdf`, warnings };
}
