"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ClipboardListIcon, DownloadIcon, SearchIcon, SendIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip, StatusBadge } from "@/components/common/status-badge";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { DIALOG_PARAM } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { importLibraryForms } from "../actions";
import { NatureChip, useActionError } from "../components/form-chips";
import { IMPORT_LIMIT } from "../meta";
import { createResponse, getReplyDefaults } from "../responses/actions";

type LibForm = {
  id: string; name: string; nature: string; reference: string | null; index_label: string | null;
  family: { short_name: string; long_name: string | null; color: string } | null;
  status: { name: string; color: string; importable: boolean } | null;
};

/** ?dialog=form-lib/import/<projectId> — import depuis la bibliothèque (max 10, statut importable). */
export function ImportFormsDialog({ projectId, close }: { projectId: string; close: () => void }) {
  const t = useTranslations("forms.import");
  const tf = useTranslations("forms");
  const tg = useTranslations("global");
  const router = useRouter();
  const errorText = useActionError();
  const [forms, setForms] = useState<LibForm[] | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("forms").select(`id, name, nature, reference, index_label,
        family:label_families!forms_family_id_fkey(short_name, long_name, color), status:custom_statuses(name, color, importable)`)
        .eq("location", "library").eq("archived", false).is("deleted_at", null).order("name"),
      supabase.from("forms").select("sourced_from_form_id").eq("project_id", projectId).eq("origin", "imported").is("deleted_at", null),
    ]).then(([lib, existing]) => {
      const all = (lib.data ?? []) as unknown as LibForm[];
      setForms(all.filter((f) => !f.status || f.status.importable));
      setImported(new Set((existing.data ?? []).map((e) => e.sourced_from_form_id!).filter(Boolean)));
    });
  }, [projectId]);

  const visible = useMemo(() => (forms ?? []).filter((f) => {
    const q = search.trim().toLowerCase();
    return !q || f.name.toLowerCase().includes(q) || (f.reference ?? "").toLowerCase().includes(q);
  }), [forms, search]);

  const toggle = (id: string, on: boolean) => {
    if (on && selected.length >= IMPORT_LIMIT) { notify.warning(tf("errors.size_limit")); return; }
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  };

  const submit = () => startTransition(async () => {
    const res = await importLibraryForms(projectId, selected);
    if (!res.ok) { notify.error(errorText(res.error)); return; }
    const { imported: n, conflicts, notImportable } = res.data;
    if (n) notify.success(tf("toasts.imported", { count: n }));
    if (conflicts.length) notify.warning(t("conflict"), conflicts.join(", "));
    if (notImportable.length) notify.warning(t("notImportable"), notImportable.join(", "));
    if (n) close();
    router.refresh();
  });

  return (
    <ModalShell onClose={close} size="lg" icon={<EntityIcon kind="library" icon={DownloadIcon} size="md" />}
      title={t("title")} subtitle={t("subtitle")}
      footer={<>
        <span className="mr-auto self-center text-sm text-muted-foreground">{tg("list.selected", { count: selected.length })}</span>
        <Button variant="outline" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || selected.length === 0}>
          {pending && <Spinner data-icon="inline-start" />}{t("submit")}
        </Button>
      </>}>
      <div className="flex flex-col gap-3">
        <InputGroup className="w-72 bg-input-bg">
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tg("list.searchPlaceholder")} />
        </InputGroup>
        {!forms ? <div className="flex justify-center py-12"><Spinner /></div> : visible.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">{tg("list.emptyTitle")}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {visible.map((f) => {
              const already = imported.has(f.id);
              const checked = selected.includes(f.id);
              return (
                <li key={f.id}>
                  <label className={`flex items-center gap-3 px-3 py-2 ${already ? "opacity-60" : "cursor-pointer hover:bg-row-hover"}`}>
                    <Checkbox checked={checked} disabled={already} onCheckedChange={(v) => toggle(f.id, !!v)} />
                    <NatureChip nature={f.nature} />
                    <FamilyChip color={f.family?.color} shortName={f.family?.short_name} longName={f.family?.long_name} />
                    <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                    <span className="w-28 truncate text-sm text-muted-foreground">{f.reference ?? "—"}</span>
                    <span className="w-12 text-sm text-muted-foreground">{f.index_label ?? "—"}</span>
                    <StatusBadge color={f.status?.color} label={f.status?.name} className="w-28" />
                    {already && <Badge variant="secondary">{t("alreadyImported")}</Badge>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t("onlyImportable")}</p>
      </div>
    </ModalShell>
  );
}

