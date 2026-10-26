/**
 * Collecte commune d'une génération : document, version, historique des indices, entité, client, compte,
 * famille + libellés de suivi, collaborateurs, trames ; chargeur d'images (Storage / data URL) avec cache.
 */
import type { Tables } from "@/lib/supabase/database.types";
import { pdfDate, pdfTranslator, type PdfT } from "@/lib/pdf/i18n";
import { imageFromDataUrl, preparePdfImage, type PdfImage } from "@/lib/pdf/images";
import type { CoverInfo, FrameInfo, VersionRow } from "@/lib/pdf/primitives";
import type { Margins } from "@/lib/pdf/theme";
import { DEFAULT_WORDING_COLORS, stateKey, type WordingFields, type WordingKey } from "../meta";
import type { DB } from "./service-client";
import { loadTemplates, type TemplateSet } from "./templates";

export type DocumentRow = Tables<"documents">;
export type VersionRowDb = Tables<"document_versions">;

export type Assets = {
  /** Image d'un objet Storage (bucket, chemin) ou d'une data URL ; null si absente / illisible. */
  image: (src: string | null | undefined, bucket?: string) => Promise<PdfImage | null>;
  /** Octets bruts d'un objet Storage. */
  file: (bucket: string, path: string | null | undefined) => Promise<Uint8Array | null>;
};

export function createAssets(db: DB): Assets {
  const images = new Map<string, Promise<PdfImage | null>>();
  const file = async (bucket: string, path: string | null | undefined) => {
    if (!path) return null;
    const { data } = await db.storage.from(bucket).download(path);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  };
  const image = (src: string | null | undefined, bucket = "form-files") => {
    if (!src) return Promise.resolve(null);
    const key = `${bucket}:${src}`;
    if (!images.has(key)) {
      images.set(key, (async () => {
        if (src.startsWith("data:")) return imageFromDataUrl(src);
        if (/^https?:\/\//.test(src)) {
          // Uniquement le stockage du projet : une valeur saisie (signature, image) ne doit pas faire télécharger au
          // serveur une URL arbitraire (réseau interne, métadonnées du cloud).
          if (!isStorageUrl(src)) return null;
          try {
            const res = await fetch(src);
            return res.ok ? preparePdfImage(new Uint8Array(await res.arrayBuffer())) : null;
          } catch { return null; }
        }
        const bytes = await file(bucket, src);
        return bytes ? preparePdfImage(bytes) : null;
      })());
    }
    return images.get(key)!;
  };
  return { image, file };
}

export type People = Map<string, { name: string; company: string | null; trigram: string | null }>;

export async function loadPeople(db: DB, ids: (string | null | undefined)[]): Promise<People> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out: People = new Map();
  if (!unique.length) return out;
  const { data } = await db.from("collaborators").select("id, first_name, last_name, trigram, company:companies(name)").in("id", unique);
  for (const c of data ?? []) {
    out.set(c.id, { name: `${c.first_name} ${c.last_name}`.trim(), company: (c.company as { name: string } | null)?.name ?? null, trigram: c.trigram });
  }
  return out;
}

export type GenContext = {
  db: DB;
  t: PdfT;
  font: string;
  assets: Assets;
  doc: DocumentRow;
  version: VersionRowDb;
  versions: VersionRowDb[];
  project: Tables<"projects"> | null;
  client: Tables<"clients"> | null;
  account: Tables<"accounts">;
  family: Tables<"label_families"> | null;
  wording: WordingFields;
  people: People;
  templates: TemplateSet;
  /** Version « avant données terrain » : signatures, réponses et observations omises. */
  withoutFieldData: boolean;
  options: Record<string, boolean>;
  generatedAt: Date;
};

export function stateLabel(ctx: Pick<GenContext, "t" | "wording">, v: Pick<VersionRowDb, "state" | "step">): { label: string; color: string; key: WordingKey } {
  const key = stateKey(v);
  const entry = ctx.wording[key];
  return { key, label: entry?.value || ctx.t.doc(`wording.${key}.value`), color: entry?.color || DEFAULT_WORDING_COLORS[key] || "#828282" };
}

export function personName(ctx: Pick<GenContext, "people">, id: string | null | undefined) {
  return id ? ctx.people.get(id)?.name ?? "" : "";
}

const storageOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin; } catch { return null; }
})();
const isStorageUrl = (src: string) => {
  try { return !!storageOrigin && new URL(src).origin === storageOrigin; } catch { return false; }
};

