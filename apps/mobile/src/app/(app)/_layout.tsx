import { Stack } from "expo-router";
import { Modal, StyleSheet, Text, View } from "react-native";

import { SnackbarProvider } from "@/components/kit";
import { Button } from "@/components/ui";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

export default function AppLayout() {
  const { forbidden, dismissForbidden } = useSession();
  return (
    <SnackbarProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.onPrimary,
          headerTitleStyle: { fontWeight: "700" },
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>

      {/* R-SES-2 : accès retiré pendant un envoi. */}
      <Modal visible={!!forbidden} transparent animationType="fade" onRequestClose={dismissForbidden}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t("push.forbiddenTitle")}</Text>
            <Text style={styles.modalText}>{t("push.forbiddenMessage")}</Text>
            <Text style={styles.modalText}>{t("push.forbiddenHint")}</Text>
            <Button label={t("common.ok")} onPress={dismissForbidden} />
          </View>
        </View>
      </Modal>
    </SnackbarProvider>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: font.title, fontWeight: "700", color: colors.text },
  modalText: { fontSize: font.body, color: colors.text, lineHeight: 22 },
});
