"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { AwardIcon, FileTextIcon, HardHatIcon, PencilIcon, SearchIcon, UserPlusIcon, UserRoundIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { importMembers, updateMember } from "../actions";
import { HierarchyPicker, type HierarchyOption } from "../components/hierarchy-picker";
import { loadHierarchyOptions } from "../hierarchies";

const EDITABLE_ROLES = ["readonly", "writer", "expert", "responsible"] as const;
const ADMINS = ["admin", "global_admin", "siteflow_admin"];

/** ?dialog=project-member/import/<projectId> · edit/<projectId>/<collaboratorId> · skills/<collaboratorId> */
export default function MemberDialogs({ segments, close }: DialogProps) {
  const [action, a, b] = segments;
  if (action === "import" && a) return <ImportMembersDialog projectId={a} close={close} />;
  if (action === "edit" && a && b) return <EditMemberDialog projectId={a} collaboratorId={b} close={close} />;
  if (action === "skills" && a) return <MemberSkillsDialog collaboratorId={a} close={close} />;
  return null;
}

type Candidate = {
  id: string; kind: Enums<"collaborator_kind">; first_name: string; last_name: string; authority: Enums<"authority"> | null;
  company: { name: string } | null; function: { short_name: string; long_name: string | null; color: string } | null;
};

