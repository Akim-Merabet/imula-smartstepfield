import path from "node:path";
import { existsSync } from "node:fs";
import { Font } from "@react-pdf/renderer";

/** Famille embarquée (Roboto, licence Apache 2.0 — public/fonts) ; repli Helvetica si absente. */
export const PDF_FONT = "Roboto";
let registered: string | null = null;

/** `fresh` : réenregistre (nouvelles instances de police, cf. render.ts). */
export function registerPdfFonts(fresh = false): string {
  if (registered && !fresh) return registered;
  // Supprime uniquement la famille embarquée (Helvetica / Courier restent enregistrées par défaut).
  if (fresh) delete (Font.getRegisteredFonts() as Record<string, unknown>)[PDF_FONT];
  const dir = path.join(process.cwd(), "public", "fonts");
  const file = (name: string) => path.join(dir, name);
  if (!existsSync(file("Roboto-Regular.ttf"))) {
    registered = "Helvetica";
    return registered;
  }
  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: file("Roboto-Regular.ttf"), fontWeight: 400 },
      { src: file("Roboto-Bold.ttf"), fontWeight: 700 },
      { src: file("Roboto-Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: file("Roboto-BoldItalic.ttf"), fontWeight: 700, fontStyle: "italic" },
    ],
  });
  // Pas de césure automatique (références, codes).
  Font.registerHyphenationCallback((word) => [word]);
  registered = PDF_FONT;
  return registered;
}
