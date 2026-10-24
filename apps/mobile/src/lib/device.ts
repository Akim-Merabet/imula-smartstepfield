import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Dimensions, Platform } from "react-native";

import { config } from "@/config";

const FALLBACK_KEY = "imula.device-id";

/** Identifiant affiché par « Identifiant appareil » et contrôlé par les appareils autorisés (R-LOG-2). */
export async function getDeviceId(): Promise<string> {
  if (Platform.OS === "android") return Application.getAndroidId();
  if (Platform.OS === "ios") {
    const id = await Application.getIosIdForVendorAsync();
    if (id) return id;
  }
  const stored = await SecureStore.getItemAsync(FALLBACK_KEY);
  if (stored) return stored;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(FALLBACK_KEY, id);
  return id;
}

export type DeviceInfo = {
  id: string;
  app_version: string;
  os_version: string | null;
  model: string | null;
  screen_size: string;
};

/** Informations envoyées avec chaque connexion (spec 05 §1.1). */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  const { width, height } = Dimensions.get("screen");
  return {
    id: await getDeviceId(),
    app_version: config.appVersion,
    os_version: Device.osVersion,
    model: Device.modelName,
    screen_size: `${Math.round(width)}/${Math.round(height)}`,
  };
}
