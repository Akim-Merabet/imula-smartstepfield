/** Constantes partagées (client + serveur) du module Accès API. */

export const API_KEY_TYPES = ["account", "organization"] as const;
export type ApiKeyType = (typeof API_KEY_TYPES)[number];

export const SERVICE_CLASSES = ["L1", "L2", "L3"] as const;
export type ServiceClass = (typeof SERVICE_CLASSES)[number];

/** L1 ⊂ L2 ⊂ L3 (« API-key-Scope ») : une classe donne accès aux endpoints de sa classe et des classes inférieures. */
export function classAllows(granted: ServiceClass, required: ServiceClass): boolean {
  return SERVICE_CLASSES.indexOf(granted) >= SERVICE_CLASSES.indexOf(required);
}

export const API_V2_BASE = "/api/ext/v2";

export type ApiClientItem = {
  id: string;
  name: string;
  key_type: ApiKeyType;
  service_class: ServiceClass;
  client_id: string;
  account_id: string | null;
  account_name: string | null;
  active: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  secret_rotated_at: string | null;
  last_used_at: string | null;
  created_at: string;
  calls_24h: number;
};

export type ApiClientState = "active" | "inactive" | "expired" | "revoked";

export function clientState(c: Pick<ApiClientItem, "active" | "expires_at" | "revoked_at">, now = Date.now()): ApiClientState {
  if (c.revoked_at) return "revoked";
  if (c.expires_at && new Date(c.expires_at).getTime() <= now) return "expired";
  return c.active ? "active" : "inactive";
}
