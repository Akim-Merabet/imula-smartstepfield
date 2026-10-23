/* eslint-disable jsx-a11y/alt-text -- <Image> @react-pdf : pas d'attribut alt (rendu PDF, non HTML). */
/**
 * Rendu PDF d'un formulaire (vierge ou réponse) — spec 03 §8.3 / spec 04 §3.4.2 :
 * rubriques et questions `hideInPdf` exclues, rubriques paysage sur pages dédiées, tailles d'images,
 * photos en annexe (option de rubrique), signatures, tableaux, R2.13 « choix non renseignés ».
 */
import { Image, Text, View } from "@react-pdf/renderer";
import type { ReactElement, ReactNode } from "react";
import { formatValue } from "@/features/forms/feedback/format-value";
import { buildModel, cellHeader, tableSize, type RtCell, type RtQuestion, type RtRubric } from "@/features/forms/response/engine/model";
import { isFilled } from "@/features/forms/response/engine/values";
import type { FileRef, SignatureValue, Size } from "@/features/forms/types";
import { pdfDate, type PdfT } from "@/lib/pdf/i18n";
import type { PdfImage } from "@/lib/pdf/images";
import { Band, CheckBox, DocPage, KeyValues, Muted, SignatureCell, SubBand, type FrameInfo } from "@/lib/pdf/primitives";
import { collectImageSources, parseRichContent } from "@/lib/pdf/rich-text";
import { renderRichBlocks } from "@/lib/pdf/rich-text-pdf";
import { A4, DEFAULT_MARGINS, PDF_COLORS, s, type Margins } from "@/lib/pdf/theme";
import type { Assets } from "./context";
import type { FormEntry } from "./form-data";

export type PageEnv = {
  t: PdfT;
  font: string;
  marginsFor: (landscape: boolean) => Margins | null;
  frameFor: (landscape: boolean) => FrameInfo | null;
};

export type FormRenderOptions = {
  /** « Afficher le(s) choix non renseigné(s) » : décoché ⇒ questions non renseignées exclues (R2.13). */
  includeEmpty: boolean;
  /** Masquer l'en-tête de réponse (aperçu brut). */
  hideHeader?: boolean;
  /** Titre de section (bandeau) au-dessus du formulaire. */
  title?: string;
  bookmark?: string;
};

const PHOTO_WIDTH: Record<Size, number> = { xs: 60, s: 95, m: 150, l: 240, xl: 380 };
const imgKey = (src: string) => `form-files:${src}`;

/** Préchargement de toutes les images d'un ensemble de formulaires (photos, signatures, images du builder, texte riche). */
export async function prepareFormImages(entries: FormEntry[], assets: Assets): Promise<Map<string, PdfImage>> {
  const srcs = new Set<string>();
  const addFiles = (files: FileRef[] | undefined) => files?.forEach((f) => f.fileId && srcs.add(f.fileId));
  for (const e of entries) {
    for (const r of e.definition.rubrics) {
      if (r.hideInPdf) continue;
      addFiles(r.images);
      for (const q of r.questions) {
        if (q.hideInPdf) continue;
        addFiles(q.images);
        q.options.forEach((o) => addFiles(o.images));
      }
    }
    if (!e.response) continue;
    for (const v of Object.values(e.response.values)) {
      if (Array.isArray(v)) v.forEach((f) => { if (f && typeof f === "object" && "fileId" in f) srcs.add((f as FileRef).fileId); });
      else if (v && typeof v === "object" && "signaturePath" in v && (v as SignatureValue).signaturePath) srcs.add((v as SignatureValue).signaturePath!);
      else if (typeof v === "string" && v.includes("<img")) collectImageSources(parseRichContent(v)).forEach((x) => srcs.add(x));
    }
  }
  const out = new Map<string, PdfImage>();
  await Promise.all([...srcs].map(async (src) => {
    const img = await assets.image(src, "form-files");
    if (img) { out.set(imgKey(src), img); out.set(src, img); }
  }));
  return out;
}

type Ctx = {
  t: PdfT;
  entry: FormEntry;
  opts: FormRenderOptions;
  images: Map<string, PdfImage>;
  blank: boolean;
  /** Photos reportées en annexe (numérotées, calculées avant rendu). */
  appendix: { label: string; image: PdfImage }[];
  appendixRefs: Map<string, number[]>;
  locale: "fr" | "en";
};

