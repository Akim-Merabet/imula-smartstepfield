import { usePowerSync } from "@powersync/react";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useState } from "react";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from "react-native";

import { listLocalBackups, type LocalBackup, RestoreError, restoreBackup } from "@/backup/service";
import { formatDate, useSnackbar } from "@/components/kit";
import { Button } from "@/components/ui";
import type { RestoreReport } from "@/data/restore";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

type Step = "decrypt" | "download" | "replay";
const STEP_LABEL = { decrypt: "backup.importDecrypt", download: "backup.importDownload", replay: "backup.importReplay" } as const;

/** Paramètres > Support > « Importer les données » (spec 05 §6.1) : restauration d'une sauvegarde du profil. */
export function RestoreBackup({ disabled }: { disabled: boolean }) {
  const db = usePowerSync();
  const { profile, offline } = useSession();
  const snackbar = useSnackbar();
  const [choices, setChoices] = useState<LocalBackup[] | null>(null);
  const [chosen, setChosen] = useState<{ file: File; createdAt: string | null } | null>(null);
  const [step, setStep] = useState<Step | null>(null);

  const open = () => {
    if (offline) return snackbar(t("backup.importOffline"));
    setChoices(profile ? listLocalBackups(profile.principalId) : []);
  };

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    setChoices(null);
    setChosen({ file: new File(result.assets[0].uri), createdAt: null });
  };

  const run = async () => {
    if (!chosen) return;
    const file = chosen.file;
    setChosen(null);
    setStep("decrypt");
    try {
      const report: RestoreReport = await restoreBackup(db, new Uint8Array(await file.arrayBuffer()), setStep);
      snackbar(`${t("backup.importDumpSuccess")}. ${t("backup.importReport", { replayed: report.replayed, already: report.alreadyApplied, missing: report.missing })}`, "success");
    } catch (e) {
      const code = e instanceof RestoreError ? e.message : null;
      snackbar(code === "NOT_YOUR_BACKUP" ? t("backup.importNotYours") : code === "INVALID_BACKUP" ? t("backup.importInvalid") : t("backup.importDumpFail"), "danger");
    } finally {
      setStep(null);
    }
  };

  return (
    <>
      <Button label={t("backup.importData")} variant="secondary" onPress={open} disabled={disabled || !!step || offline} loading={!!step} />
      {step && <Text style={styles.progress}>{t(STEP_LABEL[step])}</Text>}

      <Modal visible={!!choices} transparent animationType="fade" onRequestClose={() => setChoices(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.title}>{t("backup.importChoose")}</Text>
            <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ gap: spacing.sm }}>
              {!choices?.length && <Text style={styles.muted}>{t("backup.importNoLocal")}</Text>}
              {choices?.map((b) => (
                <Button key={b.file.uri} variant="secondary" onPress={() => { setChoices(null); setChosen(b); }}
                  label={t("backup.importLocal", { date: formatDate(b.createdAt, true) ?? b.file.name, size: Math.ceil(b.size / 1024) })} />
              ))}
            </ScrollView>
            <Button label={t("backup.importPickFile")} variant="secondary" onPress={() => void pick()} />
            <Button label={t("common.cancel")} variant="secondary" onPress={() => setChoices(null)} />
          </View>
        </View>
      </Modal>
      <Modal visible={!!chosen} transparent animationType="fade" onRequestClose={() => setChosen(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.title}>{t("backup.importData")}</Text>
            <Text style={styles.text}>{t("backup.importConfirm", { date: formatDate(chosen?.createdAt ?? null, true) ?? chosen?.file.name ?? "" })}</Text>
            <Button label={t("common.confirm")} onPress={() => void run()} />
            <Button label={t("common.cancel")} variant="secondary" onPress={() => setChosen(null)} />
          </View>
        </View>
      </Modal>
      {step && (
        <Modal visible transparent animationType="fade">
          <View style={styles.backdrop}>
            <View style={[styles.modal, styles.row]}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.text}>{t(STEP_LABEL[step])}</Text>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.body, fontWeight: "700", color: colors.text },
  muted: { fontSize: font.small, color: colors.textSecondary },
  text: { fontSize: font.body, color: colors.text, lineHeight: 22, flexShrink: 1 },
  progress: { fontSize: font.small, color: colors.warning },
  row: { flexDirection: "row", alignItems: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
});
