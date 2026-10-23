"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { FacetFilter, FilterBar, ToggleFilter } from "@/components/data-table/filter-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Counter = { key: string; new: number; total: number };

/** Usage (KPI) : utilisation globale + licences sur la période choisie. */
export function KpiView({ frequency, start, end, usage, licences, accounts }: {
  frequency: string; start: string; end: string; usage: Counter[]; licences: { key: string; value: number }[];
  accounts: { id: string; name: string }[];
}) {
  const t = useTranslations("settings.kpi");
  const format = useFormatter();
  const router = useRouter();
  const sp = useSearchParams();

  const shift = (dir: -1 | 1) => {
    const ref = new Date(dir < 0 ? new Date(start).getTime() - 1000 : new Date(end).getTime() + 1000);
    const params = new URLSearchParams(sp.toString());
    params.set("month", String(Math.floor(ref.getTime() / 1000)));
    router.replace(`?${params.toString()}`);
  };
  const last = new Date(new Date(end).getTime() - 1);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <FilterBar>
        <ToggleFilter param="frequency" defaultValue="month" options={["day", "week", "month", "quarter", "year"].map((f) => ({ value: f, label: t(`frequencies.${f}`) }))} />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={t("previous")} onClick={() => shift(-1)}><ChevronLeftIcon /></Button>
          <span className="min-w-56 text-center text-sm">
            {format.dateTimeRange(new Date(start), last, { dateStyle: "medium" })}
          </span>
          <Button variant="ghost" size="icon-sm" aria-label={t("next")} onClick={() => shift(1)}><ChevronRightIcon /></Button>
        </div>
        <FacetFilter param="account" label={t("accounts")} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
      </FilterBar>
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">{t("globalUse")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {usage.map((c) => (
            <Card key={c.key} size="sm">
              <CardHeader>
                <CardDescription>{t(`counters.${c.key}` as never)}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{format.number(c.new)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{t("totalOn", { total: format.number(c.total) })}</CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">{t("licences")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {licences.map((l) => (
            <Tooltip key={l.key}>
              <TooltipTrigger asChild>
                <Card size="sm">
                  <CardHeader>
                    <CardDescription>{t(`licenceCounters.${l.key}` as never)}</CardDescription>
                    <CardTitle className="text-2xl tabular-nums">{format.number(l.value)}</CardTitle>
                  </CardHeader>
                </Card>
              </TooltipTrigger>
              <TooltipContent>{t(`licenceHelp.${l.key}` as never)}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </section>
    </div>
  );
}
