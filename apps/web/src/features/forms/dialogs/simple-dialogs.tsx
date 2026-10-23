"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CopyIcon, HistoryIcon, InfoIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { duplicateLibraryForm } from "../actions";
import { useActionError } from "../components/form-chips";
import { creatableNatures } from "../permissions";

type Person = { first_name: string; last_name: string } | null;
const person = (c: Person) => (c ? `${c.first_name} ${c.last_name}` : "—");

/** ?dialog=form-lib/duplicate/<id> — duplication avec changement de type (spec 03 §2.5). */
export function DuplicateFormDialog({ formId, close }: { formId: string; close: () => void }) {
  const t = useTranslations("forms");
  const tg = useTranslations("global");
  const router = useRouter();
  const errorText = useActionError();
  const [source, setSource] = useState<{ name: string; nature: string } | null>(null);
  const [natures, setNatures] = useState<("model" | "generic")[]>([]);
  const [nature, setNature] = useState<"model" | "generic">("generic");
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      const [{ data: form }, { data: me }] = await Promise.all([
        supabase.from("forms").select("name, nature").eq("id", formId).single(),
        supabase.from("collaborators").select("authority, additional_rights").eq("auth_user_id", user.user?.id ?? "").maybeSingle(),
      ]);
      if (!form) return;
      const allowed = me ? creatableNatures(me) : [];
      setSource(form);
      setNatures(allowed);
      setNature(allowed.includes(form.nature as "model" | "generic") ? (form.nature as "model" | "generic") : allowed[0] ?? "generic");
      setName(t("duplicate.defaultName", { name: form.name }));
    })();
  }, [formId, t]);

  const submit = () => startTransition(async () => {
    const res = await duplicateLibraryForm(formId, { nature, name });
    if (!res.ok) { notify.error(errorText(res.error)); return; }
    notify.success(t("toasts.duplicated"));
    close();
    router.refresh();
  });

  return (
    <ModalShell onClose={close} size="sm" icon={<EntityIcon kind="library" icon={CopyIcon} size="md" />}
      title={t("duplicate.title", { name: source?.name ?? "" })}
      footer={<>
        <Button variant="outline" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !source || !name.trim() || natures.length === 0}>
          {pending && <Spinner data-icon="inline-start" />}{tg("actions.duplicate")}
        </Button>
      </>}>
      {!source ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <FieldGroup>
          <p className="text-sm">{t("duplicate.sentence", { from: t(`natures.${source.nature}` as never), name: source.name })}</p>
          <Field>
            <FieldLabel>{t("duplicate.targetType")}</FieldLabel>
            <Select value={nature} onValueChange={(v) => setNature(v as "model" | "generic")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>{natures.map((n) => <SelectItem key={n} value={n}>{t(`natures.${n}`)}</SelectItem>)}</SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="dup-name">{t("duplicate.newName")}</FieldLabel>
            <Input id="dup-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Alert><AlertDescription>{t("duplicate.warning")}</AlertDescription></Alert>
        </FieldGroup>
      )}
    </ModalShell>
  );
}

type Props = {
  name: string; nature: string; location: string; origin: string | null; reference: string | null; index_label: string | null;
  created_at: string; updated_at: string; object_attributes_link: string;
  family: { short_name: string; long_name: string | null } | null; account: { name: string } | null;
  creator: Person; updater: Person; project: { designation: string } | null;
};

/** ?dialog=form-lib/properties/<id> */
export function FormPropertiesDialog({ formId, close }: { formId: string; close: () => void }) {
  const t = useTranslations("forms");
  const tg = useTranslations("global");
  const format = useFormatter();
  const [p, setP] = useState<Props | null>(null);
  const [flows, setFlows] = useState<string[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("forms").select(`name, nature, location, origin, reference, index_label, created_at, updated_at, object_attributes_link,
      family:label_families!forms_family_id_fkey(short_name, long_name), account:accounts(name),
      creator:collaborators!forms_created_by_fkey(first_name, last_name), updater:collaborators!forms_updated_by_fkey(first_name, last_name),
      project:projects(designation)`).eq("id", formId).single().then(({ data }) => setP(data as unknown as Props));
    supabase.from("form_block_links").select("flow:flows(name)").eq("form_id", formId)
      .then(({ data }) => setFlows([...new Set((data ?? []).map((l) => (l.flow as { name: string } | null)?.name).filter((x): x is string => !!x))]));
  }, [formId]);

  const date = (d: string) => format.dateTime(new Date(d), { dateStyle: "short", timeStyle: "short" });
  const rows: [string, string][] = p ? [
    [t("properties.name"), p.name],
    [t("properties.type"), t(`natures.${p.nature}` as never)],
    [t("properties.provenance"), p.location === "library" ? t("provenance.library") : t(`provenance.${p.origin ?? "imported"}` as never)],
    ...(p.project ? [[t("properties.project"), p.project.designation] as [string, string]] : []),
    [t("properties.family"), p.family ? `${p.family.short_name}${p.family.long_name ? ` - ${p.family.long_name}` : ""}` : "—"],
    [t("properties.account"), p.account?.name ?? "—"],
    [t("properties.reference"), p.reference ?? "—"],
    [t("properties.index"), p.index_label ?? "—"],
    [t("properties.objectAttributes"), t(`dialog.fields.objectAttributesOptions.${p.object_attributes_link}` as never)],
    [t("properties.flows"), flows.join(", ") || "—"],
    [tg("createdOn"), `${date(p.created_at)} ${tg("by", { name: person(p.creator) })}`],
    [tg("updatedOn"), `${date(p.updated_at)} ${tg("by", { name: person(p.updater) })}`],
  ] : [];

  return (
    <ModalShell onClose={close} size="sm" icon={<EntityIcon kind="library" icon={InfoIcon} size="md" />} title={t("properties.title")}>
      {!p ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <dl className="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-3">
          {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-all">{v}</dd></Fragment>))}
        </dl>
      )}
    </ModalShell>
  );
}

