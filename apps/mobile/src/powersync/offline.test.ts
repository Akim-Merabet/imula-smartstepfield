import { DatabaseSync } from "node:sqlite";

import type { AbstractPowerSyncDatabase } from "@powersync/react-native";
import { describe, expect, it, vi } from "vitest";

import { pendingWritesForFlow } from "./offline";

// Remonté avant les imports par vitest : expo-crypto, importé par offline.ts, est un module natif.
vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000000" }));

/** Base en mémoire exposant getAll / getOptional comme PowerSync ; ps_crud contient les écritures en attente. */
function memoryDb(crud: object[]) {
  const sql = new DatabaseSync(":memory:");
  sql.exec(`create table ps_crud (id integer primary key, data text);
    create table form_responses (id text primary key, flow_id text);
    create table form_response_dynamic_items (id text primary key, response_id text);
    create table steps (id text primary key, flow_id text);
    insert into form_responses values ('r1', 'f1'), ('r2', 'f2');
    insert into form_response_dynamic_items values ('i1', 'r1');
    insert into steps values ('s1', 'f1');`);
  for (const op of crud) sql.prepare("insert into ps_crud (data) values (?)").run(JSON.stringify(op));
  return {
    getAll: async (q: string, p: unknown[] = []) => sql.prepare(q).all(...(p as never[])),
    getOptional: async (q: string, p: unknown[] = []) => sql.prepare(q).get(...(p as never[])) ?? null,
  } as unknown as AbstractPowerSyncDatabase;
}

describe("écritures en attente d'un flow", () => {
  it("compte les écritures portant flow_id, celles relues sur la ligne locale et celles d'une réponse du flow", async () => {
    const db = memoryDb([
      { op: "PUT", type: "signatures", id: "x", data: { flow_id: "f1" } },
      { op: "PATCH", type: "steps", id: "s1", data: { validated_at: "2026-10-26" } },
      // ligne ajoutée d'un tableau : seulement response_id (PUT), puis modification partielle sans aucune clé (PATCH)
      { op: "PUT", type: "form_response_dynamic_items", id: "i2", data: { response_id: "r1" } },
      { op: "PATCH", type: "form_response_dynamic_items", id: "i1", data: { position: 2 } },
      { op: "PUT", type: "form_response_dynamic_items", id: "i3", data: { response_id: "r2" } },
      { op: "PATCH", type: "flows", id: "f1", data: { custom_status_id: "s" } },
    ]);
    expect(await pendingWritesForFlow(db, "f1")).toBe(5);
    expect(await pendingWritesForFlow(db, "f2")).toBe(1);
    expect(await pendingWritesForFlow(db, "f3")).toBe(0);
  });
});
