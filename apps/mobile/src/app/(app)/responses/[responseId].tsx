import { cellHeader, type RtQuestion, type RtRubric } from "@imula/forms-core/model";
import type { CheckResult } from "@imula/forms-core/types";
import { checkResponse, checkRubric, computeRedirect, evaluateCell, prefillValue, type ValuesMap } from "@imula/forms-core/values";
import { usePowerSync } from "@powersync/react";
import { randomUUID } from "expo-crypto";
import { router, Stack, useLocalSearchParams, useNavigation, usePreventRemove } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from "react-native";

import { QuestionInput } from "@/components/forms/question-input";
import { Empty, Icon, useSnackbar } from "@/components/kit";
import { Banner, Button } from "@/components/ui";
import { BulkFillModal } from "@/components/forms/bulk-fill-modal";
import { ChangeSignatureModal } from "@/components/forms/change-signature";
import {
  addTableItems, bulkFillTargets, type ChangeSignature, type Db, finishResponse, loadResponse, type LoadedResponse, lockedChanges,
  rubricRows, saveRubricRows, tableItemRows,
} from "@/data/form-response";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

/** Écran de réponse à un formulaire (spec 05 §4.7.3) : lecture et écriture dans la base locale. */
export default function ResponseScreen() {
  const { responseId, readonly } = useLocalSearchParams<{ responseId: string; readonly?: string }>();
  const db = usePowerSync() as unknown as Db;
  const [loaded, setLoaded] = useState<LoadedResponse | null | undefined>(undefined);
  // Rechargé après un ajout de ligne / colonne (le modèle change ; les saisies en cours sont gardées par le formulaire).
  const reload = useCallback(() => {
    loadResponse(db, responseId).then(setLoaded).catch(() => setLoaded(null));
  }, [db, responseId]);
  useEffect(reload, [reload]);
  if (loaded === undefined) return null;
  if (!loaded) return <Empty>{t("forms.noVersion")}</Empty>;
  return <ResponseForm key={loaded.response.id} loaded={loaded} forceReadOnly={readonly === "1"} onReload={reload} />;
}

