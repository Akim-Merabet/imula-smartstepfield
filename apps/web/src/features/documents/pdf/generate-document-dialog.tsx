"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { FileTextIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { generateResponseDocument } from "./actions";

type Option = { id: string; label: string };
const NONE = "__none__";

/** Popup « Générer un document » d'une réponse (Voir PDF = aperçu direct, Générer = document + file). */
export function GenerateDocumentDialog({ open, onOpenChange, response }: {
  open: boolean; onOpenChange: (open: boolean) => void; response: { id: string; reference: string; projectId: string };
}) {
  const t = useTranslations("pdf.generate");
  const tg = useTranslations("global");
  const [families, setFamilies] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [form, setForm] = useState({ name: response.reference, family_id: "", ref_int: "", ref_ext: "", category_id: NONE, closing_category_id: NONE, include_empty_option: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    void Promise.all([
      supabase.from("label_families").select("id, short_name, long_name").eq("kind", "family").eq("nature", "document").eq("relative_nature", "child")
        .eq("active", true).is("deleted_at", null).order("priority").order("short_name"),
      supabase.from("label_families").select("id, short_name, long_name").eq("kind", "category").eq("nature", "document")
        .eq("project_id", response.projectId).is("deleted_at", null).order("priority"),
    ]).then(([fam, cat]) => {
      const label = (x: { short_name: string; long_name: string | null }) => (x.long_name ? `${x.short_name} - ${x.long_name}` : x.short_name);
      setFamilies((fam.data ?? []).map((x) => ({ id: x.id, label: label(x) })));
      setCategories((cat.data ?? []).map((x) => ({ id: x.id, label: label(x) })));
    });
  }, [open, response.reference, response.projectId]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const previewUrl = `/api/pdf/responses/${response.id}${form.include_empty_option ? "?empty=1" : ""}`;

  const submit = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 3) e.name = tg("validators.required");
    if (!form.family_id) e.family_id = tg("validators.required");
    for (const k of ["ref_int", "ref_ext"] as const) if (form[k] && form[k].trim().length < 3) e[k] = t("minLength");
    setErrors(e);
    if (Object.keys(e).length) return;
    start(async () => {
      const res = await generateResponseDocument(response.id, {
        ...form, category_id: form.category_id === NONE ? null : form.category_id,
        closing_category_id: form.closing_category_id === NONE ? null : form.closing_category_id,
      });
      if (!res.ok) { notify.error(t.has(`errors.${res.error}`) ? t(`errors.${res.error}`) : t("errors.unknown")); return; }
      notify.success(t("done"), t("doneHelp"));
      onOpenChange(false);
    });
  };

  const select = (key: "family_id" | "category_id" | "closing_category_id", items: Option[], optional: boolean) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel>{t(`fields.${key}`)}{optional ? "" : " *"}</FieldLabel>
      <Select value={form[key] || undefined} onValueChange={(v) => set({ [key]: v })}>
        <SelectTrigger aria-invalid={!!errors[key]}><SelectValue placeholder={t("selectPlaceholder")} /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {optional && <SelectItem value={NONE}>{tg("none")}</SelectItem>}
            {items.map((i) => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );
  const text = (key: "name" | "ref_int" | "ref_ext", required = false) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`gd-${key}`}>{t(`fields.${key}`)}{required && " *"}</FieldLabel>
      <Input id={`gd-${key}`} value={form[key]} aria-invalid={!!errors[key]} onChange={(e) => set({ [key]: e.target.value })} />
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {text("name", true)}
          {select("family_id", families, false)}
          <div className="grid grid-cols-2 gap-4">{text("ref_int")}{text("ref_ext")}</div>
          <div className="grid grid-cols-2 gap-4">{select("category_id", categories, true)}{select("closing_category_id", categories, true)}</div>
          <Field orientation="horizontal">
            <Checkbox id="gd-empty" checked={form.include_empty_option} onCheckedChange={(v) => set({ include_empty_option: !!v })} />
            <FieldLabel htmlFor="gd-empty">{t("fields.include_empty_option")}</FieldLabel>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" asChild>
            <a href={previewUrl} target="_blank" rel="noopener"><FileTextIcon data-icon="inline-start" />{t("preview")}</a>
          </Button>
          <Button onClick={submit} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{t("submit")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bouton d'en-tête de la page réponse. */
export function GenerateDocumentButton({ response }: { response: { id: string; reference: string; projectId: string } }) {
  const t = useTranslations("pdf.generate");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><FileTextIcon data-icon="inline-start" />{t("button")}</Button>
      <GenerateDocumentDialog open={open} onOpenChange={setOpen} response={response} />
    </>
  );
}
