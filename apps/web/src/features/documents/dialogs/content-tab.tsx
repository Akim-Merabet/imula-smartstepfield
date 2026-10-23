"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { allowedFlowTypes, baseNature, FLOW_NATURES, MAX_OBJECT_ATTRIBUTES, type DocumentNature } from "../meta";
import type { DocumentInput } from "../schema";

export type ContentSources = {
  flows: { id: string; name: string; flow_type: string }[];
  forms: { id: string; name: string }[];
  diagrams: { id: string; name: string }[];
  lists: { id: string; name: string; type: string }[];
  skills: { id: string; label: string }[];
  attributes: { id: string; name: string }[];
  documents: { id: string; name: string; nature: string; ref_int: string | null }[];
};

const PAGE_OPTIONS: [string, DocumentNature[]][] = [
  ["hide_cover_page", FLOW_NATURES],
  ["include_contributors_page", ["pr", "dsi", "multi_pr", "adr", "emm"]],
  ["include_annex_interlayer", ["pr", "dsi", "multi_pr", "object"]],
  ["hide_index_column", ["dsi"]],
];
function contentOptions(nature: DocumentNature, isGroup: boolean, strategy: string | null | undefined): string[] {
  const group = (keys: string[]) => (isGroup ? keys : []);
  const out: string[] = (() => {
    switch (nature) {
      case "object": return ["include_conformity_certificates"];
      case "pr": return ["show_annexes", "include_control_block", "include_phase_number", ...group(["include_emm_doc", "include_rh_content"])];
      case "dsi": return ["include_ref_form", "include_form_references_obs", "navigation_conditions", ...group(["show_linked_entities_references"])];
      case "flow_form": return strategy && strategy !== "none" ? ["include_skeleton_form", "include_empty_option"] : [];
      case "multi_pr": return ["hide_multi_pr_title_on_summary", "show_annexes", "include_emm_doc", "include_rh_content", "include_control_block",
        "include_instruction_block", "include_txt_content", "include_multi_pr_obs"];
      default: return [];
    }
  })();
  return [...out, ...group(["child_rendered"])];
}

type Errors = Record<string, string>;

