// Géométrie de l'éditeur d'image (annotation des photos, spec 05 §4.7.3), sans dépendance React : testable.
export type Tool = "sharpie" | "eraser" | "line" | "arrow" | "rectangle" | "ellipse" | "text";
export type Pt = { x: number; y: number };
export type Shape =
  | { kind: "sharpie"; color: string; width: number; points: Pt[] }
  | { kind: "line" | "arrow" | "rectangle" | "ellipse"; color: string; width: number; a: Pt; b: Pt }
  | { kind: "text"; color: string; size: number; at: Pt; text: string };

export const pathOf = (p: Pt[]) => p.length === 1
  ? `M${p[0].x} ${p[0].y} l0.1 0`
  : p.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" ");

export function arrowHead(a: Pt, b: Pt, width: number) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const len = Math.max(width * 4, 12);
  const side = (d: number) => `${(b.x - len * Math.cos(angle + d)).toFixed(1)} ${(b.y - len * Math.sin(angle + d)).toFixed(1)}`;
  return `M${side(Math.PI / 7)} L${b.x.toFixed(1)} ${b.y.toFixed(1)} L${side(-Math.PI / 7)}`;
}

/** Forme sous le point (la plus récente d'abord), avec une tolérance pour viser les traits fins. */
export function shapeAt(shapes: Shape[], p: Pt, tolerance: number): number {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    const pts = s.kind === "sharpie" ? s.points : s.kind === "text" ? [s.at, { x: s.at.x + s.size * 0.6 * s.text.length, y: s.at.y - s.size }] : [s.a, s.b];
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    if (p.x >= Math.min(...xs) - tolerance && p.x <= Math.max(...xs) + tolerance
      && p.y >= Math.min(...ys) - tolerance && p.y <= Math.max(...ys) + tolerance) return i;
  }
  return -1;
}

