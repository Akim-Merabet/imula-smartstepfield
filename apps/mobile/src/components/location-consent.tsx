import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui";
import { t } from "@/i18n/fr";
import { getLocationConsent, setLocationConsent } from "@/lib/location";
import { colors, font, radius, spacing } from "@/theme";

/** Demande d'autorisation de localisation (R-SEC-2), une seule fois par appareil. */
export function LocationConsent() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    getLocationConsent().then((c) => setVisible(c === null)).catch(() => {});
  }, []);
  const answer = async (granted: boolean) => {
    setVisible(false);
    await setLocationConsent(granted);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => void answer(false)}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.text}>{t("location.dataCollection")}</Text>
          <Text style={styles.title}>{t("location.authorizeDataSharing")}</Text>
          <Button label={t("location.allow")} onPress={() => void answer(true)} />
          <Button label={t("location.refuse")} variant="secondary" onPress={() => void answer(false)} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: font.body, fontWeight: "700", color: colors.text },
  text: { fontSize: font.body, color: colors.text, lineHeight: 22 },
});
