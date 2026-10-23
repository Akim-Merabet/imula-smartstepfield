"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BookUserIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { saveClient } from "../actions/clients";
import { useDirtyGuard } from "../components/dirty-guard";
import { useRun } from "../components/use-run";
import { useSiblings } from "../components/use-siblings";
import type { ClientInput } from "../schema";

const EMPTY: ClientInput = {
  name: "", name_2: "", name_3: "", address: "", address_comp: "", zip_code: "", city: "", country: "", observation: "",
  reference: "", cover_page_enabled: false, page_number_x: null, page_number_y: null, index_max: null,
};
const REQUIRED = ["name", "address", "zip_code", "city"] as const;

/** ?dialog=client/add/<onglet> · client/edit/<id>/<onglet> — spec 01 §6.5. */
export default function ClientDialog({ segments, close }: DialogProps) {
  const t = useTranslations("settings.clients");
  const tg = useTranslations("global");
  const dialog = useDialog();
  const run = useRun();
  const [action, a, b] = segments;
  const isEdit = action === "edit";
  const id = isEdit ? a : null;
  const tab = (isEdit ? b : a) ?? "general-tab";
  const [form, setForm] = useState<ClientInput>(EMPTY);
  const [initial, setInitial] = useState<ClientInput>(EMPTY);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createAnother, setCreateAnother] = useState(false);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const { requestClose, dialog: guard } = useDirtyGuard(dirty, close);
  const siblings = useSiblings(async () => {
    const { data } = await createClient().from("clients").select("id").order("name");
    return (data ?? []).map((r) => r.id);
  }, id);

  useEffect(() => {
    if (!id) return;
    createClient().from("clients").select("*").eq("id", id).single().then(({ data }) => {
      if (!data) return;
      const s = (v: string | null) => v ?? "";
      const value: ClientInput = {
        name: data.name, name_2: s(data.name_2), name_3: s(data.name_3), address: data.address, address_comp: s(data.address_comp),
        zip_code: data.zip_code, city: data.city, country: s(data.country), observation: s(data.observation), reference: s(data.reference),
        cover_page_enabled: data.cover_page_enabled, page_number_x: data.page_number_x, page_number_y: data.page_number_y, index_max: data.index_max,
      };
      setForm(value); setInitial(value); setLoaded(true);
    });
  }, [id]);

  const goTab = (tabId: string) => dialog.replace(isEdit ? `client/edit/${id}/${tabId}` : `client/add/${tabId}`);
  const set = (key: keyof ClientInput, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    const e: Record<string, string> = {};
    for (const k of REQUIRED) if (!String(form[k] ?? "").trim()) e[k] = tg("validators.required");
    setErrors(e);
    if (Object.keys(e).length) { goTab("general-tab"); return; }
    startTransition(async () => {
      const okRun = await run(() => saveClient(id, form), isEdit ? undefined : t("created"));
      if (!okRun) return;
      if (!isEdit && createAnother) { setForm(EMPTY); return; }
      close();
    });
  };

  const text = (key: keyof ClientInput, required = false) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`cl-${key}`}>{t(`fields.${key}` as never)}{required && " *"}</FieldLabel>
      <Input id={`cl-${key}`} value={(form[key] as string) ?? ""} aria-invalid={!!errors[key]} onChange={(e) => set(key, e.target.value)} />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );
  const num = (key: "page_number_x" | "page_number_y" | "index_max") => (
    <Field>
      <FieldLabel htmlFor={`cl-${key}`}>{t(`fields.${key}`)}</FieldLabel>
      <Input id={`cl-${key}`} type="number" value={form[key] ?? ""} disabled={!form.cover_page_enabled}
        onChange={(e) => set(key, e.target.value === "" ? null : Number(e.target.value))} />
    </Field>
  );

  return (
    <ModalShell onClose={requestClose} size="md"
      icon={<EntityIcon kind="settings" icon={BookUserIcon} size="md" />}
      title={isEdit ? t("editTitle", { name: initial.name }) : t("createTitle")}
      tabs={[{ id: "general-tab", label: t("tabs.general") }, { id: "options-tab", label: t("tabs.options") }]}
      activeTab={tab} onTabChange={goTab}
      onPrevious={siblings.previous ? () => dialog.replace(`client/edit/${siblings.previous}/${tab}`) : undefined}
      onNext={siblings.next ? () => dialog.replace(`client/edit/${siblings.next}/${tab}`) : undefined}
      footer={<>
        {!isEdit && (
          <label className="mr-auto flex items-center gap-2 text-sm">
            <Checkbox checked={createAnother} onCheckedChange={(v) => setCreateAnother(!!v)} />{t("createAnother")}
          </label>
        )}
        <Button variant="secondary" onClick={requestClose}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {!loaded ? <div className="flex justify-center py-16"><Spinner /></div> : tab === "options-tab" ? (
        <FieldGroup>
          <Field orientation="horizontal">
            <Switch id="cl-cover" checked={!!form.cover_page_enabled} onCheckedChange={(v) => set("cover_page_enabled", v)} />
            <FieldLabel htmlFor="cl-cover">{t("fields.cover_page_enabled")}</FieldLabel>
          </Field>
          <FieldDescription>{t("coverHelp")}</FieldDescription>
          <Field>
            <FieldLabel>{t("fields.cover_page_pdf")}</FieldLabel>
            <Input type="file" accept="application/pdf" disabled />
            <FieldDescription>{t("coverPdfUnavailable")}</FieldDescription>
          </Field>
          <div className="grid grid-cols-3 gap-4">{num("page_number_x")}{num("page_number_y")}{num("index_max")}</div>
        </FieldGroup>
      ) : (
        <FieldGroup>
          {isEdit && <Alert><AlertDescription>{t("editWarning")}</AlertDescription></Alert>}
          <div className="grid grid-cols-3 gap-4">{text("name", true)}{text("name_2")}{text("name_3")}</div>
          <div className="grid grid-cols-2 gap-4">{text("address", true)}{text("address_comp")}</div>
          <div className="grid grid-cols-3 gap-4">{text("zip_code", true)}{text("city", true)}{text("country")}</div>
          {text("reference")}
          <Field>
            <FieldLabel htmlFor="cl-observation">{t("fields.observation")}</FieldLabel>
            <Textarea id="cl-observation" value={form.observation ?? ""} onChange={(e) => set("observation", e.target.value)} />
          </Field>
        </FieldGroup>
      )}
      {guard}
    </ModalShell>
  );
}
