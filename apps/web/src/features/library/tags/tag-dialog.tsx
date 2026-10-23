"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BarcodeIcon, ExternalLinkIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ColorField } from "@/features/settings/components/color-field";
import { useDirtyGuard } from "@/features/settings/components/dirty-guard";
import { useSiblings } from "@/features/settings/components/use-siblings";
import { createClient } from "@/lib/supabase/client";
import { Loading, useLibraryRights, useLibraryRun } from "../shared/ui";
import { saveTag } from "./actions";

type Form = { name: string; parent_id: string | null; account_id: string | null; color: string; description: string };
const EMPTY: Form = { name: "", parent_id: null, account_id: null, color: "#1f5086", description: "" };
const NONE = "__none";

/** ?dialog=library-tag/add · add-child/<parent> · edit/<id> · linked-flows/<id> — Bibliothèque › Étiquettes. */
export default function TagDialog({ segments, close }: DialogProps) {
  const [action, a] = segments;
  if (action === "linked-flows" && a) return <LinkedFlows id={a} close={close} />;
  return <TagEditor segments={segments} close={close} />;
}

function TagEditor({ segments, close }: DialogProps) {
  const t = useTranslations("tags");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const { run } = useLibraryRun("tags");
  const rights = useLibraryRights("LibraryTags");
  const [action, a] = segments;
  const isEdit = action === "edit";
  const id = isEdit ? a : null;
  const parentFromUrl = action === "add-child" ? a : null;
  const canWrite = !!rights && (isEdit ? rights.edit : rights.add);
  const [form, setForm] = useState<Form>({ ...EMPTY, parent_id: parentFromUrl });
  const [initial, setInitial] = useState<Form>({ ...EMPTY, parent_id: parentFromUrl });
  const [tags, setTags] = useState<{ id: string; name: string; parent_id: string | null }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState(!isEdit);
  const [error, setError] = useState(false);
  const [createAnother, setCreateAnother] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const { requestClose, dialog: guard } = useDirtyGuard(dirty, close);
  const siblings = useSiblings(async () => {
    const { data } = await createClient().from("tags").select("id").order("position").order("name");
    return (data ?? []).map((r) => r.id);
  }, id);

  useEffect(() => {
    const supabase = createClient();
    void Promise.all([
      supabase.from("tags").select("id, name, parent_id").order("name"),
      supabase.from("accounts").select("id, name").order("name"),
    ]).then(([tg_, acc]) => { setTags(tg_.data ?? []); setAccounts(acc.data ?? []); });
  }, []);
  useEffect(() => {
    if (!id) return;
    createClient().from("tags").select("name, parent_id, account_id, color, description").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      const value: Form = { name: data.name, parent_id: data.parent_id, account_id: data.account_id, color: data.color, description: data.description ?? "" };
      setForm(value); setInitial(value); setLoaded(true);
    });
  }, [id]);

  const parentOptions = useMemo(() => {
    if (!id) return tags;
    const banned = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const x of tags) if (x.parent_id && banned.has(x.parent_id) && !banned.has(x.id)) { banned.add(x.id); grew = true; }
    }
    return tags.filter((x) => !banned.has(x.id));
  }, [tags, id]);
  const parentName = tags.find((x) => x.id === parentFromUrl)?.name ?? "";
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    if (!form.name.trim()) { setError(true); return; }
    startTransition(async () => {
      const res = await run(() => saveTag(id, { ...form, description: form.description || null }), id ? undefined : t("dialog.created"));
      if (!res.ok) return;
      setInitial(form);
      if (!id && createAnother) { const next = { ...EMPTY, parent_id: form.parent_id, account_id: form.account_id, color: form.color }; setForm(next); setInitial(next); return; }
      close();
    });
  };

  const select = (elId: string, value: string | null, onChange: (v: string | null) => void, options: { id: string; name: string }[], noneLabel: string) => (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={!canWrite}>
      <SelectTrigger id={elId}><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
      </SelectGroup></SelectContent>
    </Select>
  );

  return (
    <ModalShell onClose={requestClose} size="md" icon={<EntityIcon kind="library" icon={BarcodeIcon} size="md" />}
      title={isEdit ? t("dialog.editTitle") : parentFromUrl ? t("dialog.createChildTitle", { parentName }) : t("dialog.createTitle")}
      subtitle={isEdit ? initial.name : undefined}
      onPrevious={siblings.previous ? () => dialog.replace(`library-tag/edit/${siblings.previous}`) : undefined}
      onNext={siblings.next ? () => dialog.replace(`library-tag/edit/${siblings.next}`) : undefined}
      footer={canWrite ? <>
        {!isEdit && (
          <label className="mr-auto flex items-center gap-2 text-sm">
            <Checkbox checked={createAnother} onCheckedChange={(v) => setCreateAnother(!!v)} />{t("dialog.createAnother")}
          </label>
        )}
        <Button variant="secondary" onClick={requestClose}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </> : <Button variant="secondary" onClick={requestClose}>{tg("actions.close")}</Button>}>
      {!loaded ? <Loading /> : (
        <FieldGroup>
          <Field data-invalid={error}>
            <FieldLabel htmlFor="tag-name">{t("dialog.fields.name")} *</FieldLabel>
            <Input id="tag-name" value={form.name} maxLength={255} disabled={!canWrite} aria-invalid={error}
              onChange={(e) => { set("name", e.target.value); setError(false); }} />
            {error && <FieldError>{tg("validators.required")}</FieldError>}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="tag-parent">{t("dialog.fields.parent")}</FieldLabel>
              {select("tag-parent", form.parent_id, (v) => set("parent_id", v), parentOptions, t("dialog.fields.noParent"))}
            </Field>
            <Field>
              <FieldLabel htmlFor="tag-account">{t("dialog.fields.applicability")}</FieldLabel>
              {select("tag-account", form.account_id, (v) => set("account_id", v), accounts, t("organization"))}
            </Field>
          </div>
          <ColorField label={t("dialog.fields.color")} value={form.color} onChange={(v) => set("color", v)} disabled={!canWrite} />
          <Field>
            <FieldLabel htmlFor="tag-desc">{t("dialog.fields.description")}</FieldLabel>
            <Textarea id="tag-desc" value={form.description} maxLength={5000} disabled={!canWrite} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </FieldGroup>
      )}
      {guard}
    </ModalShell>
  );
}

