#!/usr/bin/env node
// Génère src/powersync/schema.generated.ts à partir des Sync Streams (infra/powersync/config/sync-config.yaml)
// et du schéma de la base locale (conteneur Postgres Supabase). À relancer après toute modification de l'un ou de l'autre :
//   pnpm --filter @imula/mobile gen:schema
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const container = process.env.CONTAINER ?? "supabase_db_siteflow";
const out = resolve(root, "apps/mobile/src/powersync/schema.generated.ts");

// ----- Requêtes des streams : une entrée « - SELECT … » par requête, sur une ou plusieurs lignes -----
const lines = readFileSync(resolve(root, "infra/powersync/config/sync-config.yaml"), "utf8").split("\n");
const queries = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(\s*)- (SELECT\b.*)$/i);
  if (!m) continue;
  let sql = m[2];
  while (i + 1 < lines.length && /^\s+/.test(lines[i + 1]) && !/^\s*(- |#|[a-z_]+:)/.test(lines[i + 1])) sql += " " + lines[++i].trim();
  queries.push(sql);
}

// ----- Colonnes sélectionnées par table cliente (`FROM source AS cliente` renomme la table côté appareil) -----
// Une ligne reçue par plusieurs streams n'est gardée qu'une fois (la plus récente remplace l'autre) :
// toutes les requêtes d'une même table cliente doivent sélectionner les mêmes colonnes.
const tables = new Map(); // table cliente -> { source, all, columns: Set, signature }
for (const sql of queries) {
  const m = sql.match(/^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+AS\s+(\w+))?\b/i);
  if (!m) throw new Error(`Requête non reconnue : ${sql}`);
  const [, select, source, alias] = m;
  const table = alias ?? source;
  const parts = select.split(",").map((s) => s.replace(/\s+/g, " ").trim());
  const signature = [...parts].sort().join(",");
  const previous = tables.get(table);
  if (previous && previous.signature !== signature) {
    throw new Error(`Table ${table} : colonnes différentes selon les streams (${previous.signature} ≠ ${signature})`);
  }
  const entry = previous ?? { source, all: false, columns: new Set(), signature };
  for (const part of parts) {
    if (part === "*") entry.all = true;
    else entry.columns.add((part.match(/\bAS\s+(\w+)$/i)?.[1] ?? part).trim());
  }
  tables.set(table, entry);
}

// ----- Types des colonnes en base -----
const names = [...tables.keys()];
const sources = [...new Set([...tables.values()].map((e) => e.source))];
const rows = execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-At", "-F", "\t", "-c",
  `select table_name, column_name, udt_name from information_schema.columns
    where table_schema = 'public' and table_name in (${sources.map((n) => `'${n}'`).join(",")})
    order by table_name, ordinal_position`], { encoding: "utf8" }).trim().split("\n").map((l) => l.split("\t"));
const dbColumns = new Map();
for (const [t, c, udt] of rows) dbColumns.set(t, [...(dbColumns.get(t) ?? []), [c, udt]]);

const typeOf = (udt) =>
  /^(int2|int4|int8|bool)$/.test(udt) ? "integer" : /^(numeric|float4|float8)$/.test(udt) ? "real" : "text";
const INDEXED = ["flow_id", "project_id", "step_id", "phase_id", "block_id", "response_id", "form_id", "collaborator_id", "signature_id"];

let body = "";
for (const table of names.sort()) {
  const { source, all, columns } = tables.get(table);
  const known = dbColumns.get(source);
  if (!known) throw new Error(`Table absente de la base : ${source}`);
  const types = new Map(known);
  const selected = all ? known.map(([c]) => c) : [...columns];
  const cols = selected.filter((c) => c !== "id");
  for (const c of cols) if (!types.has(c)) throw new Error(`Colonne absente de la base : ${table}.${c}`);
  const indexes = INDEXED.filter((c) => cols.includes(c));
  body += `  ${table}: new Table(\n    {\n${cols.map((c) => `      ${c}: column.${typeOf(types.get(c))},`).join("\n")}\n    },\n`;
  body += `    { indexes: { ${indexes.map((c) => `${c.replace(/_id$/, "")}: ["${c}"]`).join(", ")} } },\n  ),\n`;
}

writeFileSync(out, `// Fichier généré par scripts/gen-powersync-schema.mjs — ne pas modifier à la main.
// Tables synchronisées par les Sync Streams ; l'identifiant \`id\` (texte) est ajouté par PowerSync.
import { column, Table } from "@powersync/react-native";

export const syncedTables = {
${body}};
`);
console.log(`${names.length} tables → ${out}`);
