"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { HistoryIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";
import { SimpleSelect } from "../components/simple-select";

type Person = { first_name: string; last_name: string } | null;
type EventRow = { id: number; event_type: Enums<"flow_event_type">; occurred_at: string; source: string; comment: string | null;
  phase_id: string | null; step_id: string | null; payload: Record<string, unknown>; actor: Person };
type StatusRow = { id: number; occurred_at: string; comment: string | null; source: string;
  from: { name: string } | null; to: { name: string } | null; actor: Person };

const PAGE = 30;

/** Historique du flow : événements de contenu + changements de statut (§2.8, R-STAT-3). */
export function FlowHistoryDialog({ flowId, tab, close }: { flowId: string; tab: string; close: () => void }) {
  const t = useTranslations("flows.history");
  const format = useFormatter();
  const dialog = useDialog();
  const [name, setName] = useState("");
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [statuses, setStatuses] = useState<StatusRow[] | null>(null);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [type, setType] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [openComment, setOpenComment] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void Promise.all([
      supabase.from("flows").select("name").eq("id", flowId).single(),
      supabase.from("phases").select("id, name").eq("flow_id", flowId),
      supabase.from("steps").select("id, name").eq("flow_id", flowId),
    ]).then(([f, p, s]) => {
      setName(f.data?.name ?? "");
      setLabels(new Map([...(p.data ?? []), ...(s.data ?? [])].map((x) => [x.id, x.name])));
    });
  }, [flowId]);

  useEffect(() => {
    const supabase = createClient();
    let q = supabase.from("flow_events").select("id, event_type, occurred_at, source, comment, phase_id, step_id, payload, actor:collaborators(first_name, last_name)")
      .eq("flow_id", flowId).order("occurred_at", { ascending: false }).limit(limit);
    if (type) q = q.eq("event_type", type as Enums<"flow_event_type">);
    if (from) q = q.gte("occurred_at", from);
    void q.then(({ data }) => setEvents((data as unknown as EventRow[]) ?? []));
    void supabase.from("flow_status_history")
      .select(`id, occurred_at, comment, source, from:custom_statuses!flow_status_history_from_status_id_fkey(name),
        to:custom_statuses!flow_status_history_to_status_id_fkey(name), actor:collaborators(first_name, last_name)`)
      .eq("flow_id", flowId).order("occurred_at", { ascending: false }).limit(limit)
      .then(({ data }) => setStatuses((data as unknown as StatusRow[]) ?? []));
  }, [flowId, type, from, limit]);

  const user = (p: Person) => (p ? `${p.first_name} ${p.last_name}` : t("system"));
  const when = (v: string) => format.dateTime(new Date(v), { dateStyle: "short", timeStyle: "short" });
  const EVENT_TYPES: Enums<"flow_event_type">[] = ["create", "delete", "reset_flow", "activate_phase", "deactivate_phase", "activate_step",
    "deactivate_step", "validate_step", "devalidate_step", "add_user_hierarchy_in_flow", "delete_user_hierarchy_from_flow", "deactivate_signature"];

  const current = tab === "status-tab" ? "status-tab" : "events-tab";
  const rows = current === "events-tab" ? events : statuses;

  return (
    <ModalShell onClose={close} size="md" icon={<EntityIcon kind="project" icon={HistoryIcon} size="md" />} title={t("title", { name })}
      tabs={[{ id: "events-tab", label: t("tabs.events") }, { id: "status-tab", label: t("tabs.status") }]}
      activeTab={current} onTabChange={(id) => dialog.replace(`flow/history/${flowId}/${id}`)}>
      {current === "events-tab" && (
        <div className="mb-3 grid grid-cols-2 gap-3">
          <SimpleSelect value={type} onChange={setType} placeholder={t("filterType")} options={EVENT_TYPES.map((e) => ({ value: e, label: t(`types.${e}`) }))} />
          <Input type="date" aria-label={t("filterDate")} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
      )}
      {!rows ? <div className="flex justify-center py-12"><Spinner /></div> : rows.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col divide-y">
          {current === "events-tab" ? (events ?? []).map((e) => (
            <li key={e.id} className="flex flex-col gap-1 py-3">
              <span>{t(`actions.${e.event_type}`, {
                user: user(e.actor),
                phase: (e.phase_id && labels.get(e.phase_id)) || "—",
                step: (e.step_id && labels.get(e.step_id)) || "—",
                nature: String(e.payload?.nature ?? ""),
              })}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {when(e.occurred_at)} · {t(`sources.${e.source}`)}
                {e.comment && <Button variant="link" size="xs" className="h-auto p-0" onClick={() => setOpenComment(openComment === e.id ? null : e.id)}>{t("seeComment")}</Button>}
              </span>
              {openComment === e.id && <p className="rounded bg-muted px-3 py-2 text-sm">{e.comment}</p>}
            </li>
          )) : (statuses ?? []).map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-3">
              <span>
                {r.from ? t("statusChanged", { user: user(r.actor), from: r.from.name, to: r.to?.name ?? "—" }) : t("statusCreated", { user: user(r.actor), status: r.to?.name ?? "—" })}
                {r.comment && <> {t("statusComment", { comment: r.comment })}</>}
              </span>
              <span className="text-xs text-muted-foreground">{when(r.occurred_at)} · {t(`sources.${r.source}`)}</span>
            </li>
          ))}
        </ol>
      )}
      {rows && rows.length >= limit && (
        <div className="flex justify-center py-2"><Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>{t("loadMore")}</Button></div>
      )}
    </ModalShell>
  );
}
