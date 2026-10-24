// Localisation (spec 05 R-SEC-2) : demandée une fois avec l'explication d'origine ; un refus est toléré (la position
// n'est alors ni jointe aux signatures ni remontée sur la fiche tablette).
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

const CONSENT_KEY = "imula.location-consent";

export type LocationConsent = "granted" | "refused" | null;

export async function getLocationConsent(): Promise<LocationConsent> {
  return ((await AsyncStorage.getItem(CONSENT_KEY).catch(() => null)) as LocationConsent) ?? null;
}

export async function setLocationConsent(granted: boolean): Promise<boolean> {
  let ok = false;
  if (granted) ok = (await Location.requestForegroundPermissionsAsync().catch(() => null))?.status === "granted";
  await AsyncStorage.setItem(CONSENT_KEY, ok ? "granted" : "refused").catch(() => {});
  return ok;
}

/** Position courante (dernière connue récente, sinon mesure haute précision bornée à 5 s), ou null. */
export async function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    if ((await Location.getForegroundPermissionsAsync()).status !== "granted") return null;
    const recent = await Location.getLastKnownPositionAsync({ maxAge: 120_000 });
    const pos = recent ?? await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    return pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}
