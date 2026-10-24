import * as Network from "expo-network";

import { config } from "@/config";
import { getDeviceInfo } from "@/lib/device";

import type { Profile, StoredSession } from "./profiles";

/** Codes renvoyés par les fonctions Edge mobile-sign-in / mobile-qr-sign-in, plus les cas réseau (spec 05 §1.1, §1.2). */
export type SignInError =
  | "INVALID_REQUEST"
  | "INVALID_DOMAIN"
  | "INVALID_CREDENTIALS"
  | "PROFILE_BLOCKED"
  | "DEVICE_UNAUTHORIZED"
  | "ANOTHER_DEVICE"
  | "NO_INTERNET"
  | "INVALID_QR"
  | "EXPIRED_QR"
  | "QR_ALREADY_BOUND"
  | "QR_NO_INTERNET"
  | "UNKNOWN";

type Principal = {
  id: string;
  kind: Profile["kind"];
  first_name: string;
  last_name: string;
  organization_id: string;
  language: string;
};

type SignInBody = {
  error?: SignInError;
  session: { access_token: string; refresh_token: string; user_id: string };
  principal: Principal;
};

export type SignInResult =
  | { ok: true; profile: Profile; session: StoredSession }
  | { ok: false; error: SignInError };

const KNOWN: SignInError[] = [
  "INVALID_REQUEST", "INVALID_DOMAIN", "INVALID_CREDENTIALS", "PROFILE_BLOCKED", "DEVICE_UNAUTHORIZED", "ANOTHER_DEVICE",
  "EXPIRED_QR", "QR_ALREADY_BOUND",
];

const errorOf = (body: SignInBody | null): SignInError =>
  body?.error && KNOWN.includes(body.error) ? body.error : "UNKNOWN";

async function callSignIn(fn: string, payload: object): Promise<{ res: Response; body: SignInBody | null } | "NETWORK"> {
  try {
    const res = await fetch(`${config.supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.supabaseAnonKey },
      body: JSON.stringify(payload),
    });
    return { res, body: await res.json().catch(() => null) };
  } catch {
    return "NETWORK";
  }
}

function toResult(body: SignInBody, company: string): SignInResult {
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
      company,
      language: principal.language,
      lastConnectedAt: new Date().toISOString(),
    },
  };
}

export async function signInWithCredentials(email: string, password: string, company: string): Promise<SignInResult> {
  const device = await getDeviceInfo();
  const call = await callSignIn("mobile-sign-in", { email: email.trim(), password, company: company.trim(), device });
  if (call === "NETWORK") {
    const state = await Network.getNetworkStateAsync().catch(() => null);
    return { ok: false, error: state?.isInternetReachable === false ? "NO_INTERNET" : "INVALID_DOMAIN" };
  }
  if (!call.res.ok || !call.body?.session) return { ok: false, error: errorOf(call.body) };
  return toResult(call.body, company.trim());
}

/** Contenu du QR « Connexion rapide » généré par la WebApp : { v: 1, host, token }. */
export function parseQuickConnectionQr(raw: string): { host: string; token: string } | null {
  try {
    const data = JSON.parse(raw);
    if (data?.v !== 1 || typeof data.token !== "string" || typeof data.host !== "string") return null;
    return { host: data.host, token: data.token };
  } catch {
    return null;
  }
}

/** Connexion rapide par QR code (spec 05 §1.2) : le jeton est lié au premier appareil qui le scanne. */
export async function signInWithQrCode(raw: string): Promise<SignInResult> {
  const qr = parseQuickConnectionQr(raw);
  if (!qr) return { ok: false, error: "INVALID_QR" };
  const device = await getDeviceInfo();
  const call = await callSignIn("mobile-qr-sign-in", { token: qr.token, device });
  if (call === "NETWORK") return { ok: false, error: "QR_NO_INTERNET" };
  if (!call.res.ok || !call.body?.session) return { ok: false, error: errorOf(call.body) };
  return toResult(call.body, qr.host);
}