/** Onglet « Contenu » des documents générés (§3.4.1 à §3.4.3). */
export function ContentTab({ nature, form, set, sources, errors, disabled, referentialEntity }: {
  nature: DocumentNature; form: DocumentInput; set: (patch: Partial<DocumentInput>) => void; sources: ContentSources;
  errors: Errors; disabled: boolean; referentialEntity: boolean;
}) {
  const t = useTranslations("documents.content");
  const tg = useTranslations("global");
  const opts = form.options ?? {};
  const sel = form.selections ?? {};
  const setOpt = (k: string, v: boolean) => set({ options: { ...opts, [k]: v } });
  const setSel = (kind: string, ids: string[]) => set({ selections: { ...sel, [kind]: ids } });
  const flowTypes = allowedFlowTypes(nature, referentialEntity);
  const flowChoices = sources.flows.filter((f) => flowTypes.includes(f.flow_type as never));
  const linkedFlow = sources.flows.find((f) => f.id === form.linked_flow_id);
  const isGroup = linkedFlow?.flow_type === "group" || linkedFlow?.flow_type === "group_referential";
  const box = (k: string, labelKey = k) => (
    <label key={k} className="flex items-center gap-2 text-sm">
      <Checkbox checked={!!opts[k]} disabled={disabled} onCheckedChange={(v) => setOpt(k, !!v)} />{t(`opt.${labelKey}` as never)}
    </label>
  );
  const flowSelect = (label: string, required: boolean) => (
    <Field data-invalid={!!errors.linked_flow_id}>
      <FieldLabel>{label}{required && " *"}</FieldLabel>
      <Select value={form.linked_flow_id ?? undefined} disabled={disabled} onValueChange={(v) => set({ linked_flow_id: v })}>
        <SelectTrigger aria-invalid={!!errors.linked_flow_id}><SelectValue placeholder={t("flowPlaceholder")} /></SelectTrigger>
        <SelectContent><SelectGroup>{flowChoices.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
      {errors.linked_flow_id && <FieldError>{errors.linked_flow_id}</FieldError>}
    </Field>
  );

  // ----- Documents de flow -----
  if (FLOW_NATURES.includes(nature)) {
    const locations = nature === "dsi" || nature === "multi_pr" ? ["none", "appendix"] : ["none", "content", "appendix"];
    const loc = form.form_content_location ?? "none";
    return (
      <FieldGroup>
        {flowSelect(t("flowTitle"), true)}
        {(nature === "pr" || nature === "multi_pr") && (
          <>
            <Field><FieldLabel htmlFor="c-preamble">{t("preamble")}</FieldLabel>
              <Textarea id="c-preamble" disabled={disabled} placeholder={t("preamblePlaceholder")} value={form.preamble ?? ""} onChange={(e) => set({ preamble: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field><FieldLabel htmlFor="c-subject">{t("subject")}</FieldLabel><Textarea id="c-subject" disabled={disabled} value={form.subject ?? ""} onChange={(e) => set({ subject: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="c-glossary">{t("glossary")}</FieldLabel><Textarea id="c-glossary" disabled={disabled} value={form.glossary ?? ""} onChange={(e) => set({ glossary: e.target.value })} /></Field>
            </div>
          </>
        )}
        {nature === "flow_form" ? (
          <Field>
            <FieldLabel>{t("showing")}</FieldLabel>
            <StrategyRadio value={form.responses_strategy ?? "all"} values={["all", "none"]} disabled={disabled} onChange={(v) => set({ responses_strategy: v })} />
          </Field>
        ) : (
          <FieldSet>
            <FieldLegend variant="label">{t("formLocation")}</FieldLegend>
            <RadioGroup value={loc} disabled={disabled} onValueChange={(v) => set({ form_content_location: v as never })} className="flex gap-6">
              {locations.map((l) => <label key={l} className="flex items-center gap-2 text-sm"><RadioGroupItem value={l} />{t(`locations.${l}` as never)}</label>)}
            </RadioGroup>
            {loc === "content" && box("include_form_references")}
            {loc === "appendix" && <>{box("include_form_doc")}{box("include_response_doc")}
              {opts.include_response_doc && <><FieldDescription>{t("opt.include_response_doc_info")}</FieldDescription>{box("include_empty_option")}</>}</>}
          </FieldSet>
        )}
        {nature === "object" && (
          <Field>
            <FieldLabel>{t("attributes")}</FieldLabel>
            <FieldDescription>{t("attributesHelp")}</FieldDescription>
            <CheckList items={sources.attributes.map((a) => ({ id: a.id, label: a.name }))} value={sel.technical_object_attribute ?? []}
              max={MAX_OBJECT_ATTRIBUTES} disabled={disabled} onChange={(ids) => setSel("technical_object_attribute", ids)} />
          </Field>
        )}
        <FieldSet>
          <FieldLegend variant="label">{t("pages")}</FieldLegend>
          {PAGE_OPTIONS.filter(([, ns]) => ns.includes(nature)).map(([k]) => box(k, k === "hide_cover_page" && nature === "flow_form" ? "hide_cover_page_form" : k))}
        </FieldSet>
        {contentOptions(nature, isGroup, form.responses_strategy).length > 0 && (
          <FieldSet>
            <FieldLegend variant="label">{t("contents")}</FieldLegend>
            {contentOptions(nature, isGroup, form.responses_strategy).map((k) => box(k))}
          </FieldSet>
        )}
      </FieldGroup>
    );
  }

  // ----- Documents de formulaire -----
  if (nature === "project_form" || nature === "block_form" || nature === "multi_flow_form") {
    return (
      <FieldGroup>
        <Field data-invalid={!!errors.linked_form_id}>
          <FieldLabel>{t("formTitle")} *</FieldLabel>
          <Select value={form.linked_form_id ?? undefined} disabled={disabled} onValueChange={(v) => set({ linked_form_id: v, linked_response_id: null })}>
            <SelectTrigger aria-invalid={!!errors.linked_form_id}><SelectValue placeholder={t("formPlaceholder")} /></SelectTrigger>
            <SelectContent><SelectGroup>{sources.forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          {errors.linked_form_id && <FieldError>{errors.linked_form_id}</FieldError>}
        </Field>
        {nature === "block_form" && flowSelect(t("flowTitle"), true)}
        {nature === "multi_flow_form" && (
          <Field data-invalid={!!errors.flow}>
            <FieldLabel>{t("fromFlows")} *</FieldLabel>
            <CheckList items={flowChoices.map((f) => ({ id: f.id, label: f.name }))} value={sel.flow ?? []} disabled={disabled} onChange={(ids) => setSel("flow", ids)} />
            {errors.flow && <FieldError>{errors.flow}</FieldError>}
          </Field>
        )}
        <Field>
          <FieldLabel>{t("showing")}</FieldLabel>
          <StrategyRadio value={form.responses_strategy ?? "all"} values={nature === "project_form" ? ["all", "selected", "none"] : ["all", "none"]}
            disabled={disabled} onChange={(v) => set({ responses_strategy: v })} />
        </Field>
        {nature === "project_form" && form.responses_strategy === "selected" && (
          <ResponsePicker formId={form.linked_form_id ?? null} value={sel.form_response ?? []} disabled={disabled}
            error={errors.form_response} onChange={(ids) => setSel("form_response", ids)} />
        )}
        <FieldSet>
          <FieldLegend variant="label">{t("pages")}</FieldLegend>
          {box("hide_cover_page", "hide_cover_page_form")}{box("include_skeleton_form")}{box("include_empty_option")}
        </FieldSet>
      </FieldGroup>
    );
  }

  // ----- Documents de module -----
  const base = baseNature(nature);
  if (base === "list_emm" || base === "list_adr") {
    const fromFlows = nature === "list_emm_flow" || nature === "list_adr_flow";
    const listType = base === "list_emm" ? "emm" : "adr";
    const lists = sources.lists.filter((l) => l.type === listType);
    return (
      <FieldGroup>
        <Field>
          <FieldLabel>{t("list")}</FieldLabel>
          <RadioGroup value={fromFlows ? "flows" : "list"} disabled={disabled} className="flex gap-6"
            onValueChange={(v) => set({ nature: (v === "flows" ? `${base}_flow` : base) as never })}>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="list" />{t("fromList")}</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="flows" />{t("fromFlowsMode")}</label>
          </RadioGroup>
        </Field>
        {fromFlows ? (
          <Field data-invalid={!!errors.flow}>
            <FieldLabel>{t("fromFlows")} *</FieldLabel>
            <CheckList items={flowChoices.map((f) => ({ id: f.id, label: f.name }))} value={sel.flow ?? []} disabled={disabled} onChange={(ids) => setSel("flow", ids)} />
            {errors.flow && <FieldError>{errors.flow}</FieldError>}
          </Field>
        ) : (
          <Field data-invalid={!!errors.linked_list_id}>
            <FieldLabel>{t("listPlaceholder")} *</FieldLabel>
            {lists.length === 0 ? <FieldDescription>{t("noLists")}</FieldDescription> : (
              <Select value={form.linked_list_id ?? undefined} disabled={disabled} onValueChange={(v) => set({ linked_list_id: v })}>
                <SelectTrigger><SelectValue placeholder={t("listPlaceholder")} /></SelectTrigger>
                <SelectContent><SelectGroup>{lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
            )}
            {errors.linked_list_id && <FieldError>{errors.linked_list_id}</FieldError>}
          </Field>
        )}
        {box("hide_cover_page", "hide_cover_page_form")}
      </FieldGroup>
    );
  }
  if (nature === "lfa") {
    return (
      <FieldGroup>
        <Field data-invalid={!!errors.flow}>
          <FieldLabel>{t("fromFlows")} *</FieldLabel>
          <CheckList items={flowChoices.map((f) => ({ id: f.id, label: f.name }))} value={sel.flow ?? []} disabled={disabled} onChange={(ids) => setSel("flow", ids)} />
          {errors.flow && <FieldError>{errors.flow}</FieldError>}
        </Field>
        {box("hide_cover_page", "hide_cover_page_form")}
      </FieldGroup>
    );
  }
  if (nature === "lda") {
    return (
      <FieldGroup>
        <Field data-invalid={!!errors.document}>
          <FieldLabel>{tg("actions.select")} *</FieldLabel>
          <CheckList items={sources.documents.filter((d) => d.nature !== "lda" && d.nature !== "rfi").map((d) => ({ id: d.id, label: d.name, sub: d.ref_int ?? undefined }))}
            value={sel.document ?? []} disabled={disabled} onChange={(ids) => setSel("document", ids)} />
          {errors.document && <FieldError>{errors.document}</FieldError>}
        </Field>
        {box("hide_cover_page", "hide_cover_page_form")}{box("lda_hide_index_column")}{box("include_linked_documents_infos")}
      </FieldGroup>
    );
  }
  if (nature === "lca") {
    const some = form.responses_strategy === "selected";
    return (
      <FieldGroup>
        <Field>
          <FieldLabel>{t("lca")}</FieldLabel>
          <RadioGroup value={some ? "selected" : "all"} disabled={disabled} className="flex flex-col gap-2" onValueChange={(v) => set({ responses_strategy: v as never })}>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="all" />{t("lcaAll")}</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="selected" />{t("lcaSome")}</label>
          </RadioGroup>
        </Field>
        {some && (
          <Field data-invalid={!!errors.skill}>
            <CheckList items={sources.skills.map((s) => ({ id: s.id, label: s.label }))} value={sel.skill ?? []} disabled={disabled} onChange={(ids) => setSel("skill", ids)} />
            {errors.skill && <FieldError>{errors.skill}</FieldError>}
          </Field>
        )}
        {box("show_skills_summary")}{box("hide_cover_page", "hide_cover_page_form")}
      </FieldGroup>
    );
  }
  if (nature === "diagram") {
    return (
      <FieldGroup>
        <Field data-invalid={!!errors.linked_diagram_id}>
          <FieldLabel>{t("diagram")} *</FieldLabel>
          {sources.diagrams.length === 0 ? <FieldDescription>{t("noDiagram")}</FieldDescription> : (
            <Select value={form.linked_diagram_id ?? undefined} disabled={disabled} onValueChange={(v) => set({ linked_diagram_id: v })}>
              <SelectTrigger><SelectValue placeholder={t("diagramPlaceholder")} /></SelectTrigger>
              <SelectContent><SelectGroup>{sources.diagrams.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          )}
          {errors.linked_diagram_id && <FieldError>{errors.linked_diagram_id}</FieldError>}
        </Field>
      </FieldGroup>
    );
  }
  // field_feedback
  return (
    <FieldGroup>
      {box("hide_cover_page", "hide_cover_page_form")}{box("include_skeleton_form")}{box("include_empty_option")}
    </FieldGroup>
  );
}

/** Validation du contenu avant sauvegarde (messages §3.4). */
export function validateContent(nature: DocumentNature, form: DocumentInput, t: (k: string) => string): Errors {
  const e: Errors = {};
  const sel = form.selections ?? {};
  if (FLOW_NATURES.includes(nature) && !form.linked_flow_id) e.linked_flow_id = t("flowRequired");
  if (["project_form", "block_form", "multi_flow_form"].includes(nature) && !form.linked_form_id) e.linked_form_id = t("formRequired");
  if (nature === "block_form" && !form.linked_flow_id) e.linked_flow_id = t("flowRequired");
  if (["multi_flow_form", "lfa", "list_emm_flow", "list_adr_flow"].includes(nature) && !(sel.flow ?? []).length) e.flow = t("flowsRequired");
  if (nature === "project_form" && form.responses_strategy === "selected" && !(sel.form_response ?? []).length) e.form_response = t("responsesRequired");
  if (nature === "lda" && !(sel.document ?? []).length) e.document = t("documentsRequired");
  if ((nature === "list_emm" || nature === "list_adr") && !form.linked_list_id) e.linked_list_id = t("listPlaceholder");
  if (nature === "lca" && form.responses_strategy === "selected" && !(sel.skill ?? []).length) e.skill = t("skillsRequired");
  if (nature === "diagram" && !form.linked_diagram_id) e.linked_diagram_id = t("diagramPlaceholder");
  return e;
}

function StrategyRadio({ value, values, disabled, onChange }: {
  value: string; values: string[]; disabled: boolean; onChange: (v: "all" | "selected" | "none") => void;
}) {
  const t = useTranslations("documents.content.strategy");
  return (
    <RadioGroup value={value} disabled={disabled} onValueChange={(v) => onChange(v as never)} className="flex flex-col gap-2">
      {values.map((v) => <label key={v} className="flex items-center gap-2 text-sm"><RadioGroupItem value={v} />{t(v as never)}</label>)}
    </RadioGroup>
  );
}

function ResponsePicker({ formId, value, disabled, error, onChange }: {
  formId: string | null; value: string[]; disabled: boolean; error?: string; onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("documents.content");
  const [items, setItems] = useState<{ id: string; label: string }[] | null>(null);
  useEffect(() => {
    if (!formId) return;
    createClient().from("form_responses").select("id, reference").eq("form_id", formId).is("deleted_at", null).order("created_at", { ascending: false })
      .then(({ data }) => setItems((data ?? []).map((r) => ({ id: r.id, label: r.reference }))));
  }, [formId]);
  return (
    <Field data-invalid={!!error}>
      <FieldLabel>{t("responses")} *</FieldLabel>
      {!formId || (items && items.length === 0) ? <FieldDescription>{t("noResponses")}</FieldDescription>
        : <CheckList items={items ?? []} value={value} disabled={disabled} onChange={onChange} />}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

/** Liste de cases à cocher filtrable (sélections multiples de flows, documents, compétences…). */
export function CheckList({ items, value, onChange, disabled, max }: {
  items: { id: string; label: string; sub?: string; disabled?: boolean }[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean; max?: number;
}) {
  const t = useTranslations("documents.content");
  const [q, setQ] = useState("");
  const shown = useMemo(() => items.filter((i) => `${i.label} ${i.sub ?? ""}`.toLowerCase().includes(q.toLowerCase())), [items, q]);
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((x) => x !== id));
  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      {items.length > 6 && <Input placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="h-8" />}
      {items.length === 0 ? <p className="py-2 text-center text-sm text-muted-foreground">—</p> : (
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {shown.map((i) => {
            const checked = value.includes(i.id);
            const blocked = disabled || i.disabled || (!checked && max !== undefined && value.length >= max);
            return (
              <li key={i.id}>
                <label className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                  <Checkbox checked={checked} disabled={blocked} onCheckedChange={(v) => toggle(i.id, !!v)} />
                  <span className="truncate">{i.label}</span>
                  {i.sub && <span className="truncate text-xs text-muted-foreground">{i.sub}</span>}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {max !== undefined && <Alert className="py-1"><AlertDescription className="text-xs">{value.length} / {max}</AlertDescription></Alert>}
    </div>
  );
}
