import "server-only";
import { createClient } from "@/lib/supabase/server";

export const KPI_FREQUENCIES = ["day", "week", "month", "quarter", "year"] as const;
export type KpiFrequency = (typeof KPI_FREQUENCIES)[number];

/** Bornes [début, fin[ de la période contenant la date de référence. */
export function kpiPeriod(frequency: KpiFrequency, ref: Date) {
  const start = new Date(ref);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (frequency === "day") end.setDate(end.getDate() + 1);
  if (frequency === "week") {
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  }
  if (frequency === "month") { start.setDate(1); end.setTime(start.getTime()); end.setMonth(end.getMonth() + 1); }
  if (frequency === "quarter") {
    start.setDate(1); start.setMonth(Math.floor(start.getMonth() / 3) * 3);
    end.setTime(start.getTime()); end.setMonth(end.getMonth() + 3);
  }
  if (frequency === "year") { start.setMonth(0, 1); end.setTime(start.getTime()); end.setFullYear(end.getFullYear() + 1); }
  return { start, end };
}

export type KpiCounter = { key: string; new: number; total: number };

/** Indicateurs d'usage agrégés sur la période (spec 01 §6.14) — compteurs simples. */
export async function computeKpis(frequency: KpiFrequency, ref: Date, accountIds: string[]) {
  const supabase = await createClient();
  const { start, end } = kpiPeriod(frequency, ref);
  const s = start.toISOString();
  const e = end.toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Q = any;
  const byAccount = (q: Q, column = "account_id") => (accountIds.length ? q.in(column, accountIds) : q);
  const viaFlow = (q: Q) => byAccount(q, "flow.account_id");
  const count = async (table: string, build: (q: Q) => Q, select = "id") => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base = () => build((supabase.from as any)(table).select(select, { count: "exact", head: true }));
    const [{ count: total }, { count: fresh }] = await Promise.all([
      base().lt("created_at", e),
      base().gte("created_at", s).lt("created_at", e),
    ]);
    return { new: fresh ?? 0, total: total ?? 0 };
  };

  const entityFilter = (q: Q) => byAccount(q).is("deleted_at", null).or("type.neq.folder,is_sub_folder.eq.true");
  const [entities, flows, phases, steps, blocks, forms, responses, signatures, users, operators] = await Promise.all([
    count("projects", entityFilter),
    count("flows", (q) => byAccount(q).is("deleted_at", null)),
    count("phases", viaFlow, "id, flow:flows!inner(account_id)"),
    count("steps", viaFlow, "id, flow:flows!inner(account_id)"),
    count("blocks", viaFlow, "id, flow:flows!inner(account_id)"),
    count("forms", (q) => byAccount(q).is("deleted_at", null)),
    count("form_responses", (q) => byAccount(q).is("deleted_at", null)),
    count("signatures", (q) => viaFlow(q).eq("state", "signed"), "id, flow:flows!inner(account_id)"),
    count("collaborators", (q) => byAccount(q).eq("kind", "user").not("status", "in", "(inactive,deleted)")),
    count("collaborators", (q) => byAccount(q).eq("kind", "operator").not("status", "in", "(inactive,deleted)")),
  ]);

  const head = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return byAccount((supabase.from as any)(table).select("id", { count: "exact", head: true }));
  };
  const [webActivated, webActive, mobileOperators, tablets, tabletsActive] = await Promise.all([
    head("collaborators").eq("kind", "user").eq("status", "active"),
    head("collaborators").eq("kind", "user").eq("status", "active").gte("last_sign_in_at", s).lt("last_sign_in_at", e),
    head("collaborators").eq("kind", "operator").eq("status", "active"),
    head("tablets").is("deleted_at", null).eq("status", "active"),
    head("tablets").is("deleted_at", null).gte("last_push_at", s).lt("last_push_at", e),
  ]);

  const usage: KpiCounter[] = [
    { key: "entities", ...entities }, { key: "flows", ...flows }, { key: "phases", ...phases }, { key: "steps", ...steps },
    { key: "blocks", ...blocks }, { key: "forms", ...forms }, { key: "responses", ...responses },
    { key: "signatures", ...signatures }, { key: "users", ...users }, { key: "operators", ...operators },
  ];
  const licences = [
    { key: "webActivated", value: webActivated.count ?? 0 },
    { key: "webActive", value: webActive.count ?? 0 },
    { key: "mobileOperators", value: mobileOperators.count ?? 0 },
    { key: "tablets", value: tablets.count ?? 0 },
    { key: "tabletsActive", value: tabletsActive.count ?? 0 },
  ];
  return { start, end, usage, licences };
}
