"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { TagIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createClient } from "@/lib/supabase/client";
import { saveFamily } from "../actions/families";
import { ColorField } from "../components/color-field";
import { useDirtyGuard } from "../components/dirty-guard";
import { useRun } from "../components/use-run";
import { useSiblings } from "../components/use-siblings";
import { CATEGORY_NATURES, DEFAULT_FAMILY_COLOR, FAMILY_NATURES, familyLabel, type FamilyNature } from "../meta";
import type { FamilyInput } from "../schema";

type ParentOption = { id: string; short_name: string; long_name: string | null; color: string; nature: string };

function parseToken(token?: string) {
  if (!token || token === "family") return { kind: "family" as const, projectId: null };
  const [, projectId] = token.split("~");
  return { kind: "category" as const, projectId: projectId ?? null };
}

/**
 * ?dialog=family/add/<portée>[/<nature>[/<parentId>]] · family/edit/<id>
 * portée = family | category | category~<projectId> — spec 01 §6.6 / §5.13.
 */
export default function FamilyDialog({ segments, close }: DialogProps) {
  const t = useTranslations("settings.families");
  const tn = useTranslations("settings.natures");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const run = useRun();
  const isEdit = segments[0] === "edit";
  const id = isEdit ? segments[1] : null;
  const addScope = parseToken(isEdit ? undefined : segments[1]);

  const empty: FamilyInput = {
    kind: addScope.kind, nature: (segments[2] as FamilyNature) ?? (addScope.kind === "family" ? "project" : "flow"),
    relative_nature: segments[3] ? "child" : "parent", parent_id: segments[3] ?? null, project_id: addScope.projectId,
    short_name: "", long_name: "", code: "", color: DEFAULT_FAMILY_COLOR, priority: 0, quality_reference: "",
    client_supervision: false, client_supervision_sub_index: false, wording_configuration_id: null,
  };
  const [form, setForm] = useState<FamilyInput>(empty);
  const [initial, setInitial] = useState<FamilyInput>(empty);
  const [loaded, setLoaded] = useState(!isEdit);
  const [parents, setParents] = useState<ParentOption[]>([]);
  const [wordings, setWordings] = useState<{ id: string; name: string; is_default: boolean }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createAnother, setCreateAnother] = useState(false);
  const [pending, startTransition] = useTransition();
  const { requestClose, dialog: guard } = useDirtyGuard(JSON.stringify(form) !== JSON.stringify(initial), close);
  const isCategory = form.kind === "category";
  const natures = isCategory ? CATEGORY_NATURES : FAMILY_NATURES;
  const isDocFamily = form.nature === "document" && !isCategory;

  useEffect(() => {
    if (!id) return;
    createClient().from("label_families").select("*").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      const v: FamilyInput = {
        kind: data.kind, nature: data.nature, relative_nature: data.relative_nature, parent_id: data.parent_id, project_id: data.project_id,
        short_name: data.short_name, long_name: data.long_name ?? "", code: data.code ?? "", color: data.color, priority: data.priority,
        quality_reference: data.quality_reference ?? "", client_supervision: data.client_supervision,
        client_supervision_sub_index: data.client_supervision_sub_index, wording_configuration_id: data.wording_configuration_id,
      };
      setForm(v); setInitial(v); setLoaded(true);
    });
  }, [id]);

  // Parents possibles (même portée, même nature) + configurations de suivi.
  useEffect(() => {
    const supabase = createClient();
    let q = supabase.from("label_families").select("id, short_name, long_name, color, nature")
      .eq("kind", form.kind).eq("relative_nature", "parent").is("deleted_at", null).order("priority").order("short_name");
    q = form.project_id ? q.eq("project_id", form.project_id) : q.is("project_id", null);
    q.then(({ data }) => setParents(data ?? []));
    supabase.from("wording_configurations").select("id, name, is_default").order("name").then(({ data }) => {
      setWordings(data ?? []);
      // Configuration de suivi par défaut à la création d'une famille Document.
      const def = (data ?? []).find((w) => w.is_default);
      if (!isEdit && def) setForm((f) => (f.wording_configuration_id ? f : { ...f, wording_configuration_id: def.id }));
    });
  }, [form.kind, form.project_id, isEdit]);

  const siblings = useSiblings(async () => {
    if (!id) return [];
    const supabase = createClient();
    const { data: self } = await supabase.from("label_families").select("kind, project_id, nature").eq("id", id).single();
    if (!self) return [];
    let q = supabase.from("label_families").select("id").eq("kind", self.kind).eq("nature", self.nature).is("deleted_at", null)
      .order("relative_nature").order("priority").order("short_name");
    q = self.project_id ? q.eq("project_id", self.project_id) : q.is("project_id", null);
    const { data } = await q;
    return (data ?? []).map((r) => r.id);
  }, id, [id]);

  const parentOptions = useMemo(() => parents.filter((p) => p.nature === form.nature), [parents, form.nature]);
  const set = <K extends keyof FamilyInput>(key: K, value: FamilyInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    const e: Record<string, string> = {};
    if (form.short_name.trim().length < 3) e.short_name = tg("validators.minLength", { min: 3 });
    if (form.relative_nature === "child" && !form.parent_id) e.parent_id = tg("validators.required");
    if (isDocFamily && wordings.length > 0 && !form.wording_configuration_id) e.wording_configuration_id = tg("validators.required");
    setErrors(e);
    if (Object.keys(e).length) return;
    startTransition(async () => {
      const done = await run(() => saveFamily(id, form), isEdit ? undefined : t(isCategory ? "createdCategory" : "created"));
      if (!done) return;
      if (!isEdit && createAnother) { setForm({ ...empty, nature: form.nature, relative_nature: form.relative_nature, parent_id: form.parent_id }); return; }
      close();
    });
  };

  const text = (key: "short_name" | "long_name" | "code" | "quality_reference", label: string, placeholder?: string) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`fam-${key}`}>{label}</FieldLabel>
      <Input id={`fam-${key}`} value={(form[key] as string) ?? ""} placeholder={placeholder} aria-invalid={!!errors[key]}
        onChange={(ev) => set(key, ev.target.value)} />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );

  const titleKey = isCategory ? (isEdit ? "editCategoryTitle" : "createCategoryTitle") : (isEdit ? "editTitle" : "createTitle");

  return (
    <ModalShell onClose={requestClose} size="md" icon={<EntityIcon kind="settings" icon={TagIcon} size="md" />}
      title={t(titleKey, { name: initial.short_name })}
      subtitle={isEdit ? tn(form.nature as never) : undefined}
      onPrevious={siblings.previous ? () => dialog.replace(`family/edit/${siblings.previous}`) : undefined}
      onNext={siblings.next ? () => dialog.replace(`family/edit/${siblings.next}`) : undefined}
      footer={<>
        {!isEdit && <label className="mr-auto flex items-center gap-2 text-sm"><Checkbox checked={createAnother} onCheckedChange={(v) => setCreateAnother(!!v)} />{t(isCategory ? "createAnotherCategory" : "createAnother")}</label>}
        <Button variant="secondary" onClick={requestClose}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {!loaded ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>{t("fields.nature")} *</FieldLabel>
              <Select value={form.nature} disabled={isEdit} onValueChange={(v) => setForm((f) => ({ ...f, nature: v as FamilyNature, parent_id: null }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{natures.map((n) => <SelectItem key={n} value={n}>{tn(n as never)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              {isEdit && <FieldDescription>{t("frozen")}</FieldDescription>}
            </Field>
            <Field>
              <FieldLabel>{t("fields.type")} *</FieldLabel>
              <ToggleGroup type="single" variant="outline" value={form.relative_nature} disabled={isEdit} className="justify-start"
                onValueChange={(v) => v && setForm((f) => ({ ...f, relative_nature: v as "parent" | "child", parent_id: v === "parent" ? null : f.parent_id }))}>
                <ToggleGroupItem value="parent" className="px-3">{t("relative.parent")}</ToggleGroupItem>
                <ToggleGroupItem value="child" className="px-3">{t("relative.child")}</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          </div>
          {form.relative_nature === "child" && (
            <Field data-invalid={!!errors.parent_id}>
              <FieldLabel>{t("fields.parent")} *</FieldLabel>
              <Select value={form.parent_id ?? undefined} disabled={isEdit} onValueChange={(v) => set("parent_id", v)}>
                <SelectTrigger aria-invalid={!!errors.parent_id}><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}><span className="size-3 rounded-sm" style={{ backgroundColor: p.color }} />{familyLabel(p)}</SelectItem>
                  ))}
                </SelectGroup></SelectContent>
              </Select>
              {parentOptions.length === 0 && <FieldDescription>{t("noParent")}</FieldDescription>}
              {errors.parent_id && <FieldError>{errors.parent_id}</FieldError>}
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4">
            {text("short_name", `${t("fields.shortName")} *`, t("placeholders.shortName"))}
            {text("long_name", t("fields.longName"))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {text("code", t("fields.code"))}
            <Field>
              <FieldLabel htmlFor="fam-priority">{t("fields.priority")}</FieldLabel>
              <Input id="fam-priority" type="number" min={0} value={form.priority ?? 0} onChange={(ev) => set("priority", Number(ev.target.value) || 0)} />
            </Field>
          </div>
          <ColorField label={t("fields.color")} value={form.color} onChange={(v) => set("color", v)} />
          {form.nature === "document" && text("quality_reference", t("fields.qualityReference"))}
          {isDocFamily && (
            <>
              <Field data-invalid={!!errors.wording_configuration_id}>
                <FieldLabel>{t("fields.wording")}{wordings.length > 0 && " *"}</FieldLabel>
                <Select value={form.wording_configuration_id ?? undefined} onValueChange={(v) => set("wording_configuration_id", v)}>
                  <SelectTrigger aria-invalid={!!errors.wording_configuration_id}><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
                  <SelectContent><SelectGroup>{wordings.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                {wordings.length === 0 && <FieldDescription>{t("noWording")}</FieldDescription>}
                {errors.wording_configuration_id && <FieldError>{errors.wording_configuration_id}</FieldError>}
              </Field>
              <Field orientation="horizontal">
                <Switch id="fam-cs" checked={!!form.client_supervision} onCheckedChange={(v) => setForm((f) => ({ ...f, client_supervision: v, client_supervision_sub_index: v ? f.client_supervision_sub_index : false }))} />
                <FieldLabel htmlFor="fam-cs">{t("fields.clientSupervision")}</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Switch id="fam-css" checked={!!form.client_supervision_sub_index} disabled={!form.client_supervision} onCheckedChange={(v) => set("client_supervision_sub_index", v)} />
                <FieldLabel htmlFor="fam-css">{t("fields.clientSupervisionSubIndex")}</FieldLabel>
              </Field>
              {isEdit && (form.client_supervision !== initial.client_supervision || form.client_supervision_sub_index !== initial.client_supervision_sub_index) && (
                <Alert><AlertDescription>{t("supervisionWarning")}</AlertDescription></Alert>
              )}
            </>
          )}
        </FieldGroup>
      )}
      {guard}
    </ModalShell>
  );
}
