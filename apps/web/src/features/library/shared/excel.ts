import "server-only";
import ExcelJS from "exceljs";

/** Trame d'import : 1re feuille = colonnes à compléter, 2e feuille = familles disponibles. */
export async function buildTemplate(sheet: string, headers: string[], familiesSheet: string, families: { short_name: string; long_name: string | null }[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => { c.width = 24; });
  const wf = wb.addWorksheet(familiesSheet);
  wf.addRow([headers[0], ""]);
  wf.getRow(1).font = { bold: true };
  for (const f of families) wf.addRow([f.short_name, f.long_name ?? ""]);
  wf.columns.forEach((c) => { c.width = 28; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if ("result" in v) return v.result === undefined || v.result === null ? "" : String(v.result);
    return "";
  }
  return String(v);
};

/** Lit la 1re feuille : vérifie le nombre de colonnes d'en-tête et renvoie les lignes non vides (numéro + cellules). */
export async function readSheet(file: File, expectedColumns: number): Promise<{ rows: { line: number; cells: string[] }[] } | { error: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
  } catch {
    return { error: "invalid_template" };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { error: "invalid_template" };
  const header = ws.getRow(1);
  let count = 0;
  header.eachCell({ includeEmpty: false }, () => { count++; });
  if (count !== expectedColumns) return { error: "invalid_template" };
  const rows: { line: number; cells: string[] }[] = [];
  ws.eachRow({ includeEmpty: false }, (row, line) => {
    if (line === 1) return;
    const cells = Array.from({ length: expectedColumns }, (_, i) => cellText(row.getCell(i + 1).value).trim());
    if (cells.some(Boolean)) rows.push({ line, cells });
  });
  return { rows };
}

export const yes = (v: string) => /^(oui|yes|o|y|1|true|vrai|x)$/i.test(v.trim());
export const int = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) ? Math.round(n) : null;
};
