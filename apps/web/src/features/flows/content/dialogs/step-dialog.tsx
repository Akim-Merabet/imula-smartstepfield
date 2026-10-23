"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDownIcon, ArrowUpIcon, ListChecksIcon, PlusIcon, Trash2Icon, UnlinkIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { CustomFieldsEditor, type CustomFieldDef, type CustomFieldValues } from "@/components/custom-fields/custom-fields-editor";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { createStep, updateStep } from "../../content-actions";
import { SimpleSelect } from "../../components/simple-select";
import { BLOCK_TYPES, LINKABLE_FLOW_TYPES, type BlockState, type BlockType } from "../../meta";
import type { StepInput } from "../../schema";
import { contentError } from "../errors";

type Nav = NonNullable<StepInput["navigations"]>[number];
const EMPTY: StepInput = {
  name: "", custom_number: "", exclude_numbering: false, additional_comment: "", description: "", hide_title_pdf: false,
  read_only_on_mobile_app: false, enabled_blocks: ["pr"], linked_flow_id: null, navigations: [], custom_fields: {},
};
const STYLES = ["default", "info", "warning", "error", "success"] as const;

type Ctx = {
  flowId: string; phaseId: string; flowType: string; number: number;
  phases: { id: string; name: string }[]; steps: { id: string; phase_id: string; name: string }[];
  flows: { value: string; label: string }[]; fields: CustomFieldDef[]; blockStates: Partial<Record<BlockType, BlockState>>;
};

