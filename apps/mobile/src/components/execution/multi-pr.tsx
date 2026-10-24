// Bloc Instructions multiples (spec 05 §4.6) : statut, observation et signature par sous-instruction, changement de
// statut et signature en lot. En consultation seule si l'étape n'est pas saisissable.
import { usePowerSync, useQuery } from "@powersync/react";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Checkbox, Icon, StatusChip, useSnackbar } from "@/components/kit";
import { RichText } from "@/components/rich-text";
import { SignaturePad } from "@/components/signature-pad";
import { Banner, Button } from "@/components/ui";
import type { ExecBlock } from "@/data/execution-model";
import type { Db } from "@/data/form-response";
import { setMultiPrObservation, setMultiPrStatus, signMultiPrItems } from "@/data/flow-writes";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

type Item = {
  id: string; flow_id: string; title: string | null; content_html: string | null; content_json: string | null; observation: string | null;
  custom_status_id: string | null; status_name: string | null; status_color: string | null; signed: number;
};
type Status = { id: string; name: string; color: string | null };
type Bulk = { kind: "status" | "sign"; selected: Set<string> } | null;

export function MultiPrItems({ block, editable }: { block: ExecBlock; editable: boolean }) {
  const db = usePowerSync() as unknown as Db;
  const { profile } = useSession();
  const snackbar = useSnackbar();
  const me = profile?.principalId ?? "";
  const { data: items } = useQuery<Item>(
    `select i.id, i.flow_id, i.title, i.content_html, i.content_json, i.observation, i.custom_status_id,
            s.name as status_name, s.color as status_color,
            exists (select 1 from block_multi_pr_signatures g where g.item_id = i.id) as signed
       from block_multi_pr_items i left join custom_statuses s on s.id = i.custom_status_id
      where i.block_id = ? and ifnull(i.disabled, 0) = 0 order by i.position`, [block.id]);
  const { data: statuses } = useQuery<Status>(
    "select id, name, color from custom_statuses where nature = 'multi_pr' and ifnull(active, 1) = 1 order by sort_order, name");
  const [statusFor, setStatusFor] = useState<string[] | null>(null);
  const [signFor, setSignFor] = useState<string[] | null>(null);
  const [observationFor, setObservationFor] = useState<Item | null>(null);
  const [bulk, setBulk] = useState<Bulk>(null);

  const toggle = (id: string) => setBulk((b) => {
    if (!b) return b;
    const selected = new Set(b.selected);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    return { ...b, selected };
  });

  const applyStatus = async (statusId: string) => {
    const ids = statusFor ?? [];
    setStatusFor(null);
    await setMultiPrStatus(db, ids, statusId, me);
    if (ids.length > 1) snackbar(t("execution.statusesChanged"), "success");
    setBulk(null);
  };

  const applySignature = async (signaturePath: string, signedAt: string) => {
    const ids = signFor ?? [];
    setSignFor(null);
    await signMultiPrItems(db, items.filter((i) => ids.includes(i.id)).map((i) => ({ id: i.id, flowId: i.flow_id })),
      { signaturePath, signedAt, me }, randomUUID);
    snackbar(ids.length > 1 ? t("execution.signaturesDone") : t("signature.success"), "success");
    setBulk(null);
  };

  return (
    <View style={{ gap: spacing.xs }}>
      {editable && items.length > 1 && !bulk && (
        <View style={styles.toolbar}>
          <SmallButton label={t("execution.multipleStatusChange")} onPress={() => setBulk({ kind: "status", selected: new Set() })} />
          <SmallButton label={t("execution.multipleSignature")} onPress={() => setBulk({ kind: "sign", selected: new Set() })} />
        </View>
      )}
      {bulk && (
        <View style={styles.bulkBar}>
          <Text style={styles.muted}>{bulk.kind === "status" ? t("execution.multipleStatusAlert") : t("execution.selectItems")}</Text>
          <View style={styles.toolbar}>
            <SmallButton
              label={bulk.kind === "status" ? t("execution.changeStatusFor", { count: bulk.selected.size }) : t("execution.signFor", { count: bulk.selected.size })}
              disabled={!bulk.selected.size}
              onPress={() => (bulk.kind === "status" ? setStatusFor([...bulk.selected]) : setSignFor([...bulk.selected]))} />
            <SmallButton label={t("common.cancel")} secondary onPress={() => setBulk(null)} />
          </View>
        </View>
      )}
      {items.map((i, n) => (
        <View key={i.id} style={styles.item}>
          <View style={styles.itemHeader}>
            {bulk && (bulk.kind === "status" || !i.signed) && (
              <Checkbox checked={bulk.selected.has(i.id)} onChange={() => toggle(i.id)} label={undefined} />
            )}
            {!block.multi_pr_title_hidden && <Text style={styles.title}>{n + 1}. {i.title ?? ""}</Text>}
          </View>
          <RichText json={i.content_json} html={i.content_html} />
          <View style={styles.row}>
            {i.status_name ? <StatusChip color={i.status_color} label={i.status_name} />
              : <Text style={[styles.muted, !!block.multi_pr_requires_status && { color: colors.danger }]}>{t("execution.addStatus")}</Text>}
            {!!i.signed && <View style={styles.row}><Icon name="draw-pen" color={colors.success} size={18} /><Text style={styles.muted}>{t("execution.itemSigned")}</Text></View>}
          </View>
          {!!i.observation && <Text style={styles.muted}>{i.observation}</Text>}
          {editable && !bulk && (
            <View style={styles.toolbar}>
              <SmallButton label={i.custom_status_id ? t("flowDetails.changeStatus") : t("execution.addStatus")} onPress={() => setStatusFor([i.id])} />
              <SmallButton label={i.observation ? t("execution.seeObservation") : t("execution.addObservation")} secondary onPress={() => setObservationFor(i)} />
              {!i.signed && <SmallButton label={t("signature.sign")} secondary onPress={() => setSignFor([i.id])} />}
            </View>
          )}
        </View>
      ))}

      <Modal visible={!!statusFor} transparent animationType="fade" onRequestClose={() => setStatusFor(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{(statusFor?.length ?? 0) > 1 ? t("execution.multipleStatusChange") : t("execution.addStatus")}</Text>
            {statuses.map((s) => (
              <Pressable key={s.id} accessibilityRole="button" onPress={() => void applyStatus(s.id)} style={styles.statusRow}>
                <StatusChip color={s.color} label={s.name} />
              </Pressable>
            ))}
            <Button label={t("common.cancel")} variant="secondary" onPress={() => setStatusFor(null)} />
          </View>
        </View>
      </Modal>
      {observationFor && (
        <ObservationModal item={observationFor} onClose={() => setObservationFor(null)}
          onSave={async (text) => { await setMultiPrObservation(db, observationFor.id, text, me); setObservationFor(null); }} />
      )}
      <Modal visible={!!signFor} animationType="slide" onRequestClose={() => setSignFor(null)}>
        {signFor && <SignItems count={signFor.length} onCancel={() => setSignFor(null)} onSign={applySignature} />}
      </Modal>
    </View>
  );
}

function ObservationModal({ item, onClose, onSave }: { item: Item; onClose: () => void; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(item.observation ?? "");
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{t("execution.addObservation")}</Text>
          <TextInput value={text} onChangeText={setText} multiline maxLength={4000} placeholder={t("execution.observationPlaceholder")}
            placeholderTextColor={colors.textSecondary} style={styles.input} accessibilityLabel={t("execution.addObservation")} />
          <Button label={t("common.confirm")} onPress={() => void onSave(text)} />
          <Button label={t("common.cancel")} variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function SignItems({ count, onCancel, onSign }: { count: number; onCancel: () => void; onSign: (png: string, signedAt: string) => Promise<void> }) {
  const [drawing, setDrawing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.signScreen}>
      <Text style={styles.modalTitle}>{count > 1 ? t("execution.signFor", { count }) : t("signature.sign")}</Text>
      <SignaturePad onChange={(png) => { setDrawing(png); setError(null); }} />
      {!!error && <Banner tone="danger">{error}</Banner>}
      <Button label={t("signature.sign")} onPress={() => (drawing ? void onSign(drawing, new Date().toISOString()) : setError(t("signature.errors.drawingRequired")))} />
      <Button label={t("common.cancel")} variant="secondary" onPress={onCancel} />
    </View>
  );
}

function SmallButton({ label, onPress, secondary, disabled }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
      style={[styles.small, secondary && styles.smallSecondary, disabled && { opacity: 0.5 }]}>
      <Text style={[styles.smallLabel, secondary && { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  bulkBar: { gap: spacing.xs, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm },
  item: { gap: spacing.xs, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flex: 1, fontSize: font.body, fontWeight: "600", color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  muted: { fontSize: font.small, color: colors.textSecondary },
  small: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  smallSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  smallLabel: { color: colors.onPrimary, fontWeight: "600", fontSize: font.small },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: font.title - 2, fontWeight: "700", color: colors.text },
  statusRow: { paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  input: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: font.body, color: colors.text, textAlignVertical: "top" },
  signScreen: { flex: 1, padding: spacing.lg, paddingTop: spacing.xl * 1.5, gap: spacing.md, backgroundColor: colors.background },
});
