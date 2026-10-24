import { usePowerSync, useQuery, useStatus } from "@powersync/react";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FlowStatusModal } from "@/components/flow-status-modal";
import { Card, Empty, Field, formatDate, SectionTitle, StatusChip, useSnackbar } from "@/components/kit";
import { Button } from "@/components/ui";
import { named } from "@/data/sql";
import { t } from "@/i18n/fr";
import { pendingWritesForFlow, selectForOffline, unselectForOffline } from "@/powersync/offline";
import { useSession } from "@/session/session-context";
import { colors, font, spacing } from "@/theme";

type FlowHeader = {
  id: string; project_id: string; flow_type: string; name: string; ref_int: string | null; ref_ext: string | null;
  start_date: string | null; finish_date: string | null; estimated_start_date: string | null; estimated_end_date: string | null;
  status_id: string | null; status_name: string | null; status_color: string | null; downloadable: number; selected_offline: number; downloaded: number;
};

/** Détail d'un flow (spec 05 §2.4) : synchronisation, éléments liés, historique des statuts, données locales. */
export default function FlowDetailScreen() {
  const { flowId } = useLocalSearchParams<{ flowId: string }>();
  const db = usePowerSync();
  const status = useStatus();
  const { offline } = useSession();
  const snackbar = useSnackbar();
  const { data } = useQuery<FlowHeader>(
    `select fl.*, coalesce(f.custom_status_id, fl.custom_status_id) as status_id, s.name as status_name, s.color as status_color,
            ifnull(s.downloadable, 0) as downloadable,
            exists (select 1 from offline_selection o where o.flow_id = fl.id) as selected_offline,
            f.id is not null as downloaded
       from flow_summaries fl left join flows f on f.id = fl.id
       left join custom_statuses s on s.id = coalesce(f.custom_status_id, fl.custom_status_id) where fl.id = ?`, [flowId]);
  const flow = data[0];
  const [pending, setPending] = useState(0);
  const [changingStatus, setChangingStatus] = useState(false);
  useEffect(() => {
    pendingWritesForFlow(db, flowId).then(setPending).catch(() => {});
  }, [db, flowId, status]);
  const lastSyncedAt = status.forStream({ name: "flow_offline", parameters: { flow_id: flowId } })?.subscription.lastSyncedAt ?? null;

  if (!flow) return null;

  const open = (readonly: boolean) => {
    if (!flow.downloadable) return snackbar(t("flows.unavailable"));
    if (!flow.downloaded) return snackbar(t("flows.notDownloaded"));
    router.push({ pathname: "/execution/[flowId]", params: { flowId, ...(readonly ? { readonly: "1" } : {}) } });
  };

  const download = async () => {
    if (offline) return snackbar(t("flows.downloadOffline"));
    await selectForOffline(db, [{ id: flow.id, project_id: flow.project_id }]);
    snackbar(t("flows.downloadStarted", { count: 1 }));
  };

  const remove = async () => {
    const n = await pendingWritesForFlow(db, flowId);
    if (n > 0) return snackbar(t("flowDetails.deleteBlocked", { count: n }), "danger");
    await unselectForOffline(db, [flowId]);
    snackbar(t("flowDetails.deleted"));
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: flow.name }} />
      <Card>
        <Text style={styles.type}>{t("flowDetails.flowType")} : {t(`flowTypes.${flow.flow_type}` as never)}</Text>
        <Text style={styles.name}>{flow.name}</Text>
        <Text style={styles.meta}>{flow.ref_int || flow.ref_ext || ""}</Text>
        <View style={styles.row}>
          <Text style={styles.meta}>{t("flowDetails.flowStatus")} :</Text>
          <StatusChip color={flow.status_color} label={flow.status_name} />
          <Pressable accessibilityRole="button" onPress={() => setChangingStatus(true)} hitSlop={8}>
            <Text style={styles.link}>{t("flowDetails.changeStatus")}</Text>
          </Pressable>
        </View>
        <Field label={t("flowDetails.dateEstimated")}
          value={`${t("flowDetails.startDate")} ${formatDate(flow.estimated_start_date) ?? "—"} · ${t("flowDetails.endDate")} ${formatDate(flow.estimated_end_date) ?? "—"}`} />
        <Field label={t("flowDetails.plannedDate")}
          value={`${t("flowDetails.startDate")} ${formatDate(flow.start_date) ?? "—"} · ${t("flowDetails.endDate")} ${formatDate(flow.finish_date) ?? "—"}`} />
        <View style={styles.actions}>
          <Button label={t("flowDetails.fillIn")} onPress={() => open(false)} disabled={!flow.downloadable} />
          <Button label={t("flowDetails.readMode")} variant="secondary" onPress={() => open(true)} disabled={!flow.downloadable} />
        </View>
      </Card>

      <Card>
        <Text style={styles.meta}>
          {flow.selected_offline && lastSyncedAt
            ? t("flowDetails.lastDownloaded", { date: formatDate(lastSyncedAt.toISOString(), true)! })
            : t("flowDetails.neverDownloaded")}
        </Text>
        {pending > 0 && <Text style={[styles.meta, { color: colors.warning }]}>{t("flowDetails.pendingChanges", { count: pending })}</Text>}
        <View style={styles.actions}>
          {flow.selected_offline ? (
            <Button label={t("flowDetails.deleteTabletFlow")} variant="secondary" onPress={remove} />
          ) : (
            <Button label={t("flowDetails.downloadFlow")} onPress={download} disabled={!flow.downloadable || offline} />
          )}
        </View>
      </Card>

      <FlowStatusModal flowId={flowId} currentId={flow.status_id} visible={changingStatus} onClose={() => setChangingStatus(false)} />
      <SectionTitle>{t("flowDetails.relatedItems")}</SectionTitle>
      {flow.downloaded ? <RelatedItems flowId={flowId} /> : <Empty>{t("flowDetails.downloadToSee")}</Empty>}
    </ScrollView>
  );
}

