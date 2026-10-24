// Blocs d'une étape en consultation (spec 05 §4.1, §4.6–4.8). Les actions (signer, répondre, statuer) s'y
// ajoutent avec les écritures correspondantes.
import { expectedNatures, natureCode, type SignatureNature, supervisorName, type SupervisionFlow } from "@imula/flow-core";
import { useQuery } from "@powersync/react";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SignatureTarget } from "@/components/execution/signature-modal";
import { FormLinks } from "@/components/forms/form-links";
import { formatDate, Icon, StatusChip } from "@/components/kit";
import { RichText } from "@/components/rich-text";
import type { ExecBlock } from "@/data/execution-model";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

/** Ordre d'affichage des blocs sur le terrain (gabarit d'origine). */
const ORDER = ["rhp", "emm", "adr", "txt", "pr", "object", "multi_pr", "form", "documents", "dsi"];

/** Actions possibles sur l'étape affichée (signer…) ; absent = consultation seule. */
export type StepActions = { stepId: string; flowId: string; onSign: (target: SignatureTarget) => void };

export function StepBlocks({ stepId, blocks, flow, flowType, actions }: {
  stepId: string; blocks: ExecBlock[]; flow: SupervisionFlow; flowType: string; actions?: StepActions;
}) {
  const visible = blocks
    .filter((b) => b.step_id === stepId && !(b.type === "txt" && b.txt_visibility === "document"))
    // Bloc Contrôles masqué pour un flow générique.
    .filter((b) => !(b.type === "dsi" && flowType === "generic"))
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  const { data: docs } = useQuery<{ n: number }>("select count(*) as n from block_documents d join blocks b on b.id = d.block_id where b.step_id = ?", [stepId]);
  if (!visible.length && !docs[0]?.n) return <Text style={styles.muted}>{t("execution.emptyFlow")}</Text>;
  return (
    <View style={{ gap: spacing.md }}>
      {visible.map((b) => <BlockView key={b.id} block={b} flow={flow} actions={actions} />)}
    </View>
  );
}

function BlockShell({ title, icon, block, children }: { title: string; icon: Parameters<typeof Icon>[0]["name"]; block: ExecBlock; children: ReactNode }) {
  return (
    <View style={styles.block}>
      <View style={styles.blockHeader}>
        <Icon name={icon} color={colors.primary} size={20} />
        <Text style={styles.blockTitle}>{title}</Text>
      </View>
      {block.state && block.state !== "validated" && <Text style={styles.warning}>{t("execution.blockNotValidated")}</Text>}
      {children}
    </View>
  );
}

function BlockView({ block, flow, actions }: { block: ExecBlock; flow: SupervisionFlow; actions?: StepActions }) {
  switch (block.type) {
    case "txt":
      return <BlockShell title={t("execution.textBlock")} icon="text" block={block}><RichText json={block.content_json} html={block.content_html} /></BlockShell>;
    case "pr":
      return <BlockShell title={t("execution.instructionsBlock")} icon="clipboard-text-outline" block={block}><RichText json={block.content_json} html={block.content_html} /></BlockShell>;
    case "rhp":
      return <BlockShell title={t("execution.teamBlock")} icon="account-group-outline" block={block}><TeamItems blockId={block.id} /></BlockShell>;
    case "emm":
      return <BlockShell title={t("execution.emmBlock")} icon="tools" block={block}><EmmItems blockId={block.id} /></BlockShell>;
    case "adr":
      return <BlockShell title={t("execution.risksBlock")} icon="alert-outline" block={block}><RiskItems blockId={block.id} /></BlockShell>;
    case "object":
      return <BlockShell title={t("execution.objectBlock")} icon="cube-outline" block={block}><ObjectNotice /></BlockShell>;
    case "multi_pr":
      return <BlockShell title={t("execution.multiInstructionsBlock")} icon="format-list-checks" block={block}><MultiPrItems block={block} /></BlockShell>;
    case "form":
      return <BlockShell title={t("execution.formsBlock")} icon="file-document-edit-outline" block={block}><FormLinks blockId={block.id} editable={!!actions} /></BlockShell>;
    case "dsi":
      return <BlockShell title={t("execution.controlBlock")} icon="draw-pen" block={block}><Controls blockId={block.id} flow={flow} actions={actions} /></BlockShell>;
    default:
      return null;
  }
}

function Row({ children, badge }: { children: ReactNode; badge?: string | null }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>{children}</View>
      {!!badge && <Text style={styles.badge}>{badge}</Text>}
    </View>
  );
}

