import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Icon, useSnackbar } from "@/components/kit";
import { Button } from "@/components/ui";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

const shownKey = (principalId: string, target: "offline" | "online") => `imula.switchModalShown.${target}.${principalId}`;

/**
 * Bouton En ligne / Hors ligne de l'en-tête (spec 05 §3.3) : confirmation à la première bascule dans chaque sens,
 * puis message de confirmation à chaque bascule.
 */
export function OnlineToggle() {
  const { profile, offline, setOffline } = useSession();
  const snackbar = useSnackbar();
  const [confirm, setConfirm] = useState<"offline" | "online" | null>(null);

  const apply = async (target: "offline" | "online") => {
    setConfirm(null);
    await setOffline(target === "offline");
    snackbar(t(target === "offline" ? "onlineOffline.offlineMessage" : "onlineOffline.onlineMessage"));
  };

  const press = async () => {
    const target = offline ? "online" : "offline";
    const key = shownKey(profile?.principalId ?? "", target);
    const shown = await AsyncStorage.getItem(key).catch(() => "1");
    if (shown) return apply(target);
    await AsyncStorage.setItem(key, "1").catch(() => {});
    setConfirm(target);
  };

  return (
    <>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: !offline }}
        accessibilityLabel={offline ? t("home.offline") : t("home.online")} onPress={press}
        style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.8 }]}>
        <Icon name={offline ? "cloud-off-outline" : "cloud-check-outline"} color={colors.onPrimary} size={20} />
        <Text style={styles.label}>{offline ? t("home.offline") : t("home.online")}</Text>
      </Pressable>

      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.title}>{t(confirm === "offline" ? "onlineOffline.onlineMode" : "onlineOffline.offlineMode")}</Text>
            <Text style={styles.text}>{t(confirm === "offline" ? "onlineOffline.switchOffline" : "onlineOffline.switchOnline")}</Text>
            <Button label={t(confirm === "offline" ? "onlineOffline.goOffline" : "onlineOffline.goOnline")} onPress={() => apply(confirm!)} />
            <Button variant="secondary" label={t(confirm === "offline" ? "onlineOffline.stayOnline" : "onlineOffline.stayOffline")}
              onPress={() => setConfirm(null)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs, marginRight: spacing.md, paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
  },
  label: { color: colors.onPrimary, fontSize: font.small, fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: font.title, fontWeight: "700", color: colors.text },
  text: { fontSize: font.body, color: colors.text, lineHeight: 22 },
});
