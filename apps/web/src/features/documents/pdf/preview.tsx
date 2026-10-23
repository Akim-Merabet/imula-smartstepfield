/**
 * Aperçus synchrones (sans file d'attente) : formulaire vierge depuis l'éditeur, réponse de formulaire.
 * Même moteur que les documents générés ; données lues avec le client de l'utilisateur (RLS),
 * trames lues avec le client service.
 */
import { Document } from "@react-pdf/renderer";
import type { FormDefinition } from "@/features/forms/types";
import { assemblePdf } from "@/lib/pdf/assemble";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { pdfTranslator, type PdfLocale } from "@/lib/pdf/i18n";
import { renderPdf } from "@/lib/pdf/render";
import { createAssets } from "./context";
import { loadResponses, type FormEntry } from "./form-data";
import { prepareFormImages, renderFormEntry } from "./form-render";
import type { DB } from "./service-client";
import { loadTemplates } from "./templates";

async function renderEntries(db: DB, service: DB, entries: FormEntry[], opts: {
  orgId: string; locale: PdfLocale; title: string; reference?: string | null; footer?: string | null; watermark?: string | null; includeEmpty: boolean;
}) {
  const font = registerPdfFonts();
  const t = pdfTranslator(opts.locale);
  const templates = await loadTemplates(service, opts.orgId, null, null);
  const portrait = templates.get("FORM_GENERIC");
  const landscape = templates.get("FORM_GENERIC_H");
  const frame = { title: opts.title, reference: opts.reference ?? null, footer: opts.footer ?? null };
  const env = {
    t, font,
    marginsFor: (l: boolean) => (l ? landscape : portrait)?.margins ?? null,
    frameFor: (l: boolean) => ((l ? landscape : portrait) ? null : frame),
  };
  const images = await prepareFormImages(entries, createAssets(db));
  const pages = entries.flatMap((e, i) => renderFormEntry(e, env, { includeEmpty: e.response ? opts.includeEmpty : true }, images, `p${i}`));
  const content = await renderPdf(<Document title={opts.title} language={t.locale}>{pages}</Document>);
  const res = await assemblePdf(
    [{ bytes: content, background: portrait || landscape ? { portrait: portrait?.bytes ?? null, landscape: landscape?.bytes ?? null } : null }],
    { title: opts.title, language: t.locale, watermark: opts.watermark, pageNumbers: { label: (n, total) => t("page", { n, total }), position: portrait?.pageNumber ?? null } },
  );
  return res;
}

export async function formBlankPreview(db: DB, service: DB, input: { orgId: string; locale: PdfLocale; definition: FormDefinition; formName: string; watermark?: string | null }) {
  const t = pdfTranslator(input.locale);
  return renderEntries(db, service, [{ definition: input.definition, formName: input.formName, response: null }], {
    orgId: input.orgId, locale: input.locale, title: `${input.formName} — ${t("form.blank")}`,
    reference: [input.definition.reference, input.definition.indexLabel ? `${t("cover.index")} ${input.definition.indexLabel}` : null].filter(Boolean).join("  ·  ") || null,
    watermark: input.watermark, includeEmpty: true,
  });
}

export async function responsePreview(db: DB, service: DB, input: { orgId: string; locale: PdfLocale; responseId: string; includeEmpty: boolean; footer?: string | null; watermark?: string | null }) {
  const entries = await loadResponses(db, [input.responseId]);
  if (!entries.length) return null;
  const e = entries[0];
  return renderEntries(db, service, entries, {
    orgId: input.orgId, locale: input.locale, title: e.formName, reference: e.response?.reference ?? null,
    footer: input.footer, watermark: input.watermark, includeEmpty: input.includeEmpty,
  });
}
