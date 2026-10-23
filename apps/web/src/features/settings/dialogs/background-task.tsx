"use client";

import { Fragment, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { LoaderIcon } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { durationMs, TASK_STATUS_COLORS, useDuration } from "../components/background-tasks-table";

type Task = Tables<"background_tasks"> & { user: { first_name: string; last_name: string } | null; project: { designation: string } | null };

/** ?dialog=background-task/properties/<id> — « Propriétés de la tâche de fond » (spec 01 §6.17). */
export default function BackgroundTaskDialog({ segments, close }: DialogProps) {
  const t = useTranslations("settings.backgroundTasks");
  const format = useFormatter();
  const duration = useDuration();
  const id = segments[1];
  const [task, setTask] = useState<Task | null>(null);

  useEffect(() => {
    if (!id) return;
    createClient().from("background_tasks").select("*, user:collaborators(first_name, last_name), project:projects(designation)")
      .eq("id", id).single().then(({ data }) => setTask(data as Task | null));
  }, [id]);

  const date = (v: string | null) => (v ? format.dateTime(new Date(v), { dateStyle: "short", timeStyle: "medium" }) : "—");
  const rows: [string, React.ReactNode][] = task ? [
    [t("columns.kind"), t.has(`kinds.${task.kind}`) ? t(`kinds.${task.kind}` as never) : task.kind],
    [t("columns.type"), task.file_type?.toUpperCase() ?? "—"],
    [t("columns.name"), task.name ?? "—"],
    [t("columns.status"), <StatusBadge key="s" color={TASK_STATUS_COLORS[task.status]} label={t(`statuses.${task.status}`)} />],
    [t("columns.user"), task.user ? `${task.user.first_name} ${task.user.last_name}` : "—"],
    [t("columns.project"), task.project?.designation ?? "—"],
    [t("columns.createdAt"), date(task.created_at)],
    [t("columns.startedAt"), date(task.started_at)],
    [t("columns.finishedAt"), date(task.finished_at)],
    [t("columns.duration"), duration(durationMs(task.started_at, task.finished_at))],
    [t("columns.delay"), duration(durationMs(task.created_at, task.started_at))],
    [t("columns.attempts"), task.attempts],
    [t("columns.error"), task.error ?? "—"],
  ] : [];

  return (
    <ModalShell onClose={close} size="md" icon={<EntityIcon kind="settings" icon={LoaderIcon} size="md" />} title={t("propertiesTitle")}>
      {!task ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-3 text-sm">
            {rows.map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-all">{v}</dd></Fragment>)}
          </dl>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("debug")}</h3>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(task.metadata, null, 2)}</pre>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
