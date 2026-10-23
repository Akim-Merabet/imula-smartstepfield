"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ArrowRightIcon, BellIcon, DownloadIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { notify } from "@/components/common/notify";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

type Task = Pick<Tables<"background_tasks">, "id" | "name" | "status" | "created_at" | "result_path" | "kind" | "file_type" | "metadata">;
const STATUS_KEY = { acknowledged: "acknowledged", in_progress: "inProgress", to_retry: "acknowledged", done: "done", error: "error" } as const;
const STATUS_TONE = { acknowledged: "text-muted-foreground", in_progress: "text-info", to_retry: "text-warning", done: "text-success", error: "text-destructive" } as const;
const COLUMNS = "id,name,status,created_at,result_path,kind,file_type,metadata";

/** Les fichiers générés (PDF) sont dans le bucket privé « documents » : URL signée à la demande. */
async function download(task: Task, failed: string) {
  if (!task.result_path) return;
  const meta = (task.metadata ?? {}) as { file_name?: string };
  const { data } = await createClient().storage.from("documents").createSignedUrl(task.result_path, 600, { download: meta.file_name ?? true });
  if (!data?.signedUrl) { notify.error(failed); return; }
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.rel = "noopener";
  a.click();
}

/** Cloche des tâches de fond (génération documentaire), alimentée en temps réel (spec 00 §5.5). */
export function EventsBell() {
  const t = useTranslations("nav");
  const tStatus = useTranslations("global.status");
  const tPdf = useTranslations("pdf.bell");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.from("background_tasks").select(COLUMNS).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (active && data) setTasks(data); });
    // Nom unique par montage (le double montage du mode strict réutiliserait un canal déjà retiré).
    const channel = supabase.channel(`background-tasks-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "background_tasks" }, (payload) => {
        const row = payload.new as Partial<Task>;
        if (!row?.id) return;
        // Les événements temps réel peuvent ne porter qu'une partie des colonnes : fusion avec la ligne connue.
        setTasks((prev) => {
          const merged = { ...prev.find((x) => x.id === row.id), ...row } as Task;
          if (!merged.status) return prev;
          return [merged, ...prev.filter((x) => x.id !== row.id)].slice(0, 20);
        });
        setUnread((n) => n + 1);
      });
    // Le canal doit porter le jeton de l'utilisateur, sinon la RLS filtre tous les événements.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });
    return () => { active = false; supabase.removeChannel(channel); };
  }, []);

  const running = tasks.filter((x) => x.status === "acknowledged" || x.status === "in_progress").length;
  const badge = running + unread;

  return (
    <Popover onOpenChange={(open) => { if (!open) setUnread(0); }}>
      <PopoverTrigger aria-label={t("rail.events")} className="relative flex h-[38px] w-[53px] items-center justify-center rounded hover:bg-rail-hover">
        <BellIcon className="size-5" />
        {badge > 0 && (
          <Badge className="absolute -top-1 right-0 h-5 min-w-5 border-2 border-white bg-destructive px-1 text-[0.65rem]">
            {badge > 9 ? "9+" : badge}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-96 p-0">
        <div className="border-b p-3 font-medium">{t("events.title")}</div>
        {tasks.length === 0 ? (
          <Empty className="py-10">
            <EmptyHeader><EmptyDescription>{t("events.empty")}</EmptyDescription></EmptyHeader>
          </Empty>
        ) : (
          <ul className="max-h-[30rem] divide-y overflow-y-auto">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-2 p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium">{task.name}</span>
                  <span className="text-xs text-muted-foreground">
                    <span className={STATUS_TONE[task.status]}>{tStatus(STATUS_KEY[task.status] ?? "acknowledged")}</span>
                    {task.status === "to_retry" && ` · ${tPdf("retry")}`}
                    {task.status === "done" && typeof (task.metadata as { page_count?: number } | null)?.page_count === "number"
                      && ` · ${tPdf("pages", { count: (task.metadata as { page_count: number }).page_count })}`}
                    {" · "}{new Date(task.created_at).toLocaleString()}
                  </span>
                </div>
                {task.status === "done" && typeof (task.metadata as { href?: string } | null)?.href === "string" && (
                  <Button variant="ghost" size="icon-sm" asChild aria-label={t("events.open")} title={t("events.open")}>
                    <Link href={(task.metadata as { href: string }).href}><ArrowRightIcon /></Link>
                  </Button>
                )}
                {task.status === "done" && task.result_path && (
                  <Button variant="ghost" size="icon-sm" aria-label={tPdf("download")} title={tPdf("download")} onClick={() => void download(task, tPdf("downloadFailed"))}>
                    <DownloadIcon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
