import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ApiClientItem } from "./meta";

/** Clés API de l'organisation (RLS : administrateurs Siteflow de l'organisation uniquement). Jamais d'empreinte de secret. */
export async function listApiClients(search?: string): Promise<{ items: ApiClientItem[]; total: number }> {
  const supabase = await createClient();
  let q = supabase.from("api_clients")
    .select("id, name, key_type, service_class, client_id, account_id, active, expires_at, revoked_at, secret_rotated_at, last_used_at, created_at, account:accounts(name)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (search) q = q.or(`name.ilike.%${search.replace(/[%_,()\\]/g, "")}%,client_id.ilike.%${search.replace(/[%_,()\\]/g, "")}%`);
  const { data, count } = await q;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const items = await Promise.all((data ?? []).map(async (c) => {
    const { count: calls } = await supabase.from("api_request_logs").select("id", { count: "exact", head: true })
      .eq("api_client_id", c.id).gte("created_at", since);
    const { account, ...rest } = c;
    return { ...rest, account_name: account?.name ?? null, calls_24h: calls ?? 0 };
  }));
  return { items, total: count ?? items.length };
}

export async function listOrganizationAccounts() {
  const supabase = await createClient();
  const { data } = await supabase.from("accounts").select("id, name").order("name");
  return data ?? [];
}

export type ApiRequestLogItem = { id: number; method: string; path: string; status: number; error_key: string | null; duration_ms: number; created_at: string };

export async function listRecentLogs(apiClientId: string, limit = 50): Promise<ApiRequestLogItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("api_request_logs").select("id, method, path, status, error_key, duration_ms, created_at")
    .eq("api_client_id", apiClientId).order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}
