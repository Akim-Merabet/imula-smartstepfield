"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryState, parseAsString } from "nuqs";
import { ChevronDownIcon, ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, ExternalLinkIcon, MonitorIcon, SmartphoneIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { useNatureLabel } from "../blocks/dsi-block";
import { SimpleSelect } from "../components/simple-select";
import { expectedNatures, natureCode, natureGroup, numberItems, type SignatureNature, type SupervisionFlow } from "../meta";

type Sig = Tables<"signatures"> & { signatory: { first_name: string; last_name: string; trigram: string } | null };
type Row = { id: string; position: number; custom_number: string | null; exclude_numbering: boolean; name: string; disabled: boolean };
export type SummaryData = {
  flow: (SupervisionFlow & { id: string; name: string; ref_int: string | null; project_id: string }) | null;
  phases: Row[];
  steps: (Row & { phase_id: string })[];
  blocks: { id: string; step_id: string; enabled: boolean; dsi: Tables<"block_dsi_configs"> | null }[];
  signatures: Sig[];
};

const URL_OPTIONS = { shallow: false, history: "replace" } as const;

/** Tableau récapitulatif des signatures d'un flow (§6.4). */
export function SignaturesSummary({ flows, data }: { flows: { value: string; label: string }[]; data: SummaryData | null }) {
  const t = useTranslations("signatures");
  const [flowId, setFlowId] = useQueryState("flow", parseAsString.withOptions(URL_OPTIONS));
  const [stateFilter, setStateFilter] = useQueryState("state", parseAsString.withOptions(URL_OPTIONS));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const flow = data?.flow;
  const natureLabel = useNatureLabel((flow ?? {}) as SupervisionFlow);
  const prefixP = t("summary.prefixPhase");
  const prefixS = t("summary.prefixStep");

  if (!flow || !data) {
    return (
      <>
        <div className="flex gap-2 pb-3"><div className="w-96"><SimpleSelect value={flowId} onChange={(v) => void setFlowId(v)} options={flows} placeholder={t("summary.selectFlow")} /></div></div>
        <Empty className="flex-1 rounded-md border"><EmptyHeader><EmptyTitle>{t("summary.noFlowTitle")}</EmptyTitle><EmptyDescription>{t("summary.noFlowSubtitle")}</EmptyDescription></EmptyHeader></Empty>
      </>
    );
  }

  const numbers = numberItems(data.phases, prefixP);
  for (const p of data.phases) for (const [k, v] of numberItems(data.steps.filter((s) => s.phase_id === p.id), prefixS)) numbers.set(k, v);
  const blockOf = new Map(data.blocks.map((b) => [b.step_id, b]));
  const stepInfo = new Map(data.steps.map((s) => {
    const b = blockOf.get(s.id);
    const natures = b?.enabled && !s.disabled ? expectedNatures(b.dsi, flow) : [];
    const sigs = data.signatures.filter((x) => x.step_id === s.id);
    const done = natures.filter((n) => sigs.some((x) => x.nature === n && (x.state === "signed" || x.state === "not_possible"))).length;
    return [s.id, { block: b, natures, sigs, done }];
  }));
  const infos = [...stepInfo.values()];
  const expected = infos.reduce((a, i) => a + i.natures.length, 0);
  const signed = infos.reduce((a, i) => a + i.done, 0);
  const progress = expected ? Math.round((signed / expected) * 100) : 0;
  const filtered = data.signatures.filter((s) => !stateFilter || s.state === stateFilter).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-96"><SimpleSelect value={flowId} clearable={false} onChange={(v) => void setFlowId(v)} options={flows} placeholder={t("summary.selectFlow")} /></div>
        <div className="w-56"><SimpleSelect value={stateFilter} onChange={(v) => void setStateFilter(v)} placeholder={t("summary.filterState")}
          options={(["signed", "not_possible", "waiting"] as const).map((s) => ({ value: s, label: t(`states.${s}`) }))} /></div>
        <Button variant="secondary" asChild><Link href={`/explore/projects/${flow.project_id}/flow/${flow.id}/content-view`}><ExternalLinkIcon data-icon="inline-start" />{t("summary.open")}</Link></Button>
        <Button variant="ghost" onClick={() => setCollapsed((c) => (c.size ? new Set() : new Set(data.phases.map((p) => p.id))))}>
          {collapsed.size ? <ChevronsUpDownIcon data-icon="inline-start" /> : <ChevronsDownUpIcon data-icon="inline-start" />}{collapsed.size ? t("summary.expandAll") : t("summary.collapseAll")}
        </Button>
        <div className="ml-auto flex items-center gap-4 text-sm text-muted-foreground">
          <span>{t("summary.counters", { total: expected, filtered, signed })}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <h2 className="text-base font-medium">{t("summary.title", { progress })}</h2>
        <Progress value={progress} className="w-60" />
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="text-left text-table-head">
              {["number", "name", "execution", "supervision", "comments"].map((c) => <th key={c} className="h-11 border-b-2 px-3 font-semibold">{t(`summary.columns.${c}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.phases.map((p) => {
              const open = !collapsed.has(p.id);
              const steps = data.steps.filter((s) => s.phase_id === p.id);
              return [
                <tr key={p.id} className={cn("bg-muted/40", p.disabled && "text-muted-foreground line-through")}>
                  <td className="border-b px-3 py-2 font-semibold">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}>
                      {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}{numbers.get(p.id)}
                    </button>
                  </td>
                  <td colSpan={4} className="border-b px-3 py-2 font-medium">{p.name}</td>
                </tr>,
                ...(open ? steps.map((s) => {
                  const info = stepInfo.get(s.id)!;
                  const cell = (group: "execution" | "supervision") => {
                    const natures = info.natures.filter((n) => natureGroup(n) === group);
                    if (!info.block || !info.block.enabled) return group === "execution" ? <Hint label={t("summary.noDsi")} /> : null;
                    if (info.block.dsi?.signatories_status === "disabled") return group === "execution" ? <Hint label={t("summary.dsiDisabled")} /> : null;
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {natures.map((n) => <Pastille key={n} nature={n} label={natureLabel(n)} sig={info.sigs.find((x) => x.nature === n) ?? null}
                          dimmed={!!stateFilter && info.sigs.find((x) => x.nature === n)?.state !== stateFilter} />)}
                        {group === "execution" && info.block.dsi?.signatories_status === "required" && <Hint label={t("summary.required")} />}
                      </div>
                    );
                  };
                  return (
                    <tr key={s.id} className={cn("hover:bg-row-hover", s.disabled && "text-muted-foreground line-through")}>
                      <td className="border-b px-3 py-2 pl-9">{numbers.get(s.id)}</td>
                      <td className="border-b px-3 py-2">{s.name}</td>
                      <td className="border-b px-3 py-2">{cell("execution")}</td>
                      <td className="border-b px-3 py-2">{cell("supervision")}</td>
                      <td className="border-b px-3 py-2 text-xs text-muted-foreground">{info.block?.dsi?.observation ? t("summary.observation", { text: info.block.dsi.observation }) : ""}</td>
                    </tr>
                  );
                }) : []),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Hint({ label }: { label: string }) {
  return <span className="text-xs text-muted-foreground italic">{label}</span>;
}

function Pastille({ nature, label, sig, dimmed }: { nature: SignatureNature; label: string; sig: Sig | null; dimmed: boolean }) {
  const t = useTranslations("signatures");
  const format = useFormatter();
  const state = sig?.state ?? "free";
  const who = sig ? sig.signatory?.trigram ?? `${(sig.first_name ?? "").slice(0, 1)}${(sig.last_name ?? "").slice(0, 2)}`.toUpperCase() : null;
  const color = state === "signed" ? "border-success bg-success-bg text-success" : state === "not_possible" ? "border-muted-foreground bg-muted" : state === "waiting" ? "border-warning bg-warning-bg text-warning" : "border-dashed text-muted-foreground";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs", color, dimmed && "opacity-40")}>
          <span className="font-semibold">{natureCode(nature)}</span>
          {who && <span>{who}</span>}
          {sig && <span>{format.dateTime(new Date(sig.signed_at), { dateStyle: "short" })}</span>}
          {sig && (sig.source === "mobile" ? <SmartphoneIcon className="size-3" /> : <MonitorIcon className="size-3" />)}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="font-medium">{label}</div>
        <div className="flex flex-wrap gap-1 pt-1">
          <Badge variant="secondary">{t(`states.${state}`)}</Badge>
          {sig?.proxied && <Badge variant="secondary">{t("badges.proxiedShort")}</Badge>}
          {sig?.sign_with_qr_code && <Badge variant="secondary">{t("badges.strong")}</Badge>}
        </div>
        {sig && <div className="pt-1 text-xs">{t(`sources.${sig.source}`)}{sig.comment ? ` · ${sig.comment}` : ""}</div>}
      </TooltipContent>
    </Tooltip>
  );
}
