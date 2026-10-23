"use server";

import { revalidatePath } from "next/cache";
import { authorize, dbError, fail, ok, type ActionResult } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateClientId, generateClientSecret, hashSecret } from "./crypto";
import { apiClientSchema, type ApiClientInput } from "./schema";

const ROUTE = "ExternalAccessApiV2";
const PAGE = "/explore/collaborators/external-api/v2";

/** Identifiants affichés UNE seule fois (création, rotation) : le secret n'est jamais relu ensuite. */
export type IssuedCredentials = { id: string; clientId: string; clientSecret: string };

function expiry(date: string | null): string | null {
  return date ? new Date(`${date}T23:59:59`).toISOString() : null;
}

async function storeSecret(apiClientId: string, secret: string) {
  // Table sans politique RLS : écriture par le client service, après contrôle d'autorisation et de propriété.
  const { error } = await createAdminClient().from("api_client_secrets")
    .upsert({ api_client_id: apiClientId, secret_hash: await hashSecret(secret), created_at: new Date().toISOString() });
  return error;
}

export async function createApiClient(input: ApiClientInput): Promise<ActionResult<IssuedCredentials>> {
  const auth = await authorize(ROUTE, "add");
  if ("error" in auth) return fail(auth.error);
  const parsed = apiClientSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const v = parsed.data;
  if (v.expires_at && new Date(expiry(v.expires_at)!) <= new Date()) return fail("expiry_past");
  const me = auth.session.collaborator;
  const supabase = await createClient();
  const clientId = generateClientId();
  const { data, error } = await supabase.from("api_clients").insert({
    organization_id: me.organization_id,
    account_id: v.key_type === "account" ? v.account_id : null,
    name: v.name,
    key_type: v.key_type,
    service_class: v.service_class,
    client_id: clientId,
    active: v.active,
    expires_at: expiry(v.expires_at),
    created_by: me.id,
    updated_by: me.id,
  }).select("id").single();
  if (error || !data) return fail(error?.message?.includes("api_client_account_not_in_organization") ? "account_invalid" : dbError(error));
  const secret = generateClientSecret();
  const secretError = await storeSecret(data.id, secret);
  if (secretError) {
    await supabase.from("api_clients").delete().eq("id", data.id);
    return fail("unknown");
  }
  revalidatePath(PAGE);
  return ok({ id: data.id, clientId, clientSecret: secret });
}

export async function updateApiClient(id: string, input: ApiClientInput): Promise<ActionResult> {
  const auth = await authorize(ROUTE, "edit");
  if ("error" in auth) return fail(auth.error);
  const parsed = apiClientSchema.safeParse(input);
  if (!parsed.success) return fail("invalid", parsed.error.flatten());
  const v = parsed.data;
  const supabase = await createClient();
  const { data: before } = await supabase.from("api_clients").select("id, key_type, revoked_at").eq("id", id).maybeSingle();
  if (!before) return fail("not_found");
  if (before.revoked_at) return fail("revoked");
  // Type de clé et compte cible figés après création (la portée d'un secret déjà distribué ne change pas).
  const { error } = await supabase.from("api_clients").update({
    name: v.name, service_class: v.service_class, active: v.active, expires_at: expiry(v.expires_at), updated_by: auth.session.collaborator.id,
  }).eq("id", id);
  if (error) return fail(dbError(error));
  if (!v.active) await createAdminClient().from("api_access_tokens").delete().eq("api_client_id", id);
  revalidatePath(PAGE);
  return ok(undefined);
}

/** Rotation : nouveau secret, ancien invalidé, jetons existants révoqués. */
export async function rotateApiClientSecret(id: string): Promise<ActionResult<IssuedCredentials>> {
  const auth = await authorize(ROUTE, "edit");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data: row } = await supabase.from("api_clients").select("id, client_id, revoked_at").eq("id", id).maybeSingle();
  if (!row) return fail("not_found");
  if (row.revoked_at) return fail("revoked");
  const secret = generateClientSecret();
  const err = await storeSecret(row.id, secret);
  if (err) return fail("unknown");
  await createAdminClient().from("api_access_tokens").delete().eq("api_client_id", row.id);
  await supabase.from("api_clients").update({ secret_rotated_at: new Date().toISOString(), updated_by: auth.session.collaborator.id }).eq("id", id);
  revalidatePath(PAGE);
  return ok({ id: row.id, clientId: row.client_id, clientSecret: secret });
}

/** Révocation définitive : la clé reste listée (traçabilité) mais ne peut plus s'authentifier. */
export async function revokeApiClient(id: string): Promise<ActionResult> {
  const auth = await authorize(ROUTE, "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("api_clients").update({
    revoked_at: new Date().toISOString(), revoked_by: auth.session.collaborator.id, active: false, updated_by: auth.session.collaborator.id,
  }).eq("id", id).is("revoked_at", null).select("id").maybeSingle();
  if (error) return fail(dbError(error));
  if (!data) return fail("not_found");
  const admin = createAdminClient();
  await Promise.all([
    admin.from("api_access_tokens").delete().eq("api_client_id", id),
    admin.from("api_client_secrets").delete().eq("api_client_id", id),
  ]);
  revalidatePath(PAGE);
  return ok(undefined);
}

/** Suppression physique (pas de corbeille) ; le journal conserve les appels (client mis à null). */
export async function deleteApiClient(id: string): Promise<ActionResult> {
  const auth = await authorize(ROUTE, "delete");
  if ("error" in auth) return fail(auth.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("api_clients").delete().eq("id", id).select("id").maybeSingle();
  if (error) return fail(dbError(error));
  if (!data) return fail("not_found");
  revalidatePath(PAGE);
  return ok(undefined);
}
