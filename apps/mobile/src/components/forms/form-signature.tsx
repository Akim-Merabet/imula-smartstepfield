// Question « Collaborateur et signature » (spec 05 §4.7.3) : même valeur que la WebApp (SignatureValue), dessin PNG
// gardé sur l'appareil et mis en file d'envoi (responses/<réponse>/signatures/…).
import type { SignatorySlotDef, SignatureValue } from "@imula/forms-core/types";
import { usePowerSync, useQuery } from "@powersync/react";
import { randomUUID } from "expo-crypto";
import { Image } from "expo-image";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fileStore, useAttachmentUri } from "@/attachments/native";
import { type AttachmentDb, FORM_FILES_BUCKET, responseFilePath, saveLocalFile } from "@/attachments/queue";
import { Checkbox, formatDate, Icon } from "@/components/kit";
import { SignaturePad } from "@/components/signature-pad";
import { Banner, Button, TextField } from "@/components/ui";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

const NOT_LISTED = "__not_listed__";

/** data:image/png;base64,… → octets */
export function dataUrlBytes(dataUrl: string): Uint8Array {
  const bin = atob(dataUrl.split(",")[1] ?? "");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function FormSignature({ slot, value, onChange, disabled, responseId }: {
  slot: SignatorySlotDef; value: SignatureValue | null; onChange: (v: SignatureValue | null) => void; disabled: boolean; responseId: string;
}) {
  const { offline } = useSession();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  const uri = useAttachmentUri(value?.signaturePath, !offline);
  const name = value ? [value.firstName, value.lastName].filter(Boolean).join(" ") : "";
  return (
    <View style={styles.slot}>
      <Text style={styles.slotName}>{slot.name || t("forms.signatoryOrder", { n: slot.position })}</Text>
      {value ? (
        <>
          <Text style={styles.text}>
            {value.signedAt && !slot.disableSignature ? t("forms.signedOn", { name, date: formatDate(value.signedAt, true) ?? "" }) : name}
          </Text>
          {!!value.comment && <Text style={styles.muted}>{value.comment}</Text>}
          {!!value.signaturePath && (
            <Pressable accessibilityRole="button" onPress={() => setViewing(true)}>
              <Text style={styles.link}>{t("forms.viewSignature")}</Text>
            </Pressable>
          )}
        </>
      ) : !disabled && (
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.action}>
          <Icon name="draw-pen" color={colors.onPrimary} size={18} />
          <Text style={styles.actionLabel}>{slot.disableSignature ? t("forms.identify") : t("forms.sign")}</Text>
        </Pressable>
      )}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        {open && <SignForm slot={slot} responseId={responseId} onClose={() => setOpen(false)} onDone={(v) => { setOpen(false); onChange(v); }} />}
      </Modal>
      <Modal visible={viewing} transparent animationType="fade" onRequestClose={() => setViewing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setViewing(false)}>
          <View style={styles.viewer}>
            {uri ? <Image source={{ uri }} style={{ width: "100%", height: 200 }} contentFit="contain" /> : <Text style={styles.muted}>{t("forms.photoNotDownloaded")}</Text>}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

type Member = { id: string; first_name: string; last_name: string; email: string | null };

function SignForm({ slot, responseId, onClose, onDone }: {
  slot: SignatorySlotDef; responseId: string; onClose: () => void; onDone: (v: SignatureValue) => void;
}) {
  const db = usePowerSync() as unknown as AttachmentDb;
  const { data: members } = useQuery<Member>(
    "select id, first_name, last_name, email from collaborators where kind <> 'device' order by last_name, first_name");
  const [who, setWho] = useState("");
  const [ext, setExt] = useState({ firstName: "", lastName: "", email: "", function: "", companyName: "" });
  const [proxied, setProxied] = useState(false);
  const [principal, setPrincipal] = useState("");
  const [comment, setComment] = useState("");
  const [drawing, setDrawing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const member = members.find((m) => m.id === who);

  const submit = async () => {
    const extern = who === NOT_LISTED;
    if (!who) return setError(t("forms.selectRequired"));
    if (extern && (!ext.firstName.trim() || !ext.lastName.trim() || (slot.disableSignature && !ext.function.trim()))) {
      return setError(t("forms.identityRequired"));
    }
    if (!slot.disableSignature && !drawing) return setError(t("forms.signatureRequired"));
    let signaturePath: string | undefined;
    if (!slot.disableSignature && drawing) {
      const id = randomUUID();
      signaturePath = responseFilePath(responseId, "signatures", "signature.png", id);
      await saveLocalFile(db, fileStore, { id, bucket: FORM_FILES_BUCKET, path: signaturePath, mime: "image/png", bytes: dataUrlBytes(drawing) });
    }
    const now = new Date().toISOString();
    onDone({
      contributorType: extern ? "extern" : "intern",
      userId: extern ? undefined : member?.id,
      firstName: extern ? ext.firstName.trim() : member?.first_name,
      lastName: extern ? ext.lastName.trim() : member?.last_name,
      email: extern ? ext.email.trim() || undefined : member?.email ?? undefined,
      function: extern ? ext.function.trim() || undefined : undefined,
      companyName: extern ? ext.companyName.trim() || undefined : undefined,
      signaturePath, signedAt: now, localCreatedAt: now,
      proxied, principal: proxied ? principal.trim() : undefined,
      proxy: proxied ? [member?.first_name ?? ext.firstName, member?.last_name ?? ext.lastName].join(" ").trim() : undefined,
      proxyDate: proxied ? now : undefined,
      comment: comment.trim() || undefined,
    });
  };

  const people = [...members.map((m) => ({ id: m.id, label: `${m.first_name} ${m.last_name}` })), { id: NOT_LISTED, label: t("forms.notListed") }];
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>{slot.name || t("forms.signatoryOrder", { n: slot.position })}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} hitSlop={8}><Icon name="close" /></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>{t("forms.collaborator")}</Text>
        {people.map((p) => {
          const active = p.id === who;
          return (
            <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setWho(p.id)}
              style={[styles.person, active && styles.personActive]}>
              <Icon name={active ? "radiobox-marked" : "radiobox-blank"} color={active ? colors.primary : colors.textSecondary} size={20} />
              <Text style={styles.text}>{p.label}</Text>
            </Pressable>
          );
        })}
        {who === NOT_LISTED && (
          <>
            <TextField label={t("signature.firstName")} value={ext.firstName} onChangeText={(v) => setExt((x) => ({ ...x, firstName: v }))} />
            <TextField label={t("signature.lastName")} value={ext.lastName} onChangeText={(v) => setExt((x) => ({ ...x, lastName: v }))} />
            <TextField label={t("signature.email")} value={ext.email} onChangeText={(v) => setExt((x) => ({ ...x, email: v }))} keyboardType="email-address" autoCapitalize="none" />
            <TextField label={t("signature.profession")} value={ext.function} onChangeText={(v) => setExt((x) => ({ ...x, function: v }))} />
            <TextField label={t("signature.company")} value={ext.companyName} onChangeText={(v) => setExt((x) => ({ ...x, companyName: v }))} />
          </>
        )}
        <Checkbox checked={proxied} onChange={setProxied} label={t("forms.byProxy")} />
        {proxied && <TextField label={t("forms.principal")} value={principal} onChangeText={setPrincipal} />}
        {!slot.disableSignature && <SignaturePad onChange={setDrawing} />}
        <TextField label={t("signature.commentOptional")} value={comment} onChangeText={setComment} multiline placeholder={t("signature.commentPlaceholder")} />
        {!!error && <Banner tone="danger">{error}</Banner>}
      </ScrollView>
      <View style={styles.footer}>
        <Button label={slot.disableSignature ? t("forms.identify") : t("forms.sign")} onPress={() => void submit()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  slot: { gap: spacing.xs, paddingVertical: spacing.xs },
  slotName: { fontSize: font.small, fontWeight: "600", color: colors.textSecondary },
  text: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.small, color: colors.textSecondary },
  link: { fontSize: font.small, color: colors.primary, fontWeight: "600" },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actionLabel: { color: colors.onPrimary, fontWeight: "600", fontSize: font.small },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  viewer: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, alignItems: "center" },
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { flex: 1, fontSize: font.title - 2, fontWeight: "700", color: colors.text },
  content: { padding: spacing.md, gap: spacing.sm },
  section: { fontSize: font.small, fontWeight: "700", color: colors.textSecondary },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  personActive: { borderColor: colors.primary },
  footer: { padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
