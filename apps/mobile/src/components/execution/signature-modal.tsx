import type { SignatureNature } from "@imula/flow-core";
import { usePowerSync, useQuery } from "@powersync/react";
import { randomUUID } from "expo-crypto";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Icon, Segmented, useSnackbar } from "@/components/kit";
import { QrScanner } from "@/components/qr-scanner";
import { SignaturePad } from "@/components/signature-pad";
import { Banner, Button, TextField } from "@/components/ui";
import {
  draftToRow, emptyDraft, formatDay, formatTime, isExternalNature, parseCollaboratorQr, parseDateTime,
  type SignatoryKind, type SignatureDraft, type SignMode, validateDraft,
} from "@/data/signature-rules";
import { named } from "@/data/sql";
import { t } from "@/i18n/fr";
import { logEvent } from "@/lib/app-log";
import { getDeviceId } from "@/lib/device";
import { currentPosition } from "@/lib/location";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

export type SignatureTarget =
  | { kind: "create"; blockId: string; stepId: string; flowId: string; nature: SignatureNature; title: string; supervisor: string | null }
  | { kind: "complete"; signatureId: string; title: string; proxyDate: string | null };

type Person = { id: string; name: string; profession: string | null };

/** Modale de signature du bloc Contrôles (spec 05 §7.4) : écrit la signature dans la base locale, envoyée ensuite. */
export function SignatureModal({ target, onClose }: { target: SignatureTarget | null; onClose: () => void }) {
  return (
    <Modal visible={!!target} animationType="slide" onRequestClose={onClose}>
      {target && (target.kind === "create"
        ? <CreateForm key={`${target.blockId}:${target.nature}`} target={target} onClose={onClose} />
        : <CompleteForm key={target.signatureId} target={target} onClose={onClose} />)}
    </Modal>
  );
}

function Header({ title, subtitle, onClose }: { title: string; subtitle?: string | null; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} hitSlop={8}>
        <Icon name="close" />
      </Pressable>
    </View>
  );
}

function DateTimeFields({ label, day, time, onDay, onTime }: { label: string; day: string; time: string; onDay: (v: string) => void; onTime: (v: string) => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 3 }}>
        <TextField label={label} value={day} onChangeText={onDay} placeholder={t("signature.dateFormat")} keyboardType="numbers-and-punctuation" />
      </View>
      <View style={{ flex: 2 }}>
        <TextField label={t("signature.time")} value={time} onChangeText={onTime} placeholder={t("signature.timeFormat")} keyboardType="numbers-and-punctuation" />
      </View>
    </View>
  );
}

