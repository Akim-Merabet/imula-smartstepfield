"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ClipboardListIcon, ListChecksIcon, PencilIcon, Settings2Icon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { DIALOG_PARAM } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";
import { NatureChip, useActionError } from "../components/form-chips";
import { setResponseInProgress } from "../responses/actions";
import { linkFormsToBlock, updateBlockLink } from "./actions";
import { notifyFormBlockChanged } from "./form-block";

type ProjectForm = {
  id: string; name: string; nature: string; index_label: string | null; enabled: boolean;
  family: { short_name: string; long_name: string | null; color: string } | null;
};

/** ?dialog=form-lib/link/<blockId> — lier un formulaire de l'entité au bloc. */
export function LinkFormDialog({ blockId, close }: { blockId: string; close: () => void }) {
  const t = useTranslations("forms.block");
  const tg = useTranslations("global");
  const errorText = useActionError();
  const [forms, setForms] = useState<ProjectForm[] | null>(null);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: block } = await supabase.from("blocks").select("flow:flows(project_id)").eq("id", blockId).maybeSingle();
      const projectId = (block?.flow as { project_id: string } | null)?.project_id;
      if (!projectId) { setForms([]); return; }
      const [{ data }, { data: links }] = await Promise.all([
        supabase.from("forms").select("id, name, nature, index_label, enabled, family:label_families!forms_family_id_fkey(short_name, long_name, color)")
          .eq("project_id", projectId).is("deleted_at", null).order("name"),
        supabase.from("form_block_links").select("form_id").eq("block_id", blockId),
      ]);
      setForms((data ?? []) as unknown as ProjectForm[]);
      setLinked(new Set((links ?? []).map((l) => l.form_id)));
    })();
  }, [blockId]);

  const submit = () => startTransition(async () => {
    const res = await linkFormsToBlock(blockId, selected);
    if (!res.ok) { notify.error(errorText(res.error)); return; }
    notify.success(t("linked", { count: res.data.linked }));
    notifyFormBlockChanged();
    close();
  });

  return (
    <ModalShell onClose={close} size="md" icon={<EntityIcon kind="project" icon={ClipboardListIcon} size="md" />} title={t("linkTitle")}
      footer={<>
        <Button variant="outline" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || selected.length === 0}>{pending && <Spinner data-icon="inline-start" />}{t("link")}</Button>
      </>}>
      {!forms ? <div className="flex justify-center py-12"><Spinner /></div> : forms.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">{t("noProjectForm")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {forms.map((f) => {
            const already = linked.has(f.id);
            return (
              <li key={f.id}>
                <label className={`flex items-center gap-3 px-3 py-2 ${already || !f.enabled ? "opacity-60" : "cursor-pointer hover:bg-row-hover"}`}>
                  <Checkbox checked={selected.includes(f.id)} disabled={already || !f.enabled}
                    onCheckedChange={(v) => setSelected((s) => (v ? [...s, f.id].slice(0, 10) : s.filter((x) => x !== f.id)))} />
                  <NatureChip nature={f.nature} />
                  <FamilyChip color={f.family?.color} shortName={f.family?.short_name} longName={f.family?.long_name} />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="text-sm text-muted-foreground">{f.index_label ?? ""}</span>
                  {already && <Badge variant="secondary">{t("alreadyLinked")}</Badge>}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </ModalShell>
  );
}

type LinkRow = {
  id: string; mandatory: boolean; unique_response: boolean; unique_mode: Enums<"unique_mode">;
  initial_rubric_lineage_id: string | null; fillable_rubric_lineage_ids: string[] | null; form_id: string;
  form: { name: string } | null; block: { state: Enums<"block_state"> } | null;
};

