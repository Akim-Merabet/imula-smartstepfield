import * as LocalAuthentication from "expo-local-authentication";
import * as SplashScreen from "expo-splash-screen";
import { type ReactNode, useEffect, useState } from "react";
import { BackHandler, Platform, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui";
import { t } from "@/i18n/fr";
import { colors, font, spacing } from "@/theme";

/** R-SEC-1 : écran bloquant si l'appareil n'a aucun verrouillage (code, schéma ou biométrie). */
export function DeviceSecurityGate({ children }: { children: ReactNode }) {
  const [secure, setSecure] = useState<boolean | null>(Platform.OS === "web" ? true : null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    LocalAuthentication.getEnrolledLevelAsync()
      .then((level) => setSecure(level !== LocalAuthentication.SecurityLevel.NONE))
      .catch(() => setSecure(true));
  }, []);

  useEffect(() => {
    if (secure === false) SplashScreen.hideAsync();
  }, [secure]);

  if (secure === null) return null;
  if (secure) return children;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("deviceUnsecure.title")}</Text>
      <Text style={styles.message}>{t("deviceUnsecure.message")}</Text>
      {Platform.OS === "android" && <Button label={t("deviceUnsecure.closeApp")} onPress={() => BackHandler.exitApp()} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.background },
  title: { fontSize: font.title, fontWeight: "700", color: colors.danger },
  message: { fontSize: font.body, color: colors.text, lineHeight: 22 },
});
