// « Importer les données » (spec 05 §6.1) : déchiffre une sauvegarde de l'appareil avec la clé privée de l'organisation
// et rend au profil qui l'a produite ce qui se restaure sur l'appareil — écritures non envoyées et tables propres à
// l'appareil. La clé privée ne quitte pas le serveur (l'outil d'origine la confiait à l'appareil).
import { createClient } from "npm:@supabase/supabase-js@2";
import { inflate } from "npm:pako@2.1.0";
import nacl from "npm:tweetnacl@1.0.3";

import { fail, json, preflight, serviceClient } from "../_shared/mobile.ts";

const MAX_SIZE = 50 * 1024 * 1024;
/** Tables propres à l'appareil rendues avec les écritures (même liste que l'app). */
const LOCAL_TABLES = ["offline_selection", "flow_executions", "value_change_signatures"];

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** Format IMB1 de @imula/backup-core : "IMB1" | éphémère (32) | nonce (24) | box(clé) (48) | nonce (24) | secretbox. */
function decrypt(data: Uint8Array, secretKey: string): Uint8Array | null {
  if (data.length < 132 || String.fromCharCode(...data.subarray(0, 4)) !== "IMB1") return null;
  const key = nacl.box.open(data.subarray(60, 108), data.subarray(36, 60), data.subarray(4, 36), fromBase64(secretKey));
  if (!key) return null;
  const plain = nacl.secretbox.open(data.subarray(132), data.subarray(108, 132), key);
  return plain ? inflate(plain) : null;
}

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const auth = req.headers.get("Authorization");
  if (!auth) return fail("INVALID_CREDENTIALS", 401);
  const user = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: ctxRows, error } = await user.rpc("mobile_restore_context");
  const ctx = Array.isArray(ctxRows) ? ctxRows[0] : null;
  if (error || !ctx?.principal_id) return fail("INVALID_CREDENTIALS", 401);

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_SIZE) return fail("INVALID_REQUEST", 400);
  const { data: secret } = await serviceClient().rpc("backup_secret_key", { p_organization_id: ctx.organization_id });
  // Clé absente ou sauvegarde d'une autre organisation : le déchiffrement échoue de la même façon.
  const plain = typeof secret === "string" ? decrypt(bytes, secret) : null;
  if (!plain) return json({ error: "INVALID_BACKUP" }, 422);

  let content: { version?: number; createdAt?: string; principalId?: string; deviceId?: string | null; pending?: unknown[]; tables?: Record<string, unknown[]> };
  try {
    content = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return json({ error: "INVALID_BACKUP" }, 422);
  }
  if (content.version !== 1) return json({ error: "INVALID_BACKUP" }, 422);
  // Les écritures seraient renvoyées au nom du profil connecté : seul l'auteur de la sauvegarde peut la restaurer.
  if (content.principalId !== ctx.principal_id) return json({ error: "NOT_YOUR_BACKUP" }, 403);

  const tables: Record<string, unknown[]> = {};
  for (const name of LOCAL_TABLES) tables[name] = content.tables?.[name] ?? [];
  return json({ createdAt: content.createdAt, deviceId: content.deviceId ?? null, pending: content.pending ?? [], tables });
});
