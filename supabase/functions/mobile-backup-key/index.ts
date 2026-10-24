// Clé publique de chiffrement des sauvegardes de l'organisation du profil connecté (spec 05 §6.1, §9.9).
// La paire est générée au premier appel (NaCl box, même format que @imula/backup-core) ; la clé privée reste en base.
import { createClient } from "npm:@supabase/supabase-js@2";
import nacl from "npm:tweetnacl@1.0.3";

import { fail, json, preflight, serviceClient } from "../_shared/mobile.ts";

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const auth = req.headers.get("Authorization");
  if (!auth) return fail("INVALID_CREDENTIALS", 401);
  // Client au nom de l'utilisateur : la RLS / current_org_id() identifient son organisation.
  const user = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data, error } = await user.rpc("mobile_backup_key");
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row?.organization_id) return fail("INVALID_CREDENTIALS", 401);
  if (row.public_key) return json({ public_key: row.public_key });

  const kp = nacl.box.keyPair();
  const { data: stored, error: storeError } = await serviceClient().rpc("backup_key_store", {
    p_organization_id: row.organization_id, p_public_key: toBase64(kp.publicKey), p_secret_key: toBase64(kp.secretKey),
  });
  if (storeError || !stored) return json({ error: "KEY_UNAVAILABLE" }, 500);
  return json({ public_key: stored });
});
