import sharp from "sharp";

/** Image prête pour @react-pdf (PNG/JPEG uniquement) avec ses dimensions en pixels. */
export type PdfImage = { data: Buffer; format: "png" | "jpg"; width: number; height: number };

/** Taille max (px) du plus grand côté : ~200 dpi sur une demi-page A4 (R2.23). */
const MAX_SIDE = 1600;

/**
 * Normalise une image quelconque (JPEG, PNG, WebP, HEIC si supporté…) : rotation EXIF, redimensionnement,
 * ré-encodage JPEG qualité 80 (PNG conservé si transparence). Renvoie null si l'image est illisible.
 */
export async function preparePdfImage(input: Buffer | Uint8Array): Promise<PdfImage | null> {
  try {
    const img = sharp(Buffer.from(input), { failOn: "none" }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;
    const resized = meta.width > MAX_SIDE || meta.height > MAX_SIDE
      ? img.resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      : img;
    if (meta.hasAlpha) {
      const { data, info } = await resized.png({ compressionLevel: 8 }).toBuffer({ resolveWithObject: true });
      return { data, format: "png", width: info.width, height: info.height };
    }
    const { data, info } = await resized.jpeg({ quality: 80, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    return { data, format: "jpg", width: info.width, height: info.height };
  } catch {
    return null;
  }
}

/** Data URL (signatures dessinées) → image PDF. */
export async function imageFromDataUrl(dataUrl: string): Promise<PdfImage | null> {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
  return preparePdfImage(buf);
}
