import { MAX_EXTERNAL_FILE_SIZE } from "../meta";

/** Contrôles d'import d'un PDF externe (§5.7) : type PDF et 2 Go maximum. */
export function validatePdf(file: File): "not_pdf" | "too_large" | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "not_pdf";
  if (file.size > MAX_EXTERNAL_FILE_SIZE) return "too_large";
  return null;
}
