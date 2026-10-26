import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LinkButton } from "@/components/kit";
import { QrScanner } from "@/components/qr-scanner";
import { Banner, Button, TextField } from "@/components/ui";
import { config } from "@/config";
import { t } from "@/i18n/fr";
import { getDeviceId } from "@/lib/device";
import { listProfiles, type Profile } from "@/session/profiles";
import { useSession } from "@/session/session-context";
import type { SignInError } from "@/session/sign-in";
import { colors, font, radius, spacing } from "@/theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = { email?: string; password?: string; company?: string };

function validate(email: string, password: string, company: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = t("login.emailAddressIsRequired");
  else if (!EMAIL.test(email.trim())) errors.email = t("login.emailAddressIsInvalid");
  if (!password) errors.password = t("login.passwordIsRequired");
  else if (password.length < 6) errors.password = t("login.passwordMustBeAtLeast6CharactersLong");
  if (!company.trim()) errors.company = t("login.companyIsRequired");
  return errors;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export default function LoginScreen() {
  const { signIn, signInWithQr, resume } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [showDeviceId, setShowDeviceId] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    listProfiles().then((list) => {
      setProfiles(list);
      if (list[0]) setCompany(list[0].company);
    });
    getDeviceId().then(setDeviceId);
  }, []);

  const submit = async () => {
    const errors = validate(email, password, company);
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    const result: SignInError | null = await signIn(email, password, company);
    setBusy(false);
    if (result) setError(t(`login.errors.${result}`));
  };

  const onQrScanned = async (data: string) => {
    setScanning(false);
    setBusy(true);
    setError(null);
    const result = await signInWithQr(data);
    setBusy(false);
    if (result) setError(t(`login.errors.${result}`));
  };

  const resumeProfile = async (profile: Profile) => {
    setBusy(true);
    setError(null);
    const result = await resume(profile);
    setBusy(false);
    if (result) {
      setCompany(profile.company);
      setError(t("login.sessionExpired"));
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.welcome}>{t("login.welcomeTo")}</Text>
            <Text style={styles.brand}>Qiwi Intervention</Text>
            <Text style={styles.subtitle}>{t("login.signToAccount")}</Text>
          </View>

          <View style={styles.card}>
            <Button label={t("login.scanQrCode")} onPress={() => setScanning(true)} disabled={busy} />
          </View>

          {profiles.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t("login.knownProfiles")}</Text>
              {profiles.map((p) => (
                <Pressable
                  key={p.principalId}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => resumeProfile(p)}
                  style={({ pressed }) => [styles.profile, pressed && { backgroundColor: colors.background }]}
                >
                  <Text style={styles.profileName}>{p.displayName}</Text>
                  <Text style={styles.profileMeta}>
                    {p.company} · {t("login.lastConnection", { date: formatDate(p.lastConnectedAt) })}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.separator}>{t("login.orUseYourLoginCredentials")}</Text>

          <View style={styles.card}>
            {!!error && <Banner tone="danger">{error}</Banner>}
            <TextField
              label={t("login.email")} value={email} onChangeText={setEmail} error={fieldErrors.email}
              autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username"
            />
            <TextField
              label={t("login.password")} value={password} onChangeText={setPassword} error={fieldErrors.password}
              secureTextEntry autoComplete="password" textContentType="password"
            />
            <TextField
              label={t("login.company")} value={company} onChangeText={setCompany} error={fieldErrors.company}
              autoCapitalize="none" autoCorrect={false} returnKeyType="go" onSubmitEditing={submit}
            />
            <Button label={busy ? t("login.loggingIn") : t("login.login")} onPress={submit} loading={busy} />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t("common.version", { version: config.appVersion })}</Text>
            <LinkButton label={t("login.deviceIdentifier")} onPress={() => setShowDeviceId(true)} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <QrScanner visible={scanning} title={t("login.scanQrCode")} onScanned={onQrScanned} onClose={() => setScanning(false)} />

      <Modal visible={showDeviceId} transparent animationType="fade" onRequestClose={() => setShowDeviceId(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.sectionTitle}>{t("login.deviceIdentifierTitle")}</Text>
            <Text selectable style={styles.deviceId}>{t("login.deviceIdentifierNumber", { id: deviceId ?? "…" })}</Text>
            <Button label={t("common.close")} variant="secondary" onPress={() => setShowDeviceId(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, maxWidth: 560, width: "100%", alignSelf: "center" },
  header: { alignItems: "center", gap: spacing.xs, marginTop: spacing.xl },
  welcome: { fontSize: font.body, color: colors.textSecondary },
  brand: { fontSize: font.hero, fontWeight: "800", color: colors.primary },
  subtitle: { fontSize: font.body, color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
  sectionTitle: { fontSize: font.body, fontWeight: "700", color: colors.text },
  profile: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 2 },
  profileName: { fontSize: font.body, fontWeight: "600", color: colors.text },
  profileMeta: { fontSize: font.small, color: colors.textSecondary },
  separator: { textAlign: "center", fontSize: font.small, color: colors.textSecondary },
  footer: { alignItems: "center", gap: spacing.sm },
  footerText: { fontSize: font.small, color: colors.textSecondary },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  deviceId: { fontSize: font.body, color: colors.text },
});
