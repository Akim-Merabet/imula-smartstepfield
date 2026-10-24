import { usePowerSync, useQuery, useStatus } from "@powersync/react";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useDeferredValue, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import {
  Card, Checkbox, Empty, formatDate, Icon, IconButton, SearchField, Segmented, StatusChip, useSnackbar,
} from "@/components/kit";
import { Button } from "@/components/ui";
import { type FlowItem, useProjectFlows } from "@/data/lists";
import { t } from "@/i18n/fr";
import { selectForOffline } from "@/powersync/offline";
import { useSession } from "@/session/session-context";
import { colors, font, spacing } from "@/theme";

type Segment = "mine" | "all";

/** Liste des flows d'une entité (spec 05 §2.3) : sélection, téléchargement pour le hors ligne, envoi. */
export default function ProjectFlowsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const db = usePowerSync();
  const status = useStatus();
  const { offline } = useSession();
  const snackbar = useSnackbar();
  const [segment, setSegment] = useState<Segment>("mine");
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const { data: flows, isLoading } = useProjectFlows(projectId, deferred, segment === "mine");
  const { data: project } = useQuery<{ designation: string }>("select designation from projects where id = ?", [projectId]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState(false);

  // Seuls les flows dont le statut est téléchargeable peuvent être sélectionnés (R §2.5).
  const selectable = useMemo(() => flows.filter((f) => f.downloadable), [flows]);
  const allSelected = selectable.length > 0 && selectable.every((f) => selected.has(f.id));
  const someSelected = selectable.some((f) => selected.has(f.id));

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const download = async () => {
    if (offline) return snackbar(t("flows.downloadOffline"));
    const chosen = flows.filter((f) => selected.has(f.id) && f.downloadable);
    await selectForOffline(db, chosen.map((f) => ({ id: f.id, project_id: f.project_id })));
    setSelected(new Set());
    snackbar(t("flows.downloadStarted", { count: chosen.length }));
  };

  // « Envoi » : la file part automatiquement en ligne ; on attend qu'elle soit vide pour confirmer.
  const push = async () => {
    if (offline) return snackbar(t("flows.pushOffline"));
    setPushing(true);
    try {
      for (let i = 0; i < 60; i++) {
        if ((await db.getUploadQueueStats()).count === 0) return snackbar(t("flows.pushSuccessfully"), "success");
        await new Promise((r) => setTimeout(r, 1000));
      }
      snackbar(t("common.errorOccurred"), "danger");
    } finally {
      setPushing(false);
    }
  };

  const open = (flow: FlowItem, readonly: boolean) => {
    if (!flow.downloadable) return snackbar(t("flows.unavailable"));
    router.push({ pathname: "/execution/[flowId]", params: { flowId: flow.id, ...(readonly ? { readonly: "1" } : {}) } });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: project[0]?.designation ?? "",
        headerRight: () => (
          <IconButton name="information-outline" label={t("projects.info.title")} color={colors.onPrimary}
            onPress={() => router.push({ pathname: "/projects/[projectId]/info", params: { projectId } })} />
        ),
      }} />
      <Text style={styles.heading}>{t("flows.listProjectFlow")}</Text>
      <Segmented<Segment> value={segment} onChange={(v) => { setSegment(v); setSelected(new Set()); }} options={[
        { value: "mine", label: t("flows.myFlows") },
        { value: "all", label: t("flows.allFlows") },
      ]} />
      <SearchField value={search} onChange={setSearch} />
      <View style={styles.toolbar}>
        <Checkbox checked={allSelected} indeterminate={!allSelected && someSelected}
          label={allSelected ? t("flows.deselectAll") : t("flows.selectAll")}
          onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((f) => f.id)))} />
        <View style={styles.actions}>
          <Button label={status.dataFlowStatus.downloading ? t("flows.downloading") : t("flows.download")}
            onPress={download} disabled={!someSelected || offline} />
          <Button label={t("flows.upload")} variant="secondary" onPress={push} loading={pushing} disabled={offline} />
        </View>
      </View>
      <FlatList
        data={flows}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={isLoading ? undefined : <Empty>{t("common.noElementFound")}</Empty>}
        renderItem={({ item }) => (
          <FlowCard flow={item} selected={selected.has(item.id)} onToggle={() => toggle(item.id)}
            onOpen={(readonly) => open(item, readonly)}
            onDetails={() => router.push({ pathname: "/flows/[flowId]", params: { flowId: item.id } })} />
        )}
      />
    </View>
  );
}

function FlowCard({ flow, selected, onToggle, onOpen, onDetails }: {
  flow: FlowItem; selected: boolean; onToggle: () => void; onOpen: (readonly: boolean) => void; onDetails: () => void;
}) {
  const location = [flow.location_site, flow.location_area, flow.location_local].filter(Boolean).join(" / ");
  const tablets = [flow.tablet_1, flow.tablet_2, flow.tablet_3];
  return (
    <Card muted={!flow.downloadable}>
      <View style={styles.cardHeader}>
        {flow.downloadable ? <Checkbox checked={selected} onChange={onToggle} label={undefined} /> : <Icon name="lock-outline" color={colors.textSecondary} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.type}>{t(`flowTypes.${flow.flow_type}` as never) ?? flow.flow_type}</Text>
          <Text style={styles.name}>{flow.name}</Text>
        </View>
        {!!flow.selected_offline && <Icon name="cellphone-arrow-down" color={colors.success} size={20} />}
      </View>
      <View style={styles.meta}>
        <StatusChip color={flow.status_color} label={flow.status_name} />
        {!!flow.family_name && <StatusChip color={flow.family_color} label={flow.family_name} />}
      </View>
      <Text style={styles.line}>{t("flows.reference")} : {flow.ref_int || flow.ref_ext || "—"}</Text>
      {!!flow.client_name && <Text style={styles.line}>{t("flows.clientName")} : {flow.client_name}</Text>}
      {!!location && <Text style={styles.line}>{t("flows.location")} : {location}</Text>}
      <Text style={styles.line}>
        {t("flows.plannedStart")} : {formatDate(flow.start_date) ?? "—"} · {t("flows.plannedEnd")} : {formatDate(flow.finish_date) ?? "—"}
      </Text>
      <Text style={styles.line}>
        {tablets.map((name, i) => `${t("flows.tablet", { n: i + 1 })} : ${name ?? t("flows.noTablet")}`).join(" · ")}
      </Text>
      <View style={styles.cardActions}>
        <Button label={t("flows.open")} onPress={() => onOpen(false)} disabled={!flow.downloadable} />
        <Button label={t("common.readMode")} variant="secondary" onPress={() => onOpen(true)} disabled={!flow.downloadable} />
        <Button label={t("flows.details")} variant="secondary" onPress={onDetails} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md, gap: spacing.sm },
  heading: { fontSize: font.small, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.5 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, flexWrap: "wrap" },
  actions: { flexDirection: "row", gap: spacing.sm },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  type: { fontSize: font.small, color: colors.textSecondary },
  name: { fontSize: font.body, fontWeight: "700", color: colors.text },
  meta: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  line: { fontSize: font.small, color: colors.textSecondary },
  cardActions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginTop: spacing.xs },
});
