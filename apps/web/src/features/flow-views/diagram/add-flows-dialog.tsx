"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SearchIcon } from "lucide-react";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { FlowTypeBadge } from "@/features/flows/components/flow-type-badge";
import { MultiSelect } from "@/features/flows/components/multi-select";
import type { ViewFlow } from "../queries";

const GROUP_TYPES = new Set(["group", "group_referential"]);

/** « Ajouter des flows » : import filtrable (statut, famille, catégorie, type, affectation), sans chapeaux. */
export function AddFlowsDialog({ flows, onClose, onAdd }: { flows: ViewFlow[]; onClose: () => void; onAdd: (ids: string[]) => void }) {
  const t = useTranslations("flowViews.diagram");
  const tf = useTranslations("flows");
  const tg = useTranslations("global");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<{ status: string[]; family: string[]; category: string[]; type: string[]; assignee: string[] }>(
    { status: [], family: [], category: [], type: [], assignee: [] });
  const [selected, setSelected] = useState<string[]>([]);
  const candidates = flows.filter((f) => !GROUP_TYPES.has(f.flow_type));

  const opts = useMemo(() => {
    const uniq = <T,>(items: (T | null)[], key: (x: T) => string) => [...new Map(items.filter(Boolean).map((x) => [key(x as T), x as T])).values()];
    return {
      status: uniq(candidates.map((f) => f.status), (s) => s.id).map((s) => ({ value: s.id, label: s.name, color: s.color })),
      family: uniq(candidates.map((f) => f.family), (s) => s.id).map((s) => ({ value: s.id, label: s.short_name, color: s.color })),
      category: uniq(candidates.map((f) => f.category), (s) => s.id).map((s) => ({ value: s.id, label: s.short_name, color: s.color })),
      type: [...new Set(candidates.map((f) => f.flow_type))].map((v) => ({ value: v, label: tf(`types.${v}`) })),
      assignee: uniq(candidates.flatMap((f) => f.assignees.map((a) => a.collaborator)), (c) => c.id).map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}` })),
    };
  }, [candidates, tf]);

  const list = candidates.filter((f) => {
    const q = query.trim().toLowerCase();
    if (q && !f.name.toLowerCase().includes(q) && !(f.ref_int ?? "").toLowerCase().includes(q)) return false;
    if (filters.status.length && !filters.status.includes(f.custom_status_id ?? "")) return false;
    if (filters.family.length && !filters.family.includes(f.family_id ?? "")) return false;
    if (filters.category.length && !filters.category.includes(f.category_id ?? "")) return false;
    if (filters.type.length && !filters.type.includes(f.flow_type)) return false;
    if (filters.assignee.length && !f.assignees.some((a) => a.collaborator && filters.assignee.includes(a.collaborator.id))) return false;
    return true;
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("addFlows")}</DialogTitle>
          <DialogDescription>{t("addFlowsSubtitle")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <InputGroup className="col-span-2 sm:col-span-3">
            <InputGroupAddon><SearchIcon /></InputGroupAddon>
            <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tg("actions.search")} aria-label={tg("actions.search")} />
          </InputGroup>
          {(["status", "family", "category", "type", "assignee"] as const).map((k) => (
            <MultiSelect key={k} options={opts[k]} value={filters[k]} onChange={(v) => setFilters({ ...filters, [k]: v })} placeholder={t(`filters.${k}`)} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("importCount", { current: list.length, total: candidates.length })}</p>
        <div className="flex max-h-80 flex-col overflow-y-auto rounded-md border">
          {list.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("emptyImport")}</p>}
          {list.map((f) => (
            <label key={f.id} className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-row-focus">
              <Checkbox checked={selected.includes(f.id)} onCheckedChange={(v) => setSelected((s) => (v ? [...s, f.id] : s.filter((x) => x !== f.id)))} />
              <FlowTypeBadge type={f.flow_type} size="sm" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="w-24 truncate text-xs text-muted-foreground">{f.ref_int}</span>
              {f.family && <FamilyChip color={f.family.color} shortName={f.family.short_name} />}
              <StatusBadge color={f.status?.color} label={f.status?.name} className="w-32 text-xs" />
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button disabled={!selected.length} onClick={() => onAdd(selected)}>{tg("actions.add")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
