/**
 * Habillage et assemblage pdf-lib : trames en fond (embedPage), concaténation de parties (contenu
 * @react-pdf, PDF externes en annexe, sections de dossier de clôture), numérotation « n / N »,
 * filigrane, champs AcroForm des trames de page de garde. Pur (aucun accès réseau / base).
 */
import { degrees, PDFDict, PDFDocument, PDFName, PDFTextField, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

export type PdfPart = {
  bytes: Uint8Array;
  /** Trame (PDF vierge) posée en fond de chaque page de la partie ; variante par orientation possible. */
  background?: Uint8Array | { portrait?: Uint8Array | null; landscape?: Uint8Array | null } | null;
  /** Numérotée (n / N) ; la page de garde ne l'est pas. */
  numbered?: boolean;
  /** Libellé (sommaire / diagnostic). */
  label?: string;
};

export type PageNumberOptions = {
  label: (n: number, total: number) => string;
  /** Position (pt, origine en bas à gauche) ; défaut : bas droite. */
  position?: { x: number; y: number } | null;
  fontSize?: number;
};

export type AssembleOptions = {
  pageNumbers?: PageNumberOptions | null;
  watermark?: string | null;
  title?: string;
  author?: string;
  subject?: string;
  language?: string;
};

export type AssembleResult = {
  bytes: Uint8Array;
  pageCount: number;
  /** Index (0-based) de la première page de chaque partie dans le document final. */
  starts: number[];
  /** Pages par partie. */
  counts: number[];
  /** Index des parties illisibles (PDF chiffré / corrompu) — ignorées. */
  failed: number[];
};

const charsets = new WeakMap<PDFFont, Set<number>>();
/** Remplace les caractères non encodables en WinAnsi (polices standard pdf-lib). */
export function toWinAnsi(text: string, font: PDFFont): string {
  let set = charsets.get(font);
  if (!set) { set = new Set(font.getCharacterSet()); charsets.set(font, set); }
  let out = "";
  for (const ch of text.normalize("NFC")) {
    if (ch === "\n" || set.has(ch.codePointAt(0)!)) { out += ch; continue; }
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out += base && [...base].every((c) => set.has(c.codePointAt(0)!)) ? base : "?";
  }
  return out;
}

/**
 * Les PDF @react-pdf nomment leurs sous-ensembles de police de façon déterministe (« CZZZZZ+Roboto-Bold ») :
 * concaténés, plusieurs sous-ensembles différents porteraient le même nom et certains lecteurs les confondent.
 * On renomme le préfixe de sous-ensemble de chaque partie.
 */
function uniquifyFontSubsets(doc: PDFDocument, partIndex: number) {
  const tag = (n: number) => {
    let out = "";
    let x = n;
    for (let i = 0; i < 6; i++) { out = String.fromCharCode(65 + (x % 26)) + out; x = Math.floor(x / 26); }
    return out;
  };
  let k = 0;
  const renamed = new Map<string, string>();
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    for (const key of ["BaseFont", "FontName"]) {
      const v = obj.get(PDFName.of(key));
      if (!(v instanceof PDFName)) continue;
      const name = v.decodeText();
      const m = /^[A-Z]{6}\+(.+)$/.exec(name);
      if (!m) continue;
      if (!renamed.has(name)) renamed.set(name, `${tag(partIndex * 97 + k++ + 1)}+${m[1]}`);
      obj.set(PDFName.of(key), PDFName.of(renamed.get(name)!));
    }
  }
}

/** Charge un PDF ; null si chiffré ou illisible. */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument | null> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return doc.isEncrypted ? null : doc;
  } catch {
    return null;
  }
}

export async function countPages(bytes: Uint8Array): Promise<number> {
  const doc = await loadPdf(bytes);
  return doc ? doc.getPageCount() : 0;
}

/** Vrai si le PDF est protégé par mot de passe (import refusé). */
export async function isEncryptedPdf(bytes: Uint8Array): Promise<boolean> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return doc.isEncrypted;
  } catch {
    return false;
  }
}

function drawPageNumber(page: PDFPage, text: string, font: PDFFont, opts: PageNumberOptions) {
  const size = opts.fontSize ?? 8;
  const safe = toWinAnsi(text, font);
  const width = font.widthOfTextAtSize(safe, size);
  const { width: pw } = page.getSize();
  const x = opts.position ? opts.position.x : pw - 42 - width;
  const y = opts.position ? opts.position.y : 22;
  page.drawText(safe, { x, y, size, font, color: rgb(0.32, 0.37, 0.45) });
}

function drawWatermark(page: PDFPage, text: string, font: PDFFont) {
  const safe = toWinAnsi(text, font);
  const { width, height } = page.getSize();
  const diag = Math.sqrt(width * width + height * height);
  const size = Math.max(18, Math.min(72, (diag * 0.7) / Math.max(1, font.widthOfTextAtSize(safe, 1))));
  const tw = font.widthOfTextAtSize(safe, size);
  const angle = Math.atan2(height, width);
  // Centre la ligne de base sur le centre de la page, le long de la diagonale.
  const x = width / 2 - (Math.cos(angle) * tw) / 2 + (Math.sin(angle) * size) / 3;
  const y = height / 2 - (Math.sin(angle) * tw) / 2 - (Math.cos(angle) * size) / 3;
  page.drawText(safe, { x, y, size, font, color: rgb(0.55, 0.58, 0.62), opacity: 0.14, rotate: degrees((angle * 180) / Math.PI) });
}

