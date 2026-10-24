"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { InfoIcon, LinkIcon, MailIcon, QrCodeIcon, TabletIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { StatusBadge } from "@/components/common/status-badge";
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
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { createTablet, updateTablet } from "../actions";
import { unlinkQuickConnectionDevice } from "../quick-connection";
import { useErrorMessage } from "../components/action-runner";
import { COLLABORATOR_STATUS_COLORS, TABLET_NATURES, TABLET_STATUS_COLORS, TABLET_STATUSES, familyLabel, type TabletNature, type TabletStatus } from "../meta";
import type { TabletInput } from "../schema";

type Opt = { id: string; label: string; color?: string };
type Form = { name: string; nature: TabletNature; family_id: string; company_id: string; status: TabletStatus; comment: string; notify_email: string };
const EMPTY: Form = { name: "", nature: "internal", family_id: "", company_id: "", status: "active", comment: "", notify_email: "" };

function TabletForm({ segments, close }: DialogProps) {
  const t = useTranslations("collaborators.tablet");
  const tc = useTranslations("collaborators");
  const tg = useTranslations("global");
  const tq = useTranslations("collaborators.quickConnection");
  const format = useFormatter();
  const router = useRouter();
  const dialog = useDialog();
  const message = useErrorMessage();
  const [action, idOrTab, maybeTab] = segments;
  const isEdit = action === "edit";
  const id = isEdit ? idOrTab : null;
  const tab = (isEdit ? maybeTab : idOrTab) ?? "general-tab";

  const [options, setOptions] = useState<{ families: Opt[]; companies: Opt[] } | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [row, setRow] = useState<Tables<"tablets"> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createAnother, setCreateAnother] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const [families, companies] = await Promise.all([
        supabase.from("label_families").select("id, short_name, long_name, color")
          .eq("kind", "family").eq("nature", "device").eq("relative_nature", "child").eq("active", true).is("deleted_at", null).order("short_name"),
        supabase.from("companies").select("id, name, is_parent_company").order("name"),
      ]);
      if (!active) return;
      setOptions({
        families: (families.data ?? []).map((f) => ({ id: f.id, label: familyLabel(f), color: f.color })),
        companies: (companies.data ?? []).map((c) => ({ id: c.id, label: c.name })),
      });
      if (!id) {
        const parent = companies.data?.find((c) => c.is_parent_company);
        setForm((f) => ({ ...f, company_id: f.company_id || parent?.id || "" }));
        return;
      }
      const { data } = await supabase.from("tablets").select("*").eq("id", id).single();
      if (!active || !data) return;
      setRow(data);
      setForm({ name: data.name, nature: data.nature, family_id: data.family_id, company_id: data.company_id, status: data.status,
        comment: data.comment ?? "", notify_email: data.notify_email });
    })();
    return () => { active = false; };
  }, [id]);

  const locked = isEdit && row?.profile_status === "inactive";
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const goTab = (next: string) => dialog.replace(isEdit ? `tablet/edit/${id}/${next}` : `tablet/add/${next}`);

  const unlink = () => start(async () => {
    const res = await unlinkQuickConnectionDevice({ type: "tablet", id: id! });
    if (res.ok) notify.success(tq("unlinkSuccess"));
    else notify.error(message(res.error));
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 3) e.name = tg("validators.minLength", { min: 3 });
    if (!form.family_id) e.family_id = tg("validators.required");
    if (!form.company_id) e.company_id = tg("validators.required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.notify_email)) e.notify_email = tg("validators.email");
    setErrors(e);
    if (e.name || e.family_id || e.company_id) { goTab("general-tab"); return; }
    if (e.notify_email) { goTab("notify-tab"); return; }
    start(async () => {
      const input: TabletInput = { ...form };
      const res = isEdit ? await updateTablet(id!, input) : await createTablet(input);
      if (!res.ok) {
        if (res.error === "name_conflict") { setErrors({ name: message(res.error) }); goTab("general-tab"); }
        notify.error(message(res.error));
        return;
      }
      notify.success(isEdit ? tg("toast.saved") : tg("toast.created"));
      router.refresh();
      if (!isEdit && createAnother) { setForm({ ...EMPTY, company_id: form.company_id, family_id: form.family_id }); return; }
      close();
    });
  };

  const select = (k: "family_id" | "company_id", label: string, items: Opt[]) => (
    <Field data-invalid={!!errors[k]}>
      <FieldLabel>{label} *</FieldLabel>
      <Select value={form[k] || undefined} disabled={locked} onValueChange={(v) => set(k, v)}>
        <SelectTrigger aria-invalid={!!errors[k]}><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
        <SelectContent><SelectGroup>
          {items.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.color && <span className="size-3 rounded-sm" style={{ backgroundColor: o.color }} />}{o.label}</SelectItem>
          ))}
        </SelectGroup></SelectContent>
      </Select>
      {errors[k] && <FieldError>{errors[k]}</FieldError>}
    </Field>
  );

  const tabs = [
    { id: "general-tab", label: tc("dialog.tabs.general") },
    ...(isEdit ? [{ id: "information-tab", label: tc("dialog.tabs.information") }, { id: "options-tab", label: tc("dialog.tabs.options") }] : []),
    { id: "notify-tab", label: tc("dialog.tabs.notify") },
  ];

  const telemetry: [string, string][] = row ? [
    [t("info.uuid"), row.id],
    [t("info.appVersion"), row.app_version ?? "—"],
    [t("info.androidVersion"), row.android_version ?? "—"],
    [t("info.battery"), row.battery_level == null ? "—" : `${row.battery_level} %`],
    [t("info.model"), row.device_model ?? "—"],
    [t("info.screen"), row.screen_size ?? "—"],
    [t("info.imei"), row.unique_device_id ?? "—"],
    [t("info.mac"), row.mac_address ?? "—"],
    [t("info.lastPush"), row.last_push_at ? format.dateTime(new Date(row.last_push_at), { dateStyle: "short", timeStyle: "short" }) : "—"],
    [t("info.position"), row.last_latitude != null && row.last_longitude != null ? `${row.last_latitude}, ${row.last_longitude}` : "—"],
  ] : [];
  const hasTelemetry = !!row && (row.unique_device_id || row.app_version || row.last_push_at);

  return (
    <ModalShell onClose={close} icon={<EntityIcon kind="contributors" icon={TabletIcon} size="md" />}
      title={isEdit ? t("editTitle", { name: form.name }) : t("createTitle")}
      tabs={tabs} activeTab={tab} onTabChange={goTab}
      footer={<>
        {!isEdit && (
          <label className="mr-auto flex items-center gap-2 text-sm">
            <Checkbox checked={createAnother} onCheckedChange={(v) => setCreateAnother(!!v)} />{tc("dialog.createAnother")}
          </label>
        )}
        <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !options || locked}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
      </>}>
      {!options || (isEdit && !row) ? <div className="flex justify-center py-16"><Spinner /></div>
      : tab === "information-tab" ? (
        hasTelemetry ? (
          <dl className="grid grid-cols-[14rem_1fr] gap-x-4 gap-y-3 text-sm">
            {telemetry.map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-all">{v}</dd></Fragment>)}
          </dl>
        ) : <p className="py-12 text-center text-muted-foreground">{t("noTelemetry")}</p>
      ) : tab === "options-tab" ? (
        <FieldGroup>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!id || locked} onClick={() => dialog.open(`quick-connection/tablet/${id}`)}>
              <QrCodeIcon data-icon="inline-start" />{t("options.qr")}
            </Button>
            <Button variant="secondary" disabled title={t("options.summarySoon")}><MailIcon data-icon="inline-start" />{t("options.summary")}</Button>
            <Button variant="secondary" disabled={!id || pending} onClick={unlink}><LinkIcon data-icon="inline-start" />{t("options.unlink")}</Button>
          </div>
        </FieldGroup>
      ) : tab === "notify-tab" ? (
        <FieldGroup>
          <Field data-invalid={!!errors.notify_email}>
            <FieldLabel htmlFor="t-email">{t("notifyEmail")} *</FieldLabel>
            <Input id="t-email" type="email" value={form.notify_email} disabled={locked} aria-invalid={!!errors.notify_email}
              onChange={(e) => set("notify_email", e.target.value)} />
            <FieldDescription>{t("notifyHelp")}</FieldDescription>
            {errors.notify_email && <FieldError>{errors.notify_email}</FieldError>}
          </Field>
        </FieldGroup>
      ) : (
        <FieldGroup>
          {locked && <Alert variant="destructive"><AlertDescription>{t("disabledAlert")}</AlertDescription></Alert>}
          <Field>
            <FieldLabel>{t("nature")} *</FieldLabel>
            <ToggleGroup type="single" variant="outline" value={form.nature} disabled={isEdit}
              onValueChange={(v) => v && set("nature", v as TabletNature)} className="justify-start">
              {TABLET_NATURES.map((n) => <ToggleGroupItem key={n} value={n} className="px-3">{t(`natures.${n}`)}</ToggleGroupItem>)}
            </ToggleGroup>
            {isEdit && <FieldDescription>{t("natureLocked")}</FieldDescription>}
          </Field>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="t-name">{t("name")} *</FieldLabel>
            <Input id="t-name" value={form.name} disabled={locked} aria-invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            {select("family_id", t("family"), options.families)}
            {select("company_id", t("company"), options.companies)}
          </div>
          <Field>
            <FieldLabel>{t("status")} *</FieldLabel>
            <Select value={form.status} disabled={locked} onValueChange={(v) => set("status", v as TabletStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                {TABLET_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}><span className="size-3 rounded-sm" style={{ backgroundColor: TABLET_STATUS_COLORS[s] }} />{t(`statuses.${s}`)}</SelectItem>
                ))}
              </SelectGroup></SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="t-comment">{t("comment")}</FieldLabel>
            <Textarea id="t-comment" value={form.comment} disabled={locked} onChange={(e) => set("comment", e.target.value)} />
          </Field>
        </FieldGroup>
      )}
    </ModalShell>
  );
}

