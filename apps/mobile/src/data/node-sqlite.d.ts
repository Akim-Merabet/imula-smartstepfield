// Typage minimal de node:sqlite, utilisé par les tests Vitest (exécutés sous Node) sans tirer @types/node dans l'app.
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): { run(...params: unknown[]): unknown; get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] };
  }
}
