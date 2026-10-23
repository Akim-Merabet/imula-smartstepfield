import "server-only";
import type { Db } from "../handler";
import { dbCheck } from "../handler";
import { attributeValues, CUSTOM_FIELD_TYPE_API } from "../mappers";

export type AttributeOut = { identifier: string; name: string; type: string; listValues: string[] };

/** Valeurs d'attributs personnalisés de plusieurs objets (embed CUSTOM_ATTRIBUTES). */
export async function loadAttributes(db: Db, objectIds: string[]): Promise<Map<string, AttributeOut[]>> {
  const out = new Map<string, AttributeOut[]>();
  if (!objectIds.length) return out;
  const rows = dbCheck(await db.from("custom_field_values")
    .select("object_id, value_text, value_json, field:custom_fields!inner(id, name, type, deleted_at)")
    .in("object_id", objectIds));
  for (const r of rows ?? []) {
    if (r.field.deleted_at) continue;
    const list = out.get(r.object_id) ?? [];
    list.push({ identifier: r.field.id, name: r.field.name, type: CUSTOM_FIELD_TYPE_API[r.field.type] ?? r.field.type.toUpperCase(), listValues: attributeValues(r) });
    out.set(r.object_id, list);
  }
  return out;
}

export type StatusOut = { uuidEntity: string; name: string; color: string; category: string | null };

export async function loadStatuses(db: Db, ids: (string | null)[]): Promise<Map<string, StatusOut>> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  const out = new Map<string, StatusOut>();
  if (!unique.length) return out;
  const rows = dbCheck(await db.from("custom_statuses").select("id, name, color, category").in("id", unique));
  for (const s of rows ?? []) out.set(s.id, { uuidEntity: s.id, name: s.name, color: s.color, category: s.category.toUpperCase() });
  return out;
}

export type FamilyOut = { uuidEntity: string; name: string; fullName: string | null; color: string; code: string | null };

export async function loadFamilies(db: Db, ids: (string | null)[]): Promise<Map<string, FamilyOut>> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  const out = new Map<string, FamilyOut>();
  if (!unique.length) return out;
  const rows = dbCheck(await db.from("label_families").select("id, short_name, long_name, color, code").in("id", unique));
  for (const f of rows ?? []) out.set(f.id, { uuidEntity: f.id, name: f.short_name, fullName: f.long_name, color: f.color, code: f.code });
  return out;
}

export type PersonOut = { uuidEntity: string; firstName: string; lastName: string; email: string | null; ssoIdentifier: string | null; registrationNumber: string | null };

export async function loadPeople(db: Db, ids: (string | null)[]): Promise<Map<string, PersonOut>> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  const out = new Map<string, PersonOut>();
  if (!unique.length) return out;
  const rows = dbCheck(await db.from("collaborators").select("id, first_name, last_name, email, sso_identifier, register_number").in("id", unique));
  for (const c of rows ?? []) {
    out.set(c.id, { uuidEntity: c.id, firstName: c.first_name, lastName: c.last_name, email: c.email, ssoIdentifier: c.sso_identifier, registrationNumber: c.register_number });
  }
  return out;
}

/** Vérifie que des identifiants référencés existent dans le périmètre ; renvoie le premier manquant. */
export function firstMissing(wanted: (string | null | undefined)[], found: Iterable<string>): string | null {
  const set = new Set(found);
  for (const w of wanted) if (w && !set.has(w)) return w;
  return null;
}
