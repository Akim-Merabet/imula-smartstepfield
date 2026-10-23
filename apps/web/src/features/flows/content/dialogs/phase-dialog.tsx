"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayersIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { CustomFieldsEditor, type CustomFieldDef, type CustomFieldValues } from "@/components/custom-fields/custom-fields-editor";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { createPhase, updatePhase } from "../../content-actions";
import type { PhaseInput } from "../../schema";
import { contentError } from "../errors";

const EMPTY: PhaseInput = {
  name: "", custom_number: "", exclude_numbering: false, additional_comment: "", description: "", hide_title_pdf: false,
  read_only_on_mobile_app: false, sequence_type: "linear", mandatory: true, custom_fields: {},
};

/** Modale phase : création (`phase-add/<flowId>`) ou édition (`phase-edit/<phaseId>`) — §4.2. */
export function PhaseDialog({ mode, id, tab, close }: { mode: "add" | "edit"; id: string; tab: string; close: () => void }) {
  const t = useTranslations("flowContent.phase");
  const tc = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const dialog = useDialog();
  const [form, setForm] = useState<PhaseInput>(EMPTY);
  const [fields, setFields] = useState<CustomFieldDef[] | null>(null);
  const [siblings, setSiblings] = useState<{ id: string; name: string; disabled: boolean }[]>([]);
  const [meta, setMeta] = useState<{ flowId: string; disabled: boolean; number: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [another, setAnother] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const { data: cf } = await supabase.from("custom_fields").select("id, name, type, choices, placeholder, tooltip, description, required, read_only, default_value")
        .eq("nature", "phase").eq("active", true).is("deleted_at", null).order("sort_order");
      if (!active) return;
      setFields(cf ?? []);
      let flowId = id;
      if (mode === "edit") {
        const [{ data: p }, { data: values }] = await Promise.all([
          supabase.from("phases").select("*").eq("id", id).single(),
          supabase.from("custom_field_values").select("custom_field_id, value_text, value_json").eq("object_id", id),
        ]);
        if (!active || !p) return;
        flowId = p.flow_id;
        const vals: CustomFieldValues = {};
        for (const v of values ?? []) vals[v.custom_field_id] = Array.isArray(v.value_json) ? (v.value_json as string[]) : v.value_text;
        setForm({
          name: p.name, custom_number: p.custom_number ?? "", exclude_numbering: p.exclude_numbering, additional_comment: p.additional_comment ?? "",
          description: p.description ?? "", hide_title_pdf: p.hide_title_pdf, read_only_on_mobile_app: p.read_only_on_mobile_app,
          sequence_type: p.sequence_type, mandatory: p.mandatory, custom_fields: vals,
        });
        setMeta({ flowId, disabled: p.disabled, number: p.position });
      }
      const { data: all } = await supabase.from("phases").select("id, name, disabled").eq("flow_id", flowId).order("position");
      if (!active) return;
      setSiblings(all ?? []);
      if (mode === "add") setMeta({ flowId, disabled: false, number: (all?.length ?? 0) + 1 });
    })();
    return () => { active = false; };
  }, [mode, id]);

  const set = <K extends keyof PhaseInput>(k: K, v: PhaseInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const goTab = (tabId: string) => dialog.replace(`flow-content/phase-${mode}/${id}/${tabId}`);
  const idx = siblings.findIndex((s) => s.id === id);

  const submit = () => {
    if (!form.name.trim()) { setError(tg("validators.required")); goTab("general-tab"); return; }
    start(async () => {
      const res = mode === "edit" ? await updatePhase(id, form) : await createPhase(id, form);
      if (!res.ok) { notify.error(contentError(tc, tg, res.error)); return; }
      notify.success(mode === "edit" ? tg("toast.saved") : t("created"));
      router.refresh();
      if (mode === "add" && another) { setForm(EMPTY); return; }
      if (mode === "add" && res.data && typeof res.data === "object" && "id" in res.data) {
        dialog.replace(`flow-content/phase-edit/${(res.data as { id: string }).id}/general-tab`);
        return;
      }
      close();
    });
  };

  const tabs = [{ id: "general-tab", label: tc("dialogTabs.general") }, { id: "attribute-tab", label: tc("dialogTabs.attributes") }];
  const loading = !fields || !meta;

  return (
    <ModalShell onClose={close} size="lg" icon={<EntityIcon kind="project" icon={LayersIcon} size="md" />}
      title={mode === "edit" ? t("editTitle", { n: idx + 1, name: form.name }) : t("createTitle")}
      tabs={tabs} activeTab={tab} onTabChange={goTab}
      onPrevious={mode === "edit" && idx > 0 ? () => dialog.replace(`flow-content/phase-edit/${siblings[idx - 1].id}/${tab}`) : undefined}
      onNext={mode === "edit" && idx >= 0 && idx < siblings.length - 1 ? () => dialog.replace(`flow-content/phase-edit/${siblings[idx + 1].id}/${tab}`) : undefined}
      footer={<>
        {mode === "add" && <label className="mr-auto flex items-center gap-2 text-sm"><Checkbox checked={another} onCheckedChange={(v) => setAnother(!!v)} />{t("createAnother")}</label>}
        {mode === "edit" && <Button variant="secondary" className="mr-auto" onClick={() => dialog.replace(`flow-content/step-add/${id}/general-tab`)}>{tc("tree.addStep")}</Button>}
        <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || loading}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {loading ? <div className="flex justify-center py-16"><Spinner /></div> : tab === "attribute-tab" ? (
        <CustomFieldsEditor fields={fields} values={(form.custom_fields ?? {}) as CustomFieldValues} onChange={(v) => set("custom_fields", v)} emptyLabel={tc("noAttributes")} />
      ) : (
        <FieldGroup>
          {meta.disabled && form.read_only_on_mobile_app && <Alert><AlertDescription>{t("disabledPriority")}</AlertDescription></Alert>}
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="ph-name">{t("name")} *</FieldLabel>
            <Input id="ph-name" value={form.name} aria-invalid={!!error} onChange={(e) => { set("name", e.target.value); setError(null); }} />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <div className="grid grid-cols-2 items-end gap-4">
            <Field>
              <FieldLabel htmlFor="ph-num">{t("customNumber")}</FieldLabel>
              <Input id="ph-num" value={form.custom_number ?? ""} placeholder={`${tc("prefix.phase")}${meta.number}`} onChange={(e) => set("custom_number", e.target.value)} />
            </Field>
            <label className="flex items-center gap-2 pb-2 text-sm"><Checkbox checked={!!form.exclude_numbering} onCheckedChange={(v) => set("exclude_numbering", !!v)} />{t("excludeNumbering")}</label>
          </div>
          <Field><FieldLabel htmlFor="ph-add">{t("additionalComment")}</FieldLabel><Input id="ph-add" value={form.additional_comment ?? ""} onChange={(e) => set("additional_comment", e.target.value)} /></Field>
          <Field>
            <FieldLabel htmlFor="ph-desc">{t("description")}</FieldLabel>
            <Textarea id="ph-desc" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
            <FieldDescription>{t("descriptionHelp")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>{t("sequenceType")}</FieldLabel>
            <RadioGroup value={form.sequence_type} onValueChange={(v) => set("sequence_type", v as "linear" | "parallel")} className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="linear" />{t("linear")}</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="parallel" />{t("parallel")}</label>
            </RadioGroup>
          </Field>
          <div className="flex flex-col gap-3">
            <Field orientation="horizontal"><Switch id="ph-mand" checked={!form.mandatory} onCheckedChange={(v) => set("mandatory", !v)} /><FieldLabel htmlFor="ph-mand">{t("optional")}</FieldLabel></Field>
            <Field orientation="horizontal"><Switch id="ph-hide" checked={!!form.hide_title_pdf} onCheckedChange={(v) => set("hide_title_pdf", v)} /><FieldLabel htmlFor="ph-hide">{t("hideTitlePdf")}</FieldLabel></Field>
            <Field orientation="horizontal"><Switch id="ph-ro" checked={!!form.read_only_on_mobile_app} onCheckedChange={(v) => set("read_only_on_mobile_app", v)} /><FieldLabel htmlFor="ph-ro">{t("webAppOnly")}</FieldLabel></Field>
          </div>
          {mode === "edit" && meta.disabled && <p className="text-sm text-muted-foreground">{t("disabledInfo")}</p>}
        </FieldGroup>
      )}
    </ModalShell>
  );
}
