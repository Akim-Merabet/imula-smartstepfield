import { usePowerSync, useStatus } from "@powersync/react";
import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

/** Bandeau d'état : bascule En ligne / Hors ligne (choix utilisateur, §3), dernière synchro, file d'envoi. */
export function SyncBar() {
  const db = usePowerSync();
  const status = useStatus();
  const { offline, setOffline, rejected } = useSession();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    db.getUploadQueueStats().then((s) => setPending(s.count)).catch(() => {});
  }, [db, status]);

  const busy = status.dataFlowStatus.downloading || status.dataFlowStatus.uploading || status.connecting;
  const detail = offline
    ? null
    : busy
      ? t("home.syncing")
      : status.lastSyncedAt
        ? t("home.synced", { date: status.lastSyncedAt.toLocaleTimeString("fr-FR", { timeStyle: "short" }) })
        : t("home.neverSynced");

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: offline ? colors.textSecondary : status.connected ? colors.success : colors.warning }]} />
        <Text style={styles.mode}>{offline ? t("home.offline") : t("home.online")}</Text>
        <Switch
          value={!offline}
          onValueChange={(online) => setOffline(!online)}
          accessibilityLabel={offline ? t("home.offline") : t("home.online")}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      {!!detail && <Text style={styles.detail}>{detail}</Text>}
      {pending > 0 && <Text style={styles.detail}>{t("home.pendingChanges", { count: pending })}</Text>}
      {rejected > 0 && <Text style={[styles.detail, { color: colors.danger }]}>{t("home.rejectedChanges", { count: rejected })}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  mode: { flex: 1, fontSize: font.body, fontWeight: "600", color: colors.text },
  detail: { fontSize: font.small, color: colors.textSecondary },
});