function TeamItems({ blockId }: { blockId: string }) {
  const { data } = useQuery<{ id: string; label: string | null; count: number | null; observation: string | null }>(
    `select i.id, f.long_name as label, i.count, i.observation from block_rhp_items i
       left join label_families f on f.id = i.function_family_id where i.block_id = ? and ifnull(i.disabled, 0) = 0 order by i.position`, [blockId]);
  return <>{data.map((i) => (
    <Row key={i.id} badge={i.count != null ? `× ${i.count}` : null}>
      <Text style={styles.text}>{i.label ?? "—"}</Text>
      {!!i.observation && <Text style={styles.muted}>{i.observation}</Text>}
    </Row>
  ))}</>;
}

function EmmItems({ blockId }: { blockId: string }) {
  const { data } = useQuery<{ id: string; name: string; reference: string | null; quantity: number | null; unit: string | null; consumable: number; comment: string | null; display_comment: number }>(
    "select * from block_emm_items where block_id = ? and ifnull(disabled, 0) = 0 order by position", [blockId]);
  return <>{data.map((i) => (
    <Row key={i.id} badge={i.consumable ? t("execution.consumable") : null}>
      <Text style={styles.text}>{i.name}</Text>
      <Text style={styles.muted}>{[i.reference, i.quantity != null ? `${i.quantity} ${i.unit ?? ""}`.trim() : null].filter(Boolean).join(" · ")}</Text>
      {!!i.display_comment && !!i.comment && <Text style={styles.muted}>{i.comment}</Text>}
    </Row>
  ))}</>;
}

function RiskItems({ blockId }: { blockId: string }) {
  const { data } = useQuery<{ id: string; risk_id: string | null; name: string | null; source: string | null; major: number }>(
    `select i.id, r.id as risk_id, r.name, r.source, ifnull(i.major, r.major) as major from block_adr_items i
       left join library_risks r on r.id = i.library_risk_id where i.block_id = ? and ifnull(i.disabled, 0) = 0 order by i.position`, [blockId]);
  const { data: parades } = useQuery<{ risk_id: string; name: string }>(
    `select p.risk_id, p.name from library_risk_parades p
      where p.risk_id in (select library_risk_id from block_adr_items where block_id = ?) order by p.position`, [blockId]);
  return <>{data.map((i) => (
    <Row key={i.id} badge={i.major ? t("execution.majorRisk") : null}>
      <Text style={styles.text}>{i.name ?? "—"}</Text>
      {!!i.source && <Text style={styles.muted}>{i.source}</Text>}
      {parades.filter((p) => p.risk_id === i.risk_id).map((p, k) => <Text key={k} style={styles.muted}>• {p.name}</Text>)}
    </Row>
  ))}</>;
}

function ObjectNotice() {
  const { offline } = useSession();
  return <Text style={styles.muted}>{offline ? t("execution.objectOnlineOnly") : t("execution.objectSoon")}</Text>;
}

function MultiPrItems({ block }: { block: ExecBlock }) {
  const { data } = useQuery<{ id: string; title: string | null; content_html: string | null; content_json: string | null; observation: string | null; status_name: string | null; status_color: string | null; signed: number }>(
    `select i.id, i.title, i.content_html, i.content_json, i.observation, s.name as status_name, s.color as status_color,
            exists (select 1 from block_multi_pr_signatures g where g.item_id = i.id) as signed
       from block_multi_pr_items i left join custom_statuses s on s.id = i.custom_status_id
      where i.block_id = ? and ifnull(i.disabled, 0) = 0 order by i.position`, [block.id]);
  return <>{data.map((i, n) => (
    <View key={i.id} style={styles.subItem}>
      {!block.multi_pr_title_hidden && <Text style={styles.subTitle}>{n + 1}. {i.title ?? ""}</Text>}
      <RichText json={i.content_json} html={i.content_html} />
      <View style={styles.inline}>
        <StatusChip color={i.status_color} label={i.status_name} />
        {!!i.signed && <Icon name="draw-pen" color={colors.success} size={18} />}
      </View>
      {!!i.observation && <Text style={styles.muted}>{i.observation}</Text>}
    </View>
  ))}</>;
}

