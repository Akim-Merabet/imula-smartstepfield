"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { FlowTypeBadge } from "@/features/flows/components/flow-type-badge";
import type { ViewFlow } from "../queries";
import { addPlanFlows, createPlan, deleteMilestone, deletePlanLink, saveMilestone, updatePlan } from "./actions";
import type { Milestone, Plan, PlanLink } from "./plan-view";

const SCALES = ["default", "temporal", "scheduling"] as const;

export function PlanDialog({ projectId, plan, onClose, onSaved }: {
  projectId: string; plan: Plan | null; onClose: () => void; onSaved: (id: string) => void;
}) {
  const t = useTranslations("flowViews.plan");
  const tg = useTranslations("global");
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [scale, setScale] = useState(plan?.scale ?? "default");
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  const save = () => {
    if (!name.trim()) { setError(true); return; }
    start(async () => {
      const input = { name, description: description || null, scale: scale as (typeof SCALES)[number] };
      const res = plan ? await updatePlan(plan.id, input) : await createPlan(projectId, input);
      if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : t(plan ? "updateFail" : "createFail")); return; }
      notify.success(t(plan ? "updated" : "created"));
      onSaved(plan ? plan.id : (res.data as { id: string }).id);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{plan ? t("editPlan") : t("createPlan")}</DialogTitle></DialogHeader>
        <FieldGroup>
          <Field data-invalid={error || undefined}>
            <FieldLabel htmlFor="plan-name">{t("fields.name")} *</FieldLabel>
            <Input id="plan-name" value={name} onChange={(e) => { setName(e.target.value); setError(false); }} aria-invalid={error} autoFocus />
            {error && <FieldError>{t("fields.required")}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="plan-description">{t("fields.description")}</FieldLabel>
            <Textarea id="plan-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{t("fields.scale")}</FieldLabel>
            <RadioGroup value={scale} onValueChange={setScale}>
              {SCALES.map((s) => (
                <label key={s} className="flex items-start gap-2 text-sm">
                  <RadioGroupItem value={s} className="mt-0.5" />
                  <span className="flex flex-col"><span>{t(`scaleLong.${s}`)}</span><span className="text-xs text-muted-foreground">{t(`scaleHelp.${s}`)}</span></span>
                </label>
              ))}
            </RadioGroup>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button onClick={save} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MilestoneDialog({ planId, milestone, onClose }: { planId: string; milestone: Milestone | null; onClose: () => void }) {
  const t = useTranslations("flowViews.plan.milestone");
  const tg = useTranslations("global");
  const router = useRouter();
  const [form, setForm] = useState({
    name: milestone?.name ?? "", date: milestone?.date ?? new Date().toISOString().slice(0, 10),
    color: milestone?.color ?? "#e11d48", description: milestone?.description ?? "",
  });
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  const save = () => {
    if (!form.name.trim() || !form.date) { setError(true); return; }
    start(async () => {
      const res = await saveMilestone(planId, milestone?.id ?? null, { ...form, description: form.description || null });
      if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : t(milestone ? "updateFail" : "addFail")); return; }
      notify.success(t(milestone ? "updateSuccess" : "addSuccess"));
      onClose(); router.refresh();
    });
  };
  const remove = () => start(async () => {
    if (!milestone) return;
    const res = await deleteMilestone(milestone.id);
    if (!res.ok) { notify.error(t("deleteFail")); return; }
    notify.success(t("deleteSuccess"));
    onClose(); router.refresh();
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{milestone ? t("editTitle") : t("addTitle")}</DialogTitle></DialogHeader>
        <FieldGroup>
          <Field data-invalid={error || undefined}>
            <FieldLabel htmlFor="ms-name">{t("name")} *</FieldLabel>
            <Input id="ms-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={error} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="ms-date">{t("date")} *</FieldLabel>
              <Input id="ms-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ms-color">{t("color")}</FieldLabel>
              <Input id="ms-color" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-20 p-1" />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="ms-desc">{t("description")}</FieldLabel>
            <Textarea id="ms-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          {milestone && <Button variant="destructive" className="mr-auto" onClick={remove} disabled={pending}><Trash2Icon data-icon="inline-start" />{t("delete")}</Button>}
          <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button onClick={save} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Échelle temporelle : « Ajouter du contenu au plan à partir de flow(s) existant(s) ». */
export function AddContentDialog({ planId, flows, onClose }: { planId: string; flows: ViewFlow[]; onClose: () => void }) {
  const t = useTranslations("flowViews.plan");
  const tg = useTranslations("global");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? flows.filter((f) => f.name.toLowerCase().includes(q) || (f.ref_int ?? "").toLowerCase().includes(q)) : flows;
  }, [flows, query]);

  const add = () => start(async () => {
    const res = await addPlanFlows(planId, selected);
    if (!res.ok) { notify.error(t("importFail")); return; }
    notify.success(t("importSuccess"));
    onClose(); router.refresh();
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("addContentTitle")}</DialogTitle>
          <DialogDescription>{t("addContent")}</DialogDescription>
        </DialogHeader>
        <InputGroup>
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tg("actions.search")} aria-label={tg("actions.search")} />
        </InputGroup>
        <div className="flex max-h-80 flex-col overflow-y-auto rounded-md border">
          {list.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("emptyImport")}</p>}
          {list.map((f) => (
            <label key={f.id} className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-row-focus">
              <Checkbox checked={selected.includes(f.id)} onCheckedChange={(v) => setSelected((s) => (v ? [...s, f.id] : s.filter((x) => x !== f.id)))} />
              <FlowTypeBadge type={f.flow_type} size="sm" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{f.ref_int}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button onClick={add} disabled={pending || !selected.length}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.add")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Bar = { start: Date; end: Date };

/** « Détails des dépendances » d'une barre : avant / après, chevauchements, suppression. */
export function DependencyDialog({ flow, links, elementFlow, flows, bars, canEdit, onClose }: {
  flow: ViewFlow; links: PlanLink[]; elementFlow: Map<string, string | null>; flows: ViewFlow[];
  bars: Map<string, Bar | null>; canEdit: boolean; onClose: () => void;
}) {
  const t = useTranslations("flowViews.plan.dependencies");
  const tg = useTranslations("global");
  const router = useRouter();
  const [pending, start] = useTransition();
  const name = (id: string | null | undefined) => flows.find((f) => f.id === id)?.name ?? "—";
  const overlap = (l: PlanLink) => {
    const fb = bars.get(elementFlow.get(l.from_element_id) ?? ""), tb = bars.get(elementFlow.get(l.to_element_id) ?? "");
    if (!fb || !tb) return false;
    return l.dependency_type === "end_start" ? tb.start < fb.end : tb.end < fb.start;
  };
  const before = links.filter((l) => elementFlow.get(l.to_element_id) === flow.id);
  const after = links.filter((l) => elementFlow.get(l.from_element_id) === flow.id);

  const remove = (id: string) => start(async () => {
    const res = await deletePlanLink(id);
    if (!res.ok) { notify.error(tg("toast.error")); return; }
    notify.success(t("deleted"));
    router.refresh();
  });

  const section = (title: string, items: PlanLink[], other: (l: PlanLink) => string) => (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {items.length === 0 && <p className="text-sm text-muted-foreground">{t("none")}</p>}
      {items.map((l) => (
        <div key={l.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{other(l)}</span>
          <span className="text-xs text-muted-foreground">{t(`types.${l.dependency_type}`)}</span>
          {overlap(l) && <span className="flex items-center gap-1 text-xs text-destructive"><TriangleAlertIcon className="size-3.5" />{t("overlap")}</span>}
          {canEdit && <Button variant="ghost" size="icon-sm" aria-label={t("delete")} onClick={() => remove(l.id)} disabled={pending}><Trash2Icon /></Button>}
        </div>
      ))}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{flow.name}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {section(t("before"), before, (l) => name(elementFlow.get(l.from_element_id)))}
          {section(t("after"), after, (l) => name(elementFlow.get(l.to_element_id)))}
          <FieldDescription>{t("hint")}</FieldDescription>
        </FieldGroup>
        <DialogFooter><Button variant="secondary" onClick={onClose}>{tg("actions.close")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
