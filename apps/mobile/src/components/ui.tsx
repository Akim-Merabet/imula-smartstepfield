import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";

import { colors, font, radius, spacing } from "@/theme";

export function Button({ label, onPress, disabled, loading, variant = "primary" }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary";
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        pressed && primary && { backgroundColor: colors.primaryPressed },
        pressed && !primary && { backgroundColor: colors.background },
        (disabled || loading) && { opacity: 0.5 },
      ]}
    >
      {loading && <ActivityIndicator color={primary ? colors.onPrimary : colors.primary} />}
      <Text style={[styles.buttonLabel, { color: primary ? colors.onPrimary : colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

export function TextField({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textSecondary}
        {...props}
        style={[styles.input, !!error && { borderColor: colors.danger }]}
        accessibilityLabel={label}
      />
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

export function Banner({ tone, children }: { tone: "danger" | "info"; children: ReactNode }) {
  return (
    <View style={[styles.banner, tone === "danger" ? styles.bannerDanger : styles.bannerInfo]}>
      <Text style={{ color: tone === "danger" ? colors.danger : colors.text, fontSize: font.body }}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  buttonLabel: { fontSize: font.body, fontWeight: "600" },
  field: { gap: spacing.xs },
  fieldLabel: { fontSize: font.small, color: colors.textSecondary, fontWeight: "600" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: font.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  fieldError: { fontSize: font.small, color: colors.danger },
  banner: { borderRadius: radius.md, padding: spacing.md },
  bannerDanger: { backgroundColor: colors.dangerSurface },
  bannerInfo: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
