import { useQuery } from "@powersync/react";
import { Stack, useLocalSearchParams } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { DocumentRow } from "@/components/execution/blocks";
import { Card, Empty } from "@/components/kit";
import { t } from "@/i18n/fr";
import { colors, font, spacing } from "@/theme";

type Doc = { id: string; name: string | null; ref_int: string | null; ref_ext: string | null; attachment_name: string | null; index_label: string | null; large: number; path: string | null };

/** « Liste des documents du projet » (spec 05 §2.9) : dernière version ayant un PDF, ouverture locale ou en ligne. */
export default function ProjectDocumentsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { data } = useQuery<Doc>(
    `select d.id, d.name, d.ref_int, d.ref_ext, null as attachment_name, ifnull(d.is_large_file, 0) as large,
            (select v.index_label from document_versions v where v.document_id = d.id order by v.seq desc limit 1) as index_label,
            (select v.pdf_path from document_versions v where v.document_id = d.id and v.pdf_path is not null order by v.seq desc limit 1) as path
       from documents d where d.project_id = ? and d.deleted_at is null order by d.name collate nocase`, [projectId]);
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t("projects.documentsTitle") }} />
      <Text style={styles.count}>{t("projects.documentsCount", { count: data.length })}</Text>
      <FlatList
        data={data}
        keyExtractor={(d) => d.id}
        ListEmptyComponent={<Empty>{t("projects.documentsEmpty")}</Empty>}
        renderItem={({ item }) => <Card><DocumentRow doc={{ ...item, ref_int: [item.ref_int, item.ref_ext].filter(Boolean).join(" / ") || null }} /></Card>}
        contentContainerStyle={{ gap: spacing.sm }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md, gap: spacing.sm },
  count: { fontSize: font.small, color: colors.textSecondary },
});
