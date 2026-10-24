// « Changement de statut » d'un flow (spec 05 §2.4) : statut + commentaire, enregistré localement puis envoyé.
import { usePowerSync, useQuery } from "@powersync/react";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Icon, StatusChip, useSnackbar } from "@/components/kit";
import { Button, TextField } from "@/components/ui";
import type { Db } from "@/data/form-response";
import { changeFlowStatus } from "@/data/flow-writes";
import { t } from "@/i18n/fr";
import { useSingleFlight } from "@/lib/single-flight";
import { colors, font, radius, spacing } from "@/theme";

type Status = { id: string; name: string; color: string | null; downloadable: number };

export function FlowStatusModal({ flowId, currentId, visible, onClose }: { flowId: string; currentId: string | null; visible: boolean; onClose: () => void }) {
  const db = usePowerSync() as unknown as Db;
  const snackbar = useSnackbar();
  const { data: statuses } = useQuery<Status>(
    "select id, name, color, ifnull(downloadable, 0) as downloadable from custom_statuses where nature = 'flow' and ifnull(active, 1) = 1 order by sort_order, name");
  const [selected, setSelected] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const current = statuses.find((s) => s.id === currentId);
  const chosen = statuses.find((s) => s.id === selected);

  const [submit, submitting] = useSingleFlight(async () => {
    if (!selected || selected === currentId) return onClose();
    await changeFlowStatus(db, flowId, selected, comment, randomUUID);
    snackbar(t("flowDetails.statusChanged"), "success");
    setSelected(null);
    setComment("");
    onClose();
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.title}>{t("flowDetails.changeStatusTitle")}</Text>
          {current && <Text style={styles.text}>{t("flowDetails.actualStatus", { status: current.name })}</Text>}
          <ScrollView style={{ maxHeight: 260 }}>
            {statuses.filter((s) => s.id !== currentId).map((s) => (
              <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ selected: s.id === selected }} onPress={() => setSelected(s.id)} style={styles.row}>
                <Icon name={s.id === selected ? "radiobox-marked" : "radiobox-blank"} color={s.id === selected ? colors.primary : colors.textSecondary} size={20} />
                <StatusChip color={s.color} label={s.name} />
              </Pressable>
            ))}
          </ScrollView>
          {chosen && !chosen.downloadable && <Text style={styles.warning}>{t("flowDetails.statusNotDownloadable")}</Text>}
          <TextField label={t("signature.commentOptional")} value={comment} onChangeText={setComment} multiline placeholder={t("flowDetails.statusCommentPlaceholder")} />
          <Button label={t("flowDetails.changeStatus")} onPress={() => void submit()} disabled={!selected} loading={submitting} />
          <Button label={t("common.cancel")} variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: font.title - 2, fontWeight: "700", color: colors.text },
  text: { fontSize: font.body, color: colors.text },
  warning: { fontSize: font.small, color: colors.warning },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
