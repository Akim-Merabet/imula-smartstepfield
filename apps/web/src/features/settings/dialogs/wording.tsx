"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FileSignatureIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { deleteWordingLanguage, saveWording, saveWordingLanguage } from "../actions/wording";
import { useDirtyGuard } from "../components/dirty-guard";
import { useRun } from "../components/use-run";
import { UI_LANGUAGES, WORDING_DEFAULTS, WORDING_STATES } from "../meta";
import type { WordingInput } from "../schema";

type Entry = { value: string; tooltip: string; color: string };
type Fields = Record<string, Entry>;
const EMPTY: WordingInput = { name: "", description: "", hide_bpa: false, hide_bpe_valid: false, hide_vso_sr: false, is_default: false };

/** Sections d'états documentaires : défaut, validation bis, sous-indice, retour avec réserve. */
const SECTIONS: Record<string, readonly string[]> = {
  default: ["prel", "bpoAd", "bpoRc", "bpoModification", "vso", "vao", "bpe", "bpeTemp"],
  validationBis: ["bpeValid"],
  subIndex: ["bpa", "bpaAd", "bpaRc", "bpaOk", "bpaKo", "bpaRefused", "bpaModification"],
  reserve: ["vsoSr"],
};

function defaults(): Fields {
  return Object.fromEntries(WORDING_STATES.map((s) => [s, { value: WORDING_DEFAULTS[s], tooltip: WORDING_DEFAULTS[s], color: "#5e5a5a" }]));
}

