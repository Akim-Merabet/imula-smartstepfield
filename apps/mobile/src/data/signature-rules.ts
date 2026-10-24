// Règles de saisie d'une signature du bloc Contrôles (spec 05 §7.4), appliquées avant l'écriture locale.
// Le serveur les revérifie à l'envoi (mobile_sign) ; sans dépendance React : testable.
import type { SignatureNature } from "@imula/flow-core";

export type SignMode = "person" | "proxy" | "not_applicable";
export type SignatoryKind = "list" | "qr" | "not_listed" | "external";

export type SignatureDraft = {
  mode: SignMode;
  kind: SignatoryKind;
  signatoryId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  profession: string;
  company: string;
  principalFirstName: string;
  principalLastName: string;
  /** JJ/MM/AAAA et HH:MM saisis par l'utilisateur. */
  date: string;
  time: string;
  proxyDate: string;
  proxyTime: string;
  comment: string;
  drawing: string | null;
  /** « Signer plus tard » : case créée en attente, sans dessin. */
  later: boolean;
};

export type SignatureContext = {
  nature: SignatureNature;
  /** Signatures actives de l'étape (R-SIG-2) : collaborateur signataire et nature. */
  stepSignatures: { signatory_id: string | null; nature: string }[];
  /** Liste restreinte du flow (collaborateurs + responsables), null si aucune. */
  restricted: Set<string> | null;
  now: Date;
};

export type SignatureErrorKey =
  | "drawingRequired" | "signatoryRequired" | "identityRequired" | "principalRequired" | "invalidDate" | "futureDate"
  | "proxyDateAfter" | "commentRequired" | "userCantSignRandCt" | "signTwice" | "notInRestrictedList";

export const isExternalNature = (n: SignatureNature) => n.endsWith("_ext_1") || n.endsWith("_ext_2") || n.endsWith("_ext_3");

const pad2 = (n: number) => String(n).padStart(2, "0");
export const formatDay = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
export const formatTime = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** JJ/MM/AAAA + HH:MM (heure locale) → Date, ou null si invalide. */
export function parseDateTime(day: string, time: string): Date | null {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(day.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!d || !t) return null;
  const [dd, mm, yyyy, hh, mi] = [+d[1], +d[2], +d[3], +t[1], +t[2]];
  const date = new Date(yyyy, mm - 1, dd, hh, mi);
  if (date.getFullYear() !== yyyy || date.getMonth() !== mm - 1 || date.getDate() !== dd || hh > 23 || mi > 59) return null;
  return date;
}

export function emptyDraft(now: Date, nature: SignatureNature): SignatureDraft {
  return {
    mode: "person", kind: isExternalNature(nature) ? "external" : "list", signatoryId: null,
    firstName: "", lastName: "", email: "", profession: "", company: "",
    principalFirstName: "", principalLastName: "",
    date: formatDay(now), time: formatTime(now), proxyDate: formatDay(now), proxyTime: formatTime(now),
    comment: "", drawing: null, later: false,
  };
}

/** Signataire « collaborateur » effectif (liste ou QR), en personne ou non applicable. */
function listedSignatory(d: SignatureDraft): string | null {
  return d.mode !== "proxy" && (d.kind === "list" || d.kind === "qr") ? d.signatoryId : null;
}

