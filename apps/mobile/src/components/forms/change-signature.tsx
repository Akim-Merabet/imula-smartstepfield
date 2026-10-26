// « Signature des changements » (spec 05 §4.7.3, questions verrouillables) : signature du profil connecté et commentaire,
// exigés avant d'enregistrer la modification d'une valeur verrouillée ; même forme que la WebApp (change_signature).
import { usePowerSync } from "@powersync/react";
import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { fileStore } from "@/attachments/native";
import { type AttachmentDb, FORM_FILES_BUCKET, responseFilePath, saveLocalFile } from "@/attachments/queue";
import { dataUrlBytes } from "@/components/forms/form-signature";
import { ScreenModal } from "@/components/kit";
import { SignaturePad } from "@/components/signature-pad";
import { Banner, Button, TextField } from "@/components/ui";
import type { ChangeSignature } from "@/data/form-response";
import { t } from "@/i18n/fr";
import { useSingleFlight } from "@/lib/single-flight";
import { useSession } from "@/session/session-context";
import { colors, font, spacing } from "@/theme";

export function ChangeSignatureModal({ visible, responseId, onCancel, onSigned }: {
  visible: boolean; responseId: string; onCancel: () => void; onSigned: (s: ChangeSignature) => void;
}) {
  return (
    <ScreenModal visible={visible} onRequestClose={onCancel}>
      {visible && <Form responseId={responseId} onCancel={onCancel} onSigned={onSigned} />}
    </ScreenModal>
  );
}

function Form({ responseId, onCancel, onSigned }: { responseId: string; onCancel: () => void; onSigned: (s: ChangeSignature) => void }) {
  const db = usePowerSync() as unknown as AttachmentDb;
  const { profile } = useSession();
  const [drawing, setDrawing] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [submit, submitting] = useSingleFlight(async () => {
    if (!drawing) return setError(t("forms.signatureRequired"));
    const id = randomUUID();
    const path = responseFilePath(responseId, "signatures", "change-signature.png", id);
    await saveLocalFile(db, fileStore, { id, bucket: FORM_FILES_BUCKET, path, mime: "image/png", bytes: dataUrlBytes(drawing) });
    onSigned({
      user_id: profile?.principalId ?? "", name: profile?.displayName ?? "", image_path: path,
      signed_at: new Date().toISOString(), comment: comment.trim() || null,
    });
  });

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t("forms.changesTitle")}</Text>
        <Text style={styles.text}>{t("forms.changesText")}</Text>
        <Text style={styles.text}>{profile?.displayName}</Text>
        <SignaturePad onChange={(png) => { setDrawing(png); setError(null); }} />
        <TextField label={t("signature.commentOptional")} value={comment} onChangeText={setComment} multiline placeholder={t("signature.commentPlaceholder")} />
        {!!error && <Banner tone="danger">{error}</Banner>}
      </ScrollView>
      <View style={styles.footer}>
        <Button label={t("forms.sign")} onPress={() => void submit()} loading={submitting} />
        <Button label={t("common.cancel")} variant="secondary" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: font.title, fontWeight: "700", color: colors.text },
  text: { fontSize: font.body, color: colors.text, lineHeight: 22 },
  footer: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, justifyContent: "flex-end", backgroundColor: colors.surface },
});
