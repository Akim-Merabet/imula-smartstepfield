import { Stack } from "expo-router";
import { Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SnackbarProvider } from "@/components/kit";
import { LocationConsent } from "@/components/location-consent";
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
        // Affichage bord à bord (Android 15+) : le bas des écrans empilés (barres d'actions) ne doit pas passer sous la
        // barre de navigation du système. Les onglets ont déjà leur barre, qui gère cette marge.
        screenLayout={({ route, children }) => route.name === "(tabs)" ? children
          : <SafeAreaView edges={["bottom"]} style={styles.screen}>{children}</SafeAreaView>}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>

      <LocationConsent />

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
  screen: { flex: 1, backgroundColor: colors.background },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: font.title, fontWeight: "700", color: colors.text },
  modalText: { fontSize: font.body, color: colors.text, lineHeight: 22 },
});
