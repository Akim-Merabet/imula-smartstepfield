import type { FileRef } from "@imula/forms-core/types";
import { usePowerSync, useQuery } from "@powersync/react";
import { randomUUID } from "expo-crypto";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { fileStore, useAttachmentUri } from "@/attachments/native";
import { type AttachmentDb, FORM_FILES_BUCKET, responseFilePath, saveLocalFile } from "@/attachments/queue";
import { Icon } from "@/components/kit";
import { Button } from "@/components/ui";
import { t } from "@/i18n/fr";
import { useSession } from "@/session/session-context";
import { colors, font, radius, spacing } from "@/theme";

/**
 * Photos d'une question (spec 05 §4.7.3) : prise de vue ou galerie, fichier gardé sur l'appareil et mis en file
 * d'envoi ; la valeur référence tout de suite le chemin Storage (même convention que la WebApp).
 */
/** Côté long maximal et compression des photos (spec 05 §9.8). */
const MAX_SIDE = 2560;

/** Réduit la photo si besoin et la réencode en JPEG 80 % ; renvoie l'URI du fichier à joindre. */
async function compress(asset: ImagePicker.ImagePickerAsset): Promise<{ uri: string; mime: string }> {
  const ctx = ImageManipulator.manipulate(asset.uri);
  const longSide = Math.max(asset.width, asset.height);
  if (longSide > MAX_SIDE) ctx.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return { uri: result.uri, mime: "image/jpeg" };
}

export function PhotoField({ value, onChange, disabled, responseId }: {
  value: FileRef[] | null; onChange: (v: FileRef[] | null) => void; disabled: boolean; responseId: string;
}) {
  const db = usePowerSync() as unknown as AttachmentDb;
  const files = value ?? [];
  const [choosing, setChoosing] = useState(false);
  const [viewing, setViewing] = useState<FileRef | null>(null);
  const [removing, setRemoving] = useState<FileRef | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async (source: "camera" | "gallery") => {
    setChoosing(false);
    setError(null);
    try {
      const permission = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return setError(t(source === "camera" ? "forms.cameraPermissionDenied" : "forms.galleryPermissionDenied"));
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1, allowsMultipleSelection: source === "gallery" };
      const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const next = [...files];
      for (const asset of result.assets) {
        const id = randomUUID();
        const name = `${(asset.fileName ?? `photo-${next.length + 1}`).replace(/\.[^.]+$/, "")}.jpg`;
        const path = responseFilePath(responseId, "photos", name, id);
        const { uri, mime } = await compress(asset);
        await saveLocalFile(db, fileStore, { id, bucket: FORM_FILES_BUCKET, path, mime, sourceUri: uri });
        next.push({ fileId: path, name, position: next.length + 1, mime });
      }
      onChange(next.length ? next : null);
    } catch {
      setError(t("forms.unexpectedError"));
    }
  };

  const remove = (file: FileRef) => {
    setRemoving(null);
    const next = files.filter((f) => f.fileId !== file.fileId).map((f, i) => ({ ...f, position: i + 1 }));
    onChange(next.length ? next : null);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.grid}>
        {files.map((f) => (
          <View key={f.fileId}>
            <Thumb file={f} onPress={() => setViewing(f)} />
            {!disabled && (
              <Pressable accessibilityRole="button" accessibilityLabel={t("forms.delete")} onPress={() => setRemoving(f)} style={styles.remove} hitSlop={6}>
                <Icon name="close-circle" color={colors.danger} size={22} />
              </Pressable>
            )}
          </View>
        ))}
        {!files.length && disabled && <Text style={styles.muted}>{t("forms.noFileAdded")}</Text>}
      </View>
      {!disabled && (
        <Pressable accessibilityRole="button" onPress={() => setChoosing(true)} style={styles.add}>
          <Icon name="camera-plus-outline" color={colors.primary} size={20} />
          <Text style={styles.addLabel}>{t("forms.addPhoto")}</Text>
        </Pressable>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}

      <Modal visible={choosing} transparent animationType="fade" onRequestClose={() => setChoosing(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.title}>{t("forms.addPhoto")}</Text>
            <Button label={t("forms.takePhoto")} onPress={() => void add("camera")} />
            <Button label={t("forms.chooseFromGallery")} variant="secondary" onPress={() => void add("gallery")} />
            <Button label={t("common.cancel")} variant="secondary" onPress={() => setChoosing(false)} />
          </View>
        </View>
      </Modal>
      <Modal visible={!!removing} transparent animationType="fade" onRequestClose={() => setRemoving(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.title}>{t("forms.confirmDeleteImage")}</Text>
            <Button label={t("forms.delete")} onPress={() => removing && remove(removing)} />
            <Button label={t("common.cancel")} variant="secondary" onPress={() => setRemoving(null)} />
          </View>
        </View>
      </Modal>
      <Modal visible={!!viewing} animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewer}>
          {viewing && <FullImage file={viewing} />}
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={() => setViewing(null)} style={styles.close}>
            <Icon name="close" color={colors.onPrimary} size={28} />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function usePending(path: string) {
  const { data } = useQuery<{ n: number }>("select count(*) as n from attachment_queue where path = ? and state = 'upload'", [path]);
  return (data[0]?.n ?? 0) > 0;
}

function Thumb({ file, onPress }: { file: FileRef; onPress: () => void }) {
  const { offline } = useSession();
  const uri = useAttachmentUri(file.fileId, !offline);
  const pending = usePending(file.fileId);
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={file.name} onPress={onPress} style={styles.thumb}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        : <Icon name="image-off-outline" color={colors.textSecondary} />}
      {pending && <View style={styles.pending}><Icon name="cloud-upload-outline" color={colors.onPrimary} size={16} /></View>}
    </Pressable>
  );
}

function FullImage({ file }: { file: FileRef }) {
  const { offline } = useSession();
  const uri = useAttachmentUri(file.fileId, !offline);
  if (!uri) return <Text style={{ color: colors.onPrimary }}>{t("forms.photoNotDownloaded")}</Text>;
  return <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="contain" accessibilityLabel={file.name} />;
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  thumb: { width: 88, height: 88, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  pending: { position: "absolute", right: 4, bottom: 4, backgroundColor: colors.warning, borderRadius: 10, padding: 2 },
  remove: { position: "absolute", top: -8, right: -8, backgroundColor: colors.surface, borderRadius: 11 },
  add: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", padding: spacing.xs },
  addLabel: { color: colors.primary, fontWeight: "600", fontSize: font.small },
  muted: { fontSize: font.small, color: colors.textSecondary },
  error: { fontSize: font.small, color: colors.danger },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: font.title - 2, fontWeight: "700", color: colors.text },
  viewer: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  close: { position: "absolute", top: spacing.xl, right: spacing.lg, padding: spacing.sm },
});
