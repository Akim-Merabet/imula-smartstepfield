import { StyleSheet } from "@react-pdf/renderer";

/** Palette et styles communs des PDF générés (sobres, imprimables). */
export const PDF_COLORS = {
  ink: "#1d2633",
  muted: "#5f6b7a",
  faint: "#8a94a3",
  primary: "#1f3a5f",
  primarySoft: "#e8eef6",
  border: "#c9d1db",
  borderSoft: "#e3e8ee",
  headBg: "#eef2f6",
  zebra: "#f7f9fb",
  success: "#1b7f3a",
  warning: "#b25f0a",
  danger: "#ab2b26",
  callout: {
    info: { border: "#2f6fb5", bg: "#eaf2fb" },
    warning: { border: "#c77a14", bg: "#fdf3e4" },
    error: { border: "#b3332d", bg: "#fbeaea" },
    note: { border: "#7d8794", bg: "#f2f4f6" },
    success: { border: "#2c8a49", bg: "#e8f5ec" },
  },
} as const;

/** Points (1 pt = 1/72 in). A4 = 595.28 × 841.89. */
export const A4 = { width: 595.28, height: 841.89 } as const;
export const DEFAULT_MARGINS = { top: 62, bottom: 52, left: 42, right: 42 } as const;
export type Margins = { top: number; bottom: number; left: number; right: number };

export const s = StyleSheet.create({
  body: { fontSize: 9.5, color: PDF_COLORS.ink, lineHeight: 1.35 },
  h1: { fontSize: 15, fontWeight: 700, color: PDF_COLORS.primary, marginBottom: 8, marginTop: 4 },
  h2: { fontSize: 12.5, fontWeight: 700, color: PDF_COLORS.primary, marginTop: 10, marginBottom: 5 },
  h3: { fontSize: 11, fontWeight: 700, color: PDF_COLORS.ink, marginTop: 8, marginBottom: 4 },
  h4: { fontSize: 10, fontWeight: 700, color: PDF_COLORS.ink, marginTop: 6, marginBottom: 3 },
  small: { fontSize: 8, color: PDF_COLORS.muted },
  muted: { color: PDF_COLORS.muted },
  italic: { fontStyle: "italic" },
  bold: { fontWeight: 700 },
  para: { marginBottom: 4 },
  row: { flexDirection: "row" },
  // Tableaux
  table: { borderWidth: 0.6, borderColor: PDF_COLORS.border, borderRightWidth: 0, borderBottomWidth: 0, marginBottom: 8 },
  tr: { flexDirection: "row" },
  th: {
    backgroundColor: PDF_COLORS.headBg, fontWeight: 700, fontSize: 8.5, color: PDF_COLORS.primary,
    borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: PDF_COLORS.border, paddingVertical: 4, paddingHorizontal: 4,
  },
  td: { fontSize: 8.5, borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: PDF_COLORS.border, paddingVertical: 3.5, paddingHorizontal: 4 },
  // Bandeaux de titre
  band: { backgroundColor: PDF_COLORS.primary, color: "#ffffff", paddingVertical: 5, paddingHorizontal: 8, fontWeight: 700, fontSize: 11, marginTop: 8, marginBottom: 6 },
  subBand: {
    backgroundColor: PDF_COLORS.primarySoft, color: PDF_COLORS.primary, paddingVertical: 4, paddingHorizontal: 8, fontWeight: 700, fontSize: 10,
    marginTop: 6, marginBottom: 5, borderLeftWidth: 3, borderLeftColor: PDF_COLORS.primary,
  },
});
