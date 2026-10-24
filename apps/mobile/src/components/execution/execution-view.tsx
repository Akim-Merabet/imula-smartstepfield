import type { Chip } from "@imula/flow-core";
import { usePowerSync, useQuery } from "@powersync/react";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, TextInput, View } from "react-native";

import { StepBlocks, StepDocuments } from "@/components/execution/blocks";
import { SignatureModal, type SignatureTarget } from "@/components/execution/signature-modal";
import { Empty, Icon, StatusChip, useSnackbar } from "@/components/kit";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui";
import {
  buildExecutionModel, executionQueries, type ExecutionRows, type StepView, validationMessageKey,
} from "@/data/execution-model";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

const CHIP_COLORS: Record<Chip, string | null> = {
  none: null, disabled: "#B0B7C1", not_opened: "#B0B7C1", blue: "#2F6DB5", orange: "#E08A00", green: "#2E7D5B",
};

function ChipDot({ chip, size = 10 }: { chip: Chip; size?: number }) {
  const color = CHIP_COLORS[chip];
  if (!color) return <View style={{ width: size, height: size }} />;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/** Charge toutes les lignes du flow depuis la base locale et calcule le modèle (pastilles, séquencement). */
function useExecutionModel(flowId: string) {
  const q = useMemo(() => executionQueries(flowId), [flowId]);
  const rows: ExecutionRows = {
    flow: useQuery<ExecutionRows["flow"][number]>(...q.flow).data,
    phases: useQuery<ExecutionRows["phases"][number]>(...q.phases).data,
    steps: useQuery<ExecutionRows["steps"][number]>(...q.steps).data,
    sequences: useQuery<ExecutionRows["sequences"][number]>(...q.sequences).data,
    blocks: useQuery<ExecutionRows["blocks"][number]>(...q.blocks).data,
    dsiConfigs: useQuery<ExecutionRows["dsiConfigs"][number]>(...q.dsiConfigs).data,
    signatures: useQuery<ExecutionRows["signatures"][number]>(...q.signatures).data,
    multiPrItems: useQuery<ExecutionRows["multiPrItems"][number]>(...q.multiPrItems).data,
    multiPrSignatures: useQuery<ExecutionRows["multiPrSignatures"][number]>(...q.multiPrSignatures).data,
    formLinks: useQuery<ExecutionRows["formLinks"][number]>(...q.formLinks).data,
    responses: useQuery<ExecutionRows["responses"][number]>(...q.responses).data,
  };
  const deps = Object.values(rows);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- les tableaux de useQuery changent d'identité à chaque mise à jour
  const model = useMemo(() => buildExecutionModel(rows), deps);
  return { model, blocks: rows.blocks };
}

/**
 * Exécution d'un flow (spec 05 §4) : bandeau, navigation phases/étapes avec pastilles, contenu de l'étape,
 * redirections et pied d'étape (validation, passage à l'étape suivante).
 */
export function ExecutionView({ flowId, initialStepId, readonly }: { flowId: string; initialStepId?: string; readonly: boolean }) {
  const db = usePowerSync();
  const { profile } = useSession();
  const snackbar = useSnackbar();
  const { model, blocks } = useExecutionModel(flowId);
  const { data: lastExec } = useQuery<{ step_id: string | null }>("select step_id from flow_executions where flow_id = ?", [flowId]);
  const [stepId, setStepId] = useState<string | undefined>(initialStepId);
  const [disabledNotice, setDisabledNotice] = useState<StepView | null>(null);
  const [signing, setSigning] = useState<SignatureTarget | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  // Point d'entrée : étape demandée, sinon dernière étape consultée, sinon première étape non vide (spec 05 §2.5).
  const current = model && (
    (stepId && model.stepById.get(stepId))
    || (lastExec[0]?.step_id && model.stepById.get(lastExec[0].step_id))
    || model.order[0]
  ) || null;
  const phase = current ? model!.phases.find((p) => p.id === current.phase_id)! : null;
  const index = current ? model!.order.findIndex((s) => s.id === current.id) : -1;
  const isLast = index === (model?.order.length ?? 0) - 1;
  const editable = !!current && !readonly && !current.disabled && !current.read_only_on_mobile_app
    && !phase?.read_only_on_mobile_app && current.blockers.length === 0;

  // Mémorise le flow ouvert (Accès rapide, reprise) et marque la première ouverture de l'étape (pastille grise → bleue).
  useEffect(() => {
    if (!model || !current) return;
    const now = new Date().toISOString();
    void db.writeTransaction(async (tx) => {
      const existing = await tx.getOptional<{ id: string }>("select id from flow_executions where flow_id = ?", [flowId]);
      if (existing) {
        await tx.execute("update flow_executions set phase_id = ?, step_id = ?, readonly = ?, last_access_at = ? where id = ?",
          [current.phase_id, current.id, readonly ? 1 : 0, now, existing.id]);
      } else {
        await tx.execute(
          "insert into flow_executions (id, flow_id, project_id, phase_id, step_id, readonly, last_access_at) values (?, ?, ?, ?, ?, ?, ?)",
          [randomUUID(), flowId, model.flow.project_id, current.phase_id, current.id, readonly ? 1 : 0, now]);
      }
      if (!readonly && !current.first_opened_at && !current.disabled && !current.read_only_on_mobile_app) {
        await tx.execute("update steps set first_opened_at = ? where id = ? and first_opened_at is null", [now, current.id]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une écriture par changement d'étape
  }, [db, flowId, current?.id, readonly, !!model]);

  if (!model) return <Empty>{t("execution.flowNotDownloaded")}</Empty>;
  if (!current || !phase) return <Empty>{t("execution.emptyFlow")}</Empty>;

  const goTo = (step: StepView) => {
    setStepId(step.id);
    scroll.current?.scrollTo({ y: 0, animated: false });
    if (step.disabled) setDisabledNotice(step);
  };

  const finish = () => {
    if (router.canGoBack()) router.back();
  };

  const next = () => {
    const following = model.order[index + 1];
    if (following) goTo(following);
    else finish();
  };

  const validate = async () => {
    const key = validationMessageKey(current.missing);
    if (key) return snackbar(t(key), "danger");
    await db.execute("update steps set validated_at = ? where id = ? and validated_at is null", [new Date().toISOString(), current.id]);
    snackbar(t("execution.stepValidated"), "success");
    next();
  };

  const canValidate = editable && model.validationEnabled && !current.validated_at;
  const footerLabel = isLast
    ? t(canValidate ? "execution.validate" : "execution.finishOnly")
    : t(canValidate ? "execution.next" : "execution.nextOnly");

  return (
    <View style={styles.container}>
      <FlowBanner name={model.flow.name} type={model.flow.flow_type} reference={model.flow.ref_int || model.flow.ref_ext}
        statusName={model.flow.status_name} statusColor={model.flow.status_color} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ribbon} style={styles.ribbonBar}>
        {model.phases.map((ph) => {
          const first = ph.steps.find((s) => !s.empty);
          const active = ph.id === phase.id;
          return (
            <Pressable key={ph.id} disabled={!first} onPress={() => first && goTo(first)} accessibilityRole="tab"
              accessibilityState={{ selected: active }} style={[styles.phaseTab, active && styles.phaseTabActive, !!ph.disabled && styles.struck]}>
              <ChipDot chip={ph.chip} />
              <Text style={[styles.phaseTabLabel, active && { color: colors.onPrimary }]}>{t("execution.phaseShort", { n: ph.number })}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView ref={scroll} contentContainerStyle={styles.content}>
        <Text style={styles.phaseTitle}>{t("execution.phase", { n: phase.number })} — {phase.name}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.steps}>
          {phase.steps.filter((s) => !s.empty).map((s) => (
            <Pressable key={s.id} onPress={() => goTo(s)} accessibilityRole="tab" accessibilityState={{ selected: s.id === current.id }}
              style={[styles.stepTab, s.id === current.id && styles.stepTabActive]}>
              <ChipDot chip={s.chip} />
              <Text style={[styles.stepTabLabel, !!s.disabled && styles.struckText]}>{t("execution.stepShort", { n: s.number })}</Text>
              {s.blockers.length > 0 && <Icon name="lock-outline" size={14} color={colors.textSecondary} />}
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.stepHeader}>
          <ChipDot chip={current.chip} size={14} />
          <Text style={[styles.stepTitle, !!current.disabled && styles.struckText]}>
            {t("execution.step", { n: current.number })} — {current.name}
          </Text>
        </View>
        {readonly && <Notice icon="eye-outline" text={t("execution.readMode")} />}
        {!!current.disabled && <Notice icon="cancel" text={t("execution.disabledStep")} detail={current.disabled_comment} />}
        {(!!current.read_only_on_mobile_app || !!phase.read_only_on_mobile_app) && <Notice icon="monitor" text={t("execution.readOnlyOnMobile")} />}
        {current.blockers.length > 0 && !current.disabled && (
          <Notice icon="lock-outline" text={t("execution.lockedStep")}
            detail={t("execution.lockedBy", { steps: current.blockers.map((id) => stepLabel(model, id)).join(", ") })} />
        )}
        {!!current.description && <RichText html={current.description} />}

        <StepBlocks stepId={current.id} blocks={blocks} flow={model.flow} flowType={model.flow.flow_type}
          actions={editable ? { stepId: current.id, flowId, onSign: setSigning } : undefined} />
        <StepDocuments stepId={current.id} />

        <Redirections stepId={current.id} flowId={flowId} readonly={readonly} actorId={profile?.principalId ?? null}
          onNavigate={(targetStepId) => {
            const target = targetStepId ? model.stepById.get(targetStepId) : undefined;
            if (target) goTo(target);
          }} />
      </ScrollView>

      <View style={styles.footer}>
        {index > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel={t("execution.previous")} onPress={() => goTo(model.order[index - 1])} style={styles.prev}>
            <Icon name="chevron-left" color={colors.primary} size={28} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Button label={footerLabel} onPress={canValidate ? validate : next} />
        </View>
      </View>

      <SignatureModal target={signing} onClose={() => setSigning(null)} />

      <Modal visible={!!disabledNotice} transparent animationType="fade" onRequestClose={() => setDisabledNotice(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t("execution.disabledStepTitle")}</Text>
            <Text style={styles.modalText}>{t("execution.disabledStepDescription")}</Text>
            {!!disabledNotice?.disabled_comment && <Text style={styles.modalText}>{t("common.comment")} : {disabledNotice.disabled_comment}</Text>}
            <Button label={t("execution.disabledStepButton")} onPress={() => setDisabledNotice(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function stepLabel(model: NonNullable<ReturnType<typeof buildExecutionModel>>, stepId: string): string {
  for (const ph of model.phases) {
    const s = ph.steps.find((x) => x.id === stepId);
    if (s) return `${t("execution.phaseShort", { n: ph.number })} ${t("execution.stepShort", { n: s.number })}`;
  }
  return "—";
}

function FlowBanner({ name, type, reference, statusName, statusColor }: {
  name: string; type: string; reference: string | null; statusName: string | null; statusColor: string | null;
}) {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerType}>{t(`flowTypes.${type}` as never)}{reference ? ` · ${reference}` : ""}</Text>
      <Text style={styles.bannerName} numberOfLines={2}>{name}</Text>
      <StatusChip color={statusColor} label={statusName} />
    </View>
  );
}

function Notice({ icon, text, detail }: { icon: Parameters<typeof Icon>[0]["name"]; text: string; detail?: string | null }) {
  return (
    <View style={styles.notice}>
      <Icon name={icon} size={18} color={colors.textSecondary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.noticeText}>{text}</Text>
        {!!detail && <Text style={styles.noticeDetail}>{detail}</Text>}
      </View>
    </View>
  );
}

const STYLE_COLORS: Record<string, string> = {
  default: colors.primary, info: "#2F6DB5", warning: colors.warning, error: colors.danger, success: colors.success,
};

/** Redirections d'étape (spec 05 §4.5) : la redirection choisie est enregistrée (hors mode lecture) puis suivie. */
function Redirections({ stepId, flowId, readonly, actorId, onNavigate }: {
  stepId: string; flowId: string; readonly: boolean; actorId: string | null; onNavigate: (stepId: string | null) => void;
}) {
  const db = usePowerSync();
  const { data } = useQuery<{ id: string; message: string | null; style: string | null; target_step_id: string | null; target_name: string | null }>(
    `select n.id, n.message, n.style, n.target_step_id, s.name as target_name from step_navigations n
       left join steps s on s.id = n.target_step_id where n.step_id = ? order by n.position`, [stepId]);
  const [chosen, setChosen] = useState<(typeof data)[number] | null>(null);
  const [comment, setComment] = useState("");
  if (!data.length) return null;

  const navigate = async () => {
    if (!chosen) return;
    if (!readonly) {
      await db.execute(
        `insert into step_navigation_events (id, step_navigation_id, step_id, flow_id, action, comment, actor_id, source, occurred_at)
         values (?, ?, ?, ?, 'navigate', ?, ?, 'mobile', ?)`,
        [randomUUID(), chosen.id, stepId, flowId, comment.trim() || null, actorId, new Date().toISOString()]);
    }
    setChosen(null);
    setComment("");
    onNavigate(chosen.target_step_id);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      {data.map((n) => (
        <Pressable key={n.id} accessibilityRole="button" onPress={() => setChosen(n)}
          style={[styles.redirection, { borderLeftColor: STYLE_COLORS[n.style ?? "default"] ?? colors.primary }]}>
          <Icon name="arrow-right-bold-circle-outline" color={STYLE_COLORS[n.style ?? "default"] ?? colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeText}>{n.message ?? ""}</Text>
            {!!n.target_name && <Text style={styles.noticeDetail}>→ {n.target_name}</Text>}
          </View>
        </Pressable>
      ))}
      <Modal visible={!!chosen} transparent animationType="fade" onRequestClose={() => setChosen(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t("execution.redirectionTitle")}</Text>
            <Text style={styles.modalText}>{chosen?.message}</Text>
            {!readonly && (
              <TextInput value={comment} onChangeText={setComment} placeholder={t("execution.redirectionPlaceholder")}
                placeholderTextColor={colors.textSecondary} multiline style={styles.comment} accessibilityLabel={t("common.comment")} />
            )}
            <Button label={t("execution.navigate")} onPress={navigate} />
            <Button label={t("common.cancel")} variant="secondary" onPress={() => setChosen(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: { backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  bannerType: { fontSize: font.small, color: colors.textSecondary },
  bannerName: { fontSize: font.body + 1, fontWeight: "700", color: colors.text },
  ribbonBar: { flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  ribbon: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  phaseTab: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  phaseTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  phaseTabLabel: { fontSize: font.small, fontWeight: "700", color: colors.text },
  struck: { opacity: 0.6 },
  struckText: { textDecorationLine: "line-through", color: colors.textSecondary },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  phaseTitle: { fontSize: font.small, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase" },
  steps: { gap: spacing.sm },
  stepTab: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  stepTabActive: { borderColor: colors.primary, borderWidth: 2 },
  stepTabLabel: { fontSize: font.small, fontWeight: "600", color: colors.text },
  stepHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepTitle: { flex: 1, fontSize: font.title - 2, fontWeight: "700", color: colors.text },
  notice: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  noticeText: { fontSize: font.body, color: colors.text },
  noticeDetail: { fontSize: font.small, color: colors.textSecondary },
  redirection: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderLeftWidth: 4 },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  prev: { padding: spacing.xs },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: font.title, fontWeight: "700", color: colors.text },
  modalText: { fontSize: font.body, color: colors.text, lineHeight: 22 },
  comment: { minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, fontSize: font.body, color: colors.text, textAlignVertical: "top" },
});
