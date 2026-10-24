import { usePowerSync, useQuery } from "@powersync/react";
import { router } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { Card, Empty, formatDate, IconButton } from "@/components/kit";
import { t } from "@/i18n/fr";
import { colors, font, spacing } from "@/theme";

type OpenFlow = { id: string; flow_id: string; step_id: string | null; readonly: number; last_access_at: string; name: string | null; step_name: string | null };

/** Accès rapide (spec 05 §2.6) : flows ouverts, reprise à la dernière étape consultée. */
export default function QuickAccessScreen() {
  const db = usePowerSync();
  const { data } = useQuery<OpenFlow>(
    `select e.*, fl.name, s.name as step_name from flow_executions e
       left join flow_summaries fl on fl.id = e.flow_id left join steps s on s.id = e.step_id
      order by e.last_access_at desc`);
  return (
    <View style={styles.container}>
      {data.length > 0 && <Text style={styles.heading}>{t("quickAccess.openFlows", { count: data.length })}</Text>}
      <FlatList
        data={data}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ gap: spacing.sm }}
        ListEmptyComponent={<Empty>{t("quickAccess.noExecutedFlow")}</Empty>}
        renderItem={({ item }) => (
          <Card onPress={() => router.push({
            pathname: "/execution/[flowId]",
            params: { flowId: item.flow_id, ...(item.step_id ? { stepId: item.step_id } : {}), ...(item.readonly ? { readonly: "1" } : {}) },
          })}>
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name}>{item.name ?? "—"}</Text>
                {!!item.step_name && <Text style={styles.meta}>{t("quickAccess.lastStep", { step: item.step_name })}</Text>}
                <Text style={styles.meta}>{formatDate(item.last_access_at, true)}{item.readonly ? ` · ${t("common.readMode")}` : ""}</Text>
              </View>
              <IconButton name="close" label={t("execution.closeFlow")}
                onPress={() => void db.execute("delete from flow_executions where id = ?", [item.id])} />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md, gap: spacing.sm },
  heading: { fontSize: font.small, fontWeight: "700", color: colors.textSecondary },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { fontSize: font.body, fontWeight: "700", color: colors.text },
  meta: { fontSize: font.small, color: colors.textSecondary },
});
