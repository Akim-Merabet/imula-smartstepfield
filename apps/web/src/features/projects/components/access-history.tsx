"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EyeOffIcon, XIcon } from "lucide-react";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import { recordProjectAccess, removeProjectAccess } from "../access-history-actions";
import type { ProjectType } from "../meta";

const CHANGED_EVENT = "access-history:changed";

type Entry = {
  project_id: string; url: string;
  project: { designation: string; type: ProjectType; archived: boolean; deleted_at: string | null } | null;
};

function Tracker({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("dialog");
    const s = params.toString();
    return s ? `?${s}` : "";
  })();
  useEffect(() => {
    const url = `${pathname}${search}`;
    const timer = setTimeout(() => {
      void recordProjectAccess(projectId, url).then((res) => {
        if (res.ok) window.dispatchEvent(new Event(CHANGED_EVENT));
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [projectId, pathname, search]);
  return null;
}

/** Alimente l'historique d'accès à chaque navigation dans le tableau de bord d'une entité (URL complète, filtres compris). */
export function AccessHistoryTracker({ projectId }: { projectId: string }) {
  return <Suspense fallback={null}><Tracker projectId={projectId} /></Suspense>;
}

/** Badge + popover des 5 dernières entités ouvertes (rail, spec 00 §3.1.2). */
export function AccessHistoryButton() {
  const t = useTranslations("projects.accessHistory");
  const tp = useTranslations("projects");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await createClient().from("project_access_history")
      .select("project_id, flow_filters, accessed_at, project:projects(designation, type, archived, deleted_at)")
      .order("accessed_at", { ascending: false }).limit(5);
    setEntries((data ?? []).map((row) => ({
      project_id: row.project_id,
      url: ((row.flow_filters ?? {}) as { url?: string }).url ?? `/explore/projects/${row.project_id}/dashboard`,
      project: row.project as Entry["project"],
    })).filter((e) => e.project && !e.project.deleted_at));
  }, []);

  useEffect(() => {
    const refresh = () => void load();
    refresh();
    window.addEventListener(CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CHANGED_EVENT, refresh);
  }, [load]);

  const remove = async (projectId: string) => {
    setEntries((list) => list.filter((e) => e.project_id !== projectId));
    await removeProjectAccess(projectId);
  };

  if (entries.length === 0) return null;
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) void load(); }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger aria-label={t("tooltip")}
            className="flex size-6 items-center justify-center rounded-full border-2 border-white bg-primary text-xs font-semibold text-primary-foreground">
            {entries.length}
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{t("tooltip")}</TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="start" className="w-[18.75rem] p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">{t("title")}</div>
        <ul className="max-h-60 overflow-y-auto py-1">
          {entries.map((e) => (
            <li key={e.project_id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="relative">
                <EntityIcon kind={e.project!.type} letter={tp(`letters.${e.project!.type}`)} size="sm" />
                {e.project!.archived && <EyeOffIcon className="absolute -right-1 -bottom-1 size-3 rounded-full bg-background" />}
              </span>
              <Link href={e.url} onClick={() => setOpen(false)} className="min-w-0 flex-1 truncate text-sm hover:text-info hover:underline">
                {e.project!.designation}
              </Link>
              <button type="button" aria-label={t("remove")} title={t("remove")} onClick={() => void remove(e.project_id)}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