/**
 * Concatène les parties dans l'ordre : pages copiées telles quelles, ou recomposées sur la trame de fond
 * (fond = 1re page de la trame mise à l'échelle de la page de contenu). Puis numérotation et filigrane.
 */
export async function assemblePdf(parts: PdfPart[], opts: AssembleOptions = {}): Promise<AssembleResult> {
  const out = await PDFDocument.create();
  if (opts.title) out.setTitle(opts.title);
  if (opts.author) out.setAuthor(opts.author);
  if (opts.subject) out.setSubject(opts.subject);
  if (opts.language) out.setLanguage(opts.language);
  out.setProducer("SiteFlow PDF");
  out.setCreator("SiteFlow");

  const starts: number[] = [];
  const counts: number[] = [];
  const failed: number[] = [];
  const numbered: boolean[] = [];
  const bgCache = new Map<Uint8Array, PDFDocument | null>();

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    starts.push(out.getPageCount());
    const src = await loadPdf(part.bytes);
    if (!src || src.getPageCount() === 0) { failed.push(i); counts.push(0); continue; }
    uniquifyFontSubsets(src, i);
    const bgOf = async (bytes: Uint8Array | null | undefined) => {
      if (!bytes) return null;
      if (!bgCache.has(bytes)) bgCache.set(bytes, await loadPdf(bytes));
      const d = bgCache.get(bytes) ?? null;
      return d && d.getPageCount() > 0 ? d : null;
    };
    const bgSpec = part.background;
    const portraitBg = await bgOf(bgSpec instanceof Uint8Array ? bgSpec : bgSpec?.portrait);
    const landscapeBg = await bgOf(bgSpec instanceof Uint8Array ? bgSpec : bgSpec?.landscape);
    if (portraitBg || landscapeBg) {
      const embeddedBg = new Map<PDFDocument, Awaited<ReturnType<typeof out.embedPdf>>[number]>();
      const bgPageFor = async (d: PDFDocument) => {
        if (!embeddedBg.has(d)) embeddedBg.set(d, (await out.embedPdf(d, [0]))[0]);
        return embeddedBg.get(d)!;
      };
      const embedded = await out.embedPdf(src, src.getPageIndices());
      for (const emb of embedded) {
        const { width, height } = emb.size();
        const page = out.addPage([width, height]);
        const d = width > height ? landscapeBg : portraitBg;
        if (d) page.drawPage(await bgPageFor(d), { x: 0, y: 0, width, height });
        page.drawPage(emb, { x: 0, y: 0, width, height });
      }
    } else {
      const copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach((p) => out.addPage(p));
    }
    const n = out.getPageCount() - starts[i];
    counts.push(n);
    for (let k = 0; k < n; k++) numbered.push(part.numbered !== false);
  }

  const total = out.getPageCount();
  if (total === 0) out.addPage();
  if (opts.pageNumbers || opts.watermark) {
    const font = await out.embedFont(StandardFonts.Helvetica);
    const pages = out.getPages();
    pages.forEach((page, idx) => {
      if (opts.watermark) drawWatermark(page, opts.watermark, font);
      if (opts.pageNumbers && numbered[idx]) drawPageNumber(page, opts.pageNumbers.label(idx + 1, total), font, opts.pageNumbers);
    });
  }
  const bytes = await out.save({ useObjectStreams: true });
  return { bytes, pageCount: out.getPageCount(), starts, counts, failed };
}

/**
 * Trame de page de garde : remplit les champs texte AcroForm dont le nom (insensible à la casse) figure
 * dans `values`, puis aplatit le formulaire. Renvoie aussi les noms de champs non reconnus.
 */
export async function fillTemplateFields(template: Uint8Array, values: Record<string, string | null | undefined>):
  Promise<{ bytes: Uint8Array; unknown: string[] }> {
  const doc = await PDFDocument.load(template);
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lower = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v ?? ""]));
  const unknown: string[] = [];
  for (const field of form.getFields()) {
    const name = field.getName();
    if (!(field instanceof PDFTextField)) continue;
    const value = lower.get(name.toLowerCase());
    if (value === undefined) { unknown.push(name); continue; }
    field.setText(toWinAnsi(value, font));
  }
  form.updateFieldAppearances(font);
  form.flatten();
  return { bytes: await doc.save(), unknown };
}

/** PDF minimal d'une page (intercalaire, page de remplacement d'une annexe illisible). */
export async function textPagePdf(lines: { text: string; size?: number; bold?: boolean }[], size: [number, number] = [595.28, 841.89]):
  Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(size);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = size[1] / 2 + (lines.length * 18) / 2;
  for (const l of lines) {
    const font = l.bold ? bold : regular;
    const fs = l.size ?? 12;
    const text = toWinAnsi(l.text, font);
    const w = font.widthOfTextAtSize(text, fs);
    page.drawText(text, { x: Math.max(30, (size[0] - w) / 2), y, size: fs, font, color: rgb(0.12, 0.23, 0.37) });
    y -= fs * 1.6;
  }
  return doc.save();
}
