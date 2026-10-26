import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { staleOfflineSelectionQuery } from "./sql";

describe("purge de la sélection hors ligne", () => {
  it("retient les flows non téléchargeables, sans statut ou absents de la base locale", () => {
    const sql = new DatabaseSync(":memory:");
    sql.exec(`create table offline_selection (id text primary key, flow_id text, project_id text);
      create table flow_summaries (id text primary key, custom_status_id text);
      create table custom_statuses (id text primary key, downloadable integer);
      insert into custom_statuses values ('op', 1), ('prep', 0), ('vide', null);
      insert into flow_summaries values ('ok', 'op'), ('prep', 'prep'), ('vide', 'vide'), ('sans', null);
      insert into offline_selection values ('1', 'ok', 'p'), ('2', 'prep', 'p'), ('3', 'vide', 'p'), ('4', 'sans', 'p'),
        ('5', 'disparu', 'p');`);
    const [query, params] = staleOfflineSelectionQuery;
    const rows = sql.prepare(query).all(...(params as never[])) as { flow_id: string }[];
    expect(rows.map((r) => r.flow_id).sort()).toEqual(["disparu", "prep", "sans", "vide"]);
  });
});
