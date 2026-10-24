import { decryptBackup, generateBackupKeyPair } from "@imula/backup-core";
import { describe, expect, it } from "vitest";

import { buildBackupContent, sealBackup } from "./backup";

const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

describe("sauvegarde de la base du profil", () => {
  it("contient les tables et la file d'envoi, relisible avec la clé privée seulement", async () => {
    const db = {
      getAll: async (sql: string) => (sql.includes("ps_crud")
        ? [{ id: 1, tx_id: 7, data: JSON.stringify({ op: "PUT", type: "signatures", id: "s1" }) }]
        : sql.includes("steps") ? [{ id: "e1", name: "Étape" }] : []) as never,
    };
    const content = await buildBackupContent(db, ["steps", "phases", "drop table x"], {
      trigger: "manual", principalId: "p", deviceId: "d", appVersion: "1.0",
    });
    expect(Object.keys(content.tables)).toEqual(["steps", "phases"]);
    expect(content.pending).toEqual([{ crud_id: 1, tx_id: 7, op: "PUT", type: "signatures", id: "s1" }]);
    const keys = generateBackupKeyPair(rnd);
    const back = JSON.parse(new TextDecoder().decode(decryptBackup(sealBackup(content, keys.publicKey, rnd), keys.secretKey)));
    expect(back.tables.steps[0].name).toBe("Étape");
  });
});