function ImportMembersDialog({ projectId, close }: { projectId: string; close: () => void }) {
  const t = useTranslations("dashboard");
  const tg = useTranslations("global");
  const router = useRouter();
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [operatorsAllowed, setOperatorsAllowed] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("writer");
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const [{ data: collabs }, { data: members }, { data: project }] = await Promise.all([
        supabase.from("collaborators").select(`id, kind, first_name, last_name, authority, company:companies(name),
          function:label_families!collaborators_function_id_fkey(short_name, long_name, color)`)
          .eq("status", "active").is("deleted_at", null).order("last_name").order("first_name"),
        supabase.from("project_members").select("collaborator_id").eq("project_id", projectId),
        supabase.from("projects").select("type").eq("id", projectId).single(),
      ]);
      if (!active) return;
      setRows((collabs ?? []) as unknown as Candidate[]);
      setExisting(new Set((members ?? []).map((m) => m.collaborator_id)));
      setOperatorsAllowed(!!project && ["project", "pgac", "referential"].includes(project.type));
    })();
    return () => { active = false; };
  }, [projectId]);

  const isDisabled = (c: Candidate) => existing.has(c.id) || (c.kind === "operator" && !operatorsAllowed);
  const visible = useMemo(() => (rows ?? []).filter((c) =>
    `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const selectable = visible.filter((c) => !isDisabled(c));
  const allSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.id));

  const toggle = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const toggleAll = (on: boolean) => setSelected((s) => {
    const n = new Set(s);
    selectable.forEach((c) => (on ? n.add(c.id) : n.delete(c.id)));
    return n;
  });

  const submit = () => start(async () => {
    const res = await importMembers(projectId, [...selected], role);
    if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error")); return; }
    notify.success(t("members.import.success", { count: res.data.added }));
    router.refresh();
    close();
  });

  return (
    <ModalShell onClose={close} size="md" icon={<EntityIcon kind="contributors" icon={UserPlusIcon} size="md" />}
      title={t("members.import.title")} subtitle={t("members.import.subtitle")}
      footer={
        <>
          <Field orientation="horizontal" className="mr-auto w-auto">
            <FieldLabel className="whitespace-nowrap">{t("members.import.defaultRole")}</FieldLabel>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>{EDITABLE_ROLES.map((r) => <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>)}</SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
          <Button onClick={submit} disabled={pending || selected.size === 0}>
            {pending && <Spinner data-icon="inline-start" />}{t("members.import.submit")}
            {selected.size > 0 && <Badge variant="secondary">{selected.size}</Badge>}
          </Button>
        </>
      }>
      {!rows ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div className="flex flex-col gap-3">
          <InputGroup>
            <InputGroupAddon><SearchIcon /></InputGroupAddon>
            <InputGroupInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("members.import.search")} />
          </InputGroup>
          <label className="flex items-center gap-2 px-2 text-sm font-medium">
            <Checkbox checked={allSelected} disabled={!selectable.length} onCheckedChange={(v) => toggleAll(!!v)} />
            {t("members.import.selectAll")}
            <span className="font-normal text-muted-foreground">{tg("list.selected", { count: selected.size })}</span>
          </label>
          {visible.length === 0 ? <p className="py-8 text-center text-muted-foreground">{t("members.import.empty")}</p> : (
            <div className="flex flex-col divide-y rounded-md border">
              {visible.map((c) => {
                const disabled = isDisabled(c);
                const Icon = c.kind === "operator" ? HardHatIcon : UserRoundIcon;
                return (
                  <label key={c.id} className={cn("flex items-center gap-3 px-3 py-2 text-sm", disabled ? "opacity-50" : "cursor-pointer hover:bg-muted")}>
                    <Checkbox checked={existing.has(c.id) || selected.has(c.id)} disabled={disabled} onCheckedChange={(v) => toggle(c.id, !!v)} />
                    <Icon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{c.last_name} {c.first_name}</span>
                    {c.function && <FamilyChip color={c.function.color} shortName={c.function.short_name} longName={c.function.long_name} />}
                    <span className="w-32 truncate text-muted-foreground">{c.company?.name}</span>
                    <span className="w-28 text-right text-xs text-muted-foreground">
                      {existing.has(c.id) ? t("members.import.alreadyImported")
                        : c.kind === "operator" ? (operatorsAllowed ? t("roles.operator") : "")
                        : c.authority && ADMINS.includes(c.authority) ? t("roles.responsible") : ""}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {!operatorsAllowed && <p className="text-xs text-muted-foreground">{t("members.import.operatorNotAllowed")}</p>}
        </div>
      )}
    </ModalShell>
  );
}

function EditMemberDialog({ projectId, collaboratorId, close }: { projectId: string; collaboratorId: string; close: () => void }) {
  const t = useTranslations("dashboard");
  const tg = useTranslations("global");
  const router = useRouter();
  const [data, setData] = useState<{ name: string; kind: string; options: HierarchyOption[]; locked: Set<string> } | null>(null);
  const [role, setRole] = useState<string>("writer");
  const [hier, setHier] = useState<string[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const [{ data: member }, { data: current }, options, { data: locked }] = await Promise.all([
        supabase.from("project_members").select("role, collaborator:collaborators(first_name, last_name, kind)")
          .eq("project_id", projectId).eq("collaborator_id", collaboratorId).single(),
        supabase.from("project_member_hierarchies").select("hierarchy_id").eq("project_id", projectId).eq("collaborator_id", collaboratorId),
        loadHierarchyOptions(supabase, projectId),
        supabase.from("flow_collaborators").select("flow:flows!inner(project_id), hierarchies:flow_collaborator_hierarchies(hierarchy_id)")
          .eq("collaborator_id", collaboratorId).eq("flow.project_id", projectId),
      ]);
      if (!active || !member) return;
      const c = member.collaborator as unknown as { first_name: string; last_name: string; kind: string } | null;
      setRole(member.role);
      setHier((current ?? []).map((h) => h.hierarchy_id));
      setData({
        name: c ? `${c.first_name} ${c.last_name}` : "", kind: c?.kind ?? "user", options,
        locked: new Set((locked ?? []).flatMap((f) => (f.hierarchies ?? []).map((l) => l.hierarchy_id))),
      });
    })();
    return () => { active = false; };
  }, [projectId, collaboratorId]);

  const submit = () => start(async () => {
    const res = await updateMember(projectId, collaboratorId, { role, hierarchyIds: hier });
    if (!res.ok) {
      notify.error(res.error === "forbidden" ? tg("toast.forbidden") : res.error === "hierarchy_locked" ? t("members.edit.hierarchyLocked") : tg("toast.error"));
      return;
    }
    notify.success(tg("toast.saved"));
    router.refresh();
    close();
  });

  const isOperator = data?.kind === "operator";
  return (
    <ModalShell onClose={close} size="sm" icon={<EntityIcon kind="contributors" icon={PencilIcon} size="md" />}
      title={t("members.edit.title", { name: data?.name ?? "" })}
      footer={
        <>
          <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
          <Button onClick={submit} disabled={pending || !data}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
        </>
      }>
      {!data ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <FieldGroup>
          <Field>
            <FieldLabel>{t("members.edit.role")} *</FieldLabel>
            <Select value={role} onValueChange={setRole} disabled={isOperator}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(isOperator ? ["operator" as const] : EDITABLE_ROLES).map((r) => <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
            {isOperator && <FieldDescription>{t("members.edit.operatorRole")}</FieldDescription>}
          </Field>
          <Field>
            <FieldLabel>{t("members.edit.hierarchies")}</FieldLabel>
            <HierarchyPicker options={data.options} value={hier} onChange={setHier} lockedIds={data.locked} />
          </Field>
        </FieldGroup>
      )}
    </ModalShell>
  );
}

type SkillRow = {
  id: string; business_updated_at: string | null; ended_at: string | null; file_paths: string[];
  skill: { short_name: string; long_name: string | null; color: string } | null;
};

function MemberSkillsDialog({ collaboratorId, close }: { collaboratorId: string; close: () => void }) {
  const t = useTranslations("dashboard.members.skills");
  const format = useFormatter();
  const [name, setName] = useState("");
  const [rows, setRows] = useState<SkillRow[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const [{ data: c }, { data: skills }] = await Promise.all([
        supabase.from("collaborators").select("first_name, last_name").eq("id", collaboratorId).maybeSingle(),
        supabase.from("collaborator_skills").select(`id, business_updated_at, ended_at, file_paths,
          skill:label_families!collaborator_skills_skill_id_fkey(short_name, long_name, color)`)
          .eq("collaborator_id", collaboratorId).eq("archived", false).order("sort_order"),
      ]);
      if (!active) return;
      setName(c ? `${c.first_name} ${c.last_name}` : "");
      setRows((skills ?? []) as unknown as SkillRow[]);
    })();
    return () => { active = false; };
  }, [collaboratorId]);

  const today = new Date().toISOString().slice(0, 10);
  const date = (d: string | null) => (d ? format.dateTime(new Date(d), { dateStyle: "short" }) : "—");

  return (
    <ModalShell onClose={close} size="md" icon={<EntityIcon kind="contributors" icon={AwardIcon} size="md" />} title={t("title", { name })}>
      {!rows ? <div className="flex justify-center py-16"><Spinner /></div> : rows.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("skill")}</TableHead><TableHead>{t("updatedAt")}</TableHead><TableHead>{t("endedAt")}</TableHead>
              <TableHead>{t("state")}</TableHead><TableHead>{t("pdf")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => {
              const expired = !!s.ended_at && s.ended_at < today;
              return (
                <Fragment key={s.id}>
                  <TableRow>
                    <TableCell><FamilyChip color={s.skill?.color} shortName={s.skill?.short_name} longName={s.skill?.long_name} /></TableCell>
                    <TableCell>{date(s.business_updated_at)}</TableCell>
                    <TableCell>{date(s.ended_at)}</TableCell>
                    <TableCell className={expired ? "text-destructive" : "text-success"}>{expired ? t("inactive") : t("active")}</TableCell>
                    <TableCell>{s.file_paths.length ? <FileTextIcon className="size-4" aria-label={t("pdf")} /> : "—"}</TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </ModalShell>
  );
}
