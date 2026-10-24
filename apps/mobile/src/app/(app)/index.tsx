import { useQuery } from "@powersync/react";
import { FlatList, Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SyncBar } from "@/components/sync-bar";
import { Banner, Button } from "@/components/ui";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

type ProjectRow = { id: string; designation: string; project_index: string | null; flows: number };

// Accueil provisoire : liste des entités lue dans la base locale (preuve de la chaîne Supabase → PowerSync → SQLite).
// Remplacé par les écrans de liste de la spec 05 §2 à l'étape suivante.
export default function HomeScreen() {
  const { profile, offline, signOut, forbidden, dismissForbidden } = useSession();
  const { data: projects } = useQuery<ProjectRow>(
    `select p.id, p.designation, p.project_index,
            (select count(*) from flows f where f.project_id = p.id) as flows
       from projects p order by p.designation`,
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("home.projects")}</Text>
        <Text style={styles.profile}>{profile?.displayName}</Text>
      </View>
      <View style={styles.content}>
        <SyncBar />
        <FlatList
          data={projects}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ gap: spacing.sm }}
          ListEmptyComponent={<Text style={styles.empty}>{t("home.noProject")}</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.designation}</Text>
              <Text style={styles.cardMeta}>{[item.project_index, `${item.flows} flow(s)`].filter(Boolean).join(" · ")}</Text>
            </View>
          )}
        />
        {offline ? <Banner tone="info">{t("home.signOutOffline")}</Banner> : (
          <Button label={t("home.signOut")} variant="secondary" onPress={signOut} />
        )}
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: font.title, fontWeight: "700", color: colors.onPrimary },
  profile: { fontSize: font.small, color: colors.onPrimary, opacity: 0.85 },
  content: { flex: 1, padding: spacing.md, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  cardTitle: { fontSize: font.body, fontWeight: "600", color: colors.text },
  cardMeta: { fontSize: font.small, color: colors.textSecondary },
  empty: { textAlign: "center", color: colors.textSecondary, marginTop: spacing.xl },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: font.title, fontWeight: "700", color: colors.text },
  modalText: { fontSize: font.body, color: colors.text, lineHeight: 22 },
});