const valueOf = (c: Ctx, cell: RtCell) => (c.blank ? undefined : c.entry.response?.values[cell.lineageId]);

function questionFilled(c: Ctx, q: RtQuestion): boolean {
  if (c.blank) return true;
  if (c.entry.response?.observations[q.lineageId]?.trim()) return true;
  return q.cells.some((cell) => isFilled(q.type, valueOf(c, cell), cell));
}

function Thumbs({ files, c, width = 90 }: { files: FileRef[] | undefined; c: Ctx; width?: number }) {
  const imgs = (files ?? []).map((f) => c.images.get(imgKey(f.fileId))).filter((x): x is PdfImage => !!x);
  if (!imgs.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginVertical: 3 }}>
      {imgs.map((img, i) => (
        <Image key={i} src={{ data: img.data, format: img.format }} style={{ width, height: (img.height / img.width) * width, objectFit: "contain" }} />
      ))}
    </View>
  );
}

function EmptyLine({ lines = 1 }: { lines?: number }) {
  return <View style={{ height: 14 * lines, borderBottomWidth: 0.6, borderBottomColor: PDF_COLORS.border, borderStyle: "dotted", marginBottom: 2 }} />;
}

/** Contenu d'une cellule (option / signataire) selon la nature de la question. */
function CellValue({ c, rubric, q, cell, compact }: { c: Ctx; rubric: RtRubric; q: RtQuestion; cell: RtCell; compact?: boolean }): ReactNode {
  const { t } = c;
  const value = valueOf(c, cell);
  const labels = { true: t("form.yes"), false: t("form.no") };
  switch (q.type) {
    case "unique_choice": case "multiple_choices":
      return <CheckBox checked={value === true} label={compact ? undefined : cell.opt?.name || t("form.option", { n: cell.position })} />;
    case "single_choice_list": case "multiple_choice_list": {
      if (c.blank) return (cell.opt?.choices ?? []).map((ch, i) => <CheckBox key={i} checked={false} label={ch} />);
      const selected = Array.isArray(value) ? value as string[] : value ? [String(value)] : [];
      return <Text>{selected.join(" ; ") || " "}</Text>;
    }
    case "photo": {
      const files = (Array.isArray(value) ? value : []) as FileRef[];
      if (c.blank) return <View style={{ height: 50, borderWidth: 0.5, borderColor: PDF_COLORS.border, borderStyle: "dashed" }} />;
      const imgs = files.map((f) => ({ f, img: c.images.get(imgKey(f.fileId)) })).filter((x) => x.img);
      if (rubric.def.exportImagesInAppendix) {
        const refs = c.appendixRefs.get(cell.lineageId) ?? [];
        return <Text style={s.muted}>{refs.length ? t("form.photoInAppendix", { refs: refs.join(", ") }) : " "}</Text>;
      }
      const width = compact ? 70 : PHOTO_WIDTH[cell.opt?.photoSize ?? q.def.photoSize ?? "m"];
      return (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {imgs.map(({ img }, i) => <Image key={i} src={{ data: img!.data, format: img!.format }} style={{ width, height: (img!.height / img!.width) * width }} />)}
        </View>
      );
    }
    case "file": {
      const files = (Array.isArray(value) ? value : []) as FileRef[];
      if (c.blank) return <EmptyLine />;
      return <Text>{files.map((f) => f.name ?? f.fileId.split("/").pop()).join("\n") || " "}</Text>;
    }
    case "collaborator": {
      const sig = (value ?? null) as SignatureValue | null;
      const img = sig?.signaturePath ? c.images.get(sig.signaturePath) ?? c.images.get(imgKey(sig.signaturePath)) : null;
      const name = sig ? [sig.firstName, sig.lastName].filter(Boolean).join(" ") : null;
      return (
        <View>
          {!compact && cell.slot?.name ? <Text style={[s.small, s.bold]}>{cell.slot.name}</Text> : null}
          <SignatureCell image={img} name={name} sub={[sig?.function, sig?.companyName].filter(Boolean).join(" - ") || null}
            date={sig?.signedAt ? pdfDate(sig.signedAt, c.locale, true) : null}
            empty={cell.slot?.disableSignature ? null : t("form.signHere")} height={compact ? 24 : 34} />
          {sig?.proxied ? <Muted>{t("form.proxied", { name: sig.principal ?? "" })}</Muted> : null}
        </View>
      );
    }
    case "text_editor": {
      if (c.blank) return <EmptyLine lines={3} />;
      const blocks = parseRichContent(value);
      return blocks.length ? <View>{renderRichBlocks(blocks, { images: c.images, maxWidth: compact ? 140 : 460 })}</View> : <Text> </Text>;
    }
    case "formula":
      if (c.blank) return <Muted>{t("form.computed")}</Muted>;
      return <Text>{formatValue(q.type, value, c.locale, labels) || " "}</Text>;
    case "long_answer":
      if (c.blank) return <EmptyLine lines={3} />;
      return <Text>{formatValue(q.type, value, c.locale, labels) || " "}</Text>;
    default:
      if (c.blank) return <View style={{ flexDirection: "row", alignItems: "flex-end" }}><View style={{ flex: 1 }}><EmptyLine /></View>{cell.opt?.unit ? <Text style={s.small}> {cell.opt.unit}</Text> : null}</View>;
      return <Text>{formatValue(q.type, value, c.locale, labels) || " "}</Text>;
  }
}

