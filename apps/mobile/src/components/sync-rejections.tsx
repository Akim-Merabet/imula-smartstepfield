import { usePowerSync, useQuery } from "@powersync/react";
import { StyleSheet, Text, View } from "react-native";

import { Card, formatDate } from "@/components/kit";
import { Button } from "@/components/ui";
import { fr, t } from "@/i18n/fr";
import { colors, font, spacing } from "@/theme";

type Rejection = { id: string; table_name: string; error_code: string; created_at: string };

/** Écritures refusées par le serveur (spec 05 §9.6) : retirées de la file, listées avec leur motif. */
export function SyncRejections() {
  const db = usePowerSync();
  const { data } = useQuery<Rejection>("select id, table_name, error_code, created_at from sync_rejections order by created_at desc");
  const label = (r: Rejection) => {
    const table = r.table_name in fr.rejections.tables ? r.table_name : "other";
    const code = r.error_code in fr.rejections.codes ? r.error_code : "other";
    return {
      table: t(`rejections.tables.${table}` as never),
      reason: t(`rejections.codes.${code}` as never, { code: r.error_code }),
    };
  };
  return (
    <Card>
      <Text style={styles.title}>{t("rejections.title")}</Text>
      {!data.length && <Text style={styles.muted}>{t("rejections.none")}</Text>}
      {data.map((r) => {
        const l = label(r);
        return (
          <View key={r.id} style={styles.item}>
            <Text style={styles.text}>{l.table} — {l.reason}</Text>
            <Text style={styles.muted}>{formatDate(r.created_at, true)}</Text>
          </View>
        );
      })}
      {data.length > 0 && <Button label={t("rejections.clear")} variant="secondary" onPress={() => void db.execute("delete from sync_rejections")} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.body, fontWeight: "700", color: colors.text },
  item: { gap: 2, paddingVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  text: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.small, color: colors.textSecondary },
});
