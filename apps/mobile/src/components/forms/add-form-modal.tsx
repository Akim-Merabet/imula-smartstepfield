// « Ajouter un formulaire » / « Ouvrir un formulaire » d'un aléa (spec 05 §4.7.8) : formulaires génériques actifs de
// l'entité ; le choix lie le formulaire à l'étape puis ouvre une nouvelle réponse (référence générée).
import { usePowerSync, useQuery } from "@powersync/react";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Empty, useSnackbar } from "@/components/kit";
import { Button } from "@/components/ui";
import { createResponse, type Db, defaultReferenceForLink, versionFor } from "@/data/form-response";
import { addFormLink } from "@/data/flow-writes";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

type GenericForm = { id: string; name: string; reference: string | null; index_label: string | null; family: string | null };

export function AddFormModal({ visible, stepId, flowId, onClose }: { visible: boolean; stepId: string; flowId: string; onClose: () => void }) {
  const db = usePowerSync() as unknown as Db;
  const { profile } = useSession();
  const snackbar = useSnackbar();
  const { data: forms } = useQuery<GenericForm>(
    `select f.id, f.name, f.reference, f.index_label, fa.short_name as family from forms f
       left join label_families fa on fa.id = f.family_id
      where f.project_id = (select project_id from flows where id = ?) and f.nature = 'generic'
        and ifnull(f.enabled, 1) = 1 and ifnull(f.archived, 0) = 0 and f.deleted_at is null
      order by f.name collate nocase`, [flowId]);

  const choose = async (form: GenericForm) => {
    if (!(await versionFor(db, form.id, null))) return snackbar(t("forms.noVersion"), "danger");
    const linkId = await addFormLink(db, { stepId, flowId, formId: form.id }, randomUUID);
    const defaults = await defaultReferenceForLink(db, linkId);
    if (!defaults) return snackbar(t("common.errorOccurred"), "danger");
    const id = await createResponse(db, {
      id: randomUUID(), formId: form.id, link: defaults.link, projectId: defaults.link.project_id, reference: defaults.reference,
      me: profile?.principalId ?? "",
    });
    onClose();
    if (!id) return snackbar(t("forms.noVersion"), "danger");
    router.push({ pathname: "/responses/[responseId]", params: { responseId: id } });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <Text style={styles.title}>{t("execution.addForm")}</Text>
          <Text style={styles.muted}>{t("execution.worksiteFeedback")}</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {!forms.length && <Empty>{t("execution.noGenericForm")}</Empty>}
            {forms.map((f) => (
              <Pressable key={f.id} accessibilityRole="button" onPress={() => void choose(f)} style={styles.row}>
                <Text style={styles.name}>{f.name}</Text>
                <Text style={styles.muted}>{[f.family, f.reference, f.index_label].filter(Boolean).join(" · ")}</Text>
              </Pressable>
            ))}
          </ScrollView>
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
  row: { paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 2 },
  name: { fontSize: font.body, fontWeight: "600", color: colors.text },
  muted: { fontSize: font.small, color: colors.textSecondary },
});