function CreateForm({ target, onClose }: { target: Extract<SignatureTarget, { kind: "create" }>; onClose: () => void }) {
  const db = usePowerSync();
  const { profile, offline } = useSession();
  const snackbar = useSnackbar();
  const me = profile?.principalId ?? "";
  const [draft, setDraft] = useState<SignatureDraft>(() => emptyDraft(new Date(), target.nature));
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const external = isExternalNature(target.nature);
  const set = <K extends keyof SignatureDraft>(k: K, v: SignatureDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // Signataires proposés : liste restreinte du flow (+ responsables) si elle existe, sinon les collaborateurs de l'entité.
  const { data: restrictedRows } = useQuery<{ id: string }>(...named(
    `select collaborator_id as id from flow_collaborators where flow_id = :flow
     union select collaborator_id from flow_assignees where flow_id = :flow and exists (select 1 from flow_collaborators where flow_id = :flow)`,
    { flow: target.flowId }));
  const { data: people } = useQuery<Person>(
    `select c.id, c.first_name || ' ' || c.last_name as name, c.profession from collaborators c
      where c.kind <> 'device' order by c.last_name, c.first_name`);
  const { data: stepSignatures } = useQuery<{ signatory_id: string | null; nature: string }>(
    "select signatory_id, nature from signatures where step_id = ? and ifnull(disabled, 0) = 0", [target.stepId]);
  const restricted = useMemo(() => (restrictedRows.length ? new Set(restrictedRows.map((r) => r.id)) : null), [restrictedRows]);
  const choices = restricted ? people.filter((p) => restricted.has(p.id)) : people;
  const chosen = people.find((p) => p.id === draft.signatoryId);

  const submit = async (later: boolean) => {
    const d = { ...draft, later };
    const ctx = { nature: target.nature, stepSignatures, restricted, now: new Date() };
    const key = validateDraft(d, ctx, me);
    if (key) return setError(t(`signature.errors.${key}`));
    const row = draftToRow(d, { ...ctx, blockId: target.blockId, stepId: target.stepId, flowId: target.flowId, me },
      { deviceId: await getDeviceId().catch(() => null), offline, holderName: profile?.displayName ?? null, ...(await currentPosition()) },
      randomUUID());
    const columns = Object.keys(row);
    await db.execute(`insert into signatures (${columns.join(", ")}) values (${columns.map(() => "?").join(", ")})`,
      columns.map((c) => (row as Record<string, unknown>)[c]));
    logEvent("CLICK_TO_SAVE_SIGNATURE", { blockId: target.blockId, nature: target.nature, state: row.state });
    snackbar(t("signature.success"), "success");
    onClose();
  };

  const onQr = (raw: string) => {
    setScanning(false);
    const id = parseCollaboratorQr(raw);
    if (!id) return setError(t("signature.invalidQrCode"));
    if (!people.some((p) => p.id === id)) return setError(t("signature.userNotFound"));
    setError(null);
    setDraft((d) => ({ ...d, signatoryId: id }));
    snackbar(t("signature.identified"), "success");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header title={target.title} subtitle={target.supervisor ? t("signature.supervisor", { name: target.supervisor }) : null} onClose={onClose} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Segmented<SignMode> value={draft.mode} onChange={(v) => set("mode", v)} options={[
          { value: "person", label: t("signature.signInPerson") },
          { value: "proxy", label: t("signature.signByProxy") },
          { value: "not_applicable", label: t("signature.notApplicable") },
        ]} />

        {draft.mode === "proxy" ? (
          <>
            <Text style={styles.section}>{t("signature.principal")}</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}><TextField label={t("signature.firstName")} value={draft.principalFirstName} onChangeText={(v) => set("principalFirstName", v)} /></View>
              <View style={{ flex: 1 }}><TextField label={t("signature.lastName")} value={draft.principalLastName} onChangeText={(v) => set("principalLastName", v)} /></View>
            </View>
            <Text style={styles.section}>{t("signature.representative")}</Text>
            <Text style={styles.value}>{profile?.displayName}</Text>
            <DateTimeFields label={t("signature.proxyDate")} day={draft.proxyDate} time={draft.proxyTime}
              onDay={(v) => set("proxyDate", v)} onTime={(v) => set("proxyTime", v)} />
          </>
        ) : external ? (
          <IdentityFields draft={draft} set={set} withEmail />
        ) : (
          <>
            <Segmented<SignatoryKind> value={draft.kind} onChange={(v) => set("kind", v)} options={[
              { value: "list", label: t("signature.contributor") },
              { value: "qr", label: t("signature.qrCode") },
              { value: "not_listed", label: t("signature.notPresentOnList") },
            ]} />
            {draft.kind === "list" && (
              <View style={styles.people}>
                {!choices.length && <Text style={styles.value}>{t("signature.noCollaborator")}</Text>}
                {choices.map((p) => {
                  const active = p.id === draft.signatoryId;
                  return (
                    <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => set("signatoryId", p.id)}
                      style={[styles.person, active && styles.personActive]}>
                      <Icon name={active ? "radiobox-marked" : "radiobox-blank"} color={active ? colors.primary : colors.textSecondary} size={20} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.value}>{p.name}</Text>
                        {!!p.profession && <Text style={styles.subtitle}>{p.profession}</Text>}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {draft.kind === "qr" && (
              <>
                <Button label={t("signature.scanQr")} variant="secondary" onPress={() => setScanning(true)} />
                {!!chosen && <Text style={styles.value}>{chosen.name}</Text>}
              </>
            )}
            {draft.kind === "not_listed" && <IdentityFields draft={draft} set={set} />}
          </>
        )}

        <DateTimeFields label={t("signature.date")} day={draft.date} time={draft.time} onDay={(v) => set("date", v)} onTime={(v) => set("time", v)} />
        <TextField label={draft.mode === "not_applicable" ? t("signature.comment") : t("signature.commentOptional")} value={draft.comment}
          onChangeText={(v) => set("comment", v)} placeholder={t("signature.commentPlaceholder")} multiline maxLength={1000} />
        {draft.mode !== "not_applicable" && <SignaturePad onChange={(png) => set("drawing", png)} />}
        {!!error && <Banner tone="danger">{error}</Banner>}
      </ScrollView>
      <View style={styles.footer}>
        {draft.mode === "not_applicable" ? (
          <Button label={t("signature.signNonApplicability")} onPress={() => submit(false)} />
        ) : (
          <>
            <Button label={t("signature.sign")} onPress={() => submit(false)} />
            <Button label={t("signature.signLater")} variant="secondary" onPress={() => submit(true)} />
          </>
        )}
      </View>
      <QrScanner visible={scanning} title={t("signature.scanQr")} onScanned={onQr} onClose={() => setScanning(false)} />
    </SafeAreaView>
  );
}

function IdentityFields({ draft, set, withEmail }: {
  draft: SignatureDraft; set: <K extends keyof SignatureDraft>(k: K, v: SignatureDraft[K]) => void; withEmail?: boolean;
}) {
  return (
    <>
      <View style={styles.row}>
        <View style={{ flex: 1 }}><TextField label={t("signature.firstName")} value={draft.firstName} onChangeText={(v) => set("firstName", v)} /></View>
        <View style={{ flex: 1 }}><TextField label={t("signature.lastName")} value={draft.lastName} onChangeText={(v) => set("lastName", v)} /></View>
      </View>
      {withEmail && <TextField label={t("signature.email")} value={draft.email} onChangeText={(v) => set("email", v)} keyboardType="email-address" autoCapitalize="none" />}
      <TextField label={t("signature.profession")} value={draft.profession} onChangeText={(v) => set("profession", v)} />
      <TextField label={t("signature.company")} value={draft.company} onChangeText={(v) => set("company", v)} />
    </>
  );
}

/** « Reprendre » une signature en attente : dessin, date déclarée, commentaire. */
function CompleteForm({ target, onClose }: { target: Extract<SignatureTarget, { kind: "complete" }>; onClose: () => void }) {
  const db = usePowerSync();
  const snackbar = useSnackbar();
  const [day, setDay] = useState(formatDay(new Date()));
  const [time, setTime] = useState(formatTime(new Date()));
  const [comment, setComment] = useState("");
  const [drawing, setDrawing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const signedAt = parseDateTime(day, time);
    if (!signedAt) return setError(t("signature.errors.invalidDate"));
    if (signedAt.getTime() > Date.now() + 60_000) return setError(t("signature.errors.futureDate"));
    if (target.proxyDate && signedAt < new Date(target.proxyDate)) return setError(t("signature.errors.proxyDateAfter"));
    if (!drawing) return setError(t("signature.errors.drawingRequired"));
    await db.execute(
      "update signatures set state = 'signed', signature_path = ?, signed_at = ?, comment = coalesce(?, comment) where id = ? and state = 'waiting'",
      [drawing, signedAt.toISOString(), comment.trim() || null, target.signatureId]);
    snackbar(t("signature.success"), "success");
    onClose();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Header title={target.title} onClose={onClose} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <DateTimeFields label={t("signature.date")} day={day} time={time} onDay={setDay} onTime={setTime} />
        <TextField label={t("signature.commentOptional")} value={comment} onChangeText={setComment} placeholder={t("signature.commentPlaceholder")} multiline />
        <SignaturePad onChange={(png) => { setDrawing(png); setError(null); }} />
        {!!error && <Banner tone="danger">{error}</Banner>}
      </ScrollView>
      <View style={styles.footer}><Button label={t("signature.sign")} onPress={submit} /></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontSize: font.title - 2, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: font.small, color: colors.textSecondary },
  content: { padding: spacing.md, gap: spacing.md },
  section: { fontSize: font.small, fontWeight: "700", color: colors.textSecondary },
  value: { fontSize: font.body, color: colors.text },
  row: { flexDirection: "row", gap: spacing.sm },
  people: { gap: spacing.xs },
  person: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  personActive: { borderColor: colors.primary },
  footer: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, justifyContent: "flex-end" },
});
