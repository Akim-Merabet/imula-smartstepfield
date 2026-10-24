import * as Network from "expo-network";

import { config } from "@/config";
import { getDeviceInfo } from "@/lib/device";

import type { Profile, StoredSession } from "./profiles";

/** Codes renvoyés par la fonction Edge mobile-sign-in, plus les cas réseau (spec 05 §1.1). */
export type SignInError =
  | "INVALID_REQUEST"
  | "INVALID_DOMAIN"
  | "INVALID_CREDENTIALS"
  | "PROFILE_BLOCKED"
  | "DEVICE_UNAUTHORIZED"
  | "ANOTHER_DEVICE"
  | "NO_INTERNET"
  | "UNKNOWN";

type Principal = {
  id: string;
  kind: Profile["kind"];
  first_name: string;
  last_name: string;
  organization_id: string;
  language: string;
};

export type SignInResult =
  | { ok: true; profile: Profile; session: StoredSession }
  | { ok: false; error: SignInError };

const KNOWN: SignInError[] = [
  "INVALID_REQUEST", "INVALID_DOMAIN", "INVALID_CREDENTIALS", "PROFILE_BLOCKED", "DEVICE_UNAUTHORIZED", "ANOTHER_DEVICE",
];

export async function signInWithCredentials(email: string, password: string, company: string): Promise<SignInResult> {
  const device = await getDeviceInfo();
  let res: Response;
  try {
    res = await fetch(`${config.supabaseUrl}/functions/v1/mobile-sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.supabaseAnonKey },
      body: JSON.stringify({ email: email.trim(), password, company: company.trim(), device }),
    });
  } catch {
    const state = await Network.getNetworkStateAsync().catch(() => null);
    return { ok: false, error: state?.isInternetReachable === false ? "NO_INTERNET" : "INVALID_DOMAIN" };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: KNOWN.includes(body?.error) ? body.error : "UNKNOWN" };

  const principal: Principal = body.principal;
  return {
    ok: true,
    session: { access_token: body.session.access_token, refresh_token: body.session.refresh_token },
    profile: {
      principalId: principal.id,
      authUserId: body.session.user_id,
      kind: principal.kind,
      displayName: `${principal.first_name} ${principal.last_name}`.trim(),
      organizationId: principal.organization_id,
      company: company.trim(),
      language: principal.language,
      lastConnectedAt: new Date().toISOString(),
    },
  };
}
