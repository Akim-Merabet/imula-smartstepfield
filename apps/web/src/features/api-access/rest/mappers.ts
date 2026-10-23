/** Utilitaires de mise en forme des objets API (vocabulaire « Concordance-API-IHM »). */

export const upper = <T extends string | null | undefined>(v: T) => (v ? v.toUpperCase() : null);

export const MANAGEMENT_PROPERTIES = "MANAGEMENT_PROPERTIES" as const;

type Traced = {
  created_at?: string | null; updated_at?: string | null; created_by?: string | null; updated_by?: string | null; deleted_at?: string | null;
};

/** Bloc `managementProperties` (embed MANAGEMENT_PROPERTIES). */
export function managementProperties(row: Traced) {
  return {
    createdAt: row.created_at ?? null,
    modifiedAt: row.updated_at ?? null,
    createdById: row.created_by ?? null,
    modifiedById: row.updated_by ?? null,
    deletedAt: row.deleted_at ?? null,
  };
}

export function withEmbeds<T extends object>(base: T, embeds: Record<string, unknown>): T & Record<string, unknown> {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(embeds)) if (v !== undefined) out[k] = v;
  return out as T & Record<string, unknown>;
}

/** Valeur d'attribut personnalisé → `listValues` (chaînes). */
export function attributeValues(v: { value_text: string | null; value_json: unknown }): string[] {
  if (Array.isArray(v.value_json)) return v.value_json.map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
  return v.value_text === null || v.value_text === "" ? [] : [v.value_text];
}

export const CUSTOM_FIELD_TYPE_API: Record<string, string> = {
  text: "TEXT", textarea: "TEXT_AREA", label: "TITLE", integer: "INTEGER", double: "DECIMAL", boolean: "BOOLEAN",
  date: "DATE", datetime: "DATETIME", select: "SINGLE_SELECT", multiselect: "MULTI_SELECT", file: "FILE", image: "IMAGE",
  metadata: "METADATA", link: "HYPERTEXT_LINK",
};
