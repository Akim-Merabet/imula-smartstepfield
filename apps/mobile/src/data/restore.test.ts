import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import type { Db } from "./form-response";
import { replayPending, restoreLocalTables, same, type TableInfo } from "./restore";

const TABLES: TableInfo[] = [
  { name: "signatures", columns: ["block_id", "state", "comment"], insertOnly: false },
  { name: "steps", columns: ["name", "validated_at"], insertOnly: false },
  { name: "step_navigation_events", columns: ["step_id", "event"], insertOnly: true },
  { name: "offline_selection", columns: ["flow_id", "project_id", "subscribed_at"], insertOnly: false },
  { name: "value_change_signatures", columns: ["response_id", "option_lineage_id", "signature"], insertOnly: false },
];

/** Base SQLite en mémoire (node:sqlite) exposant l'interface utilisée par l'app ; les instructions sont journalisées. */
function memoryDb() {
  const sql = new DatabaseSync(":memory:");
  for (const t of TABLES) sql.exec(`create table ${t.name} (id text primary key, ${t.columns.map((c) => `${c} text`).join(", ")})`);
  const log: string[] = [];
  const tx = {
    execute: async (q: string, p: unknown[] = []) => {
      log.push(q.split(" ").slice(0, 3).join(" "));
      return sql.prepare(q).run(...(p as never[]));
    },
    getOptional: async <R,>(q: string, p: unknown[] = []) => (sql.prepare(q).get(...(p as never[])) as R) ?? null,
  };
  const db = { writeTransaction: async <T,>(fn: (t: typeof tx) => Promise<T>) => fn(tx) } as unknown as Pick<Db, "writeTransaction">;
  return { sql, db, log };
}

describe("restauration d'une sauvegarde", () => {
  it("rejoue les écritures absentes et ignore celles déjà appliquées", async () => {
    const { sql, db, log } = memoryDb();
    sql.exec("insert into steps (id, name, validated_at) values ('st1', 'Étape', null), ('st2', 'Autre', '2026-10-24')");
    sql.exec("insert into signatures (id, block_id, state) values ('sigOld', 'b', 'signed')");
    const report = await replayPending(db, {
      pending: [
        { crud_id: 1, op: "PUT", type: "signatures", id: "sigNew", data: { block_id: "b", state: "signed", unknown_col: 1 } },
        { crud_id: 2, op: "PUT", type: "signatures", id: "sigOld", data: { block_id: "b", state: "signed" } },
        { crud_id: 3, op: "PATCH", type: "steps", id: "st1", data: { validated_at: "2026-10-24" } },
        { crud_id: 4, op: "PATCH", type: "steps", id: "st2", data: { validated_at: "2026-10-24" } },
        { crud_id: 5, op: "PATCH", type: "steps", id: "absent", data: { validated_at: "x" } },
        { crud_id: 6, op: "PUT", type: "step_navigation_events", id: "ev1", data: { step_id: "st1", event: "open" } },
        { crud_id: 7, op: "DELETE", type: "signatures", id: "sigOld" },
        { crud_id: 8, op: "PUT", type: "offline_selection", id: "o1", data: { flow_id: "f" } },
        { crud_id: 9, op: "PUT", type: "inconnue", id: "x", data: {} },
        { crud_id: 10, raw: "{corrompu" },
      ],
      tables: {},
    }, TABLES);
    expect(report).toEqual({ replayed: 4, alreadyApplied: 2, missing: 1, ignored: 3 });
    expect(sql.prepare("select id, state from signatures").all()).toEqual([{ id: "sigNew", state: "signed" }]);
    expect(sql.prepare("select validated_at from steps where id = 'st1'").get()).toEqual({ validated_at: "2026-10-24" });
    expect(sql.prepare("select count(*) as n from step_navigation_events").get()).toEqual({ n: 1 });
    // Ordre d'origine conservé ; la modification déjà appliquée ne produit aucune écriture.
    expect(log).toEqual(["insert into signatures", "update steps set", "insert into step_navigation_events", "delete from signatures"]);
  });

  it("compare les horodatages en instants", () => {
    expect(same("2026-10-24T17:40:22.771Z", "2026-10-24T17:40:22.771+00:00")).toBe(true);
    expect(same("2026-10-24T17:40:22.771Z", "2026-10-24T17:40:23.000+00:00")).toBe(false);
    expect(same(1, "1")).toBe(true);
    expect(same(null, undefined)).toBe(true);
    expect(same("a", null)).toBe(false);
  });

  it("un second import ne rejoue rien", async () => {
    const { db } = memoryDb();
    const payload = { pending: [{ op: "PUT", type: "signatures", id: "s", data: { state: "signed" } }, { op: "DELETE", type: "signatures", id: "s" }], tables: {} };
    expect((await replayPending(db, payload, TABLES)).replayed).toBe(2);
    expect(await replayPending(db, { ...payload, pending: payload.pending.slice(1) }, TABLES)).toEqual({ replayed: 0, alreadyApplied: 1, missing: 0, ignored: 0 });
  });

  it("restaure les tables propres à l'appareil sans doublon", async () => {
    const { sql, db } = memoryDb();
    sql.exec("insert into offline_selection (id, flow_id, project_id) values ('o1', 'f1', 'p')");
    const n = await restoreLocalTables(db, {
      pending: [],
      tables: {
        offline_selection: [{ id: "autre", flow_id: "f1", project_id: "p" }, { id: "o2", flow_id: "f2", project_id: "p", inconnue: 1 }],
        value_change_signatures: [{ id: "v1", response_id: "r", option_lineage_id: "o", signature: "{}" }, { id: "v2", response_id: null }],
        app_logs: [{ id: "l1" }],
      },
    }, TABLES);
    expect(n).toBe(2);
    expect(sql.prepare("select flow_id from offline_selection order by flow_id").all()).toEqual([{ flow_id: "f1" }, { flow_id: "f2" }]);
    expect(sql.prepare("select count(*) as n from value_change_signatures").get()).toEqual({ n: 1 });
  });
});
