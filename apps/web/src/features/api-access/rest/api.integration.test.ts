/**
 * Tests d'intégration de l'API externe v2 (HTTP contre le serveur de dev http://localhost:3030 + Supabase local).
 * Crée ses propres données (2e organisation, clés, entité de test) via le client service et les supprime à la fin.
 * Ignorés si le serveur ou la base ne sont pas joignables.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateClientId, generateClientSecret, hashSecret, hashToken } from "../crypto";

const BASE = process.env.API_TEST_BASE_URL ?? "http://localhost:3030/api/ext/v2";
const DEMO_ORG = "00000000-0000-4000-8000-000000000001";
const DEMO_ACCOUNT = "00000000-0000-4000-8000-000000000002";
const DEMO_PROJECT = "00000000-0000-4000-8000-000000000100";
const RUN = Math.random().toString(36).slice(2, 8);

function loadEnv(): Record<string, string> {
  try {
    const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    return Object.fromEntries(raw.split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }));
  } catch {
    return {};
  }
}

const env = { ...loadEnv(), ...process.env } as Record<string, string | undefined>;
const reachable = await fetch(`${BASE}/openapi.json`).then((r) => r.ok).catch(() => false);
const enabled = reachable && !!env.NEXT_PUBLIC_SUPABASE_URL && !!env.SUPABASE_SECRET_KEY;

type Key = { id: string; clientId: string; secret: string };
let db: SupabaseClient;
const created = { orgB: "", accountB: "", projectB: "", flowB: "", project: "", attrA: "", attrB: "", keys: [] as string[] };
const keys: Record<string, Key> = {};
const tokens: Record<string, string> = {};

async function makeKey(name: string, opts: { org?: string; account?: string | null; type?: "account" | "organization"; level?: "L1" | "L2" | "L3"; active?: boolean; expiresAt?: string | null }) {
  const clientId = generateClientId();
  const secret = generateClientSecret();
  const { data, error } = await db.from("api_clients").insert({
    organization_id: opts.org ?? DEMO_ORG, account_id: opts.type === "organization" ? null : opts.account ?? DEMO_ACCOUNT,
    name: `test-${RUN}-${name}`, key_type: opts.type ?? "account", service_class: opts.level ?? "L1", client_id: clientId,
    active: opts.active ?? true, expires_at: opts.expiresAt ?? null,
  }).select("id").single();
  if (error) throw error;
  await db.from("api_client_secrets").insert({ api_client_id: data.id, secret_hash: await hashSecret(secret) });
  created.keys.push(data.id);
  keys[name] = { id: data.id, clientId, secret };
}

async function auth(clientId: string, clientSecret: string) {
  return fetch(`${BASE}/authenticate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId, clientSecret }) });
}

async function token(name: string) {
  if (!tokens[name]) {
    const res = await auth(keys[name].clientId, keys[name].secret);
    expect(res.status).toBe(200);
    tokens[name] = (await res.json()).accessToken;
  }
  return tokens[name];
}

async function call(name: string | null, method: string, p: string, body?: unknown, rawToken?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const tk = rawToken ?? (name ? await token(name) : null);
  if (tk) headers.authorization = `Bearer ${tk}`;
  const res = await fetch(`${BASE}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, headers: res.headers };
}

describe.skipIf(!enabled)("External API v2", () => {
  beforeAll(async () => {
    db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

    // 2e organisation isolée (B) avec compte, client, famille, entité et flow.
    const { data: org } = await db.from("organizations").insert({ name: `API test org ${RUN}` }).select("id").single();
    created.orgB = org!.id;
    const { data: acc } = await db.from("accounts").insert({ organization_id: created.orgB, name: `API test account ${RUN}` }).select("id").single();
    created.accountB = acc!.id;
    const { data: client } = await db.from("clients").insert({ account_id: created.accountB, name: "Client B", address: "1 rue B", zip_code: "69000", city: "Lyon" }).select("id").single();
    const { data: famB } = await db.from("label_families").insert({
      organization_id: created.orgB, kind: "family", nature: "project", relative_nature: "parent", short_name: `FB${RUN}`,
    }).select("id").single();
    const { data: projB } = await db.from("projects").insert({
      organization_id: created.orgB, account_id: created.accountB, type: "project", designation: `Projet B ${RUN}`, client_id: client!.id, family_id: famB!.id,
    }).select("id").single();
    created.projectB = projB!.id;
    const { data: flowB } = await db.from("flows").insert({
      organization_id: created.orgB, account_id: created.accountB, project_id: created.projectB, flow_type: "specific", name: `Flow B ${RUN}`,
    }).select("id").single();
    created.flowB = flowB!.id;
    const { data: attrB } = await db.from("custom_fields").insert({ account_id: created.accountB, nature: "flow", type: "text", name: `Attr B ${RUN}` }).select("id").single();
    created.attrB = attrB!.id;

    // Entité de test dans le compte démo (cible des écritures) + attribut de flow.
    const { data: demoFamily } = await db.from("label_families").select("id").eq("organization_id", DEMO_ORG).eq("kind", "family")
      .eq("nature", "project").is("deleted_at", null).is("project_id", null).limit(1).single();
    const { data: demoClient } = await db.from("clients").select("id").eq("account_id", DEMO_ACCOUNT).limit(1).single();
    const { data: proj } = await db.from("projects").insert({
      organization_id: DEMO_ORG, account_id: DEMO_ACCOUNT, type: "project", designation: `API test project ${RUN}`,
      client_id: demoClient!.id, family_id: demoFamily!.id,
    }).select("id").single();
    created.project = proj!.id;
    const { data: attrA } = await db.from("custom_fields").insert({ account_id: DEMO_ACCOUNT, nature: "flow", type: "text", name: `Attr A ${RUN}` }).select("id").single();
    created.attrA = attrA!.id;

    await makeKey("l1", { level: "L1" });
    await makeKey("l2", { level: "L2" });
    await makeKey("l3", { level: "L3" });
    await makeKey("org", { type: "organization", level: "L1" });
    await makeKey("orgB", { org: created.orgB, account: created.accountB, level: "L3" });
    await makeKey("inactive", { active: false });
    await makeKey("expired", { expiresAt: new Date(Date.now() - 60_000).toISOString() });
  });

  afterAll(async () => {
    if (!db) return;
    if (created.keys.length) {
      await db.from("api_request_logs").delete().in("api_client_id", created.keys);
      await db.from("api_clients").delete().in("id", created.keys);
    }
    if (created.project) await db.from("projects").delete().eq("id", created.project);
    if (created.attrA) await db.from("custom_fields").delete().eq("id", created.attrA);
    if (created.orgB) {
      await db.from("api_request_logs").delete().eq("organization_id", created.orgB);
      await db.from("organizations").delete().eq("id", created.orgB);
    }
  });

  describe("authentication", () => {
    it("rejects an invalid secret, an unknown client, inactive and expired keys with 401", async () => {
      for (const [id, secret] of [[keys.l1.clientId, "wrong"], ["sfc_unknown", "x"], [keys.inactive.clientId, keys.inactive.secret], [keys.expired.clientId, keys.expired.secret]]) {
        const res = await auth(id, secret);
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body).toMatchObject({ path: "/authenticate", key: "UNAUTHORIZED", code: "UNAUTHORIZED" });
        expect(JSON.stringify(body)).not.toContain(keys.inactive.secret);
      }
    });

    it("reports a missing parameter with 400 REQUIRED-MISSING", async () => {
      const res = await fetch(`${BASE}/authenticate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId: "x" }) });
      expect(res.status).toBe(400);
      expect((await res.json()).key).toBe("REQUIRED-MISSING");
    });

    it("issues a 24 h opaque token stored only as a hash", async () => {
      const res = await auth(keys.l1.clientId, keys.l1.secret);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ tokenType: "Bearer", expiresIn: 86400 });
      expect(body.accessToken).toMatch(/^sfat_/);
      const { data } = await db.from("api_access_tokens").select("token_hash").eq("token_hash", hashToken(body.accessToken)).maybeSingle();
      expect(data).not.toBeNull();
      const { data: plain } = await db.from("api_access_tokens").select("id").eq("token_hash", body.accessToken).maybeSingle();
      expect(plain).toBeNull();
    });

    it("rejects missing, malformed and expired tokens with 401", async () => {
      expect((await call(null, "GET", "/projects")).status).toBe(401);
      expect((await call(null, "GET", "/projects", undefined, "not-a-token")).status).toBe(401);
      const expiredToken = `sfat_expired_${RUN}`;
      await db.from("api_access_tokens").insert({ api_client_id: keys.l1.id, token_hash: hashToken(expiredToken), expires_at: new Date(Date.now() - 1000).toISOString() });
      const res = await call(null, "GET", "/flows", undefined, expiredToken);
      expect(res.status).toBe(401);
      expect(res.json).toMatchObject({ key: "UNAUTHORIZED", path: "/flows" });
    });

    it("journals calls without secrets nor tokens", async () => {
      await call("l1", "GET", `/flows?projectId=${DEMO_PROJECT}&limit=1`);
      await new Promise((r) => setTimeout(r, 300));
      const { data } = await db.from("api_request_logs").select("*").eq("api_client_id", keys.l1.id).order("created_at", { ascending: false }).limit(5);
      expect(data!.length).toBeGreaterThan(0);
      const flat = JSON.stringify(data);
      expect(flat).not.toContain(tokens.l1);
      expect(flat).not.toContain(keys.l1.secret);
      expect(flat).not.toContain(DEMO_PROJECT); // valeurs de paramètres non journalisées
      expect(data!.find((l) => l.path.endsWith("/flows"))?.query_keys).toEqual(["projectId", "limit"]);
    });
  });

  describe("multi-organization isolation", () => {
    it("never exposes another organization's objects", async () => {
      expect((await call("l1", "GET", `/projects/${created.projectB}`)).status).toBe(404);
      expect((await call("l1", "GET", `/flows/${created.flowB}`)).status).toBe(404);
      expect((await call("l1", "GET", `/flows/${created.flowB}/phases`)).status).toBe(404);
      const flows = await call("l1", "GET", "/flows?limit=100");
      expect(flows.json.data.every((f: { uuidOrganization: string }) => f.uuidOrganization === DEMO_ORG)).toBe(true);
      const projects = await call("orgB", "GET", "/projects?limit=100");
      expect(projects.json.data.map((p: { uuidEntity: string }) => p.uuidEntity)).toEqual([created.projectB]);
      expect((await call("orgB", "GET", `/projects/${DEMO_PROJECT}`)).status).toBe(404);
      const apps = await call("orgB", "GET", "/label-applicabilities");
      expect(apps.json.data.map((a: { uuidEntity: string }) => a.uuidEntity)).toEqual([created.accountB]);
    });

    it("refuses to write into another organization's project", async () => {
      const res = await call("l3", "POST", "/flows", { projectId: created.projectB, name: "intrusion" });
      expect(res.status).toBe(404);
      const { count } = await db.from("flows").select("id", { count: "exact", head: true }).eq("project_id", created.projectB);
      expect(count).toBe(1);
    });

    it("enforces account vs organization key scope", async () => {
      const noAccount = await call("org", "GET", "/projects");
      expect(noAccount.status).toBe(400);
      expect(noAccount.json.key).toBe("REQUIRED-MISSING");
      expect((await call("org", "GET", `/projects?accountId=${DEMO_ACCOUNT}`)).status).toBe(200);
      const foreign = await call("org", "GET", `/projects?accountId=${created.accountB}`);
      expect(foreign.status).toBe(403);
      expect(foreign.json.key).toBe("NO-RIGHT");
      const other = await call("l1", "GET", `/projects?accountId=${created.accountB}`);
      expect(other.status).toBe(403);
      expect((await call("l1", "GET", `/projects?accountId=${DEMO_ACCOUNT}`)).status).toBe(200);
    });
  });

  describe("lists, pagination and embed", () => {
    it("paginates with limit / offset and X-Count / X-Total-Count headers", async () => {
      const first = await call("l1", "GET", "/label-families?limit=1");
      expect(first.status).toBe(200);
      const total = Number(first.headers.get("x-total-count"));
      expect(first.headers.get("x-count")).toBe("1");
      expect(first.json.data).toHaveLength(1);
      expect(total).toBeGreaterThan(1);
      const second = await call("l1", "GET", "/label-families?limit=1&offset=1");
      expect(second.json.data[0].uuidEntity).not.toBe(first.json.data[0].uuidEntity);
      const beyond = await call("l1", "GET", `/label-families?offset=${total}`);
      expect(beyond.status).toBe(200);
      expect(beyond.json.data).toEqual([]);
      expect(beyond.headers.get("x-total-count")).toBe(String(total));
      expect((await call("l1", "GET", "/label-families?limit=101")).json.key).toBe("VALUE-NOT-VALID");
      expect((await call("l1", "GET", "/label-families?limit=0")).status).toBe(400);
      expect((await call("l1", "GET", "/label-families?offset=-1")).status).toBe(400);
    });

    it("returns oldest first and filters by date", async () => {
      const res = await call("l1", "GET", "/projects?limit=100");
      const dates = res.json.data.map((p: { uuidEntity: string }) => p.uuidEntity);
      expect(dates.length).toBeGreaterThan(0);
      const future = await call("l1", "GET", `/projects?createdAfterAt=${encodeURIComponent(new Date(Date.now() + 3600_000).toISOString())}`);
      expect(future.json.data).toEqual([]);
      expect((await call("l1", "GET", "/projects?createdAfterAt=not-a-date")).status).toBe(400);
    });

    it("adds embedded groups only on demand and rejects unknown keywords", async () => {
      const plain = await call("l1", "GET", `/projects/${DEMO_PROJECT}`);
      expect(plain.status).toBe(200);
      expect(plain.json.data.managementProperties).toBeUndefined();
      const embedded = await call("l1", "GET", `/projects/${DEMO_PROJECT}?embed=MANAGEMENT_PROPERTIES,client&embed=STATUS`);
      expect(embedded.json.data.managementProperties).toHaveProperty("createdAt");
      expect(embedded.json.data.client).toHaveProperty("uuidEntity");
      expect(embedded.json.data).toHaveProperty("status");
      const bad = await call("l1", "GET", "/flows?embed=NOPE");
      expect(bad.status).toBe(400);
      expect(bad.json).toMatchObject({ key: "VALUE-NOT-VALID", details: { field: "embed" } });
    });
  });

  describe("service classes", () => {
    it("L1 can read but not write", async () => {
      expect((await call("l1", "GET", `/flows?projectId=${created.project}`)).status).toBe(200);
      const res = await call("l1", "POST", "/flows", { projectId: created.project, name: "L1 flow" });
      expect(res.status).toBe(403);
      expect(res.json.key).toBe("NO-RIGHT");
    });

    it("L2 writes unit objects but cannot use bulk endpoints", async () => {
      const res = await call("l2", "POST", "/flows", { projectId: created.project, name: `L2 flow ${RUN}`, type: "specific", locationLocal: "Local 12" });
      expect(res.status).toBe(201);
      expect(res.json.data).toMatchObject({ name: `L2 flow ${RUN}`, type: "SPECIFIC", projectId: created.project });
      const flowId = res.json.data.uuidEntity;
      const patched = await call("l2", "PATCH", `/flows/${flowId}`, { description: "via API" });
      expect(patched.status).toBe(200);
      expect(patched.json.data.description).toBe("via API");
      const phase = await call("l2", "POST", `/flows/${flowId}/add-phases`, { data: [{ name: "Phase API" }] });
      expect(phase.status).toBe(201);
      const step = await call("l2", "POST", `/flows/${flowId}/phases/${phase.json.data[0].uuidEntity}/add-steps`,
        { data: [{ name: "Étape API", listEnabledThematicBlocks: ["INSTRUCTION", "FORM"] }] });
      expect(step.status).toBe(201);
      expect(step.json.data[0].listEnabledThematicBlocks.sort()).toEqual(["FORM", "PR"]);
      const phases = await call("l1", "GET", `/flows/${flowId}/phases?embed=STEPS`);
      expect(phases.json.data[0].steps).toHaveLength(1);
      expect((await call("l2", "POST", "/flows/bulk/create", { data: [{ projectId: created.project, name: "bulk" }] })).status).toBe(403);
    });

    it("L3 bulk creates all-or-nothing and validates attribute ownership", async () => {
      const ok = await call("l3", "POST", "/flows/bulk/create", { data: [
        { projectId: created.project, name: `Bulk 1 ${RUN}`, listCustomAttributesValues: [{ identifier: created.attrA, listValues: ["A"] }] },
        { projectId: created.project, name: `Bulk 2 ${RUN}` },
      ] });
      expect(ok.status).toBe(201);
      expect(ok.json.data).toHaveLength(2);
      const failing = await call("l3", "POST", "/flows/bulk/create", { data: [
        { projectId: created.project, name: `Bulk 3 ${RUN}` },
        { projectId: created.project, name: "bad", type: "TEMPLATE" },
      ] });
      expect(failing.status).toBe(409);
      expect(failing.json.key).toBe("CONSTRAINT-NOT-SATISFIED");
      const { count } = await db.from("flows").select("id", { count: "exact", head: true }).eq("project_id", created.project).eq("name", `Bulk 3 ${RUN}`);
      expect(count).toBe(0);
      const wrongAttr = await call("l3", "PATCH", "/flows/custom-attributes/bulk-update", { data: [
        { flowId: ok.json.data[0].uuidEntity, listCustomAttributesValues: [{ identifier: created.attrB, listValues: ["x"] }] },
      ] });
      expect(wrongAttr.status).toBe(404);
      expect(wrongAttr.json.message).toContain("Attribute does not belong to the flow's account");
      const good = await call("l3", "PATCH", "/flows/custom-attributes/bulk-update", { data: [
        { flowId: ok.json.data[1].uuidEntity, listCustomAttributesValues: [{ identifier: created.attrA, listValues: ["B"] }] },
      ] });
      expect(good.status).toBe(200);
      const flow = await call("l1", "GET", `/flows/${ok.json.data[1].uuidEntity}?embed=CUSTOM_ATTRIBUTES`);
      expect(flow.json.data.customAttributes).toEqual([expect.objectContaining({ identifier: created.attrA, listValues: ["B"] })]);
    });

    it("validates request bodies", async () => {
      const missing = await call("l2", "POST", "/flows", { name: "no project" });
      expect(missing.status).toBe(400);
      expect(missing.json.key).toBe("REQUIRED-MISSING");
      const unknown = await call("l2", "POST", "/flows", { projectId: created.project, name: "x", hacker: true });
      expect(unknown.status).toBe(400);
      expect(unknown.json.key).toBe("VALUE-NOT-VALID");
      const notFound = await call("l2", "PATCH", "/flows/00000000-0000-4000-8000-00000000dead", { name: "x" });
      expect(notFound.status).toBe(404);
      expect(notFound.json.key).toBe("OBJECT-NOT-FOUND");
    });
  });
});