function RelatedItems({ flowId }: { flowId: string }) {
  const { data: documents } = useQuery<{ id: string; name: string; ref_int: string | null }>(
    `select distinct d.id, d.name, d.ref_int from block_documents bd join documents d on d.id = bd.document_id
      where bd.flow_id = ? order by d.name`, [flowId]);
  const { data: forms } = useQuery<{ id: string; name: string; responses: number }>(
    `select l.id, f.name, (select count(*) from form_responses r where r.block_link_id = l.id and r.deleted_at is null) as responses
       from form_block_links l join forms f on f.id = l.form_id where l.flow_id = ? order by f.name`, [flowId]);
  const { data: people } = useQuery<{ id: string; name: string; role: string }>(...named(
    `select c.id, c.first_name || ' ' || c.last_name as name, 'assignee' as role
       from flow_assignees a join collaborators c on c.id = a.collaborator_id where a.flow_id = :flow
     union
     select c.id, c.first_name || ' ' || c.last_name, 'collaborator'
       from flow_collaborators fc join collaborators c on c.id = fc.collaborator_id where fc.flow_id = :flow
     order by 2`, { flow: flowId }));
  const { data: emm } = useQuery<{ id: string; name: string; consumable: number; quantity: number | null; unit: string | null }>(
    "select id, name, consumable, quantity, unit from block_emm_items where flow_id = ? and ifnull(disabled, 0) = 0 order by name", [flowId]);
  const { data: risks } = useQuery<{ id: string; name: string | null; major: number }>(
    `select i.id, r.name, ifnull(i.major, r.major) as major from block_adr_items i left join library_risks r on r.id = i.library_risk_id
      where i.flow_id = ? and ifnull(i.disabled, 0) = 0 order by r.name`, [flowId]);
  const { data: history } = useQuery<{ id: string; occurred_at: string; actor: string | null; from_name: string | null; to_name: string | null; comment: string | null }>(
    `select h.id, h.occurred_at, c.first_name || ' ' || c.last_name as actor, sf.name as from_name, st.name as to_name, h.comment
       from flow_status_history h left join collaborators c on c.id = h.actor_id
       left join custom_statuses sf on sf.id = h.from_status_id left join custom_statuses st on st.id = h.to_status_id
      where h.flow_id = ? order by h.occurred_at desc`, [flowId]);

  const section = (title: string, rows: { key: string; text: string; badge?: string | null }[]) => (
    <Card>
      <Text style={styles.cardTitle}>{title} ({rows.length})</Text>
      {rows.length ? rows.map((r) => (
        <View key={r.key} style={styles.item}>
          <Text style={styles.itemText}>{r.text}</Text>
          {!!r.badge && <Text style={styles.badge}>{r.badge}</Text>}
        </View>
      )) : <Text style={styles.meta}>{t("common.noElementFound")}</Text>}
    </Card>
  );

  return (
    <>
      {section(t("flowDetails.documents"), documents.map((d) => ({ key: d.id, text: [d.ref_int, d.name].filter(Boolean).join(" — ") })))}
      {section(t("flowDetails.forms"), forms.map((f) => ({ key: f.id, text: f.name, badge: `${f.responses}` })))}
      {section(t("flowDetails.assignments"), people.map((p) => ({ key: `${p.role}:${p.id}`, text: p.name })))}
      {section(t("flowDetails.emm"), emm.map((e) => ({
        key: e.id, text: [e.name, e.quantity != null ? `${e.quantity} ${e.unit ?? ""}`.trim() : null].filter(Boolean).join(" · "),
        badge: e.consumable ? t("flowDetails.consumable") : null,
      })))}
      {section(t("flowDetails.risks"), risks.map((r) => ({ key: r.id, text: r.name ?? "—", badge: r.major ? t("flowDetails.majorRisk") : null })))}
      <Card>
        <Text style={styles.cardTitle}>{t("flowDetails.statusHistory")}</Text>
        {history.length ? history.map((h) => (
          <View key={h.id} style={styles.item}>
            <Text style={styles.itemText}>
              {t("flowDetails.changedStatus", { actor: h.actor ?? "—" })} {t("common.from")} {h.from_name ?? "—"} {t("common.to")} {h.to_name ?? "—"}
            </Text>
            <Text style={styles.meta}>{formatDate(h.occurred_at, true)}{h.comment ? ` · ${h.comment}` : ""}</Text>
          </View>
        )) : <Text style={styles.meta}>{t("common.noElementFound")}</Text>}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  type: { fontSize: font.small, color: colors.textSecondary },
  name: { fontSize: font.title, fontWeight: "700", color: colors.text },
  meta: { fontSize: font.small, color: colors.textSecondary },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  link: { fontSize: font.small, color: colors.primary, fontWeight: "600" },
  actions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginTop: spacing.sm },
  cardTitle: { fontSize: font.body, fontWeight: "700", color: colors.text },
  item: { paddingVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 2 },
  itemText: { fontSize: font.body, color: colors.text },
  badge: { fontSize: 11, fontWeight: "700", color: colors.warning },
});
