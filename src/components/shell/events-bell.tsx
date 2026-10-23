"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BellIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

type Task = Pick<Tables<"background_tasks">, "id" | "name" | "status" | "created_at" | "result_path">;
const STATUS_KEY = { acknowledged: "acknowledged", in_progress: "inProgress", to_retry: "inProgress", done: "done", error: "error" } as const;

/** Cloche des tâches de fond (génération documentaire), alimentée en temps réel (spec 00 §5.5). */
export function EventsBell() {
  const t = useTranslations("nav");
  const tStatus = useTranslations("global.status");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    supabase.from("background_tasks").select("id,name,status,created_at,result_path").order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (active && data) setTasks(data); });
    const channel = supabase.channel("background-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "background_tasks" }, (payload) => {
        const row = payload.new as Task;
        setTasks((prev) => [row, ...prev.filter((x) => x.id !== row.id)].slice(0, 20));
        setUnread((n) => n + 1);
      })
      .subscribe();
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
              <li key={task.id} className="flex flex-col gap-1 p-3">
                <span className="truncate font-medium">{task.name}</span>
                <span className="text-xs text-muted-foreground">
                  {tStatus(STATUS_KEY[task.status])} · {new Date(task.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
