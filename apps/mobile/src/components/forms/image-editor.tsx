import { Image } from "expo-image";
import { type ComponentRef, useRef, useState } from "react";
import {
  ActivityIndicator, type GestureResponderEvent, type LayoutChangeEvent, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import Svg, { Ellipse, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

import { Icon, type IconName, ScreenModal } from "@/components/kit";
import { Button } from "@/components/ui";
import { type MessageKey, t } from "@/i18n/fr";
import { arrowHead, pathOf, type Pt, type Shape, shapeAt, type Tool } from "@/lib/annotation";
import { colors, font, radius, spacing } from "@/theme";

/**
 * « Éditeur d'image » (spec 05 §4.7.3) : annotation d'une photo avant envoi, comme l'éditeur Pintura de l'application
 * d'origine (outils crayon, gomme, ligne, flèche, rectangle, ellipse, texte). Les formes sont tracées en coordonnées de
 * l'image, puis la vue (photo + calque SVG) est capturée à la taille d'origine en JPEG.
 */
const TOOLS: { tool: Tool; icon: IconName; label: MessageKey }[] = [
  { tool: "sharpie", icon: "draw", label: "imageEditor.sharpie" },
  { tool: "eraser", icon: "eraser", label: "imageEditor.eraser" },
  { tool: "line", icon: "slash-forward", label: "imageEditor.line" },
  { tool: "arrow", icon: "arrow-top-right", label: "imageEditor.arrow" },
  { tool: "rectangle", icon: "rectangle-outline", label: "imageEditor.rectangle" },
  { tool: "ellipse", icon: "ellipse-outline", label: "imageEditor.ellipse" },
  { tool: "text", icon: "format-text", label: "imageEditor.text" },
];
const COLORS = ["#E53935", "#FB8C00", "#FDD835", "#43A047", "#1E88E5", "#000000", "#FFFFFF"];
/** Épaisseurs relatives au côté long de l'image (fin, moyen, épais). */
const WIDTHS = [0.004, 0.008, 0.016];

function ShapeView({ s }: { s: Shape }) {
  const stroke = { stroke: s.color, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (s.kind) {
    case "sharpie": return <Path d={pathOf(s.points)} strokeWidth={s.width} {...stroke} />;
    case "line": return <Line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} strokeWidth={s.width} {...stroke} />;
    case "arrow": return <Path d={`M${s.a.x} ${s.a.y} L${s.b.x} ${s.b.y} ${arrowHead(s.a, s.b, s.width)}`} strokeWidth={s.width} {...stroke} />;
    case "rectangle": return <Rect x={Math.min(s.a.x, s.b.x)} y={Math.min(s.a.y, s.b.y)} width={Math.abs(s.b.x - s.a.x)} height={Math.abs(s.b.y - s.a.y)} strokeWidth={s.width} {...stroke} />;
    case "ellipse": return <Ellipse cx={(s.a.x + s.b.x) / 2} cy={(s.a.y + s.b.y) / 2} rx={Math.abs(s.b.x - s.a.x) / 2} ry={Math.abs(s.b.y - s.a.y) / 2} strokeWidth={s.width} {...stroke} />;
    case "text": return <SvgText x={s.at.x} y={s.at.y} fill={s.color} fontSize={s.size} fontWeight="bold">{s.text}</SvgText>;
  }
}

export function ImageEditor({ uri, onClose, onSave }: {
  uri: string; onClose: () => void; onSave: (uri: string) => Promise<void>;
}) {
  const [image, setImage] = useState<{ width: number; height: number } | null>(null);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<Tool>("sharpie");
  const [color, setColor] = useState(COLORS[0]);
  const [widthIndex, setWidthIndex] = useState(1);
  const [textAt, setTextAt] = useState<Pt | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const canvas = useRef<ComponentRef<typeof View>>(null);
  const drawing = useRef<Shape | null>(null);

  // Affichage « contain » de l'image dans la zone disponible ; les gestes sont ramenés en pixels de l'image.
  const scale = image && area ? Math.min(area.width / image.width, area.height / image.height) : 0;
  const longSide = image ? Math.max(image.width, image.height) : 0;
  const toImage = (e: GestureResponderEvent): Pt => ({
    x: Math.max(0, Math.min(image!.width, e.nativeEvent.locationX / scale)),
    y: Math.max(0, Math.min(image!.height, e.nativeEvent.locationY / scale)),
  });

  const handlers = {
    onStartShouldSetResponder: () => !saving,
    onMoveShouldSetResponder: () => !saving,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      const p = toImage(e);
      const width = longSide * WIDTHS[widthIndex];
      if (tool === "eraser") {
        const i = shapeAt(shapes, p, longSide * 0.02);
        if (i >= 0) setShapes(shapes.filter((_, j) => j !== i));
        return;
      }
      if (tool === "text") {
        setText("");
        setTextAt(p);
        return;
      }
      const shape: Shape = tool === "sharpie" ? { kind: "sharpie", color, width, points: [p] } : { kind: tool, color, width, a: p, b: p };
      drawing.current = shape;
      setShapes((all) => [...all, shape]);
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const s = drawing.current;
      if (!s) return;
      const p = toImage(e);
      const next: Shape = s.kind === "sharpie" ? { ...s, points: [...s.points, p] } : s.kind === "text" ? s : { ...s, b: p };
      drawing.current = next;
      // `next` et non drawing.current : la mise à jour différée peut s'exécuter après le relâchement (ref remise à null).
      setShapes((all) => [...all.slice(0, -1), next]);
    },
    onResponderRelease: () => {
      drawing.current = null;
    },
  };

  const addText = () => {
    if (textAt && text.trim()) setShapes([...shapes, { kind: "text", color, size: longSide * 0.035 * (widthIndex + 1), at: textAt, text: text.trim() }]);
    setTextAt(null);
  };

  const save = async () => {
    if (!image || saving || !shapes.length) return;
    setSaving(true);
    setError(false);
    try {
      // Android : largeur et hauteur de sortie en pixels → image annotée à la définition d'origine.
      const out = await captureRef(canvas, { format: "jpg", quality: 0.8, result: "tmpfile", width: Math.round(image.width), height: Math.round(image.height) });
      await onSave(out);
    } catch {
      setError(true);
      setSaving(false);
    }
  };

  return (
    <ScreenModal visible background="#111" onRequestClose={() => { if (!saving) onClose(); }}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("imageEditor.title")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("imageEditor.undo")} disabled={!shapes.length || saving}
            onPress={() => setShapes(shapes.slice(0, -1))} style={styles.iconButton}>
            <Icon name="undo" color={shapes.length ? colors.onPrimary : "#777"} size={24} />
          </Pressable>
        </View>
        <View style={styles.area} onLayout={(e: LayoutChangeEvent) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
          {!image && <Text style={styles.hint}>{t("imageEditor.loading")}</Text>}
          <View ref={canvas} collapsable={false} {...(image ? handlers : {})}
            style={image && scale ? { width: image.width * scale, height: image.height * scale } : styles.probe}>
            <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="fill"
              onLoad={(e) => setImage({ width: e.source.width, height: e.source.height })} onError={() => setError(true)} />
            {image && (
              <Svg width="100%" height="100%" viewBox={`0 0 ${image.width} ${image.height}`} pointerEvents="none">
                {shapes.map((s, i) => <ShapeView key={i} s={s} />)}
              </Svg>
            )}
          </View>
        </View>
        <View style={styles.tools}>
          {TOOLS.map((x) => (
            <Pressable key={x.tool} accessibilityRole="button" accessibilityLabel={t(x.label)} accessibilityState={{ selected: tool === x.tool }}
              onPress={() => setTool(x.tool)} style={[styles.tool, tool === x.tool && styles.toolActive]}>
              <Icon name={x.icon} color={colors.onPrimary} size={22} />
            </Pressable>
          ))}
        </View>
        <View style={styles.tools}>
          {COLORS.map((c) => (
            <Pressable key={c} accessibilityRole="button" accessibilityLabel={c} accessibilityState={{ selected: color === c }}
              onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]} />
          ))}
          {WIDTHS.map((_, i) => (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={t("imageEditor.size", { n: i + 1 })} accessibilityState={{ selected: widthIndex === i }}
              onPress={() => setWidthIndex(i)} style={[styles.tool, widthIndex === i && styles.toolActive]}>
              <View style={{ width: 18, height: 2 + i * 3, borderRadius: 3, backgroundColor: colors.onPrimary }} />
            </Pressable>
          ))}
        </View>
        {error && <Text style={styles.error}>{t("imageEditor.error")}</Text>}
        <View style={styles.footer}>
          <View style={{ flex: 1 }}><Button label={t("common.close")} variant="secondary" disabled={saving} onPress={onClose} /></View>
          <View style={{ flex: 1 }}>
            {saving
              ? <View style={styles.saving}><ActivityIndicator color={colors.onPrimary} /><Text style={styles.savingLabel}>{t("imageEditor.saving")}</Text></View>
              : <Button label={t("common.save")} disabled={!shapes.length || !image} onPress={() => void save()} />}
          </View>
        </View>
      </View>

      <Modal visible={!!textAt} transparent animationType="fade" onRequestClose={() => setTextAt(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t("imageEditor.text")}</Text>
            <TextInput value={text} onChangeText={setText} autoFocus style={styles.input} accessibilityLabel={t("imageEditor.text")} />
            <Button label={t("common.confirm")} disabled={!text.trim()} onPress={addText} />
            <Button label={t("common.cancel")} variant="secondary" onPress={() => setTextAt(null)} />
          </View>
        </View>
      </Modal>
    </ScreenModal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#111", paddingVertical: spacing.sm, gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md },
  title: { flex: 1, color: colors.onPrimary, fontSize: font.title - 2, fontWeight: "700" },
  iconButton: { padding: spacing.sm },
  area: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  probe: { width: 1, height: 1, opacity: 0 },
  hint: { color: "#bbb", fontSize: font.small },
  tools: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md },
  tool: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  toolActive: { backgroundColor: colors.primary },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: "#555" },
  swatchActive: { borderWidth: 3, borderColor: colors.onPrimary },
  error: { color: colors.danger, textAlign: "center", fontSize: font.small },
  footer: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md },
  saving: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, padding: spacing.sm },
  savingLabel: { color: colors.onPrimary, fontSize: font.small },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: font.title - 2, fontWeight: "700", color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: font.body, color: colors.text },
});