function ResponseForm({ loaded, forceReadOnly, onReload }: { loaded: LoadedResponse; forceReadOnly: boolean; onReload: () => void }) {
  const db = usePowerSync() as unknown as Db;
  const { profile } = useSession();
  const snackbar = useSnackbar();
  const navigation = useNavigation();
  const { model, response } = loaded;
  const done = response.state === "done";
  const rubrics = useMemo(() => model.rubrics.filter((r) => !r.def.hiddenInMobile), [model]);
  const rubricReadOnly = (r: RtRubric) => done || forceReadOnly || (!!loaded.fillable && !loaded.fillable.has(r.def.lineageId));

  // Valeurs saisies (pré-remplissage appliqué aux cellules jamais renseignées d'une réponse en cours).
  const [values, setValues] = useState<ValuesMap>(() => {
    const v: ValuesMap = { ...loaded.values };
    if (!done && !forceReadOnly) {
      for (const r of model.rubrics) for (const q of r.questions) for (const c of q.cells) {
        if (v[c.lineageId] !== undefined) continue;
        const pre = prefillValue(q.type, c.opt, loaded.dynamicCtx);
        if (pre !== null && pre !== undefined) v[c.lineageId] = { value: pre, locked: false };
      }
    }
    return v;
  });
  const baseline = useRef<ValuesMap>(loaded.values);
  const [observations, setObservations] = useState<Record<string, string>>(loaded.observations);
  const baseObservations = useRef<Record<string, string>>(loaded.observations);
  const [touched, setTouched] = useState(false);
  const [index, setIndex] = useState(() => Math.max(0, rubrics.findIndex((r) => r.def.lineageId === response.last_rubric_lineage_id)));
  const [failed, setFailed] = useState<CheckResult[] | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Questions verrouillées déverrouillées pour modification (signature exigée à la sauvegarde).
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [unlockQ, setUnlockQ] = useState<RtQuestion | null>(null);
  const [bulkQ, setBulkQ] = useState<RtQuestion | null>(null);
  const sigResolver = useRef<((s: ChangeSignature | null) => void) | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const askSignature = () => new Promise<ChangeSignature | null>((resolve) => { sigResolver.current = resolve; setSigOpen(true); });
  const scroll = useRef<ScrollViewInstance>(null);
  const rubric = rubrics[index];
  const readOnly = !rubric || rubricReadOnly(rubric);

  // Formules recalculées à chaque saisie (affichage) ; la valeur enregistrée est recalculée à la sauvegarde.
  const display = useMemo(() => {
    if (!rubric) return values;
    const out: ValuesMap = { ...values };
    for (const q of rubric.questions) {
      if (q.type !== "formula") continue;
      for (const c of q.cells) {
        const res = evaluateCell(model, rubric, q, c, out, loaded.dynamicCtx, loaded.locale);
        out[c.lineageId] = { value: res.ok ? { result: res.value, unit: c.opt?.unit } : null, locked: false };
      }
    }
    return out;
  }, [values, rubric, model, loaded]);

  // Sortie avec des saisies non sauvegardées : confirmation.
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [leavingNow, setLeavingNow] = useState(false);
  const allowLeave = usePreventRemove(touched && !leavingNow, ({ data }) => {
    setPendingLeave(() => () => navigation.dispatch(data.action));
  });

  const setValue = (lineageId: string, value: unknown) => {
    setValues((v) => ({ ...v, [lineageId]: { ...v[lineageId], value, locked: v[lineageId]?.locked ?? false } }));
    setTouched(true);
  };
  const setExclusive = (q: RtQuestion, lineageId: string, checked: boolean) => {
    setValues((v) => {
      const next = { ...v };
      for (const c of q.cells) next[c.lineageId] = { ...next[c.lineageId], value: c.lineageId === lineageId && checked ? true : null, locked: next[c.lineageId]?.locked ?? false };
      return next;
    });
    setTouched(true);
  };

  /** Écrit la rubrique courante dans la base locale (l'envoi suit). Renvoie false si la signature a été annulée. */
  const saveCurrent = async (): Promise<boolean> => {
    if (!rubric || readOnly) return true;
    const rows = rubricRows(loaded, rubric, display, baseline.current, observations, baseObservations.current, unlocked);
    if (!rows.length && !touched) return true;
    const changed = lockedChanges(rows, baseline.current);
    let change: { signature: ChangeSignature; optionLineageIds: string[] } | undefined;
    if (changed.length) {
      const signature = await askSignature();
      if (!signature) return false;
      change = { signature, optionLineageIds: changed.map((r) => r.option_lineage_id) };
    }
    await saveRubricRows(db, response, rubric, rows, display, profile?.principalId ?? "", randomUUID,
      { flowId: response.flow_id, projectId: response.project_id }, change);
    const nextBase = { ...baseline.current };
    for (const r of rows) nextBase[r.option_lineage_id] = { value: display[r.option_lineage_id]?.value ?? null, locked: !!r.locked };
    baseline.current = nextBase;
    setValues((v) => {
      const out = { ...v };
      for (const r of rows) out[r.option_lineage_id] = { value: display[r.option_lineage_id]?.value ?? null, locked: !!r.locked };
      return out;
    });
    baseObservations.current = { ...observations };
    setUnlocked((u) => { const n = new Set(u); for (const q of rubric.questions) n.delete(q.lineageId); return n; });
    setTouched(false);
    return true;
  };

  const addItem = (axis: "row" | "column") => run(async () => {
    if (!rubric) return;
    const rows = tableItemRows(rubric, axis, loaded.items, response.id, randomUUID);
    if (!rows?.length) return;
    await addTableItems(db, rows, randomUUID);
    onReload();
  });

  const applyBulk = (q: RtQuestion, value: unknown) => {
    const targets = bulkFillTargets(q, display);
    setValues((v) => {
      const next = { ...v };
      for (const id of targets) next[id] = { value, locked: false };
      return next;
    });
    setTouched(true);
    setBulkQ(null);
  };

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch {
      snackbar(t("common.errorOccurred"), "danger");
    } finally {
      setBusy(false);
    }
  };

  const goTo = (i: number, questionId?: string) => run(async () => {
    if (!(await saveCurrent())) return;
    setFailed(null);
    setIndex(i);
    setHighlight(questionId ?? null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  });

  // « Rubrique suivante » : redirection active (spec 03 §6.6), contrôle de la rubrique quittée.
  const next = () => run(async () => {
    if (!rubric) return;
    if (!readOnly) {
      const check = checkRubric(rubric, display, response.created_at);
      if (!check.valid) return setFailed([check]);
    }
    if (!(await saveCurrent())) return;
    const redirect = !readOnly ? computeRedirect(rubric, display) : null;
    const target = redirect ? rubrics.findIndex((r) => r.def.lineageId === redirect.rubricLineageId) : index + 1;
    setIndex(target >= 0 ? target : index + 1);
    setHighlight(redirect?.questionLineageId ?? null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  });

  const leave = () => {
    setLeavingNow(true);
    allowLeave();
    if (router.canGoBack()) router.back();
  };

  const saveLater = () => run(async () => {
    if (!(await saveCurrent())) return;
    snackbar(t("forms.saved"), "success");
    leave();
  });

  const finish = () => run(async () => {
    setConfirmFinish(false);
    if (!(await saveCurrent())) return;
    const skip = new Set(model.rubrics.filter((r) => r.def.hiddenInMobile || rubricReadOnly(r)).map((r) => r.def.lineageId));
    const merged = { ...baseline.current };
    const failures = checkResponse(model, merged, response.created_at, skip);
    if (failures.length) return setFailed(failures);
    await finishResponse(db, response.id);
    snackbar(t("forms.finished"), "success");
    leave();
  });

  if (!rubric) return <Empty>{t("common.noElementFound")}</Empty>;
  const isLast = index === rubrics.length - 1;
  const errors = new Map((failed ?? []).flatMap((f) => f.questions.map((q) => [q.questionLineageId, q.error] as const)));

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: response.reference }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.ribbonBar} contentContainerStyle={styles.ribbon}>
        {rubrics.map((r, i) => (
          <Pressable key={r.def.lineageId} onPress={() => goTo(i)} accessibilityRole="tab" accessibilityState={{ selected: i === index }}
            style={[styles.tab, i === index && styles.tabActive]}>
            <Text style={[styles.tabLabel, i === index && { color: colors.onPrimary }]} numberOfLines={1}>{r.def.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.rubricType}>
          {rubric.def.type === "table_row" ? t("forms.tableByRow") : rubric.def.type === "table_column" ? t("forms.tableByColumn") : t("forms.rubric")}
        </Text>
        <Text style={styles.rubricTitle}>{rubric.def.name}</Text>
        {!!rubric.def.description && <Text style={styles.muted}>{rubric.def.description}</Text>}
        {(done || forceReadOnly) && <Banner tone="info">{t("forms.readOnly")}</Banner>}
        {!done && !forceReadOnly && readOnly && <Banner tone="info">{t("forms.inaccessibleRubric")}</Banner>}
        {failed && (
          <View style={styles.failed}>
            <Text style={styles.failedTitle}>{t("forms.failedQuestions")}</Text>
            <Text style={styles.muted}>{t("forms.fillInfoBelow")}</Text>
            {failed.flatMap((f) => f.questions.map((q) => (
              <Pressable key={q.questionLineageId} accessibilityRole="button" style={styles.failedRow}
                onPress={() => goTo(rubrics.findIndex((r) => r.def.lineageId === q.rubricLineageId), q.questionLineageId)}>
                <Text style={styles.text}>{f.name} — {q.name}</Text>
                <Text style={styles.errorTag}>{q.error === "mandatory" ? t("forms.mandatory") : t("forms.invalid")}</Text>
                <Icon name="chevron-right" size={18} color={colors.primary} />
              </Pressable>
            )))}
          </View>
        )}
        {rubric.questions.map((q) => (
          <QuestionInput key={q.lineageId} question={q} responseId={response.id} values={display} readOnly={readOnly} createdAt={response.created_at}
            observation={observations[q.lineageId] ?? ""} error={errors.get(q.lineageId) ?? null} highlight={highlight === q.lineageId}
            header={rubric.def.type === "question" ? undefined : (_cell, i) => cellHeader(rubric, i)}
            onChange={setValue} onExclusive={setExclusive}
            locked={q.cells.some((c) => display[c.lineageId]?.locked) && !unlocked.has(q.lineageId)}
            onUnlock={() => setUnlockQ(q)}
            onBulkFill={rubric.def.type !== "question" && bulkFillTargets(q, display).length > 0 ? () => setBulkQ(q) : undefined}
            onObservation={(text) => { setObservations((o) => ({ ...o, [q.lineageId]: text })); setTouched(true); }} />
        ))}
        {!readOnly && rubric.def.type !== "question" && (rubric.def.allowAddRow || rubric.def.allowAddColumn) && (
          <View style={styles.addItems}>
            {rubric.def.allowAddRow && <Button label={t("forms.addRow")} variant="secondary" onPress={() => addItem("row")} disabled={busy} />}
            {rubric.def.allowAddColumn && <Button label={t("forms.addColumn")} variant="secondary" onPress={() => addItem("column")} disabled={busy} />}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {index > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel={t("forms.previous")} onPress={() => goTo(index - 1)} style={styles.prev}>
            <Icon name="chevron-left" color={colors.primary} size={28} />
          </Pressable>
        )}
        <View style={styles.actions}>
          {!isLast && <Button label={t("forms.next")} onPress={next} loading={busy} />}
          {isLast && !done && !forceReadOnly && <Button label={t("forms.finish")} onPress={() => setConfirmFinish(true)} loading={busy} />}
          {!done && !forceReadOnly && <Button label={t("forms.saveLater")} variant="secondary" onPress={saveLater} disabled={busy} />}
          {(done || forceReadOnly) && isLast && <Button label={t("forms.returnToStep")} variant="secondary" onPress={leave} />}
        </View>
      </View>

      <ChangeSignatureModal visible={sigOpen} responseId={response.id}
        onCancel={() => { setSigOpen(false); sigResolver.current?.(null); }}
        onSigned={(sig) => { setSigOpen(false); sigResolver.current?.(sig); }} />
      <Confirm visible={!!unlockQ} title={t("forms.unlockTitle")} description={t("forms.unlockText")} confirm={t("forms.unlockQuestion")}
        cancel={t("common.cancel")} onConfirm={() => { if (unlockQ) setUnlocked((u) => new Set(u).add(unlockQ.lineageId)); setUnlockQ(null); }}
        onCancel={() => setUnlockQ(null)} onDismiss={() => setUnlockQ(null)} />
      {bulkQ && (
        <BulkFillModal question={bulkQ} targets={bulkFillTargets(bulkQ, display)} responseId={response.id} createdAt={response.created_at}
          onApply={(v) => applyBulk(bulkQ, v)} onClose={() => setBulkQ(null)} />
      )}
      <Confirm visible={confirmFinish} title={t("forms.finishConfirm")} confirm={t("forms.finish")} cancel={t("forms.saveLater")}
        onConfirm={finish} onCancel={() => { setConfirmFinish(false); saveLater(); }} onDismiss={() => setConfirmFinish(false)} />
      <Confirm visible={!!pendingLeave} title={t("forms.unsavedTitle")} description={t("forms.unsavedDescription")}
        confirm={t("forms.continue")} cancel={t("common.cancel")}
        onConfirm={() => { setLeavingNow(true); allowLeave(); const go = pendingLeave; setPendingLeave(null); go?.(); }}
        onCancel={() => setPendingLeave(null)} onDismiss={() => setPendingLeave(null)} />
    </View>
  );
}

function Confirm({ visible, title, description, confirm, cancel, onConfirm, onCancel, onDismiss }: {
  visible: boolean; title: string; description?: string; confirm: string; cancel: string;
  onConfirm: () => void; onCancel: () => void; onDismiss: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{title}</Text>
          {!!description && <Text style={styles.text}>{description}</Text>}
          <Button label={confirm} onPress={onConfirm} />
          <Button label={cancel} variant="secondary" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  ribbonBar: { flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  ribbon: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, maxWidth: 220 },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabLabel: { fontSize: font.small, fontWeight: "600", color: colors.text },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  rubricType: { fontSize: font.small, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase" },
  rubricTitle: { fontSize: font.title - 2, fontWeight: "700", color: colors.text },
  muted: { fontSize: font.small, color: colors.textSecondary },
  text: { flex: 1, fontSize: font.body, color: colors.text },
  failed: { backgroundColor: colors.dangerSurface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  failedTitle: { fontSize: font.body, fontWeight: "700", color: colors.danger },
  failedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  errorTag: { fontSize: 11, fontWeight: "700", color: colors.danger },
  addItems: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  prev: { padding: spacing.xs },
  actions: { flex: 1, flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", justifyContent: "flex-end" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: font.title, fontWeight: "700", color: colors.text },
});
