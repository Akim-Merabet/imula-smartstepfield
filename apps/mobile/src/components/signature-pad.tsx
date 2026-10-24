import { useEffect, useRef, useState } from "react";
import { type GestureResponderEvent, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { t } from "@/i18n/fr";
import { type Point, signatureToPng, type Stroke } from "@/lib/signature-png";
import { colors, font, radius, spacing } from "@/theme";

const toPath = (s: Stroke) => s.length === 1
  ? `M${s[0].x} ${s[0].y} l0.1 0`
  : s.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

/** Zone de dessin de signature ; renvoie un PNG (data URL) à chaque fin de trait, null si effacée. */
export function SignaturePad({ onChange, height = 180 }: { onChange: (png: string | null) => void; height?: number }) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const size = useRef({ width: 0, height });
  const current = useRef<Stroke | null>(null);
  const all = useRef<Stroke[]>([]);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);

  const point = (e: { nativeEvent: { locationX: number; locationY: number } }): Point => ({
    x: Math.max(0, Math.min(size.current.width, e.nativeEvent.locationX)),
    y: Math.max(0, Math.min(size.current.height, e.nativeEvent.locationY)),
  });

  // Système de répondeur natif : le dessin capte le geste et ne le cède pas au défilement de la modale.
  const handlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      current.current = [point(e)];
      all.current = [...all.current, current.current];
      setStrokes(all.current);
    },
    onResponderMove: (e: GestureResponderEvent) => {
      if (!current.current) return;
      current.current.push(point(e));
      setStrokes([...all.current]);
    },
    onResponderRelease: () => {
      current.current = null;
      changed.current(signatureToPng(all.current, size.current.width, size.current.height));
    },
  };

  const clear = () => {
    all.current = [];
    setStrokes([]);
    onChange(null);
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={[styles.pad, { height }]} {...handlers} accessibilityLabel={t("signature.pad")}
        onLayout={(e: LayoutChangeEvent) => { size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height }; }}>
        {!strokes.length && <Text style={styles.placeholder} pointerEvents="none">{t("signature.pad")}</Text>}
        <Svg width="100%" height="100%" pointerEvents="none">
          {strokes.map((s, i) => (
            <Path key={i} d={toPath(s)} stroke={colors.text} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
      </View>
      <Pressable accessibilityRole="button" onPress={clear} style={styles.clear}>
        <Text style={styles.clearLabel}>{t("signature.clear")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, overflow: "hidden" },
  placeholder: { position: "absolute", alignSelf: "center", top: "45%", color: colors.textSecondary, fontSize: font.small },
  clear: { alignSelf: "flex-end", padding: spacing.xs },
  clearLabel: { color: colors.primary, fontWeight: "600", fontSize: font.small },
});
