import { usePowerSync } from "@powersync/react";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";

import { Card, Empty, useSnackbar } from "@/components/kit";
import { listReferentialFlows, loadReferentialFlow, type ReferentialFlow } from "@/data/referentials";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, spacing } from "@/theme";

/** Flows d'un référentiel / modèle, ouverts en mode lecture (en ligne uniquement). */
export default function ReferentialFlowsScreen() {
  const { projectId, name } = useLocalSearchParams<{ projectId: string; name?: string }>();
  const db = usePowerSync();
  const { offline } = useSession();
  const snackbar = useSnackbar();
  const [flows, setFlows] = useState<ReferentialFlow[] | null | undefined>(undefined);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    listReferentialFlows(projectId).then(setFlows);
  }, [projectId]);

  const open = async (flow: ReferentialFlow) => {
    if (offline) return snackbar(t("layout.referentialOnlineOnly"));
    setOpening(flow.id);
    const ok = await loadReferentialFlow(db, flow.id);
    setOpening(null);
    if (!ok) return snackbar(t("layout.referentialLoadError"), "danger");
    router.push({ pathname: "/execution/[flowId]", params: { flowId: flow.id, readonly: "1" } });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: name ?? t("layout.referentialAndModels") }} />
      {flows === undefined ? <ActivityIndicator color={colors.primary} />
        : flows === null ? <Empty>{t("layout.referentialLoadError")}</Empty>
        : (
          <FlatList
            data={flows}
            keyExtractor={(f) => f.id}
            contentContainerStyle={{ gap: spacing.sm }}
            ListEmptyComponent={<Empty>{t("common.noElementFound")}</Empty>}
            renderItem={({ item }) => (
              <Card onPress={() => void open(item)} muted={!!opening && opening !== item.id}>
                <Text style={styles.type}>{t(`flowTypes.${item.flow_type}` as never)}</Text>
                <View style={styles.row}>
                  <Text style={styles.name}>{item.name}</Text>
                  {opening === item.id && <ActivityIndicator color={colors.primary} />}
                </View>
                {!!item.ref_int && <Text style={styles.type}>{item.ref_int}</Text>}
                <Text style={styles.hint}>{t("common.readMode")}</Text>
              </Card>
            )}
          />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  type: { fontSize: font.small, color: colors.textSecondary },
  name: { flex: 1, fontSize: font.body, fontWeight: "700", color: colors.text },
  hint: { fontSize: font.small, color: colors.primary, fontWeight: "600" },
});
