import { usePowerSync } from "@powersync/react";
import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

import {
  BACKUP_INTERVALS, getBackupInterval, getLastBackup, saveLocalBackup, sendBackupToSupport, setBackupInterval,
} from "@/backup/service";
import { Card, formatDate, Segmented, useSnackbar } from "@/components/kit";
import { Button } from "@/components/ui";
import { t } from "@/i18n/fr";
import { logEvent } from "@/lib/app-log";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

/** Paramètres > Sauvegarde et Support (spec 05 §1.5, §6.1). */
export function BackupSettings() {
  const db = usePowerSync();
  const { profile, offline, resetLocalData } = useSession();
  const snackbar = useSnackbar();
  const [interval, setIntervalState] = useState<number | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState<"local" | "support" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const principalId = profile?.principalId ?? "";

  useEffect(() => {
    if (!principalId) return;
    getBackupInterval(principalId).then(setIntervalState);
    getLastBackup(principalId).then(setLast);
  }, [principalId]);

  const run = async (kind: "local" | "support") => {
    if (!profile) return;
    if (kind === "support" && offline) return snackbar(t("backup.sendSupportOffline"));
    setBusy(kind);
    try {
      if (kind === "local") {
        await saveLocalBackup(db, profile, "manual");
        setLast(await getLastBackup(principalId));
      } else {
        await sendBackupToSupport(db, profile, "support");
      }
      logEvent(kind === "local" ? "BACKUP_LOCAL" : "BACKUP_SUPPORT");
      snackbar(t(kind === "local" ? "backup.saveLocalSuccess" : "backup.sendSupportSuccess"), "success");
    } catch (e) {
      logEvent("BACKUP_FAIL", { kind, error: e instanceof Error ? e.message : String(e) });
      snackbar(e instanceof Error && e.message === "KEY_UNAVAILABLE" ? t("backup.keyError")
        : kind === "local" ? t("backup.saveLocalError") : t("backup.error"), "danger");
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setConfirmReset(false);
    const res = await resetLocalData();
    snackbar(res === "PENDING_WRITES" ? t("backup.resetPending") : t("backup.resetDone"), res ? "danger" : "success");
  };

  return (
    <>
      <Card>
        <Text style={styles.title}>{t("backup.title")}</Text>
        <Text style={styles.label}>{t("backup.interval")}</Text>
        {interval !== null && (
          <Segmented<string> value={String(interval)} options={BACKUP_INTERVALS.map((m) => ({
            value: String(m), label: m < 60 ? t("backup.minutes", { n: m }) : t("backup.hours", { n: m / 60 }), disabled: offline,
          }))} onChange={(v) => {
            if (offline) return snackbar(t("backup.intervalOffline"));
            setIntervalState(Number(v));
            void setBackupInterval(principalId, Number(v));
          }} />
        )}
        <Text style={styles.muted}>{last ? t("backup.last", { date: formatDate(last, true) ?? "" }) : t("backup.never")}</Text>
        {busy && <Text style={styles.warning}>{t("backup.inProgress")}</Text>}
        <Button label={t("backup.saveLocal")} variant="secondary" onPress={() => void run("local")} loading={busy === "local"} disabled={!!busy} />
      </Card>
      <Card>
        <Text style={styles.title}>{t("backup.support")}</Text>
        <Button label={t("backup.sendSupport")} variant="secondary" onPress={() => void run("support")} loading={busy === "support"} disabled={!!busy || offline} />
        <Button label={t("backup.reset")} variant="secondary" onPress={() => setConfirmReset(true)} disabled={!!busy} />
      </Card>
      <Modal visible={confirmReset} transparent animationType="fade" onRequestClose={() => setConfirmReset(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.title}>{t("backup.reset")}</Text>
            <Text style={styles.text}>{t("backup.resetConfirm")}</Text>
            <Button label={t("common.confirm")} onPress={() => void reset()} />
            <Button label={t("common.cancel")} variant="secondary" onPress={() => setConfirmReset(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.body, fontWeight: "700", color: colors.text },
  label: { fontSize: font.small, fontWeight: "600", color: colors.textSecondary },
  muted: { fontSize: font.small, color: colors.textSecondary },
  warning: { fontSize: font.small, color: colors.warning },
  text: { fontSize: font.body, color: colors.text, lineHeight: 22 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
});
