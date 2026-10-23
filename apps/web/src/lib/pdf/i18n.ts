import frPdf from "../../../messages/fr/pdf.json";
import enPdf from "../../../messages/en/pdf.json";
import frDocs from "../../../messages/fr/documents.json";
import enDocs from "../../../messages/en/documents.json";

/** Langues d'export (enum export_language) ; de/it retombent sur l'anglais (libellés non traduits). */
export type ExportLanguage = "none" | "fr" | "en" | "de" | "it";
export type PdfLocale = "fr" | "en";

type Dict = Record<string, unknown>;
const DICTS: Record<PdfLocale, { pdf: Dict; documents: Dict }> = {
  fr: { pdf: frPdf as Dict, documents: frDocs as Dict },
  en: { pdf: enPdf as Dict, documents: enDocs as Dict },
};

export function toPdfLocale(lang: string | null | undefined, fallback: PdfLocale = "fr"): PdfLocale {
  if (lang === "fr") return "fr";
  if (lang === "en" || lang === "de" || lang === "it") return "en";
  return fallback;
}

function lookup(dict: Dict, path: string): string | undefined {
  let cur: unknown = dict;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Dict)) cur = (cur as Dict)[part];
    else return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

const fill = (msg: string, vars?: Record<string, string | number | null | undefined>) =>
  vars ? msg.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] === undefined || vars[k] === null ? "" : String(vars[k]))) : msg;

export type PdfT = {
  locale: PdfLocale;
  secondary: PdfLocale | null;
  /** Libellé PDF (namespace pdf) dans la langue 1. */
  (key: string, vars?: Record<string, string | number | null | undefined>): string;
  /** Libellé bilingue « L1 / L2 » si une langue 2 est définie (en-têtes, pages techniques). */
  b: (key: string, vars?: Record<string, string | number | null | undefined>) => string;
  /** Libellé du namespace documents (natures, libellés de suivi par défaut). */
  doc: (key: string, vars?: Record<string, string | number | null | undefined>) => string;
  has: (key: string) => boolean;
};

/** Traducteur des PDF : langue d'export 1 (+ 2 optionnelle). */
export function pdfTranslator(lang1: string | null | undefined, lang2?: string | null, uiFallback: PdfLocale = "fr"): PdfT {
  const locale = toPdfLocale(lang1, uiFallback);
  const second = lang2 && lang2 !== "none" ? toPdfLocale(lang2, locale) : null;
  const secondary = second && second !== locale ? second : null;
  const get = (loc: PdfLocale, ns: "pdf" | "documents", key: string) =>
    lookup(DICTS[loc][ns], key) ?? lookup(DICTS.fr[ns], key) ?? key;
  const t = ((key, vars) => fill(get(locale, "pdf", key), vars)) as PdfT;
  t.locale = locale;
  t.secondary = secondary;
  t.b = (key, vars) => {
    const a = fill(get(locale, "pdf", key), vars);
    if (!secondary) return a;
    const b = fill(get(secondary, "pdf", key), vars);
    return a === b ? a : `${a} / ${b}`;
  };
  t.doc = (key, vars) => fill(get(locale, "documents", key), vars);
  t.has = (key) => lookup(DICTS[locale].pdf, key) !== undefined;
  return t;
}

/** Formatage de dates selon la langue 1. */
export function pdfDate(value: string | Date | null | undefined, locale: PdfLocale, withTime = false): string {
  if (!value) return "";
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", withTime
    ? { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }
    : { dateStyle: "short", timeZone: "Europe/Paris" });
}
