"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { InfoIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { FlowTypeBadge } from "@/features/flows/components/flow-type-badge";
import { SimpleSelect } from "@/features/flows/components/simple-select";
import type { FlowType } from "@/features/flows/meta";
import { watchJob } from "@/features/jobs/watch-job";
import { executeReferentials, importReferentials, unlockReferential } from "./actions";
import type { ReferentialFlow } from "./queries";
import { referentialError } from "./referential-list";

const REF_TYPES: FlowType[] = ["referential", "referential_generic", "group_referential", "referential_intervention"];
const MAX = 10;

type SourceFlow = {
  id: string; name: string; ref_int: string | null; flow_type: FlowType;
  family: { short_name: string; long_name: string | null; color: string } | null;
  status: { name: string; color: string; category: string } | null;
};

/** « Importer depuis un référentiel » : ≤ 10 flows « en préparation » d'une entité référentiel. */
export function ImportDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const t = useTranslations("referentials");
  const tg = useTranslations("global");
  const router = useRouter();
  const [entities, setEntities] = useState<{ id: string; designation: string }[]>([]);
  const [entity, setEntity] = useState<string | null>(null);
  const [flows, setFlows] = useState<SourceFlow[] | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [update, setUpdate] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const [{ data: projects }, { data: mine }] = await Promise.all([
        supabase.from("projects").select("id, designation").eq("type", "referential").is("deleted_at", null).order("designation"),
        supabase.from("flows").select("sourced_from_flow_id").eq("project_id", projectId).is("deleted_at", null).not("sourced_from_flow_id", "is", null),
      ]);
      setEntities(projects ?? []);
      setImported(new Set((mine ?? []).map((f) => f.sourced_from_flow_id as string)));
      if (projects?.length === 1) setEntity(projects[0].id);
    })();
  }, [projectId]);

  useEffect(() => {
    if (!entity) return;
    const supabase = createClient();
    void (async () => {
      setFlows(null); setSelected([]);
      const { data } = await supabase.from("flows").select(`id, name, ref_int, flow_type,
          family:label_families!flows_family_id_fkey(short_name, long_name, color),
          status:custom_statuses!flows_custom_status_id_fkey!inner(name, color, category)`)
        .eq("project_id", entity).is("deleted_at", null).in("flow_type", REF_TYPES).eq("status.category", "in_preparation").order("name");
      setFlows((data ?? []) as unknown as SourceFlow[]);
    })();
  }, [entity]);

  const toggle = (id: string, on: boolean) => {
    if (on && selected.length >= MAX) { notify.error(t("errors.size_limit")); return; }
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  };
  const conflicts = selected.filter((id) => imported.has(id));

  const submit = () => start(async () => {
    const res = await importReferentials(projectId, selected, update);
    if (!res.ok) { notify.error(referentialError(t as never, tg as never, res.error)); return; }
    notify.info(t("import.inProgress"), t("import.inProgressDescription"));
    onClose();
    void watchJob(res.data.jobId).then((outcome) => {
      if (!outcome.ok) { notify.error(referentialError(t as never, tg as never, outcome.error)); return; }
      const { created = [], updated = [], conflicts: skipped = [] } = outcome.result as { created?: string[]; updated?: string[]; conflicts?: string[] };
      notify.success(t("import.success"), t("import.summary", { created: created.length, updated: updated.length, skipped: skipped.length }));
      router.refresh();
    });
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("import.title")}</DialogTitle>
          <DialogDescription>{t("import.subtitle")}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{t("import.entity")}</FieldLabel>
            <SimpleSelect clearable={false} value={entity} onChange={setEntity} options={entities.map((e) => ({ value: e.id, label: e.designation }))}
              placeholder={entities.length ? t("import.selectEntity") : t("import.noEntity")} />
          </Field>
        </FieldGroup>
        {entity && (
          <div className="flex max-h-80 flex-col overflow-y-auto rounded-md border">
            {flows === null && <div className="flex justify-center p-4"><Spinner /></div>}
            {flows?.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("import.empty")}</p>}
            {flows?.map((f) => (
              <label key={f.id} className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-row-focus">
                <Checkbox checked={selected.includes(f.id)} onCheckedChange={(v) => toggle(f.id, !!v)} />
                <FlowTypeBadge type={f.flow_type} size="sm" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {imported.has(f.id) && <Badge variant="outline">{t("import.alreadyImported")}</Badge>}
                <span className="w-24 truncate text-xs text-muted-foreground">{f.ref_int}</span>
                {f.family && <FamilyChip color={f.family.color} shortName={f.family.short_name} longName={f.family.long_name} />}
                <StatusBadge color={f.status?.color} label={f.status?.name} className="text-xs" />
              </label>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{t("import.selected", { count: selected.length, max: MAX })}</span>
          <label className="flex items-center gap-2"><Checkbox checked={update} onCheckedChange={(v) => setUpdate(!!v)} />{t("import.updateExisting")}</label>
        </div>
        {conflicts.length > 0 && (
          <Alert><InfoIcon /><AlertDescription>{update ? t("import.conflictUpdate", { count: conflicts.length }) : t("import.conflict", { count: conflicts.length })}</AlertDescription></Alert>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button onClick={submit} disabled={pending || !selected.length}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.import")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** « Exécuter à partir d'un standard » : nombre de copies + options. */
export function ExecuteDialog({ flows, onClose }: { flows: ReferentialFlow[]; onClose: () => void }) {
  const t = useTranslations("referentials");
  const tg = useTranslations("global");
  const router = useRouter();
  const [copies, setCopies] = useState("1");
  const [resetInternal, setResetInternal] = useState(true);
  const [pending, start] = useTransition();
  const single = flows.length === 1 ? flows[0] : null;
  const variant = single?.flow_type === "group_referential" ? "group" : single?.flow_type === "referential_intervention" ? "intervention" : "referential";

  const submit = () => start(async () => {
    const n = Number(copies);
    const res = await executeReferentials(flows.map((f) => f.id), n, resetInternal);
    if (!res.ok) { notify.error(referentialError(t as never, tg as never, res.error)); return; }
    notify.info(t("execute.inProgress"), t("execute.inProgressDescription"));
    onClose();
    const count = flows.length;
    void watchJob(res.data.jobId).then((outcome) => {
      if (!outcome.ok) { notify.error(referentialError(t as never, tg as never, outcome.error)); return; }
      const created = (outcome.result as { created?: string[] }).created ?? [];
      notify.success(count === 1 ? t("execute.success") : t("execute.successList", { count }), t("execute.created", { count: created.length }));
      router.refresh();
    });
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`execute.title.${variant}`)}</DialogTitle>
          <DialogDescription>{single ? single.name : t("execute.selection", { count: flows.length })}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field className="w-40">
            <FieldLabel htmlFor="exec-copies">{t("execute.copies")}</FieldLabel>
            <Input id="exec-copies" type="number" min={1} max={50} value={copies} onChange={(e) => setCopies(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{t("execute.options")}</FieldLabel>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={resetInternal} onCheckedChange={(v) => setResetInternal(!!v)} className="mt-0.5" />
              <span className="flex flex-col"><span>{t("execute.resetInternal")}</span><span className="text-xs text-muted-foreground">{t("execute.resetInternalHelp")}</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <Checkbox checked={false} disabled className="mt-0.5" />
              <span className="flex flex-col"><span>{t("execute.resetExternal")}</span><span className="text-xs">{t("execute.documentsUnavailable")}</span></span>
            </label>
            <FieldDescription>{t("execute.info")}</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button onClick={submit} disabled={pending || !(Number(copies) >= 1 && Number(copies) <= 50)}>{pending && <Spinner data-icon="inline-start" />}{t("actions.execute")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RefreshDialog({ all, onClose, onConfirm }: { all: boolean; onClose: () => void; onConfirm: () => Promise<void> }) {
  const t = useTranslations("referentials.refresh");
  const tg = useTranslations("global");
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{all ? t("titleAll") : t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button onClick={() => start(onConfirm)} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UnlockDialog({ flow, onClose }: { flow: ReferentialFlow; onClose: () => void }) {
  const t = useTranslations("referentials");
  const tg = useTranslations("global");
  const router = useRouter();
  const [reset, setReset] = useState(false);
  const [pending, start] = useTransition();
  const variant = flow.flow_type === "group_referential" ? "group" : flow.flow_type === "referential_intervention" ? "intervention" : "referential";
  const submit = () => start(async () => {
    const res = await unlockReferential(flow.id, reset);
    if (!res.ok) { notify.error(referentialError(t as never, tg as never, res.error)); return; }
    notify.success(t("unlock.success"));
    onClose(); router.refresh();
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`unlock.title.${variant}`)}</DialogTitle>
          <DialogDescription>{t("unlock.subtitle")}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>{t("unlock.options")}</FieldLabel>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={reset} onCheckedChange={(v) => setReset(!!v)} className="mt-0.5" />
            <span className="flex flex-col"><span>{t("unlock.resetInternal")}</span><span className="text-xs text-muted-foreground">{t("unlock.resetInternalHelp")}</span></span>
          </label>
        </Field>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button variant="destructive" onClick={submit} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{t("actions.unlock")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
