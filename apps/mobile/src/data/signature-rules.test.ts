import { describe, expect, it } from "vitest";

import { inflate } from "pako";

import { signatureToPng } from "@/lib/signature-png";

import { draftToRow, emptyDraft, parseCollaboratorQr, parseDateTime, validateDraft } from "./signature-rules";

const now = new Date(2026, 9, 24, 15, 30);
const me = "me";
const ctx = { nature: "realisation" as const, stepSignatures: [], restricted: null, now };
const drawing = "data:image/png;base64,AA";

describe("saisie d'une signature (spec 05 §7.4)", () => {
  it("collaborateur de la liste : signataire puis dessin exigés", () => {
    const d = emptyDraft(now, "realisation");
    expect(validateDraft(d, ctx, me)).toBe("signatoryRequired");
    expect(validateDraft({ ...d, signatoryId: "a" }, ctx, me)).toBe("drawingRequired");
    expect(validateDraft({ ...d, signatoryId: "a", drawing }, ctx, me)).toBeNull();
    expect(validateDraft({ ...d, signatoryId: "a", later: true }, ctx, me)).toBeNull();
  });

  it("QR code : identification sans dessin", () => {
    expect(validateDraft({ ...emptyDraft(now, "realisation"), kind: "qr", signatoryId: "a" }, ctx, me)).toBeNull();
  });

  it("signataire hors liste ou externe : prénom, nom, fonction", () => {
    const ext = emptyDraft(now, "breakpoint_ext_1");
    expect(ext.kind).toBe("external");
    expect(validateDraft({ ...ext, firstName: "A", lastName: "B", drawing }, { ...ctx, nature: "breakpoint_ext_1" }, me)).toBe("identityRequired");
    expect(validateDraft({ ...ext, firstName: "A", lastName: "B", profession: "C", drawing }, { ...ctx, nature: "breakpoint_ext_1" }, me)).toBeNull();
  });

  it("procuration : mandant et date de procuration antérieure", () => {
    const d = { ...emptyDraft(now, "realisation"), mode: "proxy" as const, drawing };
    expect(validateDraft(d, ctx, me)).toBe("principalRequired");
    const full = { ...d, principalFirstName: "P", principalLastName: "Q" };
    expect(validateDraft({ ...full, proxyTime: "15:31" }, ctx, me)).toBe("proxyDateAfter");
    expect(validateDraft({ ...full, proxyTime: "15:00" }, ctx, me)).toBeNull();
    const row = draftToRow({ ...full, proxyTime: "15:00" }, { ...ctx, blockId: "b", stepId: "s", flowId: "f", me }, { deviceId: "d", offline: true, holderName: "Moi" }, "id");
    expect(row).toMatchObject({ proxied: 1, signatory_id: "me", contributor_type: "intern", proxy_principal_name: "P Q", connection_mode: "offline" });
  });

  it("non applicable : commentaire obligatoire, pas de dessin", () => {
    const d = { ...emptyDraft(now, "realisation"), mode: "not_applicable" as const, signatoryId: "a" };
    expect(validateDraft(d, ctx, me)).toBe("commentRequired");
    expect(validateDraft({ ...d, comment: "N/A" }, ctx, me)).toBeNull();
    const row = draftToRow({ ...d, comment: "N/A", drawing }, { ...ctx, blockId: "b", stepId: "s", flowId: "f", me }, { deviceId: null, offline: false, holderName: null }, "id");
    expect(row).toMatchObject({ state: "not_possible", signature_path: null });
  });

  it("R ≠ CT, une signature par collaborateur et par étape, liste restreinte", () => {
    const d = { ...emptyDraft(now, "tech_control"), signatoryId: "a", drawing };
    const tc = { ...ctx, nature: "tech_control" as const };
    expect(validateDraft(d, { ...tc, stepSignatures: [{ signatory_id: "a", nature: "realisation" }] }, me)).toBe("userCantSignRandCt");
    expect(validateDraft({ ...d, kind: "list" }, { ...ctx, nature: "breakpoint_int_1", stepSignatures: [{ signatory_id: "a", nature: "realisation" }] }, me)).toBe("signTwice");
    expect(validateDraft(d, { ...tc, restricted: new Set(["b"]) }, me)).toBe("notInRestrictedList");
  });

  it("dates et QR Code ID", () => {
    expect(parseDateTime("31/02/2026", "10:00")).toBeNull();
    expect(parseDateTime("24/10/2026", "25:00")).toBeNull();
    expect(parseDateTime("24/10/2026", "9:05")?.getHours()).toBe(9);
    expect(validateDraft({ ...emptyDraft(now, "realisation"), date: "25/10/2026", signatoryId: "a", drawing }, ctx, me)).toBe("futureDate");
    expect(parseCollaboratorQr('{"v":1,"collaborator_id":"x"}')).toBe("x");
    expect(parseCollaboratorQr("nope")).toBeNull();
  });
});

describe("dessin → PNG", () => {
  it("produit un PNG RGBA valide, vide si aucun trait", () => {
    expect(signatureToPng([], 10, 10)).toBeNull();
    const url = signatureToPng([[{ x: 1, y: 1 }, { x: 9, y: 4 }]], 10, 5)!;
    const bytes = Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0));
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([20, 10]);
    // IDAT : 10 lignes de (1 octet de filtre + 20 × 4 octets).
    const idatLen = view.getUint32(33);
    expect(inflate(bytes.slice(41, 41 + idatLen)).length).toBe(10 * 81);
  });
});
