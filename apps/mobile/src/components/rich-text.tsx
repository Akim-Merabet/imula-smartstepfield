import { type CalloutVariant, parseRichContent, type RichBlock, type RichRun } from "@imula/flow-core/rich-text";
import { Image } from "expo-image";
import { useMemo } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { colors, font, radius, spacing } from "@/theme";

/** Texte riche des blocs (Tiptap JSON ou HTML), rendu en composants natifs à partir du parseur partagé. */
export function RichText({ json, html }: { json?: string | null; html?: string | null }) {
  const blocks = useMemo(() => {
    let input: unknown = html ?? null;
    if (json) {
      try {
        input = JSON.parse(json);
      } catch {
        input = html ?? null;
      }
    }
    return input ? parseRichContent(input) : [];
  }, [json, html]);
  return <View style={styles.root}>{blocks.map((b, i) => <Block key={i} block={b} />)}</View>;
}

function Runs({ runs, style }: { runs: RichRun[]; style?: object }) {
  return (
    <Text style={[styles.text, style]}>
      {runs.map((r, i) => r.kind === "break" ? "\n" : (
        <Text key={i}
          onPress={r.href ? () => void Linking.openURL(r.href!) : undefined}
          style={[
            r.bold && { fontWeight: "700" }, r.italic && { fontStyle: "italic" },
            (r.underline || r.href) && { textDecorationLine: "underline" }, r.strike && { textDecorationLine: "line-through" },
            r.code && styles.code, r.href && { color: colors.primary },
          ]}>
          {r.text}
        </Text>
      ))}
    </Text>
  );
}

const CALLOUT_COLORS: Record<CalloutVariant, { bg: string; border: string }> = {
  info: { bg: "#E8F1FB", border: "#2F6DB5" },
  warning: { bg: "#FFF4E0", border: "#B26A00" },
  error: { bg: "#FDECEA", border: "#C62828" },
  note: { bg: "#F1F1F4", border: "#5B6776" },
  success: { bg: "#E7F5EE", border: "#2E7D5B" },
};

function Block({ block }: { block: RichBlock }) {
  switch (block.type) {
    case "paragraph":
      if (!block.runs.length) return null;
      return <Runs runs={block.runs} style={block.align ? { textAlign: block.align } : undefined} />;
    case "heading":
      return <Runs runs={block.runs} style={{ fontSize: block.level <= 2 ? font.title - 2 : font.body + 2, fontWeight: "700" }} />;
    case "list":
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.text}>{block.ordered ? `${block.start + i}.` : "•"}</Text>
              <View style={{ flex: 1 }}>{item.map((b, j) => <Block key={j} block={b} />)}</View>
            </View>
          ))}
        </View>
      );
    case "blockquote":
      return <View style={styles.quote}>{block.children.map((b, i) => <Block key={i} block={b} />)}</View>;
    case "callout": {
      const c = CALLOUT_COLORS[block.variant];
      return (
        <View style={[styles.callout, { backgroundColor: c.bg, borderLeftColor: c.border }]}>
          {block.children.map((b, i) => <Block key={i} block={b} />)}
        </View>
      );
    }
    case "code":
      return <Text style={[styles.text, styles.code, styles.codeBlock]}>{block.text}</Text>;
    case "hr":
      return <View style={styles.hr} />;
    case "image":
      // Images distantes : visibles en ligne ; la mise en cache hors ligne arrive avec les pièces jointes (spec 05 §9.8).
      return /^https?:/.test(block.src)
        ? <Image source={{ uri: block.src }} style={styles.image} contentFit="contain" accessibilityLabel={block.alt} />
        : null;
    case "table":
      return (
        <View style={styles.table}>
          {block.rows.map((row, i) => (
            <View key={i} style={styles.tableRow}>
              {row.cells.map((cell, j) => (
                <View key={j} style={[styles.cell, cell.header && { backgroundColor: colors.background }]}>
                  {cell.blocks.map((b, k) => <Block key={k} block={b} />)}
                </View>
              ))}
            </View>
          ))}
        </View>
      );
  }
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  text: { fontSize: font.body, color: colors.text, lineHeight: 22 },
  code: { fontFamily: "monospace", backgroundColor: colors.background },
  codeBlock: { padding: spacing.sm, borderRadius: radius.sm },
  list: { gap: spacing.xs },
  listItem: { flexDirection: "row", gap: spacing.sm },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: spacing.md, gap: spacing.xs },
  callout: { borderLeftWidth: 4, borderRadius: radius.sm, padding: spacing.md, gap: spacing.xs },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  image: { width: "100%", aspectRatio: 16 / 9 },
  table: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tableRow: { flexDirection: "row" },
  cell: { flex: 1, padding: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
