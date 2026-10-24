import { ScrollView, StyleSheet, Text } from "react-native";

import { Card, Field } from "@/components/kit";
import { SyncBar } from "@/components/sync-bar";
import { SyncRejections } from "@/components/sync-rejections";
import { Banner, Button } from "@/components/ui";
import { config } from "@/config";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, spacing } from "@/theme";

/** Paramètres (spec 05 §1.5) : profil, état de la synchro, déconnexion (en ligne uniquement). */
export default function SettingsScreen() {
  const { profile, offline, signOut } = useSession();
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.title}>{profile?.displayName}</Text>
        <Field label={t("login.company")} value={profile?.company} />
      </Card>
      <SyncBar />
      <SyncRejections />
      {offline ? <Banner tone="info">{t("home.signOutOffline")}</Banner> : (
        <Button label={t("home.signOut")} variant="secondary" onPress={signOut} />
      )}
      <Text style={styles.version}>{t("common.version", { version: config.appVersion })}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md },
  title: { fontSize: font.title, fontWeight: "700", color: colors.text },
  version: { textAlign: "center", fontSize: font.small, color: colors.textSecondary },
});
