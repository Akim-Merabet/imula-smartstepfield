import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ScreenModal } from "@/components/kit";
import { Button } from "@/components/ui";
import { t } from "@/i18n/fr";
import { colors, font, radius, spacing } from "@/theme";

/**
 * Scanner plein écran de QR codes (connexion rapide, ouverture de flow, authentification forte d'un signataire).
 * `onScanned` n'est appelé qu'une fois par ouverture : la caméra continue d'émettre tant que le code est visible.
 */
export function QrScanner({ visible, title, onScanned, onClose }: {
  visible: boolean;
  title?: string;
  onScanned: (data: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  const handle = ({ data }: { data: string }) => {
    if (handled.current) return;
    handled.current = true;
    onScanned(data);
  };

  return (
    <ScreenModal visible={visible} onRequestClose={onClose} onShow={() => { handled.current = false; }}>
      <View style={styles.safe}>
        <Text style={styles.title}>{title ?? t("qrScanner.title")}</Text>
        {permission?.granted ? (
          <View style={styles.cameraBox}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={handle}
            />
            <View style={styles.frame} pointerEvents="none" />
            <Text style={styles.hint}>{t("qrScanner.hint")}</Text>
          </View>
        ) : (
          <View style={styles.permission}>
            {permission && !permission.canAskAgain ? (
              <Text style={styles.message}>{t("qrScanner.permissionDenied")}</Text>
            ) : (
              <Button label={t("qrScanner.grant")} onPress={requestPermission} />
            )}
          </View>
        )}
        <Button label={t("qrScanner.cancel")} variant="secondary" onPress={onClose} />
      </View>
    </ScreenModal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: font.title, fontWeight: "700", color: colors.text },
  cameraBox: { flex: 1, borderRadius: radius.lg, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  frame: { width: 240, height: 240, borderWidth: 3, borderColor: colors.onPrimary, borderRadius: radius.md },
  hint: { position: "absolute", bottom: spacing.lg, color: colors.onPrimary, fontSize: font.body, fontWeight: "600" },
  permission: { flex: 1, justifyContent: "center", gap: spacing.md },
  message: { fontSize: font.body, color: colors.text, textAlign: "center", lineHeight: 22 },
});