/** ?dialog=wording/add/configuration-tab · wording/edit/<id>/<configuration-tab|translation-tab> — spec 01 §6.13. */
export default function WordingDialog({ segments, close }: DialogProps) {
  const t = useTranslations("settings.wording");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const run = useRun();
  const isEdit = segments[0] === "edit";
  const id = isEdit ? segments[1] : null;
  const tab = (isEdit ? segments[2] : segments[1]) ?? "configuration-tab";
  const [form, setForm] = useState<WordingInput>(EMPTY);
  const [initial, setInitial] = useState<WordingInput>(EMPTY);
  const [readOnly, setReadOnly] = useState(false);
  const [loaded, setLoaded] = useState(!isEdit);
  const [nameError, setNameError] = useState<string | null>(null);
  const [languages, setLanguages] = useState<Record<string, Fields>>({});
  const [language, setLanguage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { requestClose, dialog: guard } = useDirtyGuard(JSON.stringify(form) !== JSON.stringify(initial), close);

  const applyLanguages = useCallback((data: { language: string; fields: unknown }[] | null) => {
    const map: Record<string, Fields> = {};
    for (const row of data ?? []) map[row.language] = { ...defaults(), ...(row.fields as Fields) };
    setLanguages(map);
    setLanguage((cur) => cur && map[cur] ? cur : Object.keys(map)[0] ?? null);
  }, []);
  const fetchLanguages = useCallback(() => createClient().from("wording_configuration_languages")
    .select("language, fields").eq("wording_configuration_id", id ?? ""), [id]);
  const loadLanguages = useCallback(async () => { const { data } = await fetchLanguages(); applyLanguages(data); }, [fetchLanguages, applyLanguages]);

  useEffect(() => {
    if (!id) return;
    createClient().from("wording_configurations").select("*").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      const v = { name: data.name, description: data.description ?? "", hide_bpa: data.hide_bpa, hide_bpe_valid: data.hide_bpe_valid, hide_vso_sr: data.hide_vso_sr, is_default: data.is_default };
      setForm(v); setInitial(v); setReadOnly(data.read_only); setLoaded(true);
    });
    fetchLanguages().then(({ data }) => applyLanguages(data));
  }, [id, fetchLanguages, applyLanguages]);

  const goTab = (tabId: string) => dialog.replace(isEdit ? `wording/edit/${id}/${tabId}` : `wording/add/${tabId}`);
  const sw = (k: "hide_bpa" | "hide_bpe_valid" | "hide_vso_sr" | "is_default") => (
    <Field orientation="horizontal">
      <Switch id={`w-${k}`} checked={!!form[k]} disabled={readOnly} onCheckedChange={(v) => setForm((f) => ({ ...f, [k]: v }))} />
      <FieldLabel htmlFor={`w-${k}`}>{t(`fields.${k}`)}</FieldLabel>
    </Field>
  );

  const saveConfig = () => {
    if (!form.name.trim()) { setNameError(tg("validators.required")); return; }
    setNameError(null);
    startTransition(async () => {
      const res = await saveWording(id, form);
      if (!res.ok) { await run(async () => res); return; }
      await run(async () => res);
      if (isEdit) { setInitial(form); return; }
      dialog.replace(`wording/edit/${res.data.id}/translation-tab`);
    });
  };

  const current = language ? languages[language] : null;
  const setEntry = (state: string, key: keyof Entry, value: string) => {
    if (!language) return;
    setLanguages((all) => ({ ...all, [language]: { ...all[language], [state]: { ...all[language][state], [key]: value } } }));
  };
  const missing = current ? WORDING_STATES.filter((s) => !current[s]?.value?.trim() || !current[s]?.tooltip?.trim()) : [];
  const available = UI_LANGUAGES.filter((l) => !languages[l]);

  const translation = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {Object.keys(languages).map((l) => (
          <Button key={l} size="sm" variant={l === language ? "default" : "secondary"} onClick={() => setLanguage(l)}>{t(`languages.${l}` as never)}</Button>
        ))}
        {!readOnly && available.length > 0 && (
          <Select value="" onValueChange={(l) => { setLanguages((all) => ({ ...all, [l]: defaults() })); setLanguage(l); }}>
            <SelectTrigger size="sm" className="w-48"><PlusIcon /><SelectValue placeholder={t("addLanguage")} /></SelectTrigger>
            <SelectContent><SelectGroup>{available.map((l) => <SelectItem key={l} value={l}>{t(`languages.${l}`)}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        )}
      </div>
      {!current ? <p className="py-8 text-center text-muted-foreground">{t("noTranslation")}</p> : (
        <>
          {Object.entries(SECTIONS).map(([section, states]) => (
            <div key={section} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t(`sections.${section}` as never)}</h3>
              <div className="grid grid-cols-[10rem_1fr_1.5fr_4rem] items-center gap-2 text-sm">
                {states.map((s) => (
                  <div key={s} className="contents">
                    <span className="text-muted-foreground">{t(`states.${s}` as never)}</span>
                    <Input aria-label={t("value")} value={current[s]?.value ?? ""} disabled={readOnly} aria-invalid={!current[s]?.value?.trim()} onChange={(e) => setEntry(s, "value", e.target.value)} />
                    <Input aria-label={t("tooltip")} value={current[s]?.tooltip ?? ""} disabled={readOnly} aria-invalid={!current[s]?.tooltip?.trim()} onChange={(e) => setEntry(s, "tooltip", e.target.value)} />
                    <Input aria-label={t("color")} type="color" className="h-8 p-0.5" value={current[s]?.color ?? "#5e5a5a"} disabled={readOnly} onChange={(e) => setEntry(s, "color", e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {missing.length > 0 && <p className="text-sm text-destructive">{t("entriesRequired")}</p>}
          {!readOnly && (
            <div className="flex justify-between">
              <Button variant="ghost" className="text-destructive" onClick={() => startTransition(async () => {
                if (await run(() => deleteWordingLanguage(id!, language!), tg("toast.deleted"))) await loadLanguages();
              })}><Trash2Icon data-icon="inline-start" />{t("deleteLanguage")}</Button>
              <Button disabled={pending || missing.length > 0} onClick={() => startTransition(async () => {
                if (await run(() => saveWordingLanguage(id!, { language: language as never, fields: current }))) await loadLanguages();
              })}>{pending && <Spinner data-icon="inline-start" />}{t("saveTranslation")}</Button>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <ModalShell onClose={requestClose} size="lg" icon={<EntityIcon kind="settings" icon={FileSignatureIcon} size="md" />}
      title={isEdit ? t("editTitle", { name: initial.name }) : t("createTitle")}
      tabs={[{ id: "configuration-tab", label: t("tabs.configuration") }, { id: "translation-tab", label: t("tabs.translation"), disabled: !isEdit }]}
      activeTab={tab} onTabChange={goTab}
      footer={tab === "configuration-tab" ? <>
        <Button variant="secondary" onClick={requestClose}>{tg("actions.cancel")}</Button>
        <Button onClick={saveConfig} disabled={pending || !loaded || readOnly}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </> : <Button variant="secondary" onClick={requestClose}>{tg("actions.close")}</Button>}>
      {!loaded ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <div className={cn("flex flex-col gap-4")}>
          {readOnly && <Alert><AlertDescription>{t("readOnly")}</AlertDescription></Alert>}
          {tab === "translation-tab" ? translation : (
            <FieldGroup>
              <Field data-invalid={!!nameError}>
                <FieldLabel htmlFor="w-name">{t("fields.name")} *</FieldLabel>
                <Input id="w-name" value={form.name} disabled={readOnly} aria-invalid={!!nameError} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                {nameError && <FieldError>{nameError}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="w-desc">{t("fields.description")}</FieldLabel>
                <Textarea id="w-desc" value={form.description ?? ""} disabled={readOnly} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </Field>
              {sw("hide_bpa")}
              {sw("hide_bpe_valid")}
              {sw("hide_vso_sr")}
              {sw("is_default")}
            </FieldGroup>
          )}
        </div>
      )}
      {guard}
    </ModalShell>
  );
}