/** ?dialog=form-lib/reply/<formId>[/<blockLinkId>] — « Répondre à un formulaire » (spec 03 §6.2). */
export function ReplyDialog({ projectId, formId, blockLinkId, close }: {
  projectId: string; formId: string; blockLinkId?: string; close: () => void;
}) {
  const t = useTranslations("forms.reply");
  const tg = useTranslations("global");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const errorText = useActionError();
  const [defaults, setDefaults] = useState<Awaited<ReturnType<typeof getReplyDefaults>> | null>(null);
  const [mode, setMode] = useState<"new" | "resume">("new");
  const [reference, setReference] = useState("");
  const [resumeId, setResumeId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getReplyDefaults({ projectId, formId, blockLinkId: blockLinkId ?? null }, locale).then((res) => {
      setDefaults(res);
      if (res.ok) setReference(res.data.reference);
    });
  }, [projectId, formId, blockLinkId, locale]);

  const returnTo = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(DIALOG_PARAM);
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  })();
  const go = (url: string) => router.push(`${url}?${new URLSearchParams({ returnTo })}`);

  const data = defaults?.ok ? defaults.data : null;
  const tooShort = reference.trim().length < 3;
  const blocked = !!data && (!data.enabled || (mode === "new" && data.uniqueBlocked));

  const submit = () => {
    if (!data) return;
    if (mode === "resume") { if (resumeId) go(`/explore/projects/${projectId}/responses/${resumeId}`); return; }
    if (tooShort) return;
    startTransition(async () => {
      const res = await createResponse({ projectId, formId, blockLinkId: blockLinkId ?? null, reference: reference.trim() });
      if (!res.ok) { notify.error(errorText(res.error)); return; }
      go(res.data.url);
    });
  };

  return (
    <ModalShell onClose={close} size="sm" icon={<EntityIcon kind="project" icon={ClipboardListIcon} size="md" />}
      title={t("title", { name: data?.formName ?? "" })}
      footer={<>
        <Button variant="outline" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !data || blocked || (mode === "new" ? tooShort : !resumeId)}>
          {pending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}{t("submit")}
        </Button>
      </>}>
      {!defaults ? <div className="flex justify-center py-12"><Spinner /></div> : !data ? (
        <Alert variant="destructive"><AlertDescription>{errorText(defaults.ok ? "unknown" : defaults.error)}</AlertDescription></Alert>
      ) : (
        <FieldGroup>
          {!data.enabled && <Alert variant="destructive"><AlertDescription>{t("disabled")}</AlertDescription></Alert>}
          {data.inProgress.length > 0 && (
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "new" | "resume")}>
              <Field orientation="horizontal">
                <RadioGroupItem value="new" id="reply-new" />
                <FieldLabel htmlFor="reply-new" className="font-normal">{t("newResponse")}</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <RadioGroupItem value="resume" id="reply-resume" />
                <FieldLabel htmlFor="reply-resume" className="font-normal">{t("resume")}</FieldLabel>
              </Field>
            </RadioGroup>
          )}
          {mode === "new" ? (
            <Field data-invalid={tooShort}>
              <FieldLabel htmlFor="reply-ref">{t("reference")} *</FieldLabel>
              <Input id="reply-ref" value={reference} onChange={(e) => setReference(e.target.value)} aria-invalid={tooShort} />
              <FieldDescription>{t("referenceHint")}</FieldDescription>
              {tooShort && <FieldError>{t("referenceTooShort")}</FieldError>}
              {data.uniqueBlocked && <Alert variant="destructive"><AlertDescription>{t("unique")}</AlertDescription></Alert>}
            </Field>
          ) : (
            <Field>
              <FieldLabel>{t("response")}</FieldLabel>
              <Select value={resumeId || undefined} onValueChange={setResumeId}>
                <SelectTrigger><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {data.inProgress.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.reference} · {format.dateTime(new Date(r.created_at), { dateStyle: "short" })}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>{t("resumeHint")}</FieldDescription>
            </Field>
          )}
        </FieldGroup>
      )}
    </ModalShell>
  );
}
