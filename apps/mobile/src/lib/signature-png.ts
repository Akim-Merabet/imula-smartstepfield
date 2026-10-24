// Dessin de signature → PNG (data URL), en JavaScript pur : même format que la WebApp (signature_pad,
// « image/png »), lisible par le PDF et sans module natif. Fond transparent, trait noir anti-crénelé.
import { deflate } from "pako";

export type Point = { x: number; y: number };
export type Stroke = Point[];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
      + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return out;
}

/** Encode une image RGBA en PNG (filtre « aucun », compression zlib). */
export function encodePng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA, compression/filtre/entrelacement standard
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflate(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Trace les traits (coordonnées dans la zone de dessin `width × height`) dans une image `scale` fois plus grande. */
export function rasterize(strokes: Stroke[], width: number, height: number, opts: { scale?: number; lineWidth?: number } = {}) {
  const scale = opts.scale ?? 2;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const radius = ((opts.lineWidth ?? 2.5) * scale) / 2;
  const alpha = new Float32Array(w * h);

  // Tampon disque anti-crénelé : couverture = distance au bord, cumulée au maximum (pas de surépaisseur).
  const stamp = (cx: number, cy: number) => {
    const r = radius + 1;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const cover = Math.min(1, Math.max(0, radius + 0.5 - d));
        if (cover > alpha[y * w + x]) alpha[y * w + x] = cover;
      }
    }
  };

  for (const stroke of strokes) {
    const pts = stroke.map((p) => ({ x: p.x * scale, y: p.y * scale }));
    if (pts.length === 1) stamp(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5));
      for (let s = 0; s <= steps; s++) stamp(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps);
    }
  }

  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba[i * 4 + 3] = Math.round(alpha[i] * 255);
  return { rgba, width: w, height: h };
}

/** Data URL PNG du dessin, ou null s'il est vide. */
export function signatureToPng(strokes: Stroke[], width: number, height: number): string | null {
  if (!strokes.some((s) => s.length > 0)) return null;
  const { rgba, width: w, height: h } = rasterize(strokes, width, height);
  return `data:image/png;base64,${base64(encodePng(rgba, w, h))}`;
}
