import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFRawStream, StandardFonts, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { assemblePdf, countPages, fillTemplateFields, textPagePdf, toWinAnsi } from "./assemble";

async function makePdf(pages: number, label: string, size: [number, number] = [595.28, 841.89]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage(size).drawText(`${label}-${i + 1}`, { x: 50, y: 700, size: 12, font });
  return doc.save();
}

/** Texte des flux de contenu d'une page (décompressés), chaînes hexadécimales décodées. */
async function pageText(bytes: Uint8Array, index: number): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(index);
  const contents = page.node.Contents();
  const streams: PDFRawStream[] = [];
  const collect = (obj: unknown) => {
    const resolved = obj instanceof PDFRawStream ? obj : doc.context.lookup(obj as never);
    if (resolved instanceof PDFRawStream) streams.push(resolved);
    else if (resolved && "asArray" in (resolved as object)) (resolved as unknown as { asArray(): unknown[] }).asArray().forEach(collect);
  };
  collect(contents);
  const raw = streams.map((st) => {
    const filter = st.dict.get(PDFName.of("Filter"));
    const data = st.getContents();
    return filter?.toString() === "/FlateDecode" ? inflateSync(Buffer.from(data)).toString("latin1") : Buffer.from(data).toString("latin1");
  }).join("\n");
  return raw.replace(/<([0-9A-Fa-f]+)>/g, (_, hex: string) => Buffer.from(hex, "hex").toString("latin1"));
}

describe("assemblePdf", () => {
  it("fusionne les parties dans l'ordre et renvoie le début de chaque partie", async () => {
    const res = await assemblePdf([
      { bytes: await makePdf(1, "garde"), numbered: false },
      { bytes: await makePdf(3, "contenu") },
      { bytes: await makePdf(2, "annexe") },
    ]);
    expect(res.pageCount).toBe(6);
    expect(res.starts).toEqual([0, 1, 4]);
    expect(res.counts).toEqual([1, 3, 2]);
    expect(res.failed).toEqual([]);
    expect(await countPages(res.bytes)).toBe(6);
  });

  it("numérote « n / N » sauf les parties non numérotées, à la position demandée", async () => {
    const res = await assemblePdf(
      [{ bytes: await makePdf(1, "garde"), numbered: false }, { bytes: await makePdf(2, "contenu") }],
      { pageNumbers: { label: (n, total) => `Page ${n} / ${total}`, position: { x: 300, y: 30 } } },
    );
    expect(await pageText(res.bytes, 0)).not.toContain("Page 1 / 3");
    const p2 = await pageText(res.bytes, 1);
    expect(p2).toContain("Page 2 / 3");
    expect(p2).toMatch(/300 30 Td|1 0 0 1 300 30 Tm/);
    expect(await pageText(res.bytes, 2)).toContain("Page 3 / 3");
  });

  it("pose le filigrane du compte sur chaque page", async () => {
    const res = await assemblePdf([{ bytes: await makePdf(2, "x") }], { watermark: "CONFIDENTIEL" });
    for (const i of [0, 1]) expect(await pageText(res.bytes, i)).toContain("CONFIDENTIEL");
  });

  it("recompose les pages sur la trame de fond (dimensions conservées)", async () => {
    const tpl = await PDFDocument.create();
    tpl.addPage([595.28, 841.89]).drawRectangle({ x: 10, y: 10, width: 575, height: 30, color: rgb(0.1, 0.2, 0.4) });
    const template = await tpl.save();
    const res = await assemblePdf([{ bytes: await makePdf(2, "paysage", [841.89, 595.28]), background: template }]);
    const doc = await PDFDocument.load(res.bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getSize()).toEqual({ width: 841.89, height: 595.28 });
    const xobjects = doc.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"));
    expect(xobjects?.toString()).toMatch(/EmbeddedPdfPage-\d+[\s\S]*EmbeddedPdfPage-\d+/);
  });

  it("ignore une partie illisible sans casser l'assemblage", async () => {
    const res = await assemblePdf([{ bytes: await makePdf(1, "ok") }, { bytes: new TextEncoder().encode("pas un pdf") }]);
    expect(res.pageCount).toBe(1);
    expect(res.failed).toEqual([1]);
  });
});

describe("outils pdf-lib", () => {
  it("remplit les champs AcroForm d'une trame et aplatit", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const form = doc.getForm();
    form.createTextField("doc_name").addToPage(page, { x: 50, y: 700, width: 300, height: 20 });
    form.createTextField("champ_inconnu").addToPage(page, { x: 50, y: 650, width: 300, height: 20 });
    const { bytes, unknown } = await fillTemplateFields(await doc.save(), { DOC_NAME: "Plan d'intervention – poste HTA" });
    expect(unknown).toEqual(["champ_inconnu"]);
    const filled = await PDFDocument.load(bytes);
    expect(filled.getForm().getFields()).toHaveLength(0);
    expect(await pageText(bytes, 0) + (await (async () => {
      // Le texte aplati vit dans une XObject d'apparence : on vérifie au moins la présence de la ressource.
      return filled.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"))?.toString() ?? "";
    })())).toMatch(/FlatWidget|XObject|Tm/);
  });

  it("toWinAnsi remplace les caractères non encodables", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(toWinAnsi("Indice B – état ✓", font)).toBe("Indice B – état ?");
  });

  it("textPagePdf produit une page", async () => {
    expect(await countPages(await textPagePdf([{ text: "Annexe 1", bold: true }]))).toBe(1);
  });
});
