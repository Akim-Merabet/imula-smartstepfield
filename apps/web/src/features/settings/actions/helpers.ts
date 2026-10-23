import "server-only";
import { createClient } from "@/lib/supabase/server";

type Usage = { table: string; column: string; label: string; filter?: (q: any) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Compte les références à un élément (dépendances bloquant la suppression). Renvoie les libellés utilisés. */
export async function findUsages(id: string, usages: Usage[]): Promise<{ label: string; count: number }[]> {
  const supabase = await createClient();
  const results = await Promise.all(usages.map(async (u) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (supabase.from as any)(u.table).select(u.column, { count: "exact", head: true }).eq(u.column, id);
    if (u.filter) q = u.filter(q);
    const { count } = await q;
    return { label: u.label, count: count ?? 0 };
  }));
  return results.filter((r) => r.count > 0);
}
