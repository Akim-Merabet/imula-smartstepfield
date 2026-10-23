"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileStackIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { TEMPLATE_GROUPS } from "../templates";
import { saveTram } from "./actions";

type Form = {
  link_type: "default" | "client" | "family"; client_id: string; family_id: string; page_type: string;
  margin_top: string; margin_bottom: string; margin_left: string; margin_right: string;
  page_number_x: string; page_number_y: string; index_max: string;
};
const EMPTY: Form = {
  link_type: "default", client_id: "", family_id: "", page_type: "COVER_PAGE",
  margin_top: "62", margin_bottom: "52", margin_left: "42", margin_right: "42", page_number_x: "", page_number_y: "", index_max: "",
};
const str = (v: number | null) => (v === null || v === undefined ? "" : String(v));

/** ?dialog=tram/add · tram/edit/<id> — trame PDF (spec 01 §6.12). */
export default function TramDialog({ segments, close }: DialogProps) {
  const t = useTranslations("pdf.trams");
  const tg = useTranslations("global");
  const router = useRouter();
  const [action, id] = segments;
  const isEdit = action === "edit" && !!id;
  const [form, setForm] = useState<Form>(EMPTY);
  const [initialLink, setInitialLink] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [families, setFamilies] = useState<{ id: string; label: string }[]>([]);
  const [loaded, setLoaded] = useState(!isEdit);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    void Promise.all([
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("label_families").select("id, short_name, long_name").eq("kind", "family").eq("nature", "document").eq("relative_nature", "child")
        .is("deleted_at", null).order("short_name"),
      isEdit ? supabase.from("document_templates").select("*").eq("id", id).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([c, f, tpl]) => {
      setClients(c.data ?? []);
      setFamilies((f.data ?? []).map((x) => ({ id: x.id, label: x.long_name ? `${x.short_name} - ${x.long_name}` : x.short_name })));
      const r = tpl.data;
      if (r) {
        setForm({
          link_type: r.link_type as Form["link_type"], client_id: r.client_id ?? "", family_id: r.family_id ?? "", page_type: r.page_type,
          margin_top: str(r.margin_top), margin_bottom: str(r.margin_bottom), margin_left: str(r.margin_left), margin_right: str(r.margin_right),
          page_number_x: str(r.page_number_x), page_number_y: str(r.page_number_y), index_max: str(r.index_max),
        });
        setInitialLink(r.link_type);
        setHasFile(!!r.pdf_path);
        setLoaded(true);
      }
    });
  }, [id, isEdit]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const lockedType = isEdit && initialLink === "default";

  const submit = () => {
    const e: Record<string, string> = {};
    if (form.link_type === "client" && !form.client_id) e.client_id = tg("validators.required");
    if (form.link_type === "family" && !form.family_id) e.family_id = tg("validators.required");
    for (const k of ["margin_top", "margin_bottom", "margin_left", "margin_right"] as const) if (form[k] === "" || Number(form[k]) < 0) e[k] = tg("validators.required");
    if (!file && !hasFile) e.file = tg("validators.required");
    if (file && file.type && file.type !== "application/pdf") e.file = t("errors.invalid_pdf");
    setErrors(e);
    if (Object.keys(e).length) return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.set(k, v);
    if (file) fd.set("file", file);
    start(async () => {
      const res = await saveTram(isEdit ? id : null, fd);
      if (!res.ok) { notify.error(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : tg("toast.error")); return; }
      notify.success(tg("toast.saved"));
      router.refresh();
      close();
    });
  };

  const numField = (key: keyof Form, required = true) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`tr-${key}`}>{t(`fields.${key}`)}{required && " *"}</FieldLabel>
      <Input id={`tr-${key}`} type="number" min={0} step="1" value={form[key]} aria-invalid={!!errors[key]} onChange={(ev) => set({ [key]: ev.target.value })} />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );

  return (
    <ModalShell onClose={close} size="md" icon={<EntityIcon kind="settings" icon={FileStackIcon} size="md" />}
      title={isEdit ? t("editTitle") : t("createTitle")}
      footer={<>
        <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !loaded}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {!loaded ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <FieldGroup>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>{t("fields.link_type")} *</FieldLabel>
              <Select value={form.link_type} disabled={lockedType} onValueChange={(v) => set({ link_type: v as Form["link_type"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {(["default", "client", "family"] as const).map((l) => <SelectItem key={l} value={l}>{t(`links.${l}`)}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
            {form.link_type === "client" && (
              <Field data-invalid={!!errors.client_id}>
                <FieldLabel>{t("fields.client_id")} *</FieldLabel>
                <Select value={form.client_id || undefined} onValueChange={(v) => set({ client_id: v })}>
                  <SelectTrigger aria-invalid={!!errors.client_id}><SelectValue placeholder={t("select")} /></SelectTrigger>
                  <SelectContent><SelectGroup>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                {errors.client_id && <FieldError>{errors.client_id}</FieldError>}
              </Field>
            )}
            {form.link_type === "family" && (
              <Field data-invalid={!!errors.family_id}>
                <FieldLabel>{t("fields.family_id")} *</FieldLabel>
                <Select value={form.family_id || undefined} onValueChange={(v) => set({ family_id: v })}>
                  <SelectTrigger aria-invalid={!!errors.family_id}><SelectValue placeholder={t("select")} /></SelectTrigger>
                  <SelectContent><SelectGroup>{families.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                {errors.family_id && <FieldError>{errors.family_id}</FieldError>}
              </Field>
            )}
          </div>
          <Field>
            <FieldLabel>{t("fields.page_type")} *</FieldLabel>
            <Select value={form.page_type} disabled={lockedType} onValueChange={(v) => set({ page_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEMPLATE_GROUPS.map((g) => (
                  <SelectGroup key={g.group}>
                    <SelectLabel>{t(`groups.${g.group}`)}</SelectLabel>
                    {g.types.map((ty) => <SelectItem key={ty} value={ty}>{t(`types.${ty}`)}</SelectItem>)}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {lockedType && <FieldDescription>{t("defaultLocked")}</FieldDescription>}
          </Field>
          <Field data-invalid={!!errors.file}>
            <FieldLabel htmlFor="tr-file">{t("fields.file")}{!hasFile && " *"}</FieldLabel>
            <Input id="tr-file" type="file" accept="application/pdf" aria-invalid={!!errors.file} onChange={(ev) => setFile(ev.target.files?.[0] ?? null)} />
            <FieldDescription>{hasFile ? t("fileReplace") : t("fileHelp")}</FieldDescription>
            {errors.file && <FieldError>{errors.file}</FieldError>}
          </Field>
          <FieldSet>
            <FieldLegend variant="label">{t("margins")}</FieldLegend>
            <FieldDescription>{t("marginsHelp")}</FieldDescription>
            <div className="grid grid-cols-4 gap-4">{numField("margin_top")}{numField("margin_bottom")}{numField("margin_left")}{numField("margin_right")}</div>
          </FieldSet>
          <FieldSet>
            <FieldLegend variant="label">{t("pageNumber")}</FieldLegend>
            <FieldDescription>{t("pageNumberHelp")}</FieldDescription>
            <div className="grid grid-cols-3 gap-4">{numField("page_number_x", false)}{numField("page_number_y", false)}{numField("index_max", false)}</div>
          </FieldSet>
        </FieldGroup>
      )}
    </ModalShell>
  );
}
