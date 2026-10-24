// Réglage « Enregistrer les photos vers la galerie » (spec 05 §1.5) : copie des photos prises dans la galerie Android.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset, requestPermissionsAsync } from "expo-media-library";

const KEY = "settings.savePhotosToGallery";

/** Vrai par défaut, comme l'application d'origine. */
export async function getSaveToGallery(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY).catch(() => null)) !== "false";
}

export async function setSaveToGallery(value: boolean) {
  await AsyncStorage.setItem(KEY, String(value)).catch(() => {});
}

/** Copie la photo dans la galerie si le réglage est actif ; un refus ou un échec n'empêche pas la réponse. */
export async function copyToGallery(uri: string): Promise<boolean> {
  if (!(await getSaveToGallery())) return false;
  try {
    const permission = await requestPermissionsAsync(true);
    if (!permission.granted) return false;
    await Asset.create(uri);
    return true;
  } catch {
    return false;
  }
}