type FlowRef = { id: string; name: string; ref_int: string | null; project_id: string; project: { designation: string } | null } | null;
type LinkRow = { key: string; level: "flow" | "phase" | "step"; flow: FlowRef; phase: string | null; step: string | null };

/** « Flow(s) lié(s) » : flows, phases et étapes portant l'étiquette (lecture seule). */
function LinkedFlows({ id, close }: { id: string; close: () => void }) {
  const t = useTranslations("tags.linkedFlows");
  const tg = useTranslations("global");
  const [name, setName] = useState("");
  const [rows, setRows] = useState<LinkRow[] | null>(null);
  const [filter, setFilter] = useState("");
  useEffect(() => {
    const supabase = createClient();
    const FLOW = "id, name, ref_int, project_id, project:projects(designation)";
    void Promise.all([
      supabase.from("tags").select("name").eq("id", id).single(),
      supabase.from("flow_tags").select(`flow:flows(${FLOW})`).eq("tag_id", id),
      supabase.from("phase_tags").select(`phase:phases(id, name, flow:flows(${FLOW}))`).eq("tag_id", id),
      supabase.from("step_tags").select(`step:steps(id, name, phase:phases(name), flow:flows(${FLOW}))`).eq("tag_id", id),
    ]).then(([tag, flows, phases, steps]) => {
      setName(tag.data?.name ?? "");
      type F = { flow: FlowRef };
      type P = { phase: { id: string; name: string; flow: FlowRef } | null };
      type S = { step: { id: string; name: string; phase: { name: string } | null; flow: FlowRef } | null };
      const out: LinkRow[] = [
        ...((flows.data ?? []) as unknown as F[]).filter((r) => r.flow).map((r) => ({ key: `f-${r.flow!.id}`, level: "flow" as const, flow: r.flow, phase: null, step: null })),
        ...((phases.data ?? []) as unknown as P[]).filter((r) => r.phase?.flow).map((r) => ({ key: `p-${r.phase!.id}`, level: "phase" as const, flow: r.phase!.flow, phase: r.phase!.name, step: null })),
        ...((steps.data ?? []) as unknown as S[]).filter((r) => r.step?.flow).map((r) => ({ key: `s-${r.step!.id}`, level: "step" as const, flow: r.step!.flow, phase: r.step!.phase?.name ?? null, step: r.step!.name })),
      ];
      setRows(out);
    });
  }, [id]);
  const visible = (rows ?? []).filter((r) => !filter || r.flow?.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <ModalShell onClose={close} size="lg" icon={<EntityIcon kind="library" icon={BarcodeIcon} size="md" />} title={t("title", { name })}
      footer={<Button variant="secondary" onClick={close}>{tg("actions.back")}</Button>}>
      {!rows ? <Loading /> : (
        <div className="flex flex-col gap-3">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("filter")} aria-label={t("filter")} className="w-72" />
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-table-head">
              <th className="py-2 pr-3">{t("columns.project")}</th><th className="pr-3">{t("columns.flow")}</th><th className="pr-3">{t("columns.phase")}</th>
              <th className="pr-3">{t("columns.step")}</th><th className="w-20 text-right">{t("columns.action")}</th>
            </tr></thead>
            <tbody>
              {visible.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">{t("empty")}</td></tr>}
              {visible.map((r) => (
                <tr key={r.key} className="border-b">
                  <td className="py-2 pr-3">{r.flow?.project?.designation ?? "—"}</td>
                  <td className="pr-3"><div className="font-medium">{r.flow?.name}</div>{r.flow?.ref_int && <div className="text-xs text-muted-foreground">{r.flow.ref_int}</div>}</td>
                  <td className="pr-3">{r.phase ?? "—"}</td>
                  <td className="pr-3">{r.step ?? "—"}</td>
                  <td className="text-right">
                    {r.flow && (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/explore/projects/${r.flow.project_id}/flow/${r.flow.id}`} target="_blank"><ExternalLinkIcon data-icon="inline-start" />{t("see")}</Link>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
  );
}
