import { describe, expect, it } from "vitest";

import { type AttachmentDb, type FileStore, referencedFiles, referencedPaths, responseFilePath, syncAttachments } from "./queue";

describe("pièces jointes", () => {
  it("chemin Storage : convention de la WebApp, nom assaini", () => {
    expect(responseFilePath("r1", "photos", "chantier été 1.jpg", "id")).toBe("responses/r1/photos/id-chantier_e_te_1.jpg");
  });

  it("fichiers référencés : photos, signatures des réponses et PDF des documents liés", async () => {
    const db = {
      getAll: async (sql: string) => (sql.includes("block_documents") ? [{ path: "projects/p/doc.pdf" }, { path: null }] : [
        { question_type: "photo", value_json: JSON.stringify([{ fileId: "a" }, { fileId: "b" }]) },
        { question_type: "collaborator", value_json: JSON.stringify({ signaturePath: "s" }) },
        { question_type: "photo", value_json: "{illisible" },
      ]),
    } as unknown as AttachmentDb;
    expect((await referencedPaths(db)).sort()).toEqual(["a", "b", "projects/p/doc.pdf", "s"]);
    expect((await referencedFiles(db)).find((f) => f.path === "projects/p/doc.pdf")?.bucket).toBe("documents");
  });

  it("échec d'envoi : la ligne reste en file avec le motif", async () => {
    const calls: string[] = [];
    const db: AttachmentDb = {
      getAll: async (sql: string) => (sql.includes("attachment_queue")
        ? [{ id: "q", bucket: "b", path: "p", state: "upload", mime: null, attempts: 0 }] : []) as never,
      getOptional: async () => ({ n: 1 }) as never,
      execute: async (sql: string) => { calls.push(sql.split(" ")[0]); },
    };
    const store = { exists: () => true, read: async () => new Uint8Array([1]) } as unknown as FileStore;
    const res = await syncAttachments(db, store, {
      upload: async () => ({ error: { message: "new row violates row-level security policy" } }),
      signedUrl: async () => null,
    }, () => "x");
    expect(res).toEqual({ uploaded: 0, downloaded: 0, pending: 1 });
    expect(calls).toEqual(["update"]);
  });
});
