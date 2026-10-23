"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { TabletIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { importTablets } from "../actions";

type Row = { id: string; name: string; family: { short_name: string; long_name: string | null; color: string } | null; company: { name: string } | null };

/** ?dialog=project-tablet/import/<projectId> */
export default function ProjectTabletDialogs({ segments, close }: DialogProps) {
  const [action, projectId] = segments;
  if (action !== "import" || !projectId) return null;
  return <ImportTabletsDialog projectId={projectId} close={close} />;
}

function ImportTabletsDialog({ projectId, close }: { projectId: string; close: () => void }) {
  const t = useTranslations("dashboard.tablets");
  const tg = useTranslations("global");
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    Promise.all([
      supabase.from("tablets").select("id, name, family:label_families!tablets_family_id_fkey(short_name, long_name, color), company:companies(name)")
        .eq("status", "active").is("deleted_at", null).order("name"),
      supabase.from("project_tablets").select("tablet_id").eq("project_id", projectId),
    ]).then(([tablets, current]) => {
      if (!active) return;
      setRows((tablets.data ?? []) as unknown as Row[]);
      setExisting(new Set((current.data ?? []).map((x) => x.tablet_id)));
    });
    return () => { active = false; };
  }, [projectId]);

  const submit = () => start(async () => {
    const res = await importTablets(projectId, [...selected]);
    if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error")); return; }
    notify.success(t("import.success", { count: res.data.added }));
    router.refresh();
    close();
  });

  return (
    <ModalShell onClose={close} size="sm" icon={<EntityIcon kind="contributors" icon={TabletIcon} size="md" />} title={t("import.title")}
      footer={
        <>
          <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
          <Button onClick={submit} disabled={pending || selected.size === 0}>{pending && <Spinner data-icon="inline-start" />}{t("import.submit")}</Button>
        </>
      }>
      {!rows ? <div className="flex justify-center py-16"><Spinner /></div> : rows.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">{t("import.empty")}</p>
      ) : (
        <div className="flex flex-col divide-y rounded-md border">
          {rows.map((r) => {
            const done = existing.has(r.id);
            return (
              <label key={r.id} className={cn("flex items-center gap-3 px-3 py-2 text-sm", done ? "opacity-50" : "cursor-pointer hover:bg-muted")}>
                <Checkbox checked={done || selected.has(r.id)} disabled={done}
                  onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(r.id); else n.delete(r.id); return n; })} />
                <FamilyChip color={r.family?.color} shortName={r.family?.short_name} longName={r.family?.long_name} />
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="text-muted-foreground">{done ? t("import.alreadyImported") : r.company?.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}
