import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { Card } from "@/components/kit";
import { t } from "@/i18n/fr";
import { getSaveToGallery, setSaveToGallery } from "@/lib/gallery";
import { colors, font, spacing } from "@/theme";

/** Paramètres > Général (spec 05 §1.5) : copie des photos prises dans la galerie. */
export function GeneralSettings() {
  const [gallery, setGallery] = useState<boolean | null>(null);
  useEffect(() => {
    getSaveToGallery().then(setGallery);
  }, []);

  return (
    <Card>
      <Text style={styles.title}>{t("generalSettings.title")}</Text>
      <View style={styles.row}>
        <Text style={styles.label}>{t("generalSettings.savePhotosToGallery")}</Text>
        <Switch
          value={!!gallery}
          disabled={gallery === null}
          onValueChange={(v) => { setGallery(v); void setSaveToGallery(v); }}
          accessibilityLabel={t("generalSettings.savePhotosToGallery")}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.body, fontWeight: "700", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { flex: 1, fontSize: font.body, color: colors.text },
});
