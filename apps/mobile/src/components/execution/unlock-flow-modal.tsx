// « Déverrouiller le flow » (spec 05 §4.4, R-SEQ-4) : confirmation irréversible, commentaire obligatoire, signature du
// profil connecté. Toutes les étapes deviennent saisissables, y compris hors ligne (séquencement levé localement).
import { usePowerSync } from "@powersync/react";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Checkbox, useSnackbar } from "@/components/kit";
import { SignaturePad } from "@/components/signature-pad";
import { Banner, Button, TextField } from "@/components/ui";
import type { Db } from "@/data/form-response";
import { unlockFlow } from "@/data/flow-writes";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, spacing } from "@/theme";

export function UnlockFlowModal({ flowId, visible, onClose }: { flowId: string; visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible && <UnlockForm flowId={flowId} onClose={onClose} />}
    </Modal>
  );
}

function UnlockForm({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const db = usePowerSync() as unknown as Db;
  const { profile } = useSession();
  const snackbar = useSnackbar();
  const [confirmed, setConfirmed] = useState(false);
  const [comment, setComment] = useState("");
  const [drawing, setDrawing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!confirmed) return setError(t("execution.unlockConfirmRequired"));
    if (!comment.trim()) return setError(t("execution.unlockCommentRequired"));
    if (!drawing) return setError(t("signature.errors.drawingRequired"));
    await unlockFlow(db, {
      id: randomUUID(), flowId, unlockedBy: profile?.principalId ?? "", signaturePath: drawing, comment,
      signedAt: new Date().toISOString(), qr: false,
    });
    snackbar(t("execution.unlockDone"), "success");
    onClose();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("execution.unlockTitle")}</Text>
        <Text style={styles.text}>{t("execution.unlockSubtitle")}</Text>
        <Checkbox checked={confirmed} onChange={setConfirmed} label={t("execution.unlockConfirm")} />
        <TextField label={`${t("signature.comment")} *`} value={comment} onChangeText={setComment} multiline
          placeholder={t("signature.commentPlaceholder")} maxLength={1000} />
        <Text style={styles.text}>{profile?.displayName}</Text>
        <SignaturePad onChange={setDrawing} />
        {!!error && <Banner tone="danger">{error}</Banner>}
      </ScrollView>
      <View style={styles.footer}>
        <Button label={t("execution.unlock")} onPress={() => void submit()} />
        <Button label={t("common.cancel")} variant="secondary" onPress={onClose} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: font.title, fontWeight: "700", color: colors.text },
  text: { fontSize: font.body, color: colors.text, lineHeight: 22 },
  footer: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, justifyContent: "flex-end", backgroundColor: colors.surface },
});
