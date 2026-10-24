import { MaterialCommunityIcons } from "@expo/vector-icons";
import { type ComponentProps, createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { t } from "@/i18n/fr";
import { colors, font, radius, spacing } from "@/theme";

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function Icon({ name, size = 22, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

export function IconButton({ name, label, onPress, disabled, color = colors.primary }: {
  name: IconName; label: string; onPress: () => void; disabled?: boolean; color?: string;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.background }, disabled && { opacity: 0.4 }]}>
      <Icon name={name} color={color} />
    </Pressable>
  );
}

/** Contrôle segmenté (« Mes flows / Tous les flows », segments de fiche). */
export function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: active, disabled: o.disabled }}
            onPress={() => onChange(o.value)} style={[styles.segment, active && styles.segmentActive, o.disabled && { opacity: 0.5 }]}>
            <Text style={[styles.segmentLabel, active && { color: colors.onPrimary }]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Checkbox({ checked, indeterminate, onChange, label }: {
  checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; label?: string;
}) {
  const name: IconName = indeterminate ? "minus-box" : checked ? "checkbox-marked" : "checkbox-blank-outline";
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: indeterminate ? "mixed" : checked }}
      accessibilityLabel={label} onPress={() => onChange(!checked)} hitSlop={8} style={styles.checkbox}>
      <Icon name={name} color={checked || indeterminate ? colors.primary : colors.textSecondary} />
      {!!label && <Text style={styles.checkboxLabel}>{label}</Text>}
    </Pressable>
  );
}

export function SearchField({ value, onChange, right }: { value: string; onChange: (v: string) => void; right?: ReactNode }) {
  return (
    <View style={styles.searchRow}>
      <View style={styles.search}>
        <Icon name="magnify" color={colors.textSecondary} size={20} />
        <TextInput value={value} onChangeText={onChange} placeholder={t("common.search")} placeholderTextColor={colors.textSecondary}
          style={styles.searchInput} accessibilityLabel={t("common.search")} autoCorrect={false} clearButtonMode="while-editing" />
      </View>
      {right}
    </View>
  );
}

/** Pastille de statut personnalisé : carré de couleur + libellé. */
export function StatusChip({ color, label }: { color: string | null; label: string | null }) {
  if (!label) return null;
  return (
    <View style={styles.status}>
      <View style={[styles.statusDot, { backgroundColor: color ?? colors.border }]} />
      <Text style={styles.statusLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function Card({ children, onPress, muted }: { children: ReactNode; onPress?: () => void; muted?: boolean }) {
  const body = <View style={[styles.card, muted && { opacity: 0.55 }]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.8 }}>{body}</Pressable>
  );
}

export function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value?.toString().trim() ? value : "—"}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={styles.empty}>{children}</Text>;
}

// ---------- Snackbar (messages de confirmation / d'erreur, 3 s) ----------

type Snack = { message: string; tone: "info" | "success" | "danger" };
const SnackbarContext = createContext<(message: string, tone?: Snack["tone"]) => void>(() => {});

export function useSnackbar() {
  return useContext(SnackbarContext);
}

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [snack, setSnack] = useState<Snack | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((message: string, tone: Snack["tone"] = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setSnack({ message, tone });
    timer.current = setTimeout(() => setSnack(null), 3000);
  }, []);
  return (
    <SnackbarContext.Provider value={show}>
      {children}
      {snack && (
        <View pointerEvents="none" style={[styles.snack, { bottom: insets.bottom + 72 },
          snack.tone === "danger" && { backgroundColor: colors.danger }, snack.tone === "success" && { backgroundColor: colors.success }]}
          accessibilityLiveRegion="polite">
          <Text style={styles.snackText}>{snack.message}</Text>
        </View>
      )}
    </SnackbarContext.Provider>
  );
}

export const formatDate = (iso: string | null | undefined, withTime = false) =>
  iso ? new Date(iso).toLocaleString("fr-FR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }) : null;

const styles = StyleSheet.create({
  iconButton: { padding: spacing.sm, borderRadius: radius.md },
  segmented: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 2 },
  segment: { flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, borderRadius: radius.sm, alignItems: "center" },
  segmentActive: { backgroundColor: colors.primary },
  segmentLabel: { fontSize: font.small, fontWeight: "600", color: colors.text },
  checkbox: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  checkboxLabel: { fontSize: font.body, color: colors.text },
  searchRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  search: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: font.body, color: colors.text, paddingVertical: spacing.xs },
  status: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexShrink: 1 },
  statusDot: { width: 12, height: 12, borderRadius: 2 },
  statusLabel: { fontSize: font.small, color: colors.text, flexShrink: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  field: { gap: 2, paddingVertical: spacing.xs },
  fieldLabel: { fontSize: font.small, color: colors.textSecondary },
  fieldValue: { fontSize: font.body, color: colors.text },
  sectionTitle: { fontSize: font.small, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.5, marginTop: spacing.sm },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: spacing.xl, fontSize: font.body },
  snack: {
    position: "absolute", left: spacing.md, right: spacing.md, backgroundColor: colors.text, borderRadius: radius.md,
    padding: spacing.md,
  },
  snackText: { color: colors.onPrimary, fontSize: font.body },
});