/** Documents liés à l'étape (tous blocs confondus). */
export function StepDocuments({ stepId }: { stepId: string }) {
  const { data } = useQuery<{ id: string; name: string | null; ref_int: string | null; attachment_name: string | null }>(
    `select d.id, doc.name, doc.ref_int, d.attachment_name from block_documents d join blocks b on b.id = d.block_id
       left join documents doc on doc.id = d.document_id where b.step_id = ? order by d.position`, [stepId]);
  if (!data.length) return null;
  return (
    <View style={styles.block}>
      <View style={styles.blockHeader}>
        <Icon name="paperclip" color={colors.primary} size={20} />
        <Text style={styles.blockTitle}>{t("execution.linkedDoc")}</Text>
      </View>
      {data.map((d) => (
        <Row key={d.id}><Text style={styles.text}>{[d.ref_int, d.name ?? d.attachment_name].filter(Boolean).join(" — ")}</Text></Row>
      ))}
    </View>
  );
}

function natureLabel(n: SignatureNature): string {
  const m = /^(breakpoint|convocation)_(int|ext)_(\d)$/.exec(n);
  if (!m) return t(`execution.natures.${n as "realisation" | "tech_control"}`);
  return t(`execution.natures.${m[1]}_${m[2]}` as "execution.natures.breakpoint_int", { n: m[3] });
}

function Controls({ blockId, flow, actions }: { blockId: string; flow: SupervisionFlow; actions?: StepActions }) {
  const { data: configs } = useQuery<Parameters<typeof expectedNatures>[0] & { signatories_status: string }>(
    "select * from block_dsi_configs where block_id = ?", [blockId]);
  const { data: signatures } = useQuery<{ id: string; nature: string; state: string; first_name: string | null; last_name: string | null; signed_at: string | null; proxied: number; proxy_principal_name: string | null; proxy_date: string | null }>(
    `select s.id, s.nature, s.state, coalesce(s.first_name, c.first_name) as first_name, coalesce(s.last_name, c.last_name) as last_name,
            s.signed_at, s.proxied, s.proxy_principal_name, s.proxy_date
       from signatures s left join collaborators c on c.id = s.signatory_id
      where s.block_id = ? and ifnull(s.disabled, 0) = 0 order by s.created_at`, [blockId]);
  const config = configs[0];
  // Natures attendues, plus celles déjà signées hors attente (ex. PA/PC en mode simplifié, spec 05 §4.8).
  const expected = expectedNatures(config, flow);
  const natures = [...expected, ...signatures.map((s) => s.nature as SignatureNature).filter((n) => !expected.includes(n))]
    .filter((n, i, all) => all.indexOf(n) === i);
  const mandatory = config?.signatories_status === "required";
  return <>{natures.map((n) => {
    const s = [...signatures].reverse().find((x) => x.nature === n);
    const name = s ? `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() : "";
    const status = !s ? (mandatory ? t("execution.signatureMandatory") : t("execution.signatureToDo"))
      : s.state === "not_possible" ? t("execution.signatureNotApplicable")
      : s.state === "waiting" ? t("execution.signatureWaiting")
      : s.proxied ? t("execution.signedFor", { name, principal: s.proxy_principal_name ?? "" })
      : t("execution.signedBy", { name, date: formatDate(s.signed_at, true) ?? "" });
    const done = s && (s.state === "signed" || s.state === "not_possible");
    const supervisor = supervisorName(n, flow);
    const action = !actions ? null
      : !s ? { label: t("signature.sign"), target: { kind: "create", blockId, stepId: actions.stepId, flowId: actions.flowId, nature: n, title: natureLabel(n), supervisor } as SignatureTarget }
      : s.state === "waiting" ? { label: t("signature.resume"), target: { kind: "complete", signatureId: s.id, title: natureLabel(n), proxyDate: s.proxy_date } as SignatureTarget }
      : null;
    return (
      <Row key={n} badge={natureCode(n)}>
        <Text style={styles.text}>{natureLabel(n)}{supervisor ? ` — ${supervisor}` : ""}</Text>
        <Text style={[styles.muted, done && { color: colors.success }, !s && mandatory && { color: colors.danger }]}>{status}</Text>
        {action && (
          <Pressable accessibilityRole="button" onPress={() => actions!.onSign(action.target)} style={styles.action}>
            <Icon name="draw-pen" size={18} color={colors.onPrimary} />
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        )}
      </Row>
    );
  })}</>;
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  blockHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  blockTitle: { fontSize: font.body, fontWeight: "700", color: colors.primary, textTransform: "uppercase" },
  text: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.small, color: colors.textSecondary },
  warning: { fontSize: font.small, color: colors.warning },
  row: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  badge: { fontSize: 11, fontWeight: "700", color: colors.primary, alignSelf: "flex-start" },
  subItem: { gap: spacing.xs, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  subTitle: { fontSize: font.body, fontWeight: "600", color: colors.text },
  inline: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.xs },
  actionLabel: { color: colors.onPrimary, fontWeight: "600", fontSize: font.small },
});
