"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { DownloadIcon, EllipsisVerticalIcon, LockIcon, LockOpenIcon, PlayIcon, RefreshCwIcon, SearchIcon, SparklesIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FlowTypeBadge } from "@/features/flows/components/flow-type-badge";
import { MultiSelect } from "@/features/flows/components/multi-select";
import { jobErrorCode, watchJob } from "@/features/jobs/watch-job";
import { refreshReferentials } from "./actions";
import { ExecuteDialog, ImportDialog, RefreshDialog, UnlockDialog } from "./referential-dialogs";
import type { ReferentialFlow } from "./queries";

export function referentialError(t: (k: string) => string, tg: (k: string) => string, code: string) {
  if (code === "forbidden") return tg("toast.forbidden");
  const known = ["has_signatures_or_responses", "source_missing", "not_refreshable", "size_limit", "no_selection", "not_lockable", "invalid_copies", "invalid_target", "job_failed", "timeout"];
  return known.includes(code) ? t(`errors.${code}`) : tg("toast.error");
}

/** « Liste des flows référentiels applicables au projet » (§3.6). */
export function ReferentialList({ projectId, flows, permissions }: {
  projectId: string; flows: ReferentialFlow[];
  permissions: { import: boolean; execute: boolean; refresh: boolean; unlock: boolean };
}) {
  const t = useTranslations("referentials");
  const tf = useTranslations("flows");
  const tg = useTranslations("global");
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<{ type: string[]; family: string[]; status: string[]; entity: string[] }>({ type: [], family: [], status: [], entity: [] });
  const [selected, setSelected] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [executing, setExecuting] = useState<ReferentialFlow[] | null>(null);
  const [refreshing, setRefreshing] = useState<ReferentialFlow | "all" | null>(null);
  const [unlocking, setUnlocking] = useState<ReferentialFlow | null>(null);
  const [, start] = useTransition();

  const opts = useMemo(() => {
    const uniq = <T extends { id: string },>(xs: (T | null)[]) => [...new Map(xs.filter(Boolean).map((x) => [x!.id, x!])).values()];
    return {
      type: [...new Set(flows.map((f) => f.flow_type))].map((v) => ({ value: v, label: tf(`types.${v}`) })),
      family: uniq(flows.map((f) => f.family)).map((f) => ({ value: f.id, label: f.short_name, color: f.color })),
      status: uniq(flows.map((f) => f.status)).map((s) => ({ value: s.id, label: s.name, color: s.color })),
      entity: uniq(flows.map((f) => f.source?.project ?? null)).map((p) => ({ value: p.id, label: p.designation })),
    };
  }, [flows, tf]);

  const list = flows.filter((f) => {
    const q = query.trim().toLowerCase();
    if (q && !f.name.toLowerCase().includes(q) && !(f.ref_int ?? "").toLowerCase().includes(q)) return false;
    if (filters.type.length && !filters.type.includes(f.flow_type)) return false;
    if (filters.family.length && !filters.family.includes(f.family_id ?? "")) return false;
    if (filters.status.length && !filters.status.includes(f.custom_status_id ?? "")) return false;
    if (filters.entity.length && !filters.entity.includes(f.source?.project?.id ?? "")) return false;
    return true;
  });
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-64">
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tg("actions.search")} aria-label={tg("actions.search")} />
        </InputGroup>
        {(["type", "family", "status", "entity"] as const).map((k) => (
          <div key={k} className="w-44"><MultiSelect options={opts[k]} value={filters[k]} onChange={(v) => setFilters({ ...filters, [k]: v })} placeholder={t(`filters.${k}`)} /></div>
        ))}
        {(query || Object.values(filters).some((v) => v.length)) && (
          <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setFilters({ type: [], family: [], status: [], entity: [] }); }}>{tg("actions.clearFilters")}</Button>
        )}
        <div className="ml-auto flex gap-2">
          {permissions.execute && selected.length > 0 && (
            <Button variant="secondary" onClick={() => {
              if (selected.length > 10) { notify.error(t("errors.size_limit")); return; }
              setExecuting(flows.filter((f) => selected.includes(f.id)));
            }}><PlayIcon data-icon="inline-start" />{t("actions.executeSelection", { count: selected.length })}</Button>
          )}
          {permissions.refresh && flows.some((f) => !f.unlocked) && (
            <Button variant="secondary" onClick={() => setRefreshing("all")}><RefreshCwIcon data-icon="inline-start" />{t("actions.refreshAll")}</Button>
          )}
          {permissions.import && <Button onClick={() => setImporting(true)}><DownloadIcon data-icon="inline-start" />{t("import.title")}</Button>}
        </div>
      </div>

      {flows.length === 0 ? (
        <Empty className="flex-1 border"><EmptyHeader><EmptyTitle>{t("emptyTitle")}</EmptyTitle><EmptyDescription>{t("emptySubtitle")}</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-card">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox aria-label={tg("actions.select")} checked={list.length > 0 && list.every((f) => selected.includes(f.id))}
                    onCheckedChange={(v) => setSelected(v ? list.map((f) => f.id) : [])} />
                </TableHead>
                <TableHead className="w-10">{t("columns.type")}</TableHead>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.reference")}</TableHead>
                <TableHead>{t("columns.family")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.index")}</TableHead>
                <TableHead>{t("columns.entity")}</TableHead>
                <TableHead>{t("columns.lastImport")}</TableHead>
                <TableHead>{t("columns.executions")}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((f) => (
                <TableRow key={f.id} className="cursor-pointer" onClick={() => router.push(`/explore/projects/${projectId}/flow/${f.id}/content-view`)}>
                  <TableCell onClick={(e) => e.stopPropagation()}><Checkbox aria-label={f.name} checked={selected.includes(f.id)} onCheckedChange={(v) => toggle(f.id, !!v)} /></TableCell>
                  <TableCell><FlowTypeBadge type={f.flow_type} size="sm" /></TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>{f.unlocked ? <LockOpenIcon className="size-3.5 text-muted-foreground" /> : <LockIcon className="size-3.5 text-muted-foreground" />}</TooltipTrigger>
                        <TooltipContent>{f.unlocked ? t("unlockedTooltip") : t("lockedTooltip")}</TooltipContent>
                      </Tooltip>
                      <span className="font-medium">{f.name}</span>
                      {f.updateAvailable && <Badge variant="secondary" className="gap-1"><SparklesIcon className="size-3" />{t("updateAvailable")}</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>{f.ref_int ?? "—"}</TableCell>
                  <TableCell>{f.family ? <FamilyChip color={f.family.color} shortName={f.family.short_name} longName={f.family.long_name} /> : "—"}</TableCell>
                  <TableCell><StatusBadge color={f.status?.color} label={f.status?.name} /></TableCell>
                  <TableCell>{f.sourced_from_index ?? "—"}</TableCell>
                  <TableCell>{f.source?.project?.designation ?? t("sourceMissing")}</TableCell>
                  <TableCell className="text-xs">{f.lastImport ? new Date(f.lastImport).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : "—"}</TableCell>
                  <TableCell>{f.executions}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisVerticalIcon /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem asChild><Link href={`/explore/projects/${projectId}/flow/${f.id}/content-view`}>{t("actions.open")}</Link></DropdownMenuItem>
                          {permissions.execute && <DropdownMenuItem onSelect={() => setExecuting([f])}>{t("actions.execute")}</DropdownMenuItem>}
                          {permissions.refresh && !f.unlocked && <DropdownMenuItem onSelect={() => setRefreshing(f)}>{t("actions.refresh")}</DropdownMenuItem>}
                          {permissions.unlock && !f.unlocked && <DropdownMenuItem onSelect={() => setUnlocking(f)}>{t("actions.unlock")}</DropdownMenuItem>}
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {importing && <ImportDialog projectId={projectId} onClose={() => setImporting(false)} />}
      {executing && <ExecuteDialog flows={executing} onClose={() => { setExecuting(null); setSelected([]); }} />}
      {refreshing && (
        <RefreshDialog all={refreshing === "all"} onClose={() => setRefreshing(null)} onConfirm={async () => {
          const targets = refreshing === "all" ? flows.filter((f) => !f.unlocked) : [refreshing];
          const all = refreshing === "all";
          const res = await refreshReferentials(targets.map((f) => f.id));
          setRefreshing(null);
          if (!res.ok) { notify.error(referentialError(t as never, tg as never, res.error)); return; }
          notify.info(t("refresh.inProgress"), t("refresh.inProgressDescription"));
          void watchJob(res.data.jobId).then((outcome) => {
            if (!outcome.ok) { notify.error(referentialError(t as never, tg as never, outcome.error)); return; }
            const { updated = [], failed = [] } = outcome.result as { updated?: string[]; failed?: { flow_id: string; error: string }[] };
            for (const f of failed) {
              const name = flows.find((x) => x.id === f.flow_id)?.name ?? "";
              notify.error(`${name} : ${referentialError(t as never, tg as never, jobErrorCode(f.error))}`);
            }
            if (updated.length) notify.success(all ? t("refresh.successAll", { count: updated.length }) : t("refresh.success"));
            start(() => router.refresh());
          });
        }} />
      )}
      {unlocking && <UnlockDialog flow={unlocking} onClose={() => setUnlocking(null)} />}
    </div>
  );
}
