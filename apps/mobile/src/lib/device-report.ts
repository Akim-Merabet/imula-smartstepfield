// Remontée d'informations de l'appareil après chaque envoi réussi (spec 05 §1.8) : fiche tablette sur la WebApp.
import * as Battery from "expo-battery";

import { supabase } from "@/lib/supabase";

import { getDeviceInfo } from "./device";
import { currentPosition } from "./location";

export async function reportDevice(): Promise<void> {
  const [info, battery, position] = await Promise.all([
    getDeviceInfo(),
    Battery.getBatteryLevelAsync().catch(() => -1),
    currentPosition(),
  ]);
  await supabase.rpc("mobile_report_device", {
    p: {
      device_id: info.id, app_version: info.app_version, os_version: info.os_version, model: info.model,
      screen_size: info.screen_size, battery_level: battery >= 0 ? Math.round(battery * 100) : null,
      latitude: position?.latitude ?? null, longitude: position?.longitude ?? null,
    } as never,
  });
}