type HistoryEvent = { at: string; text: string };

/** ?dialog=form-lib/history/<id> — journal simple : création, versions publiées, dernière modification. */
export function FormHistoryDialog({ formId, close }: { formId: string; close: () => void }) {
  const t = useTranslations("forms.history");
  const format = useFormatter();
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("forms").select(`created_at, updated_at, creator:collaborators!forms_created_by_fkey(first_name, last_name),
        updater:collaborators!forms_updated_by_fkey(first_name, last_name), status:custom_statuses(name)`).eq("id", formId).single(),
      supabase.from("form_versions").select("version_no, index_label, created_at, creator:collaborators(first_name, last_name)")
        .eq("form_id", formId).order("version_no", { ascending: false }),
    ]).then(([{ data: form }, { data: versions }]) => {
      const list: HistoryEvent[] = [];
      for (const v of versions ?? []) {
        list.push({ at: v.created_at, text: t("version", { no: v.version_no, index: v.index_label ?? "—", user: person(v.creator as Person) }) });
      }
      if (form) {
        const f = form as unknown as { created_at: string; updated_at: string; creator: Person; updater: Person; status: { name: string } | null };
        if (f.updated_at !== f.created_at) list.push({ at: f.updated_at, text: t("updated", { user: person(f.updater) }) });
        list.push({ at: f.created_at, text: t("created", { user: person(f.creator), status: f.status?.name ?? "—" }) });
      }
      setEvents(list.sort((a, b) => b.at.localeCompare(a.at)));
    });
  }, [formId, t]);

  return (
    <ModalShell onClose={close} size="md" icon={<EntityIcon kind="library" icon={HistoryIcon} size="md" />} title={t("title")}>
      {!events ? <div className="flex justify-center py-12"><Spinner /></div> : events.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col divide-y">
          {events.map((e, i) => (
            <li key={i} className="flex flex-col gap-1 py-3">
              <span>{e.text}</span>
              <span className="text-xs text-muted-foreground">{format.dateTime(new Date(e.at), { dateStyle: "short", timeStyle: "short" })}</span>
            </li>
          ))}
        </ol>
      )}
    </ModalShell>
  );
}

type ResponseEvent = { id: number; action: string; at: string; provenance: string; actor: Person; payload: Record<string, unknown> };

/** ?dialog=form-lib/response-history/<responseId> — historique des événements d'une réponse (spec 03 §6.9). */
export function ResponseHistoryDialog({ responseId, close }: { responseId: string; close: () => void }) {
  const t = useTranslations("forms.responseHistory");
  const format = useFormatter();
  const [rows, setRows] = useState<{ reference: string; events: ResponseEvent[] } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("form_responses").select("reference").eq("id", responseId).maybeSingle(),
      supabase.from("form_response_events").select("id, action, at, provenance, payload, actor:collaborators(first_name, last_name)")
        .eq("response_id", responseId).order("at", { ascending: false }),
    ]).then(([{ data: r }, { data: ev }]) => setRows({ reference: r?.reference ?? "", events: (ev ?? []) as unknown as ResponseEvent[] }));
  }, [responseId]);

  const known = ["created", "updated", "filled", "deleted", "exported", "status_changed", "state_changed", "shared"];
  return (
    <ModalShell onClose={close} size="md" icon={<EntityIcon kind="project" icon={HistoryIcon} size="md" />} title={t("title")} subtitle={rows?.reference}>
      {!rows ? <div className="flex justify-center py-12"><Spinner /></div> : rows.events.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col divide-y">
          {rows.events.map((e) => {
            const d = new Date(e.at);
            return (
              <li key={e.id} className="py-3 text-sm">
                {t("event", {
                  user: person(e.actor), action: t(`actions.${known.includes(e.action) ? e.action : "updated"}` as never), reference: rows.reference,
                  date: format.dateTime(d, { dateStyle: "short" }), time: format.dateTime(d, { timeStyle: "short" }),
                  source: t(`sources.${e.provenance === "mobile" ? "mobile" : "webapp"}` as never),
                })}
              </li>
            );
          })}
        </ol>
      )}
    </ModalShell>
  );
}