/** Première règle non respectée, ou null (spec 05 §7.4). */
export function validateDraft(d: SignatureDraft, ctx: SignatureContext, me: string): SignatureErrorKey | null {
  const signedAt = parseDateTime(d.date, d.time);
  if (!signedAt) return "invalidDate";
  if (signedAt.getTime() > ctx.now.getTime() + 60_000) return "futureDate";

  if (d.mode === "proxy") {
    if (!d.principalFirstName.trim() || !d.principalLastName.trim()) return "principalRequired";
    const proxyAt = parseDateTime(d.proxyDate, d.proxyTime);
    if (!proxyAt) return "invalidDate";
    if (proxyAt > signedAt) return "proxyDateAfter";
  } else if (d.kind === "list" || d.kind === "qr") {
    if (!d.signatoryId) return "signatoryRequired";
    if (ctx.restricted && !ctx.restricted.has(d.signatoryId)) return "notInRestrictedList";
  } else if (!d.firstName.trim() || !d.lastName.trim() || !d.profession.trim()) {
    return "identityRequired";
  }

  // R-SIG-RCT (message d'origine) puis R-SIG-2 : une signature par collaborateur et par étape.
  const signatory = d.mode === "proxy" ? me : listedSignatory(d);
  if (signatory) {
    const previous = ctx.stepSignatures.filter((s) => s.signatory_id === signatory);
    const pair = new Set(["realisation", "tech_control"]);
    if (pair.has(ctx.nature) && previous.some((s) => pair.has(s.nature))) return "userCantSignRandCt";
    if (previous.length) return "signTwice";
  }

  if (d.mode === "not_applicable" && !d.comment.trim()) return "commentRequired";
  // En identification par QR code, le dessin n'est pas exigé.
  if (d.mode !== "not_applicable" && !d.later && !d.drawing && d.kind !== "qr") return "drawingRequired";
  return null;
}

export type DeviceContext = { deviceId: string | null; offline: boolean; holderName: string | null };

/** Ligne locale `signatures` (envoyée telle quelle à mobile_sign). */
export function draftToRow(d: SignatureDraft, ctx: SignatureContext & { blockId: string; stepId: string; flowId: string; me: string },
  device: DeviceContext, id: string) {
  const signedAt = parseDateTime(d.date, d.time)!;
  const proxied = d.mode === "proxy";
  const intern = proxied || d.kind === "list" || d.kind === "qr";
  return {
    id,
    block_id: ctx.blockId,
    step_id: ctx.stepId,
    flow_id: ctx.flowId,
    nature: ctx.nature,
    state: d.mode === "not_applicable" ? "not_possible" : d.later ? "waiting" : "signed",
    contributor_type: intern ? "intern" : d.kind === "external" ? "extern" : "not_listed_intern",
    signatory_id: proxied ? ctx.me : intern ? d.signatoryId : null,
    first_name: intern ? null : d.firstName.trim(),
    last_name: intern ? null : d.lastName.trim(),
    email: intern ? null : d.email.trim() || null,
    company_name: intern ? null : d.company.trim() || null,
    profession: intern ? null : d.profession.trim() || null,
    signature_path: d.mode === "not_applicable" || d.later ? null : d.drawing,
    signed_at: signedAt.toISOString(),
    comment: d.comment.trim() || null,
    sign_with_qr_code: !proxied && d.kind === "qr" ? 1 : 0,
    proxied: proxied ? 1 : 0,
    proxy_principal_first_name: proxied ? d.principalFirstName.trim() : null,
    proxy_principal_last_name: proxied ? d.principalLastName.trim() : null,
    proxy_principal_name: proxied ? `${d.principalFirstName.trim()} ${d.principalLastName.trim()}` : null,
    proxy_holder_name: proxied ? device.holderName : null,
    proxy_date: proxied ? parseDateTime(d.proxyDate, d.proxyTime)!.toISOString() : null,
    source: "mobile",
    disabled: 0,
    created_by: ctx.me,
    created_at: new Date().toISOString(),
    local_created_at: new Date().toISOString(),
    device_id: device.deviceId,
    connection_mode: device.offline ? "offline" : "online",
    latitude: null,
    longitude: null,
  };
}

/** Contenu du « QR Code ID » d'un collaborateur : { v: 1, collaborator_id } (format reconstruit). */
export function parseCollaboratorQr(raw: string): string | null {
  try {
    const data = JSON.parse(raw);
    const id = data?.collaborator_id ?? data?.userRef;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}