const MULTI = new Set(["multiple_answers", "unique_choice", "multiple_choices", "value_unit", "collaborator"]);

function QuestionView({ c, rubric, q }: { c: Ctx; rubric: RtRubric; q: RtQuestion }) {
  const { t } = c;
  const cells = MULTI.has(q.type) ? q.cells : q.cells.slice(0, 1);
  const observation = c.blank ? null : c.entry.response?.observations[q.lineageId];
  const bg = q.def.backgroundColor && q.def.backgroundColor.toLowerCase() !== "#ffffff" ? q.def.backgroundColor : undefined;
  const signatures = q.type === "collaborator";
  return (
    <View style={{ borderWidth: 0.6, borderColor: PDF_COLORS.border, marginBottom: 5, backgroundColor: bg }} wrap={q.type === "text_editor" || q.type === "photo"}>
      <View style={{ flexDirection: "row", backgroundColor: PDF_COLORS.zebra, borderBottomWidth: 0.6, borderBottomColor: PDF_COLORS.borderSoft, paddingVertical: 3, paddingHorizontal: 5 }}>
        <Text style={{ flex: 1, fontWeight: 700 }}>
          {q.name}{q.def.mandatory && q.type !== "text_editor" ? <Text style={{ color: PDF_COLORS.danger }}> *</Text> : null}
        </Text>
      </View>
      <View style={{ paddingVertical: 4, paddingHorizontal: 5 }}>
        {q.def.description ? <Text style={[s.small, { marginBottom: 2 }]}>{q.def.description}</Text> : null}
        {q.def.additionalComment ? <Muted style={{ marginBottom: 2 }}>{q.def.additionalComment}</Muted> : null}
        <Thumbs files={q.def.images} c={c} />
        <View style={signatures ? { flexDirection: "row", flexWrap: "wrap", gap: 8 } : {}}>
          {cells.map((cell) => {
            const labelled = MULTI.has(q.type) && !signatures && q.type !== "unique_choice" && q.type !== "multiple_choices";
            return (
              <View key={cell.lineageId} style={signatures ? { width: "47%" } : { flexDirection: labelled ? "row" : "column", marginBottom: 2 }}>
                {labelled ? <Text style={{ width: "35%", color: PDF_COLORS.muted }}>{cell.opt?.name || t("form.option", { n: cell.position })}</Text> : null}
                <View style={labelled ? { flex: 1 } : {}}><CellValue c={c} rubric={rubric} q={q} cell={cell} /></View>
                {cell.opt?.images?.length ? <Thumbs files={cell.opt.images} c={c} width={60} /> : null}
              </View>
            );
          })}
        </View>
        {q.def.withObservation && (observation || c.blank) ? (
          <View style={{ marginTop: 3, borderTopWidth: 0.4, borderTopColor: PDF_COLORS.borderSoft, paddingTop: 2 }}>
            <Text style={[s.small, s.bold]}>{t("form.observation")}</Text>
            {observation ? <Text>{observation}</Text> : <EmptyLine />}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function TableView({ c, rubric, questions, width }: { c: Ctx; rubric: RtRubric; questions: RtQuestion[]; width: number }) {
  const { t } = c;
  const n = tableSize(rubric);
  const byColumns = rubric.def.type === "table_column";
  const hideFirst = rubric.def.firstColumnHidden;
  const dataCols = byColumns ? questions.length : n;
  const firstW = hideFirst ? 0 : Math.min(130, width * 0.25);
  const colW = (width - firstW) / Math.max(1, dataCols);
  const head = (label: ReactNode, w: number, k: string | number) => <View key={k} style={[s.th, { width: w }]}><Text>{label}</Text></View>;
  const td = (node: ReactNode, w: number, k: string | number, bg?: string) => <View key={k} style={[s.td, { width: w, backgroundColor: bg }]}>{node}</View>;
  const cellNode = (q: RtQuestion, cell: RtCell | undefined) => (cell ? <CellValue c={c} rubric={rubric} q={q} cell={cell} compact /> : null);
  return (
    <View style={[s.table, { width }]}>
      <View style={s.tr} wrap={false}>
        {!hideFirst && head(" ", firstW, "corner")}
        {byColumns
          ? questions.map((q) => head(`${q.name}${q.def.mandatory ? " *" : ""}`, colW, q.lineageId))
          : Array.from({ length: n }, (_, j) => head(cellHeader(rubric, j) ?? t("form.column", { n: j + 1 }), colW, j))}
      </View>
      {byColumns
        ? Array.from({ length: n }, (_, i) => (
          <View key={i} style={s.tr} wrap={false}>
            {!hideFirst && td(<Text style={s.bold}>{cellHeader(rubric, i) ?? t("form.row", { n: i + 1 })}</Text>, firstW, "h", PDF_COLORS.headBg)}
            {questions.map((q) => td(cellNode(q, q.cells[i]), colW, q.lineageId, q.def.backgroundColor))}
          </View>
        ))
        : questions.map((q) => (
          <View key={q.lineageId} style={s.tr} wrap={false}>
            {!hideFirst && td(<Text style={s.bold}>{q.name}{q.def.mandatory ? " *" : ""}</Text>, firstW, "h", PDF_COLORS.headBg)}
            {Array.from({ length: n }, (_, j) => td(cellNode(q, q.cells[j]), colW, j, q.def.backgroundColor))}
          </View>
        ))}
    </View>
  );
}

function RubricView({ c, rubric, width }: { c: Ctx; rubric: RtRubric; width: number }) {
  const questions = rubric.questions.filter((q) => !q.def.hideInPdf && (c.opts.includeEmpty || questionFilled(c, q)));
  if (!questions.length && !c.opts.includeEmpty) return null;
  const isTable = rubric.def.type !== "question";
  // Observations des tableaux : sous le tableau.
  const tableObs = isTable && !c.blank ? questions.map((q) => [q.name, c.entry.response?.observations[q.lineageId]] as const).filter(([, o]) => o) : [];
  return (
    <View>
      <SubBand>{`R${rubric.position} - ${rubric.def.name}`}</SubBand>
      {rubric.def.description ? <Text style={[s.small, { marginBottom: 4 }]}>{rubric.def.description}</Text> : null}
      <Thumbs files={rubric.def.images} c={c} width={120} />
      {isTable ? <TableView c={c} rubric={rubric} questions={questions} width={width} /> : questions.map((q) => <QuestionView key={q.lineageId} c={c} rubric={rubric} q={q} />)}
      {tableObs.map(([name, o], i) => <Text key={i} style={s.small}><Text style={s.bold}>{name} : </Text>{o}</Text>)}
      {rubric.def.additionalComment ? <Muted>{rubric.def.additionalComment}</Muted> : null}
    </View>
  );
}

function ResponseHeader({ c }: { c: Ctx }) {
  const { t } = c;
  const def = c.entry.definition;
  const r = c.entry.response;
  if (!r) {
    return <KeyValues items={[{ label: t("form.form"), value: c.entry.formName }, { label: t("form.reference"), value: def.reference ?? "" }, { label: t("form.formIndex"), value: def.indexLabel ?? "" }, { label: t("form.kind"), value: t("form.blank") }]} />;
  }
  return (
    <KeyValues items={[
      { label: t("form.responseRef"), value: r.reference },
      { label: t("form.form"), value: `${c.entry.formName}${r.formIndex ? ` (${t("form.formIndex")} ${r.formIndex})` : ""}` },
      { label: t("form.state"), value: t(`form.states.${r.state}`) },
      { label: t("form.status"), value: r.status ?? "" },
      { label: t("form.createdAt"), value: pdfDate(r.createdAt, c.locale, true) },
      { label: t("form.doneAt"), value: pdfDate(r.doneAt, c.locale, true) },
      { label: t("form.author"), value: r.author ?? "" },
      { label: t("form.flow"), value: [r.flow, r.location].filter(Boolean).join(" — ") },
    ]} />
  );
}

/**
 * Pages d'un formulaire (vierge si `entry.response` est null). Les rubriques consécutives en portrait
 * partagent une page qui se poursuit ; une rubrique paysage a sa propre page.
 */
export function renderFormEntry(entry: FormEntry, env: PageEnv, opts: FormRenderOptions, images: Map<string, PdfImage>, key: string): ReactElement[] {
  const c: Ctx = { t: env.t, entry, opts, images, blank: !entry.response, appendix: [], appendixRefs: new Map(), locale: env.t.locale };
  const model = buildModel(entry.definition, entry.response?.items ?? []);
  const rubrics = model.rubrics.filter((r) => !r.def.hideInPdf);
  // Photos en annexe : numérotation dans l'ordre du formulaire.
  if (entry.response) {
    for (const r of rubrics) {
      if (!r.def.exportImagesInAppendix) continue;
      for (const q of r.questions) {
        if (q.type !== "photo" || q.def.hideInPdf) continue;
        for (const cell of q.cells) {
          const files = (Array.isArray(entry.response.values[cell.lineageId]) ? entry.response.values[cell.lineageId] : []) as FileRef[];
          const refs: number[] = [];
          for (const f of files) {
            const img = images.get(imgKey(f.fileId));
            if (!img) continue;
            c.appendix.push({ label: `${env.t("form.photo")} ${c.appendix.length + 1} — ${q.name}${f.name ? ` (${f.name})` : ""}`, image: img });
            refs.push(c.appendix.length);
          }
          c.appendixRefs.set(cell.lineageId, refs);
        }
      }
    }
  }
  const groups: { landscape: boolean; rubrics: RtRubric[] }[] = [];
  for (const r of rubrics) {
    const landscape = !!r.def.pdfLandscape;
    const last = groups[groups.length - 1];
    if (last && last.landscape === landscape && !landscape) last.rubrics.push(r);
    else groups.push({ landscape, rubrics: [r] });
  }
  if (!groups.length) groups.push({ landscape: false, rubrics: [] });
  const widthOf = (landscape: boolean) => {
    const m = env.marginsFor(landscape) ?? DEFAULT_MARGINS;
    return (landscape ? A4.height : A4.width) - m.left - m.right;
  };
  const title = opts.title ?? (entry.response ? `${entry.formName} — ${entry.response.reference}` : `${entry.formName} — ${env.t("form.blank")}`);
  const pages = groups.map((g, gi) => (
    <DocPage key={`${key}-${gi}`} landscape={g.landscape} frame={env.frameFor(g.landscape)} margins={env.marginsFor(g.landscape)} font={env.font}
      bookmark={gi === 0 ? opts.bookmark ?? title : undefined}>
      {gi === 0 ? (
        <View>
          <Band>{title}</Band>
          {!opts.hideHeader ? <ResponseHeader c={c} /> : null}
          {entry.definition.additionalComment ? <Muted style={{ marginBottom: 4 }}>{entry.definition.additionalComment}</Muted> : null}
        </View>
      ) : null}
      {g.rubrics.map((r) => <RubricView key={r.def.lineageId} c={c} rubric={r} width={widthOf(g.landscape)} />)}
      {gi === 0 && !g.rubrics.length ? <Muted>{env.t("form.noRubric")}</Muted> : null}
    </DocPage>
  ));
  if (c.appendix.length) pages.push(<AppendixPage key={`${key}-photos`} c={c} env={env} />);
  return pages;
}

function AppendixPage({ c, env }: { c: Ctx; env: PageEnv }) {
  const width = widthFor(env);
  return (
    <DocPage frame={env.frameFor(false)} margins={env.marginsFor(false)} font={env.font}>
      <Band>{env.t("form.photoAppendix")}</Band>
      {c.appendix.map((a, i) => (
        <View key={i} wrap={false} style={{ marginBottom: 10 }}>
          <Text style={[s.small, s.bold, { marginBottom: 3 }]}>{a.label}</Text>
          <Image src={{ data: a.image.data, format: a.image.format }} style={{ width: Math.min(width, 420), height: (a.image.height / a.image.width) * Math.min(width, 420) }} />
        </View>
      ))}
    </DocPage>
  );
}

const widthFor = (env: PageEnv) => { const m = env.marginsFor(false) ?? DEFAULT_MARGINS; return A4.width - m.left - m.right; };