type Props = Tables<"tablets"> & {
  family: { short_name: string; long_name: string | null } | null; account: { name: string } | null;
};

function TabletProperties({ id, close }: { id: string; close: () => void }) {
  const t = useTranslations("collaborators");
  const [p, setP] = useState<Props | null>(null);
  const [flows, setFlows] = useState<string[]>([]);
  useEffect(() => {
    const supabase = createClient();
    supabase.from("tablets").select("*, family:label_families!tablets_family_id_fkey(short_name, long_name), account:accounts(name)")
      .eq("id", id).single().then(({ data }) => setP(data as unknown as Props));
    supabase.from("flows").select("name").or(`tablet_1_id.eq.${id},tablet_2_id.eq.${id},tablet_3_id.eq.${id}`).is("deleted_at", null)
      .then(({ data }) => setFlows((data ?? []).map((f) => f.name)));
  }, [id]);
  const rows: [string, React.ReactNode][] = p ? [
    [t("tablet.name"), p.name],
    [t("tablet.family"), familyLabel(p.family) || "—"],
    [t("tablet.nature"), t(`tablet.natures.${p.nature}`)],
    [t("tablet.status"), <StatusBadge key="s" color={TABLET_STATUS_COLORS[p.status]} label={t(`tablet.statuses.${p.status}`)} />],
    [t("columns.state"), <StatusBadge key="e" color={COLLABORATOR_STATUS_COLORS[p.profile_status]} label={t(`status.${p.profile_status}`)} />],
    [t("properties.applicability"), p.account?.name ?? "—"],
    [t("properties.flows"), flows.length ? flows.join(", ") : t("properties.none")],
  ] : [];
  return (
    <ModalShell onClose={close} size="sm" icon={<EntityIcon kind="contributors" icon={InfoIcon} size="md" />} title={t("properties.title")} subtitle={p?.name}>
      {!p ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <dl className="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-3 text-sm">
          {rows.map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></Fragment>)}
        </dl>
      )}
    </ModalShell>
  );
}

/** ?dialog=tablet/add/<onglet> · tablet/edit/<id>/<onglet> · tablet/properties/<id> (spec 01 §4.8). */
export default function TabletDialogs(props: DialogProps) {
  const [action, id] = props.segments;
  if (action === "properties" && id) return <TabletProperties id={id} close={props.close} />;
  return <TabletForm {...props} />;
}