/** Charge le contexte de génération d'une version de document. */
export async function loadGenContext(db: DB, versionId: string, opts: { withoutFieldData?: boolean; uiLocale?: "fr" | "en"; font: string; assetsDb?: DB; templatesDb?: DB }):
  Promise<GenContext | null> {
  const { data: version } = await db.from("document_versions").select("*").eq("id", versionId).maybeSingle();
  if (!version) return null;
  const { data: doc } = await db.from("documents").select("*").eq("id", version.document_id).maybeSingle();
  if (!doc) return null;
  const [{ data: versions }, projectRes, { data: account }, { data: family }] = await Promise.all([
    db.from("document_versions").select("*").eq("document_id", doc.id).order("seq"),
    doc.project_id ? db.from("projects").select("*").eq("id", doc.project_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("accounts").select("*").eq("id", doc.account_id).maybeSingle(),
    db.from("label_families").select("*").eq("id", doc.family_id).maybeSingle(),
  ]);
  if (!account) return null;
  const project = (projectRes.data ?? null) as Tables<"projects"> | null;
  const { data: client } = project?.client_id ? await db.from("clients").select("*").eq("id", project.client_id).maybeSingle() : { data: null };
  const lang1 = doc.language_1 !== "none" ? doc.language_1 : project?.export_language_1 !== "none" ? project?.export_language_1 : account.doc_language_1;
  const { data: org } = await db.from("organizations").select("flow_term").eq("id", account.organization_id).maybeSingle();
  const t = pdfTranslator(lang1, doc.language_2, opts.uiLocale ?? "fr", org?.flow_term ?? "flow");
  let wording: WordingFields = {};
  if (family?.wording_configuration_id) {
    const { data: langs } = await db.from("wording_configuration_languages").select("language, fields").eq("wording_configuration_id", family.wording_configuration_id);
    const row = langs?.find((r) => r.language === t.locale) ?? langs?.find((r) => r.language === "fr") ?? langs?.[0];
    wording = (row?.fields ?? {}) as WordingFields;
  }
  const all = versions ?? [version];
  const people = await loadPeople(db, all.flatMap((v) => [v.redactor_id, v.checker_id, v.approver_id, v.quality_supervisor_id, v.safety_supervisor_id, v.bpe_user_id, v.bpa_user_id, v.diffused_by]));
  const templates = await loadTemplates(opts.templatesDb ?? db, doc.organization_id, doc.family_id, project?.client_id ?? null);
  return {
    db, t, font: opts.font, assets: createAssets(opts.assetsDb ?? db), doc, version, versions: all,
    project, client: (client ?? null) as Tables<"clients"> | null, account, family: family ?? null, wording, people, templates,
    withoutFieldData: !!opts.withoutFieldData, options: (doc.options ?? {}) as Record<string, boolean>, generatedAt: new Date(),
  };
}

/** Lignes du tableau de suivi des indices (N derniers selon la trame / le client). */
export function versionRows(ctx: GenContext, followTemplateMax?: number | null): VersionRow[] {
  const max = followTemplateMax ?? ctx.client?.index_max ?? null;
  const upTo = ctx.versions.filter((v) => v.seq <= ctx.version.seq);
  const list = max && max > 0 ? upTo.slice(-max) : upTo;
  return list.map((v) => {
    const st = stateLabel(ctx, v);
    return {
      index: v.index_label, date: pdfDate(v.diffusion_date ?? v.created_at, ctx.t.locale), state: st.label, stateColor: st.color,
      redactor: personName(ctx, v.redactor_id), checker: personName(ctx, v.checker_id), approver: personName(ctx, v.approver_id),
      comment: v.diffusion_comment ?? "",
    };
  });
}

export function refsOf(ctx: GenContext) {
  const refInt = [ctx.doc.ref_int, ctx.version.complement_ref_int].filter(Boolean).join(" ");
  const refExt = [ctx.doc.ref_ext, ctx.version.complement_ref_ext].filter(Boolean).join(" ");
  return { refInt: refInt || null, refExt: refExt || null };
}

export function frameOf(ctx: GenContext): FrameInfo {
  const { refInt, refExt } = refsOf(ctx);
  const st = stateLabel(ctx, ctx.version);
  return {
    title: ctx.doc.name,
    reference: [refInt, refExt].filter(Boolean).join("  ·  ") || null,
    indexLabel: ctx.doc.nature === "pdf_unversioned" ? null : `${ctx.t("cover.index")} ${ctx.version.index_label} - ${st.label}`,
    footer: [ctx.project?.designation, ctx.client?.name].filter(Boolean).join(" — ") || null,
  };
}

export async function coverInfo(ctx: GenContext, typeLabel?: string): Promise<CoverInfo> {
  const { refInt, refExt } = refsOf(ctx);
  const st = stateLabel(ctx, ctx.version);
  const logoBox = (ctx.account.cover_logo ?? null) as { x?: number; y?: number; width?: number; height?: number } | null;
  const logoPath = ctx.client?.logo_path ?? ctx.account.logo_path;
  let logo: PdfImage | null = null;
  for (const bucket of ["documents", "form-files"]) {
    if (logo || !logoPath) break;
    logo = await ctx.assets.image(logoPath, bucket);
  }
  return {
    title: ctx.doc.name,
    typeLabel: typeLabel ?? ctx.t.doc(`natures.${ctx.doc.nature}`),
    refInt, refExt,
    index: ctx.version.index_label,
    state: { label: st.label, color: st.color },
    client: ctx.client?.name ?? null,
    entity: ctx.project?.designation ?? null,
    family: ctx.family ? [ctx.family.short_name, ctx.family.long_name].filter(Boolean).join(" - ") : null,
    account: ctx.account.full_name || ctx.account.name,
    createdAt: pdfDate(ctx.doc.created_at, ctx.t.locale),
    diffusionDate: pdfDate(ctx.version.diffusion_date, ctx.t.locale),
    generatedAt: pdfDate(ctx.generatedAt, ctx.t.locale, true),
    logo,
    logoBox: logoBox && logoBox.width && logoBox.height ? { x: logoBox.x ?? 48, y: logoBox.y ?? 48, width: logoBox.width, height: logoBox.height } : null,
    versions: versionRows(ctx),
  };
}

/** Valeurs des champs nommés d'une trame de page de garde (convention documentée dans pdf.json → fields). */
export function templateFieldValues(ctx: GenContext): Record<string, string> {
  const { refInt, refExt } = refsOf(ctx);
  const st = stateLabel(ctx, ctx.version);
  const v = ctx.version;
  const p = ctx.project;
  const values: Record<string, string> = {
    doc_name: ctx.doc.name, doc_type: ctx.t.doc(`natures.${ctx.doc.nature}`), doc_ref_int: refInt ?? "", doc_ref_ext: refExt ?? "",
    doc_index: v.index_label, doc_state: st.label, doc_diffusion_date: pdfDate(v.diffusion_date, ctx.t.locale),
    doc_diffusion_comment: v.diffusion_comment ?? "", doc_family: ctx.family?.short_name ?? "",
    doc_redactor: personName(ctx, v.redactor_id), doc_redactor_date: pdfDate(v.redactor_date, ctx.t.locale),
    doc_checker: personName(ctx, v.checker_id), doc_checker_date: pdfDate(v.checker_date, ctx.t.locale),
    doc_approver: personName(ctx, v.approver_id), doc_approver_date: pdfDate(v.approver_date, ctx.t.locale),
    project_designation: p?.designation ?? "", project_business_ref: p?.business_ref ?? "", project_contract_ref: p?.contract_ref ?? "",
    project_market_number: p?.market_number ?? "", project_location: p?.location_label ?? "",
    client_name: ctx.client?.name ?? "", account_name: ctx.account.name, generated_at: pdfDate(ctx.generatedAt, ctx.t.locale),
  };
  // Déclinaison multi-indice : suffixe « Indice » + rang (1 = indice précédent).
  const previous = ctx.versions.filter((x) => x.seq < v.seq).reverse();
  previous.forEach((x, i) => {
    values[`doc_indexIndice${i + 1}`] = x.index_label;
    values[`doc_dateIndice${i + 1}`] = pdfDate(x.diffusion_date, ctx.t.locale);
    values[`doc_stateIndice${i + 1}`] = stateLabel(ctx, x).label;
  });
  return values;
}

/** Marges / trame d'une orientation donnée. */
export function contentLayout(ctx: GenContext, portraitType: string, landscapeType: string) {
  const portrait = ctx.templates.get(portraitType);
  const landscape = ctx.templates.get(landscapeType);
  const marginsFor = (isLandscape: boolean): Margins | null => (isLandscape ? landscape : portrait)?.margins ?? null;
  const frameFor = (isLandscape: boolean): FrameInfo | null => ((isLandscape ? landscape : portrait) ? null : frameOf(ctx));
  return {
    marginsFor, frameFor,
    background: portrait || landscape ? { portrait: portrait?.bytes ?? null, landscape: landscape?.bytes ?? null } : null,
    pageNumber: portrait?.pageNumber ?? landscape?.pageNumber ?? null,
  };
}
