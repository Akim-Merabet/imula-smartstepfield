import { Document, Page, Text, View } from "@react-pdf/renderer";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { countPages } from "./assemble";
import { registerPdfFonts } from "./fonts";
import { renderPdf } from "./render";
import { collectImageSources, isRichEmpty, parseHtml, parseRichContent, richToPlainText, type RichBlock } from "./rich-text";
import { renderRichBlocks } from "./rich-text-pdf";

const tiptapDoc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Consignation" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Couper " },
        { type: "text", text: "l'alimentation", marks: [{ type: "bold" }] },
        { type: "text", text: " puis " },
        { type: "text", text: "vérifier", marks: [{ type: "italic" }, { type: "underline" }] },
        { type: "hardBreak" },
        { type: "text", text: "l'absence de tension." },
      ],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Gants isolants" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Écran facial" }] }] },
      ],
    },
    { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Étape trois" }] }] }] },
    { type: "callout", attrs: { variant: "warning" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Risque électrique" }] }] },
    { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Citation" }] }] },
    { type: "horizontalRule" },
  ],
};

describe("parseRichContent — Tiptap JSON", () => {
  const blocks = parseRichContent(tiptapDoc);

  it("convertit titres, paragraphes, listes, encarts et citations", () => {
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "list", "list", "callout", "blockquote", "hr"]);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 2 });
  });

  it("conserve les marques inline et les retours à la ligne", () => {
    const p = blocks[1] as Extract<RichBlock, { type: "paragraph" }>;
    expect(p.runs).toEqual([
      { kind: "text", text: "Couper " },
      { kind: "text", text: "l'alimentation", bold: true },
      { kind: "text", text: " puis " },
      { kind: "text", text: "vérifier", italic: true, underline: true },
      { kind: "break" },
      { kind: "text", text: "l'absence de tension." },
    ]);
  });

  it("gère listes ordonnées (départ) et variantes d'encart", () => {
    expect(blocks[2]).toMatchObject({ type: "list", ordered: false, items: [[{ type: "paragraph" }], [{ type: "paragraph" }]] });
    expect(blocks[3]).toMatchObject({ type: "list", ordered: true, start: 3 });
    expect(blocks[4]).toMatchObject({ type: "callout", variant: "warning" });
  });

  it("accepte une chaîne JSON", () => {
    expect(parseRichContent(JSON.stringify(tiptapDoc))).toEqual(blocks);
  });
});

describe("parseRichContent — HTML", () => {
  it("convertit le HTML de l'éditeur (encarts data-callout, entités, styles)", () => {
    const html = '<h2>Titre&nbsp;1</h2><p>Texte <strong>gras</strong> et <em>italique</em><br>ligne 2</p>'
      + '<div data-callout="" data-variant="error" class="rich-callout"><p>Danger</p></div>'
      + '<ul><li><p>A</p></li><li><p>B <s>barré</s></p></li></ul><p style="text-align:center">centré &amp; &#233;</p>'
      + '<p><span style="font-weight:700">gras css</span></p>';
    const blocks = parseRichContent(html);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "callout", "list", "paragraph", "paragraph"]);
    expect(richToPlainText([blocks[0]])).toBe("Titre 1");
    expect((blocks[1] as Extract<RichBlock, { type: "paragraph" }>).runs).toEqual([
      { kind: "text", text: "Texte " }, { kind: "text", text: "gras", bold: true }, { kind: "text", text: " et " },
      { kind: "text", text: "italique", italic: true }, { kind: "break" }, { kind: "text", text: "ligne 2" },
    ]);
    expect(blocks[2]).toMatchObject({ type: "callout", variant: "error" });
    expect(blocks[4]).toMatchObject({ type: "paragraph", align: "center", runs: [{ kind: "text", text: "centré & é" }] });
    expect((blocks[5] as Extract<RichBlock, { type: "paragraph" }>).runs[0]).toMatchObject({ bold: true });
  });

  it("extrait images et tableaux", () => {
    const blocks = parseRichContent('<p>avant<img src="data:image/png;base64,AAA" alt="photo"></p><table><tr><th>N°</th><th>Action</th></tr><tr><td>1</td><td><p>Ouvrir</p></td></tr></table>');
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "image", "table"]);
    expect(collectImageSources(blocks)).toEqual(["data:image/png;base64,AAA"]);
    const table = blocks[2] as Extract<RichBlock, { type: "table" }>;
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].cells[0].header).toBe(true);
    expect(richToPlainText([table])).toBe("N° | Action\n1 | Ouvrir");
  });

  it("tolère le HTML mal fermé et le texte brut", () => {
    expect(parseHtml("<p>a<b>b</p><p>c")).toHaveLength(2);
    expect(parseRichContent("ligne 1\nligne 2\n\nparagraphe 2")).toHaveLength(2);
    expect(isRichEmpty(parseRichContent("<p></p><p> </p>"))).toBe(true);
    expect(isRichEmpty(parseRichContent(null))).toBe(true);
  });
});

/** Parcourt l'arbre d'éléments @react-pdf produit. */
function walk(node: ReactNode, visit: (el: ReactElement<{ style?: unknown; children?: ReactNode }>) => void) {
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit)); return; }
  if (!isValidElement(node)) return;
  const el = node as ReactElement<{ style?: unknown; children?: ReactNode }>;
  visit(el);
  walk(el.props.children, visit);
}
const flat = (st: unknown): Record<string, unknown> => (Array.isArray(st) ? Object.assign({}, ...st.map(flat)) : ((st as Record<string, unknown>) ?? {}));

describe("renderRichBlocks → éléments @react-pdf", () => {
  const elements = renderRichBlocks(parseRichContent(tiptapDoc));

  it("applique gras / italique / souligné via des <Text> imbriqués", () => {
    const styles: Record<string, unknown>[] = [];
    walk(elements, (el) => { if (el.type === Text) styles.push(flat(el.props.style)); });
    expect(styles.some((st) => st.fontWeight === 700)).toBe(true);
    expect(styles.some((st) => st.fontStyle === "italic" && st.textDecoration === "underline")).toBe(true);
  });

  it("rend l'encart avec la couleur de sa variante et les puces de liste", () => {
    const views: Record<string, unknown>[] = [];
    const texts: string[] = [];
    walk(elements, (el) => {
      if (el.type === View) views.push(flat(el.props.style));
      if (el.type === Text && typeof el.props.children === "string") texts.push(el.props.children);
    });
    expect(views.some((v) => v.borderLeftColor === "#c77a14" && v.backgroundColor === "#fdf3e4")).toBe(true);
    expect(texts).toEqual(expect.arrayContaining(["•", "3."]));
  });

  it("produit un PDF valide (Roboto embarqué)", async () => {
    const font = registerPdfFonts();
    const bytes = await renderPdf(
      <Document><Page size="A4" style={{ fontFamily: font, padding: 40, fontSize: 10 }}>{elements}</Page></Document>,
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(await countPages(bytes)).toBe(1);
  }, 30_000);
});