/** ?dialog=form-lib/link-settings/<linkId> — paramètres de liaison (spec 03 §6.3). */
export function LinkSettingsDialog({ linkId, close }: { linkId: string; close: () => void }) {
  const t = useTranslations("forms.block");
  const tg = useTranslations("global");
  const errorText = useActionError();
  const [link, setLink] = useState<LinkRow | null>(null);
  const [rubrics, setRubrics] = useState<{ lineage_id: string; name: string; position: number }[]>([]);
  const [draft, setDraft] = useState<Partial<LinkRow>>({});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.from("form_block_links")
        .select("id, mandatory, unique_response, unique_mode, initial_rubric_lineage_id, fillable_rubric_lineage_ids, form_id, form:forms(name), block:blocks(state)")
        .eq("id", linkId).maybeSingle();
      if (!data) return;
      const row = data as unknown as LinkRow;
      setLink(row);
      setDraft(row);
      const { data: r } = await supabase.from("form_rubrics").select("lineage_id, name, position").eq("form_id", row.form_id).order("position");
      setRubrics(r ?? []);
    })();
  }, [linkId]);

  const restricted = draft.fillable_rubric_lineage_ids !== null && draft.fillable_rubric_lineage_ids !== undefined;
  const conflict = restricted && !!draft.initial_rubric_lineage_id && !draft.fillable_rubric_lineage_ids!.includes(draft.initial_rubric_lineage_id);
  const redaction = link?.block?.state === "redaction";

  const submit = () => startTransition(async () => {
    const res = await updateBlockLink(linkId, {
      mandatory: !!draft.mandatory, unique_response: !!draft.unique_response,
      ...(redaction ? { unique_mode: draft.unique_mode } : {}),
      initial_rubric_lineage_id: draft.initial_rubric_lineage_id ?? null,
      fillable_rubric_lineage_ids: restricted ? draft.fillable_rubric_lineage_ids : null,
    });
    if (!res.ok) { notify.error(res.error === "block_not_redaction" ? t("modeRedactionOnly") : errorText(res.error)); return; }
    notify.success(tg("toast.saved"));
    notifyFormBlockChanged();
    close();
  });

  return (
    <ModalShell onClose={close} size="md" icon={<EntityIcon kind="project" icon={Settings2Icon} size="md" />}
      title={t("settingsTitle", { name: link?.form?.name ?? "" })}
      footer={<>
        <Button variant="outline" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !link}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {!link ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <FieldGroup>
          <Field orientation="horizontal">
            <Switch id="link-mandatory" checked={!!draft.mandatory} onCheckedChange={(v) => setDraft((d) => ({ ...d, mandatory: v }))} />
            <div className="flex flex-col">
              <FieldLabel htmlFor="link-mandatory">{t("mandatory")}</FieldLabel>
              <FieldDescription>{t("mandatoryHint")}</FieldDescription>
            </div>
          </Field>
          <Field orientation="horizontal">
            <Switch id="link-unique" checked={!!draft.unique_response} onCheckedChange={(v) => setDraft((d) => ({ ...d, unique_response: v }))} />
            <div className="flex flex-col">
              <FieldLabel htmlFor="link-unique">{t("unique")}</FieldLabel>
              <FieldDescription>{t("uniqueHint")}</FieldDescription>
            </div>
          </Field>
          {draft.unique_response && (
            <Field>
              <FieldLabel>{t("uniqueMode")}</FieldLabel>
              <Select value={draft.unique_mode} onValueChange={(v) => setDraft((d) => ({ ...d, unique_mode: v as Enums<"unique_mode"> }))} disabled={!redaction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(["new_or_resume", "new_response", "resume_response"] as const).map((m) => <SelectItem key={m} value={m}>{t(`uniqueModes.${m}`)}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>{redaction ? t("uniqueModeHint") : t("modeRedactionOnly")}</FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel>{t("guideTo")}</FieldLabel>
            <Select value={draft.initial_rubric_lineage_id ?? "__none"} onValueChange={(v) => setDraft((d) => ({ ...d, initial_rubric_lineage_id: v === "__none" ? null : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__none">{t("guideNone")}</SelectItem>
                  {rubrics.map((r) => <SelectItem key={r.lineage_id} value={r.lineage_id}>{r.position}. {r.name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{t("guideHint")}</FieldDescription>
          </Field>
          <FieldSet>
            <Field orientation="horizontal">
              <Switch id="link-restrict" checked={restricted}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, fillable_rubric_lineage_ids: v ? rubrics.map((r) => r.lineage_id) : null }))} />
              <FieldLabel htmlFor="link-restrict">{t("restrict")}</FieldLabel>
            </Field>
            {restricted && (
              <div className="flex flex-col gap-2 pl-12">
                <FieldLegend variant="label">{t("allowFillOf")}</FieldLegend>
                {rubrics.map((r) => (
                  <label key={r.lineage_id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={draft.fillable_rubric_lineage_ids!.includes(r.lineage_id)}
                      onCheckedChange={(v) => setDraft((d) => ({
                        ...d, fillable_rubric_lineage_ids: v ? [...d.fillable_rubric_lineage_ids!, r.lineage_id] : d.fillable_rubric_lineage_ids!.filter((x) => x !== r.lineage_id),
                      }))} />
                    {r.position}. {r.name}
                  </label>
                ))}
                {draft.fillable_rubric_lineage_ids!.length === 0 && <Alert variant="destructive"><AlertDescription>{t("allReadOnly")}</AlertDescription></Alert>}
              </div>
            )}
          </FieldSet>
          {conflict && <Alert><AlertDescription>{t("conflict")}</AlertDescription></Alert>}
        </FieldGroup>
      )}
    </ModalShell>
  );
}

type ResponseRow = {
  id: string; reference: string; form_index_label: string | null; state: Enums<"response_state">; created_at: string; updated_at: string;
  status: { name: string; color: string } | null; link: { flow: { project_id: string } | null } | null;
};

/** ?dialog=form-lib/link-responses/<linkId> — « Gestion des réponses de formulaire » d'une liaison. */
export function LinkResponsesDialog({ linkId, close }: { linkId: string; close: () => void }) {
  const t = useTranslations("forms.responses");
  const tg = useTranslations("global");
  const format = useFormatter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const errorText = useActionError();
  const [rows, setRows] = useState<ResponseRow[] | null>(null);

  const load = useMemo(() => () => {
    createClient().from("form_responses")
      .select("id, reference, form_index_label, state, created_at, updated_at, status:custom_statuses(name, color), link:form_block_links(flow:flows(project_id))")
      .eq("block_link_id", linkId).is("deleted_at", null).order("created_at", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as unknown as ResponseRow[]));
  }, [linkId]);
  useEffect(() => { load(); }, [load]);

  const returnTo = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(DIALOG_PARAM);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  })();
  const date = (d: string) => format.dateTime(new Date(d), { dateStyle: "short", timeStyle: "short" });

  return (
    <ModalShell onClose={close} size="lg" icon={<EntityIcon kind="project" icon={ListChecksIcon} size="md" />} title={t("title")}>
      {!rows ? <div className="flex justify-center py-12"><Spinner /></div> : rows.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">{tg("list.emptyTitle")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-table-head">
            <tr className="border-b-2">
              <th className="py-2 pr-3">{t("columns.reference")}</th><th className="pr-3">{t("columns.index")}</th>
              <th className="pr-3">{t("columns.state")}</th><th className="pr-3">{t("columns.status")}</th>
              <th className="pr-3">{t("columns.createdAt")}</th><th className="pr-3">{t("columns.updatedAt")}</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const projectId = r.link?.flow?.project_id;
              return (
                <tr key={r.id} className="border-b">
                  <td className="py-2 pr-3 font-medium">{r.reference}</td>
                  <td className="pr-3">{r.form_index_label ?? "—"}</td>
                  <td className="pr-3"><Badge variant={r.state === "done" ? "default" : "secondary"}>{t(`state.${r.state}`)}</Badge></td>
                  <td className="pr-3"><StatusBadge color={r.status?.color} label={r.status?.name} /></td>
                  <td className="pr-3">{date(r.created_at)}</td>
                  <td className="pr-3">{date(r.updated_at)}</td>
                  <td className="text-right whitespace-nowrap">
                    {r.state === "done" && (
                      <Button variant="ghost" size="sm" onClick={async () => {
                        const res = await setResponseInProgress(r.id);
                        if (res.ok) { notify.success(tg("toast.saved")); load(); notifyFormBlockChanged(); } else notify.error(errorText(res.error));
                      }}>{t("actions.backToInProgress")}</Button>
                    )}
                    {projectId && (
                      <Button variant="ghost" size="icon-sm" asChild aria-label={t("actions.edit")}>
                        <Link href={`/explore/projects/${projectId}/responses/${r.id}?${new URLSearchParams({ returnTo })}`}><PencilIcon /></Link>
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </ModalShell>
  );
}
