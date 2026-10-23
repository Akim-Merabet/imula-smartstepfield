"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { AwardIcon, FileTextIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { createSkill, deleteSkill, updateSkill } from "../actions";
import { useErrorMessage } from "../components/action-runner";
import { ADMIN_AUTHORITIES, familyLabel, isSkillExpired, type Authority } from "../meta";
import type { SkillInput } from "../schema";

type Fam = { id: string; short_name: string; long_name: string | null; color: string; parent_id: string | null };
type SkillRow = Tables<"collaborator_skills"> & { skill: Fam | null; domain: Fam | null };

const ACTIVE_COLOR = "#57b09d";
const EXPIRED_COLOR = "#af1018";

type SkillsData = { name: string; skills: SkillRow[]; families: Fam[]; domains: Fam[]; canEdit: boolean };

/** Données communes : collaborateur, compétences, familles, droit courant. */
async function fetchSkillsData(collaboratorId: string): Promise<SkillsData> {
  const supabase = createClient();
  const { data: user } = await supabase.auth.getUser();
  const [c, skills, families, domains, me] = await Promise.all([
    supabase.from("collaborators").select("first_name, last_name").eq("id", collaboratorId).single(),
    supabase.from("collaborator_skills").select(`*, skill:label_families!collaborator_skills_skill_id_fkey(id, short_name, long_name, color, parent_id),
      domain:label_families!collaborator_skills_activity_domain_id_fkey(id, short_name, long_name, color, parent_id)`)
      .eq("collaborator_id", collaboratorId).order("sort_order").order("created_at"),
    supabase.from("label_families").select("id, short_name, long_name, color, parent_id")
      .eq("kind", "family").eq("nature", "skill").eq("active", true).is("deleted_at", null).order("priority").order("short_name"),
    supabase.from("label_families").select("id, short_name, long_name, color, parent_id")
      .eq("kind", "family").eq("nature", "activity_domain").eq("relative_nature", "child").eq("active", true).is("deleted_at", null)
      .order("short_name"),
    supabase.from("collaborators").select("authority").eq("auth_user_id", user.user?.id ?? "").maybeSingle(),
  ]);
  return {
    name: c.data ? `${c.data.first_name} ${c.data.last_name}` : "",
    skills: (skills.data as unknown as SkillRow[]) ?? [],
    families: families.data ?? [],
    domains: domains.data ?? [],
    canEdit: ADMIN_AUTHORITIES.includes(me.data?.authority as Authority),
  };
}

function useSkillsData(collaboratorId: string) {
  const [data, setData] = useState<SkillsData | null>(null);
  useEffect(() => {
    let active = true;
    fetchSkillsData(collaboratorId).then((d) => { if (active) setData(d); });
    return () => { active = false; };
  }, [collaboratorId]);
  const reload = useCallback(async () => setData(await fetchSkillsData(collaboratorId)), [collaboratorId]);
  return { data, reload };
}

