"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { HistoryIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: number; created_at: string; comment: string | null; source: string;
  from: { name: string } | null; to: { name: string } | null; actor: { first_name: string; last_name: string } | null;
};

export function ProjectHistoryDialog({ projectId, close }: { projectId: string; close: () => void }) {
  const t = useTranslations("projects.history");
  const format = useFormatter();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    createClient().from("project_status_history")
      .select(`id, created_at, comment, source,
        from:custom_statuses!project_status_history_from_status_id_fkey(name),
        to:custom_statuses!project_status_history_to_status_id_fkey(name),
        actor:collaborators(first_name, last_name)`)
      .eq("project_id", projectId).order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as unknown as Row[]) ?? []));
  }, [projectId]);

  return (
    <ModalShell onClose={close} size="md" icon={<EntityIcon kind="project" icon={HistoryIcon} size="md" />} title={t("title")}>
      {!rows ? <div className="flex justify-center py-12"><Spinner /></div> : rows.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col divide-y">
          {rows.map((r) => {
            const user = r.actor ? `${r.actor.first_name} ${r.actor.last_name}` : "—";
            return (
              <li key={r.id} className="flex flex-col gap-1 py-3">
                <span>
                  {r.from ? t("changed", { user, from: r.from.name, to: r.to?.name ?? "—" }) : t("created", { user, status: r.to?.name ?? "—" })}
                  {r.comment && <> {t("comment", { comment: r.comment })}</>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format.dateTime(new Date(r.created_at), { dateStyle: "short", timeStyle: "short" })} · {r.source}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </ModalShell>
  );
}
