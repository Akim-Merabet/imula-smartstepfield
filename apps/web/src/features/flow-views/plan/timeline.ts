import {
  addDays, addMonths, addQuarters, addWeeks, addYears, differenceInCalendarDays, format, getISOWeek, getQuarter,
  startOfDay, startOfMonth, startOfQuarter, startOfWeek, startOfYear, type Locale,
} from "date-fns";

export const PERIODS = ["day", "week", "month", "quarter", "year"] as const;
export type Period = (typeof PERIODS)[number];

/** Pixels par jour selon la période d'affichage. */
export const PX_PER_DAY: Record<Period, number> = { day: 40, week: 16, month: 4, quarter: 1.6, year: 0.5 };

type Unit = "day" | "week" | "month" | "quarter" | "year";
const START: Record<Unit, (d: Date) => Date> = {
  day: startOfDay, week: (d) => startOfWeek(d, { weekStartsOn: 1 }), month: startOfMonth, quarter: startOfQuarter, year: startOfYear,
};
const ADD: Record<Unit, (d: Date, n: number) => Date> = { day: addDays, week: addWeeks, month: addMonths, quarter: addQuarters, year: addYears };

/** Unités des deux lignes d'en-tête (haut / bas) par période. */
export const HEADER_UNITS: Record<Period, [Unit, Unit]> = {
  day: ["month", "day"], week: ["month", "week"], month: ["year", "month"], quarter: ["year", "quarter"], year: ["year", "year"],
};

export type Cell = { key: string; start: Date; days: number; label: string };

export function cells(unit: Unit, from: Date, to: Date, locale: Locale, prefix: { week: string; quarter: string }): Cell[] {
  const out: Cell[] = [];
  let cur = START[unit](from);
  while (cur < to) {
    const next = ADD[unit](cur, 1);
    const s = cur < from ? from : cur;
    const e = next > to ? to : next;
    const label = unit === "day" ? format(cur, "EEEEE d", { locale })
      : unit === "week" ? `${prefix.week}${getISOWeek(cur)}`
      : unit === "month" ? format(cur, "MMM yyyy", { locale })
      : unit === "quarter" ? `${prefix.quarter}${getQuarter(cur)} ${format(cur, "yyyy")}`
      : format(cur, "yyyy");
    out.push({ key: cur.toISOString(), start: s, days: differenceInCalendarDays(e, s), label });
    cur = next;
  }
  return out;
}

/** Plage affichée : englobe les barres, les jalons et aujourd'hui, alignée sur l'unité haute. */
export function computeRange(dates: Date[], period: Period): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  const all = [...dates, today];
  const min = new Date(Math.min(...all.map((d) => d.getTime())));
  const max = new Date(Math.max(...all.map((d) => d.getTime())));
  const unit = HEADER_UNITS[period][0];
  const margin = { day: 14, week: 45, month: 120, quarter: 365, year: 730 }[period];
  const from = START[unit](addDays(min, -margin));
  const to = ADD[unit](START[unit](addDays(max, margin)), 1);
  return { from, to };
}

export const dayOffset = (from: Date, d: Date) => (d.getTime() - from.getTime()) / 86_400_000;