function SkillsList({ collaboratorId, close }: { collaboratorId: string; close: () => void }) {
  const t = useTranslations("collaborators.skills");
  const tg = useTranslations("global");
  const format = useFormatter();
  const dialog = useDialog();
  const router = useRouter();
  const message = useErrorMessage();
  const { data, reload } = useSkillsData(collaboratorId);
  const [state, setState] = useState<"all" | "active" | "expired">("all");
  const [parent, setParent] = useState("__all");
  const [toDelete, setToDelete] = useState<SkillRow | null>(null);

  const parents = (data?.families ?? []).filter((f) => !f.parent_id);
  const rows = useMemo(() => (data?.skills ?? []).filter((s) => {
    const expired = isSkillExpired(s.ended_at);
    if (state === "active" && expired) return false;
    if (state === "expired" && !expired) return false;
    if (parent !== "__all" && s.skill?.parent_id !== parent) return false;
    return true;
  }), [data, state, parent]);
  const fmt = (d: string | null) => (d ? format.dateTime(new Date(`${d}T00:00:00`), { dateStyle: "short" }) : "—");
  const parentOf = (s: SkillRow) => data?.families.find((f) => f.id === s.skill?.parent_id);

  return (
    <ModalShell onClose={close} size="lg" icon={<EntityIcon kind="contributors" icon={AwardIcon} size="md" />}
      title={t("title", { name: data?.name ?? "" })}
      footer={<Button variant="secondary" onClick={close}>{tg("actions.close")}</Button>}>
      {!data ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup type="single" variant="outline" value={state} onValueChange={(v) => v && setState(v as typeof state)}>
              <ToggleGroupItem value="all" className="px-3">{t("all")}</ToggleGroupItem>
              <ToggleGroupItem value="active" className="px-3">{t("active")}</ToggleGroupItem>
              <ToggleGroupItem value="expired" className="px-3">{t("expired")}</ToggleGroupItem>
            </ToggleGroup>
            <Select value={parent} onValueChange={setParent}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="__all">{t("parent")} : {tg("all")}</SelectItem>
                {parents.map((p) => <SelectItem key={p.id} value={p.id}>{familyLabel(p)}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
            {data.canEdit && (
              <Button className="ml-auto" onClick={() => dialog.replace(`skills/add/${collaboratorId}`)}>
                <PlusIcon data-icon="inline-start" />{t("add")}
              </Button>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("skill")}</TableHead>
                  <TableHead>{t("domain")}</TableHead>
                  <TableHead>{t("updatedAt")}</TableHead>
                  <TableHead>{t("endedAt")}</TableHead>
                  <TableHead>{t("state")}</TableHead>
                  <TableHead>{t("expertise")}</TableHead>
                  <TableHead className="text-right">{tg("list.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const expired = isSkillExpired(s.ended_at);
                  const p = parentOf(s);
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{familyLabel(s.skill)}</div>
                        {p && <div className="text-xs text-muted-foreground">{familyLabel(p)}</div>}
                      </TableCell>
                      <TableCell>{familyLabel(s.domain) || "—"}</TableCell>
                      <TableCell>{fmt(s.business_updated_at)}</TableCell>
                      <TableCell>{fmt(s.ended_at)}</TableCell>
                      <TableCell><StatusBadge color={expired ? EXPIRED_COLOR : ACTIVE_COLOR} label={t(expired ? "expired" : "active")} /></TableCell>
                      <TableCell>{s.expertise ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0}><Button variant="ghost" size="icon-sm" disabled aria-label={t("pdf")}><FileTextIcon /></Button></span>
                            </TooltipTrigger>
                            <TooltipContent>{t("pdfSoon")}</TooltipContent>
                          </Tooltip>
                          {data.canEdit && (
                            <>
                              <Button variant="ghost" size="icon-sm" aria-label={tg("actions.edit")}
                                onClick={() => dialog.replace(`skills/edit/${collaboratorId}/${s.id}`)}><PencilIcon /></Button>
                              <Button variant="ghost" size="icon-sm" aria-label={tg("actions.delete")} onClick={() => setToDelete(s)}><Trash2Icon /></Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title={tg("confirm.deleteTitle")} description={tg("confirm.noTrash")} confirmLabel={tg("actions.delete")}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteSkill(toDelete.id);
          if (!res.ok) { notify.error(message(res.error)); return; }
          notify.success(tg("toast.deleted"));
          await reload();
          router.refresh();
        }} />
    </ModalShell>
  );
}

type FormState = Omit<SkillInput, "expertise"> & { parent_id: string; expertise: string };

const EMPTY_SKILL: FormState = {
  parent_id: "", skill_id: "", activity_domain_id: null, started_at: "", business_updated_at: "", ended_at: "",
  expertise: "", description: "", comment: "",
};

function SkillForm({ collaboratorId, skillId, close }: { collaboratorId: string; skillId: string | null; close: () => void }) {
  const { data } = useSkillsData(collaboratorId);
  if (!data) return <SkillFormBody collaboratorId={collaboratorId} skillId={skillId} close={close} data={null} initial={EMPTY_SKILL} />;
  const s = skillId ? data.skills.find((x) => x.id === skillId) : undefined;
  const initial: FormState = s ? {
    parent_id: s.skill?.parent_id ?? "", skill_id: s.skill_id, activity_domain_id: s.activity_domain_id,
    started_at: s.started_at ?? "", business_updated_at: s.business_updated_at ?? "", ended_at: s.ended_at ?? "",
    expertise: s.expertise == null ? "" : String(s.expertise), description: s.description ?? "", comment: s.comment ?? "",
  } : EMPTY_SKILL;
  return <SkillFormBody key="ready" collaboratorId={collaboratorId} skillId={skillId} close={close} data={data} initial={initial} />;
}

function SkillFormBody({ collaboratorId, skillId, close, data, initial }: {
  collaboratorId: string; skillId: string | null; close: () => void; data: SkillsData | null; initial: FormState;
}) {
  const t = useTranslations("collaborators.skills");
  const te = useTranslations("collaborators.errors");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const router = useRouter();
  const message = useErrorMessage();
  const [form, setForm] = useState<FormState>(initial);
  const ready = !!data;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const back = () => dialog.replace(`skills/list/${collaboratorId}`);
  const parents = (data?.families ?? []).filter((f) => !f.parent_id);
  const children = (data?.families ?? []).filter((f) => f.parent_id && f.parent_id === form.parent_id);
  const used = new Set((data?.skills ?? []).filter((s) => s.id !== skillId).map((s) => s.skill_id));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.parent_id) e.parent_id = tg("validators.required");
    if (!form.skill_id) e.skill_id = tg("validators.required");
    else if (used.has(form.skill_id)) e.skill_id = te("skill_duplicate");
    const { started_at: s, business_updated_at: u, ended_at: f } = form;
    if (f && s && f < s) e.ended_at = te("endBeforeStart");
    else if (f && u && f < u) e.ended_at = te("endBeforeUpdate");
    if (u && s && u < s) e.business_updated_at = te("updateBeforeStart");
    const x = form.expertise === "" ? null : Number(form.expertise);
    if (x !== null && (!Number.isInteger(x) || x < 0 || x > 10)) e.expertise = te("skill_dates");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    start(async () => {
      const { parent_id, expertise, ...rest } = form;
      void parent_id;
      const input: SkillInput = { ...rest, expertise: expertise === "" ? null : Number(expertise) };
      const res = skillId ? await updateSkill(skillId, input) : await createSkill(collaboratorId, input);
      if (!res.ok) { notify.error(message(res.error)); return; }
      notify.success(skillId ? tg("toast.saved") : tg("toast.created"));
      router.refresh();
      back();
    });
  };

  const date = (key: "started_at" | "business_updated_at" | "ended_at", label: string) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`s-${key}`}>{label}</FieldLabel>
      <Input id={`s-${key}`} type="date" value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} aria-invalid={!!errors[key]} />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );

  return (
    <ModalShell onClose={close} size="md" icon={<EntityIcon kind="contributors" icon={AwardIcon} size="md" />}
      title={skillId ? t("editTitle") : t("addTitle")} subtitle={data?.name}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={back}>{t("back")}</Button>
          <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
          <Button onClick={submit} disabled={pending || !data}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
        </>
      }>
      {!data || !ready ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={!!errors.parent_id}>
              <FieldLabel>{t("parent")} *</FieldLabel>
              <Select value={form.parent_id || undefined} onValueChange={(v) => setForm((f) => ({ ...f, parent_id: v, skill_id: "" }))}>
                <SelectTrigger aria-invalid={!!errors.parent_id}><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
                <SelectContent><SelectGroup>{parents.map((p) => <SelectItem key={p.id} value={p.id}>{familyLabel(p)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              {errors.parent_id && <FieldError>{errors.parent_id}</FieldError>}
            </Field>
            <Field data-invalid={!!errors.skill_id}>
              <FieldLabel>{t("child")} *</FieldLabel>
              <Select value={form.skill_id || undefined} disabled={!form.parent_id} onValueChange={(v) => set("skill_id", v)}>
                <SelectTrigger aria-invalid={!!errors.skill_id}><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {children.map((c) => <SelectItem key={c.id} value={c.id} disabled={used.has(c.id)}>{familyLabel(c)}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
              {errors.skill_id && <FieldError>{errors.skill_id}</FieldError>}
            </Field>
          </div>
          <Field>
            <FieldLabel>{t("domain")}</FieldLabel>
            <Select value={form.activity_domain_id ?? "__none"} onValueChange={(v) => set("activity_domain_id", v === "__none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="__none">{tg("none")}</SelectItem>
                {data.domains.map((d) => <SelectItem key={d.id} value={d.id}>{familyLabel(d)}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-4">
            {date("started_at", t("startedAt"))}
            {date("business_updated_at", t("updatedAt"))}
            {date("ended_at", t("endedAt"))}
          </div>
          <Field data-invalid={!!errors.expertise}>
            <FieldLabel htmlFor="s-expertise">
              {form.expertise === "" ? t("expertise") : t("expertiseValue", { current: form.expertise })}
            </FieldLabel>
            <Input id="s-expertise" type="number" min={0} max={10} step={1} className="w-32" value={form.expertise}
              onChange={(e) => set("expertise", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="s-description">{t("description")}</FieldLabel>
            <Textarea id="s-description" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="s-comment">{t("comment")}</FieldLabel>
            <Textarea id="s-comment" value={form.comment ?? ""} onChange={(e) => set("comment", e.target.value)} />
          </Field>
        </FieldGroup>
      )}
    </ModalShell>
  );
}

/** ?dialog=skills/list/<collaboratorId> · skills/add/<collaboratorId> · skills/edit/<collaboratorId>/<skillId> */
export default function SkillsDialogs({ segments, close }: DialogProps) {
  const [action, collaboratorId, skillId] = segments;
  if (!collaboratorId) return null;
  if (action === "add") return <SkillForm key="add" collaboratorId={collaboratorId} skillId={null} close={close} />;
  if (action === "edit" && skillId) return <SkillForm key={skillId} collaboratorId={collaboratorId} skillId={skillId} close={close} />;
  return <SkillsList collaboratorId={collaboratorId} close={close} />;
}
