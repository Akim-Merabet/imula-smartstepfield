// Bloc Formulaires d'une étape (spec 05 §4.7.1, §4.7.2, §4.7.4) : réponses du lien et actions selon la réponse unique.
import { usePowerSync, useQuery } from "@powersync/react";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useSnackbar } from "@/components/kit";
import { Banner, Button, TextField } from "@/components/ui";
import { createResponse, type Db, defaultReferenceForLink, type LinkInfo, reopenResponse, versionFor } from "@/data/form-response";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

type LinkRow = LinkInfo & { name: string; reference: string | null; index_label: string | null; mandatory: number; project_id: string };
type ResponseItem = { id: string; reference: string; state: "in_progress" | "done"; created_at: string };

export function FormLinks({ blockId, editable }: { blockId: string; editable: boolean }) {
  const { data } = useQuery<LinkRow>(
    `select l.*, f.name, f.reference, f.index_label, f.project_id from form_block_links l join forms f on f.id = l.form_id
      where l.block_id = ? order by l.position`, [blockId]);
  return <>{data.map((l) => <FormLink key={l.id} link={l} editable={editable} />)}</>;
}

function FormLink({ link, editable }: { link: LinkRow; editable: boolean }) {
  const db = usePowerSync() as unknown as Db;
  const { profile } = useSession();
  const snackbar = useSnackbar();
  const { data: responses } = useQuery<ResponseItem>(
    "select id, reference, state, created_at from form_responses where block_link_id = ? and deleted_at is null order by created_at desc", [link.id]);
  const { data: org } = useQuery<{ block: number | null }>("select block_form_response_edition as block from organizations limit 1");
  const [creating, setCreating] = useState<string | null>(null);
  const [reopen, setReopen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Réponse unique / modes (spec 05 §4.7.2).
  const exists = responses.length > 0;
  const canCreate = editable && !!link.enabled && !(exists && (!!link.unique_response || link.unique_mode === "resume_response"));
  const canResume = editable && link.unique_mode !== "new_response";
  const canEditDone = editable && !org[0]?.block;

  const open = (id: string, readonly = false) =>
    router.push({ pathname: "/responses/[responseId]", params: { responseId: id, ...(readonly ? { readonly: "1" } : {}) } });

  const startCreate = async () => {
    setError(null);
    if (!(await versionFor(db, link.form_id, link))) return snackbar(t("forms.noVersion"), "danger");
    const defaults = await defaultReferenceForLink(db, link.id);
    setCreating(defaults?.reference ?? "");
  };

  const create = async () => {
    const reference = (creating ?? "").trim();
    if (reference.length < 3) return setError(t("forms.referenceTooShort"));
    const id = await createResponse(db, { id: randomUUID(), formId: link.form_id, link, projectId: link.project_id, reference, me: profile?.principalId ?? "" });
    setCreating(null);
    if (!id) return snackbar(t("forms.noVersion"), "danger");
    open(id);
  };

  const confirmReopen = async () => {
    const id = reopen!;
    setReopen(null);
    await reopenResponse(db, id);
    open(id);
  };

  return (
    <View style={styles.link}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{link.name}</Text>
          <Text style={styles.muted}>{[link.reference, link.index_label].filter(Boolean).join(" · ")}</Text>
        </View>
        {!!link.mandatory && <Text style={styles.required}>{t("forms.required")}</Text>}
      </View>
      {responses.map((r) => (
        <View key={r.id} style={styles.response}>
          <View style={{ flex: 1 }}>
            <Text style={styles.text}>{r.reference}</Text>
            <Text style={[styles.muted, r.state === "done" && { color: colors.success }]}>{r.state === "done" ? t("forms.done") : t("forms.inProgress")}</Text>
          </View>
          {r.state === "in_progress" && canResume
            ? <Action label={t("forms.resume")} onPress={() => open(r.id)} />
            : <Action label={t("forms.view")} onPress={() => open(r.id, true)} secondary />}
          {r.state === "done" && canEditDone && <Action label={t("forms.edit")} onPress={() => setReopen(r.id)} secondary />}
        </View>
      ))}
      {canCreate && <Action label={t("forms.answer")} onPress={startCreate} />}

      <Modal visible={creating !== null} transparent animationType="fade" onRequestClose={() => setCreating(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t("forms.newAnswer")}</Text>
            <TextField label={t("forms.answerReference")} value={creating ?? ""} onChangeText={setCreating}
              placeholder={t("forms.referencePlaceholder")} maxLength={255} />
            {!!error && <Banner tone="danger">{error}</Banner>}
            <Button label={t("forms.create")} onPress={create} />
            <Button label={t("common.cancel")} variant="secondary" onPress={() => setCreating(null)} />
          </View>
        </View>
      </Modal>
      <Modal visible={!!reopen} transparent animationType="fade" onRequestClose={() => setReopen(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t("forms.editTitle")}</Text>
            <Text style={styles.text}>{t("forms.editDescription")}</Text>
            <Button label={t("common.confirm")} onPress={confirmReopen} />
            <Button label={t("common.cancel")} variant="secondary" onPress={() => setReopen(null)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Action({ label, onPress, secondary }: { label: string; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.action, secondary && styles.actionSecondary]}>
      <Text style={[styles.actionLabel, secondary && { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { gap: spacing.xs, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { fontSize: font.body, fontWeight: "600", color: colors.text },
  required: { fontSize: 11, fontWeight: "700", color: colors.danger },
  response: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: spacing.sm },
  text: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.small, color: colors.textSecondary },
  action: { alignSelf: "flex-start", backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actionSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  actionLabel: { color: colors.onPrimary, fontWeight: "600", fontSize: font.small },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: font.title, fontWeight: "700", color: colors.text },
});
