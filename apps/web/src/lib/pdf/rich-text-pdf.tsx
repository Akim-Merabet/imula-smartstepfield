/* eslint-disable jsx-a11y/alt-text -- <Image> @react-pdf : pas d'attribut alt (rendu PDF, non HTML). */
import { Image, Link, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { ReactNode } from "react";
import type { PdfImage } from "./images";
import { parseRichContent, type RichBlock, type RichRun } from "./rich-text";
import { PDF_COLORS, s } from "./theme";

export type RichImages = Map<string, PdfImage>;

const HEADING: Record<number, Style> = { 1: s.h2, 2: s.h3, 3: s.h4, 4: s.h4, 5: s.h4, 6: s.h4 };

function runStyle(r: Extract<RichRun, { kind: "text" }>): Style {
  const st: Style = {};
  if (r.bold) st.fontWeight = 700;
  if (r.italic) st.fontStyle = "italic";
  const deco = [r.underline || r.href ? "underline" : null, r.strike ? "line-through" : null].filter(Boolean).join(" ");
  if (deco) st.textDecoration = deco as Style["textDecoration"];
  if (r.code) { st.fontFamily = "Courier"; st.backgroundColor = PDF_COLORS.headBg; }
  if (r.href) st.color = PDF_COLORS.callout.info.border;
  return st;
}

/** Runs inline → <Text> imbriqués (gras, italique, souligné, barré, code, liens). */
export function renderRuns(runs: RichRun[], keyPrefix = "r"): ReactNode[] {
  return runs.map((r, i) => {
    if (r.kind === "break") return <Text key={`${keyPrefix}${i}`}>{"\n"}</Text>;
    const st = runStyle(r);
    if (r.href && /^https?:|^mailto:/i.test(r.href)) {
      return <Link key={`${keyPrefix}${i}`} src={r.href} style={st}>{r.text}</Link>;
    }
    return Object.keys(st).length ? <Text key={`${keyPrefix}${i}`} style={st}>{r.text}</Text> : r.text;
  });
}

function imageBlock(b: Extract<RichBlock, { type: "image" }>, images: RichImages | undefined, maxWidth: number, key: string) {
  const img = images?.get(b.src);
  if (!img) return b.alt ? <Text key={key} style={[s.small, s.italic]}>[{b.alt}]</Text> : null;
  const width = Math.min(maxWidth, b.width ?? img.width * 0.75, img.width);
  const height = (img.height / img.width) * width;
  return <Image key={key} src={{ data: img.data, format: img.format }} style={{ width, height, marginVertical: 4 }} />;
}

/** Arbre de blocs → éléments @react-pdf. `maxWidth` = largeur utile (pt) pour les images. */
export function renderRichBlocks(blocks: RichBlock[], opts: { images?: RichImages; maxWidth?: number; depth?: number } = {}): ReactNode[] {
  const maxWidth = opts.maxWidth ?? 480;
  const depth = opts.depth ?? 0;
  return blocks.map((b, i) => {
    const key = `b${depth}-${i}`;
    switch (b.type) {
      case "paragraph":
        return (
          <Text key={key} style={[s.para, b.align ? { textAlign: b.align } : {}]}>
            {b.runs.length ? renderRuns(b.runs, `${key}-`) : " "}
          </Text>
        );
      case "heading":
        return <View key={key} minPresenceAhead={30}><Text style={HEADING[b.level]}>{renderRuns(b.runs, `${key}-`)}</Text></View>;
      case "list":
        return (
          <View key={key} style={{ marginBottom: 4, marginLeft: depth ? 4 : 2 }}>
            {b.items.map((item, k) => (
              <View key={`${key}-${k}`} style={{ flexDirection: "row", marginBottom: 1.5 }} wrap={false}>
                <Text style={{ width: b.ordered ? 18 : 11, textAlign: b.ordered ? "right" : "left", paddingRight: b.ordered ? 4 : 0 }}>
                  {b.ordered ? `${b.start + k}.` : depth % 2 ? "–" : "•"}
                </Text>
                <View style={{ flex: 1 }}>{renderRichBlocks(item, { ...opts, maxWidth: maxWidth - 20, depth: depth + 1 })}</View>
              </View>
            ))}
          </View>
        );
      case "blockquote":
        return (
          <View key={key} style={{ borderLeftWidth: 2, borderLeftColor: PDF_COLORS.border, paddingLeft: 8, marginVertical: 4, color: PDF_COLORS.muted }}>
            {renderRichBlocks(b.children, { ...opts, maxWidth: maxWidth - 12, depth: depth + 1 })}
          </View>
        );
      case "callout": {
        const c = PDF_COLORS.callout[b.variant];
        return (
          <View key={key} style={{ borderLeftWidth: 3, borderLeftColor: c.border, backgroundColor: c.bg, paddingVertical: 5, paddingHorizontal: 8, marginVertical: 5 }}>
            {renderRichBlocks(b.children, { ...opts, maxWidth: maxWidth - 16, depth: depth + 1 })}
          </View>
        );
      }
      case "code":
        return <Text key={key} style={{ fontFamily: "Courier", fontSize: 8.5, backgroundColor: PDF_COLORS.headBg, padding: 5, marginVertical: 4 }}>{b.text}</Text>;
      case "hr":
        return <View key={key} style={{ borderBottomWidth: 0.6, borderBottomColor: PDF_COLORS.border, marginVertical: 6 }} />;
      case "image":
        return imageBlock(b, opts.images, maxWidth, key);
      case "table": {
        const cols = Math.max(1, ...b.rows.map((r) => r.cells.length));
        return (
          <View key={key} style={s.table}>
            {b.rows.map((r, ri) => (
              <View key={`${key}-${ri}`} style={s.tr} wrap={false}>
                {r.cells.map((c, ci) => (
                  <View key={ci} style={[c.header ? s.th : s.td, { width: `${100 / cols}%` }]}>
                    {renderRichBlocks(c.blocks, { ...opts, maxWidth: maxWidth / cols - 8, depth: depth + 1 })}
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      }
    }
  });
}

/** Composant pratique : contenu riche brut (JSON Tiptap / HTML). */
export function RichText({ content, images, maxWidth, style }: { content: unknown; images?: RichImages; maxWidth?: number; style?: Style }) {
  const blocks = parseRichContent(content);
  if (!blocks.length) return null;
  return <View style={style}>{renderRichBlocks(blocks, { images, maxWidth })}</View>;
}