/** Modale étape : création (`step-add/<phaseId>`) ou édition (`step-edit/<stepId>`) — §4.3, §4.4. */
export function StepDialog({ mode, id, tab, close }: { mode: "add" | "edit"; id: string; tab: string; close: () => void }) {
  const t = useTranslations("flowContent.stepDialog");
  const tc = useTranslations("flowContent");
  const tb = useTranslations("blocks");
  const tg = useTranslations("global");
  const router = useRouter();
  const dialog = useDialog();
  const [form, setForm] = useState<StepInput>(EMPTY);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [another, setAnother] = useState(false);
  const [confirmUncheck, setConfirmUncheck] = useState<BlockType | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      let phaseId = id;
      let blockStates: Ctx["blockStates"] = {};
      if (mode === "edit") {
        const [{ data: s }, { data: blocks }, { data: navs }, { data: values }] = await Promise.all([
          supabase.from("steps").select("*").eq("id", id).single(),
          supabase.from("blocks").select("type, enabled, state").eq("step_id", id),
          supabase.from("step_navigations").select("*").eq("step_id", id).order("position"),
          supabase.from("custom_field_values").select("custom_field_id, value_text, value_json").eq("object_id", id),
        ]);
        if (!active || !s) return;
        phaseId = s.phase_id;
        blockStates = Object.fromEntries((blocks ?? []).filter((b) => b.enabled).map((b) => [b.type, b.state]));
        const vals: CustomFieldValues = {};
        for (const v of values ?? []) vals[v.custom_field_id] = Array.isArray(v.value_json) ? (v.value_json as string[]) : v.value_text;
        setForm({
          name: s.name, custom_number: s.custom_number ?? "", exclude_numbering: s.exclude_numbering, additional_comment: s.additional_comment ?? "",
          description: s.description ?? "", hide_title_pdf: s.hide_title_pdf, read_only_on_mobile_app: s.read_only_on_mobile_app,
          enabled_blocks: (blocks ?? []).filter((b) => b.enabled).map((b) => b.type), linked_flow_id: s.linked_flow_id,
          navigations: (navs ?? []).flatMap((n) => (n.target_phase_id && n.target_step_id ? [{
            id: n.id, target_phase_id: n.target_phase_id, target_step_id: n.target_step_id, style: n.style, message: n.message ?? "",
          }] : [])),
          custom_fields: vals,
        });
      }
      const { data: phase } = await supabase.from("phases").select("flow_id, flow:flows(flow_type, project_id)").eq("id", phaseId).single();
      if (!active || !phase) return;
      const flow = phase.flow as unknown as { flow_type: string; project_id: string };
      const [{ data: phases }, { data: steps }, { data: flows }, { data: fields }] = await Promise.all([
        supabase.from("phases").select("id, name").eq("flow_id", phase.flow_id).order("position"),
        supabase.from("steps").select("id, phase_id, name, position").eq("flow_id", phase.flow_id).order("position"),
        supabase.from("flows").select("id, name, ref_int, flow_type").eq("project_id", flow.project_id).is("deleted_at", null)
          .neq("id", phase.flow_id).in("flow_type", LINKABLE_FLOW_TYPES).order("name"),
        supabase.from("custom_fields").select("id, name, type, choices, placeholder, tooltip, description, required, read_only, default_value")
          .eq("nature", "step").eq("active", true).is("deleted_at", null).order("sort_order"),
      ]);
      if (!active) return;
      if (mode === "add" && flow.flow_type === "group") setForm((f) => ({ ...f, enabled_blocks: ["dsi"] }));
      setCtx({
        flowId: phase.flow_id, phaseId, flowType: flow.flow_type,
        number: mode === "add" ? (steps ?? []).filter((s) => s.phase_id === phaseId).length + 1 : ((steps ?? []).filter((s) => s.phase_id === phaseId).findIndex((s) => s.id === id) + 1),
        phases: phases ?? [], steps: steps ?? [],
        flows: (flows ?? []).map((f) => ({ value: f.id, label: f.ref_int ? `${f.ref_int} - ${f.name}` : f.name })),
        fields: fields ?? [], blockStates,
      });
    })();
    return () => { active = false; };
  }, [mode, id]);

  const set = <K extends keyof StepInput>(k: K, v: StepInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const goTab = (tabId: string) => dialog.replace(`flow-content/step-${mode}/${id}/${tabId}`);
  const blocks = (form.enabled_blocks ?? []) as BlockType[];
  const toggleBlock = (type: BlockType, on: boolean) => {
    if (!on && type === "dsi" && ctx?.flowType === "group") { notify.error(tc("errors.dsi_required_group")); return; }
    if (!on && ctx?.blockStates[type] === "validated") { setConfirmUncheck(type); return; }
    set("enabled_blocks", on ? [...blocks, type] : blocks.filter((b) => b !== type));
  };
  const navs = (form.navigations ?? []) as Nav[];
  const setNav = (i: number, patch: Partial<Nav>) => set("navigations", navs.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  const moveNav = (i: number, d: number) => { const n = [...navs]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); set("navigations", n); };
  const phaseSteps = ctx ? ctx.steps.filter((s) => s.phase_id === ctx.phaseId) : [];
  const idx = phaseSteps.findIndex((s) => s.id === id);

  const validate = () => {
    const e: Record<string, string> = {};
    const name = form.name ?? "";
    if (name.length < 3) e.name = tg("validators.minLength", { min: 3 });
    else if (name.length > 255) e.name = tg("validators.maxLength", { max: 255 });
    else if (name !== name.trim()) e.name = tc("stepDialog.trim");
    if (!blocks.length) e.blocks = t("blocksRequired");
    if (navs.some((n) => !n.target_phase_id || !n.target_step_id)) e.navigations = t("navigationIncomplete");
    setErrors(e);
    if (e.name) goTab("general-tab"); else if (e.blocks) goTab("blocks-tab"); else if (e.navigations) goTab("navigation-tab");
    return !Object.keys(e).length;
  };
  const submit = () => {
    if (!validate()) return;
    start(async () => {
      const res = mode === "edit" ? await updateStep(id, form) : await createStep(id, form);
      if (!res.ok) { notify.error(contentError(tc, tg, res.error)); return; }
      notify.success(mode === "edit" ? tg("toast.saved") : t("created"));
      router.refresh();
      if (mode === "add" && another) { setForm({ ...EMPTY, enabled_blocks: ctx?.flowType === "group" ? ["dsi"] : ["pr"] }); return; }
      close();
    });
  };

  const tabs = [
    { id: "general-tab", label: tc("dialogTabs.general") }, { id: "blocks-tab", label: t("tabs.blocks") },
    { id: "navigation-tab", label: t("tabs.navigation") }, { id: "attribute-tab", label: tc("dialogTabs.attributes") },
  ];

  const body = () => {
    if (!ctx) return <div className="flex justify-center py-16"><Spinner /></div>;
    if (tab === "attribute-tab") return <CustomFieldsEditor fields={ctx.fields} values={(form.custom_fields ?? {}) as CustomFieldValues} onChange={(v) => set("custom_fields", v)} emptyLabel={tc("noAttributes")} />;
    if (tab === "blocks-tab") {
      return (
        <FieldGroup>
          <FieldSet>
            <FieldLegend>{t("blocks")}</FieldLegend>
            <div className="grid grid-cols-2 gap-3">
              {BLOCK_TYPES.map((type) => (
                <label key={type} className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox checked={blocks.includes(type)} onCheckedChange={(v) => toggleBlock(type, !!v)} className="mt-0.5" />
                  <span><span className="block text-sm font-medium">{tb("blockLabel", { block: tb(`title.${type}`) })}</span>
                    <span className="block text-xs text-muted-foreground">{tb(`description.${type}`)}</span></span>
                </label>
              ))}
            </div>
            {errors.blocks && <FieldError>{errors.blocks}</FieldError>}
          </FieldSet>
          <FieldSet>
            <FieldLegend>{t("linkedFlow")}</FieldLegend>
            <div className="flex gap-2">
              <div className="flex-1"><SimpleSelect value={form.linked_flow_id ?? null} onChange={(v) => set("linked_flow_id", v)} options={ctx.flows} placeholder={t("linkFlow")} /></div>
              {form.linked_flow_id && <Button variant="secondary" onClick={() => set("linked_flow_id", null)}><UnlinkIcon data-icon="inline-start" />{t("removeLink")}</Button>}
            </div>
            <FieldDescription>{t("linkedFlowHelp")}</FieldDescription>
          </FieldSet>
        </FieldGroup>
      );
    }
    if (tab === "navigation-tab") {
      return (
        <FieldGroup>
          <p className="text-sm text-muted-foreground">{t("navigationHelp")}</p>
          {navs.map((n, i) => (
            <FieldSet key={i} className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <FieldLegend className="flex-1">{t("navigation", { index: i + 1 })}</FieldLegend>
                <Button variant="ghost" size="icon-sm" aria-label={t("moveUp")} disabled={i === 0} onClick={() => moveNav(i, -1)}><ArrowUpIcon /></Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("moveDown")} disabled={i === navs.length - 1} onClick={() => moveNav(i, 1)}><ArrowDownIcon /></Button>
                <Button variant="ghost" size="icon-sm" aria-label={tg("actions.delete")} onClick={() => set("navigations", navs.filter((_, j) => j !== i))}><Trash2Icon /></Button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field><FieldLabel>{t("targetPhase")}</FieldLabel>
                  <SimpleSelect clearable={false} value={n.target_phase_id || null} onChange={(v) => setNav(i, { target_phase_id: v ?? "", target_step_id: "" })} options={ctx.phases.map((p) => ({ value: p.id, label: p.name }))} /></Field>
                <Field><FieldLabel>{t("targetStep")}</FieldLabel>
                  <SimpleSelect clearable={false} value={n.target_step_id || null} onChange={(v) => setNav(i, { target_step_id: v ?? "" })}
                    options={ctx.steps.filter((s) => s.phase_id === n.target_phase_id && s.id !== id).map((s) => ({ value: s.id, label: s.name }))} /></Field>
                <Field><FieldLabel>{t("style")}</FieldLabel>
                  <SimpleSelect clearable={false} value={n.style ?? "default"} onChange={(v) => setNav(i, { style: (v ?? "default") as Nav["style"] })} options={STYLES.map((s) => ({ value: s, label: t(`styles.${s}`) }))} /></Field>
              </div>
              <Field><FieldLabel>{t("message")}</FieldLabel><Input value={n.message ?? ""} onChange={(e) => setNav(i, { message: e.target.value })} /></Field>
            </FieldSet>
          ))}
          {errors.navigations && <FieldError>{errors.navigations}</FieldError>}
          <Button variant="secondary" className="self-start" onClick={() => set("navigations", [...navs, { target_phase_id: "", target_step_id: "", style: "default", message: "" }])}>
            <PlusIcon data-icon="inline-start" />{t("addNavigation")}
          </Button>
        </FieldGroup>
      );
    }
    return (
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="st-name">{t("name")} *</FieldLabel>
          <Input id="st-name" value={form.name} aria-invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} />
          {errors.name && <FieldError>{errors.name}</FieldError>}
        </Field>
        <div className="grid grid-cols-2 items-end gap-4">
          <Field><FieldLabel htmlFor="st-num">{t("customNumber")}</FieldLabel>
            <Input id="st-num" value={form.custom_number ?? ""} placeholder={`${tc("prefix.step")}${ctx.number}`} onChange={(e) => set("custom_number", e.target.value)} /></Field>
          <label className="flex items-center gap-2 pb-2 text-sm"><Checkbox checked={!!form.exclude_numbering} onCheckedChange={(v) => set("exclude_numbering", !!v)} />{t("excludeNumbering")}</label>
        </div>
        <Field><FieldLabel htmlFor="st-add">{t("additionalComment")}</FieldLabel><Input id="st-add" value={form.additional_comment ?? ""} onChange={(e) => set("additional_comment", e.target.value)} /></Field>
        <Field>
          <FieldLabel htmlFor="st-desc">{t("description")}</FieldLabel>
          <Textarea id="st-desc" value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          <FieldDescription>{t("descriptionHelp")}</FieldDescription>
        </Field>
        <Field orientation="horizontal"><Switch id="st-hide" checked={!!form.hide_title_pdf} onCheckedChange={(v) => set("hide_title_pdf", v)} /><FieldLabel htmlFor="st-hide">{t("hideTitlePdf")}</FieldLabel></Field>
        <Field orientation="horizontal"><Switch id="st-ro" checked={!!form.read_only_on_mobile_app} onCheckedChange={(v) => set("read_only_on_mobile_app", v)} /><FieldLabel htmlFor="st-ro">{t("webAppOnly")}</FieldLabel></Field>
      </FieldGroup>
    );
  };

  return (
    <>
      <ModalShell onClose={close} size="lg" icon={<EntityIcon kind="project" icon={ListChecksIcon} size="md" />}
        title={mode === "edit" ? t("editTitle", { n: ctx?.number ?? "", name: form.name }) : t("createTitle")}
        tabs={tabs} activeTab={tab} onTabChange={goTab}
        onPrevious={mode === "edit" && idx > 0 ? () => dialog.replace(`flow-content/step-edit/${phaseSteps[idx - 1].id}/${tab}`) : undefined}
        onNext={mode === "edit" && idx >= 0 && idx < phaseSteps.length - 1 ? () => dialog.replace(`flow-content/step-edit/${phaseSteps[idx + 1].id}/${tab}`) : undefined}
        footer={<>
          {mode === "add" && <label className="mr-auto flex items-center gap-2 text-sm"><Checkbox checked={another} onCheckedChange={(v) => setAnother(!!v)} />{t("createAnother")}</label>}
          <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
          <Button onClick={submit} disabled={pending || !ctx}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
        </>}>
        {body()}
      </ModalShell>
      <ConfirmDialog open={!!confirmUncheck} onOpenChange={(o) => { if (!o) setConfirmUncheck(null); }} title={t("uncheckValidatedTitle")}
        description={t("uncheckValidated")} destructive confirmLabel={tg("actions.confirm")}
        onConfirm={() => { if (confirmUncheck) set("enabled_blocks", blocks.filter((b) => b !== confirmUncheck)); setConfirmUncheck(null); }} />
    </>
  );
}
