import { usePowerSync } from "@powersync/react";
import { router } from "expo-router";
import { useDeferredValue, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, View } from "react-native";

import { Card, Empty, IconButton, SearchField, Segmented, StatusChip, useSnackbar } from "@/components/kit";
import { QrScanner } from "@/components/qr-scanner";
import { Button } from "@/components/ui";
import { useProjects } from "@/data/lists";
import { listReferentialEntities, type ReferentialEntity } from "@/data/referentials";
import { t } from "@/i18n/fr";
import { logEvent } from "@/lib/app-log";
import { parseFlowQr } from "@/lib/flow-qr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

type Segment = "projects" | "referentials";

/** Liste des entités (spec 05 §2.2) : lue dans la base locale, en ligne comme hors ligne. */
export default function ProjectsScreen() {
  const db = usePowerSync();
  const { offline } = useSession();
  const snackbar = useSnackbar();
  const [chosenSegment, setSegment] = useState<Segment>("projects");
  // Hors ligne, les référentiels et modèles ne sont pas consultables : retour sur « Projets ».
  const segment: Segment = offline ? "projects" : chosenSegment;
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const { data: projects, isLoading } = useProjects(deferred);
  const [scanning, setScanning] = useState(false);
  const [qrError, setQrError] = useState(false);

  const changeSegment = (value: Segment) => {
    if (value === "referentials" && offline) return snackbar(t("layout.referentialOnlineOnly"));
    setSegment(value);
  };

  // QR imprimable d'un flow (WebApp) : ouvre le flow s'il est accessible sur l'appareil, en ligne comme hors ligne.
  const onFlowQr = async (raw: string) => {
    setScanning(false);
    const qr = parseFlowQr(raw);
    const flow = qr && await db.getOptional<{ id: string; downloadable: number }>(
      `select fl.id, ifnull(s.downloadable, 0) as downloadable from flow_summaries fl
         left join custom_statuses s on s.id = fl.custom_status_id where fl.id = ?`, [qr.flowId]);
    const local = flow && await db.getOptional("select 1 from flows where id = ?", [qr!.flowId]);
    if (!flow || !flow.downloadable || !local) {
      logEvent("SCAN_QRCODE_FLOW_FAIL", { flowId: qr?.flowId ?? null });
      return setQrError(true);
    }
    logEvent("SCAN_QRCODE_FLOW_SUCCESS", { flowId: flow.id });
    router.push({ pathname: "/execution/[flowId]", params: { flowId: flow.id } });
  };

  return (
    <View style={styles.container}>
      <Segmented<Segment> value={segment} onChange={changeSegment} options={[
        { value: "projects", label: t("layout.projects") },
        { value: "referentials", label: t("layout.referentialAndModels"), disabled: offline },
      ]} />
      {segment === "referentials" ? (
        <ReferentialList />
      ) : (
        <>
          <SearchField value={search} onChange={setSearch}
            right={<IconButton name="qrcode-scan" label={t("projects.scanFlow")} onPress={() => setScanning(true)} />} />
          <FlatList
            data={projects}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={isLoading ? undefined : <Empty>{t("projects.noProject")}</Empty>}
            renderItem={({ item }) => (
              <Card onPress={() => router.push({ pathname: "/projects/[projectId]/flows", params: { projectId: item.id } })}>
                <View style={styles.row}>
                  {!!item.family_color && <View style={[styles.family, { backgroundColor: item.family_color }]} />}
                  <Text style={styles.title} numberOfLines={2}>{item.designation}</Text>
                </View>
                {!!item.client_name && <Text style={styles.meta}>{t("projects.client")} : {item.client_name}</Text>}
                <View style={styles.row}>
                  <StatusChip color={item.status_color} label={item.status_name} />
                  <Text style={styles.meta}>
                    {[item.project_index, t("projects.flowsCount", { count: item.flow_count }), item.downloaded ? t("projects.downloaded") : null]
                      .filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </Card>
            )}
          />
        </>
      )}

      <QrScanner visible={scanning} title={t("projects.scanFlow")} onScanned={onFlowQr} onClose={() => setScanning(false)} />
      <Modal visible={qrError} transparent animationType="fade" onRequestClose={() => setQrError(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t("projects.flowQrTitle")}</Text>
            <Text style={styles.modalText}>{t("projects.flowQrMessage")}</Text>
            <Button label={t("common.ok")} onPress={() => setQrError(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Segment « Référentiels et Modèles » : lu en ligne ; les flows s'ouvrent en mode lecture. */
function ReferentialList() {
  const [items, setItems] = useState<ReferentialEntity[] | null | undefined>(undefined);
  useEffect(() => {
    listReferentialEntities().then(setItems);
  }, []);
  if (items === undefined) return <ActivityIndicator color={colors.primary} />;
  if (items === null) return <Empty>{t("layout.referentialLoadError")}</Empty>;
  return (
    <FlatList
      data={items}
      keyExtractor={(p) => p.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Empty>{t("layout.noReferential")}</Empty>}
      renderItem={({ item }) => (
        <Card onPress={() => router.push({ pathname: "/referentials/[projectId]", params: { projectId: item.id, name: item.designation } })}>
          <Text style={styles.meta}>{item.type === "template" ? t("layout.template") : t("layout.referential")}</Text>
          <Text style={styles.title}>{item.designation}</Text>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md, gap: spacing.md },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  family: { width: 6, alignSelf: "stretch", borderRadius: 3 },
  title: { flex: 1, fontSize: font.body, fontWeight: "700", color: colors.text },
  meta: { fontSize: font.small, color: colors.textSecondary },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: font.title, fontWeight: "700", color: colors.text },
  modalText: { fontSize: font.body, color: colors.text, lineHeight: 22 },
});
