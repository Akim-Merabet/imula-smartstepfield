"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HardHatIcon, UserRoundIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { useDialog } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { createCollaborator, updateCollaborator } from "../actions";
import { useErrorMessage } from "../components/action-runner";
import { MultiSelect, type MultiOption } from "../components/multi-select";
import {
  ADDITIONAL_RIGHT_ELIGIBLE, ADDITIONAL_RIGHTS, assignableAuthorities, familyLabel,
  type AdditionalRight, type Authority, type CollaboratorKind,
} from "../meta";
import type { CollaboratorInput } from "../schema";

type Opt = MultiOption;
type Company = { id: string; name: string; is_parent_company: boolean };
type Options = {
  companies: Company[]; functions: Opt[]; groups: Opt[]; legals: Opt[]; contracts: Opt[]; hierarchies: Opt[];
  me: Authority | null;
};

type Form = Omit<CollaboratorInput, "authority" | "additional_rights" | "hierarchy_ids"> & {
  authority: Authority | null; additional_rights: AdditionalRight[]; hierarchy_ids: string[];
};

const empty = (kind: CollaboratorKind): Form => ({
  kind, first_name: "", last_name: "", trigram: "", email: "", sso_identifier: "", register_number: "",
  authority: kind === "user" ? "normal" : null, additional_rights: [...ADDITIONAL_RIGHTS], company_id: "", function_id: "",
  group_id: "", complement: "", legal_id: null, contract_type_id: null, hierarchy_ids: [],
});

/**
 * ?dialog=user|operator/add/<onglet> · /edit/<id>/<onglet> · user/convert/<externalUserId>/<onglet>
 * Onglets : general-tab, rights-tab (utilisateurs uniquement).
 */
export function CollaboratorDialog({ kind, segments, close }: { kind: CollaboratorKind; segments: string[]; close: () => void }) {
  const t = useTranslations("collaborators");
  const tg = useTranslations("global");
  const router = useRouter();
  const dialog = useDialog();
  const message = useErrorMessage();
  const [action, idOrTab, maybeTab] = segments;
  const isEdit = action === "edit";
  const isConvert = action === "convert" && kind === "user";
  const targetId = isEdit || isConvert ? idOrTab : null;
  const tab = (targetId ? maybeTab : idOrTab) ?? "general-tab";
  const isUser = kind === "user";

  const [options, setOptions] = useState<Options | null>(null);
  const [form, setForm] = useState<Form>(empty(kind));
  const [initialAuthority, setInitialAuthority] = useState<Authority | null>(null);
  const [loaded, setLoaded] = useState(!targetId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createAnother, setCreateAnother] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const fam = (nature: "function" | "team" | "legal" | "contract") =>
        supabase.from("label_families").select("id, short_name, long_name, color")
          .eq("kind", "family").eq("nature", nature).eq("relative_nature", "child").eq("active", true).is("deleted_at", null)
          .order("priority").order("short_name");
      const { data: userData } = await supabase.auth.getUser();
      const [companies, fn, team, legal, contract, hier, me] = await Promise.all([
        supabase.from("companies").select("id, name, is_parent_company").order("name"),
        fam("function"), fam("team"), fam("legal"), fam("contract"),
        supabase.from("label_families").select("id, short_name, long_name, color")
          .eq("kind", "category").eq("nature", "hierarchy").is("project_id", null).eq("active", true).is("deleted_at", null)
          .order("priority").order("short_name"),
        supabase.from("collaborators").select("authority").eq("auth_user_id", userData.user?.id ?? "").maybeSingle(),
      ]);
      if (!active) return;
      const opts = (r: { data: { id: string; short_name: string; long_name: string | null; color: string }[] | null }) =>
        (r.data ?? []).map((f) => ({ id: f.id, label: familyLabel(f), color: f.color }));
      setOptions({
        companies: companies.data ?? [], functions: opts(fn), groups: opts(team), legals: opts(legal), contracts: opts(contract),
        hierarchies: opts(hier), me: me.data?.authority ?? null,
      });
      const parent = (companies.data ?? []).find((c) => c.is_parent_company);
      if (!targetId) { setForm((f) => ({ ...f, company_id: f.company_id || parent?.id || "" })); return; }
      if (isConvert) {
        const { data: ext } = await supabase.from("external_users").select("*").eq("id", targetId).single();
        if (!active || !ext) return;
        setForm((f) => ({ ...f, first_name: ext.first_name, last_name: ext.last_name, email: ext.email, complement: ext.profession,
          trigram: `${ext.first_name.slice(0, 1)}${ext.last_name.slice(0, 2)}`.toUpperCase(), company_id: parent?.id ?? "" }));
        setLoaded(true);
        return;
      }
      const { data: c } = await supabase.from("collaborators")
        .select("*, hierarchies:collaborator_default_hierarchies(hierarchy_id)").eq("id", targetId).single();
      if (!active || !c) return;
      setForm({
        kind, first_name: c.first_name, last_name: c.last_name, trigram: c.trigram, email: c.email ?? "",
        sso_identifier: c.sso_identifier ?? "", register_number: c.register_number ?? "", authority: c.authority,
        additional_rights: c.additional_rights, company_id: c.company_id ?? "", function_id: c.function_id ?? "",
        group_id: c.group_id ?? "", complement: c.complement ?? "", legal_id: c.legal_id, contract_type_id: c.contract_type_id,
        hierarchy_ids: c.hierarchies.map((h) => h.hierarchy_id),
      });
      setInitialAuthority(c.authority);
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [kind, targetId, isConvert]);

  const company = options?.companies.find((c) => c.id === form.company_id);
  const coContractor = isUser && !!company && !company.is_parent_company;
  const effectiveAuthority: Authority | null = coContractor ? "co_contractor_user" : form.authority;
  const rightsEligible = !!effectiveAuthority && ADDITIONAL_RIGHT_ELIGIBLE.includes(effectiveAuthority);

  const authorityChoices = useMemo(() => {
    const list = assignableAuthorities(options?.me ?? null);
    if (initialAuthority && !list.includes(initialAuthority) && initialAuthority !== "co_contractor_user") list.push(initialAuthority);
    return list;
  }, [options?.me, initialAuthority]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const base = isEdit ? `${kind}/edit/${targetId}` : isConvert ? `user/convert/${targetId}` : `${kind}/add`;
  const goTab = (id: string) => dialog.replace(`${base}/${id}`);

  const validate = () => {
    const e: Record<string, string> = {};
    const req = tg("validators.required");
    if (!form.first_name.trim()) e.first_name = req;
    if (form.first_name.length > 50) e.first_name = tg("validators.maxLength", { max: 50 });
    if (!form.last_name.trim()) e.last_name = req;
    if (form.last_name.length > 50) e.last_name = tg("validators.maxLength", { max: 50 });
    if (form.trigram.trim().length < 3) e.trigram = tg("validators.minLength", { min: 3 });
    if (isUser) {
      if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = tg("validators.email");
      else if (form.email.length > 50) e.email = tg("validators.maxLength", { max: 50 });
      if (!effectiveAuthority) e.authority = req;
    }
    if (!form.company_id) e.company_id = req;
    if (!form.function_id) e.function_id = req;
    if (!form.group_id) e.group_id = req;
    setErrors(e);
    if (Object.keys(e).length && tab !== "general-tab") goTab("general-tab");
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    startTransition(async () => {
      const payload: CollaboratorInput = { ...form, authority: effectiveAuthority as CollaboratorInput["authority"], additional_rights: rightsEligible ? form.additional_rights : [] };
      const res = isEdit ? await updateCollaborator(targetId!, payload)
        : await createCollaborator(payload, isConvert ? { externalUserId: targetId! } : undefined);
      if (!res.ok) {
        const msg = message(res.error);
        if (res.error === "email_conflict") setErrors({ email: msg });
        if (res.error === "sso_conflict") setErrors({ sso_identifier: msg });
        if (res.error === "register_conflict") setErrors({ register_number: msg });
        notify.error(msg);
        return;
      }
      notify.success(isEdit ? tg("toast.saved") : isUser ? t("toast.invited") : t("toast.created"));
      router.refresh();
      if (!isEdit && !isConvert && createAnother) { setForm({ ...empty(kind), company_id: form.company_id }); return; }
      close();
    });
  };

  const fullName = `${form.first_name} ${form.last_name}`.trim();
  const title = isEdit ? t(isUser ? "dialog.editUser" : "dialog.editOperator", { name: fullName })
    : isConvert ? t("dialog.convertUser", { name: fullName })
    : t(isUser ? "dialog.createUser" : "dialog.createOperator");

  const text = (key: "first_name" | "last_name" | "trigram" | "email" | "sso_identifier" | "register_number" | "complement",
    label: string, opts?: { required?: boolean; disabled?: boolean; help?: string; upper?: boolean }) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel htmlFor={`c-${key}`}>{label}{opts?.required && " *"}</FieldLabel>
      <Input id={`c-${key}`} value={(form[key] as string) ?? ""} disabled={opts?.disabled} aria-invalid={!!errors[key]}
        onChange={(e) => set(key, opts?.upper ? e.target.value.toUpperCase() : e.target.value)} />
      {opts?.help && <FieldDescription>{opts.help}</FieldDescription>}
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );

  const select = (key: "company_id" | "function_id" | "group_id" | "legal_id" | "contract_type_id", label: string,
    items: { id: string; label: string; color?: string }[], required: boolean, help?: string) => (
    <Field data-invalid={!!errors[key]}>
      <FieldLabel>{label}{required && " *"}</FieldLabel>
      <Select value={(form[key] as string) || (required ? undefined : "__none")}
        onValueChange={(v) => set(key, (v === "__none" ? null : v) as never)}>
        <SelectTrigger aria-invalid={!!errors[key]}><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {!required && <SelectItem value="__none">{tg("none")}</SelectItem>}
            {items.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.color && <span className="size-3 rounded-sm" style={{ backgroundColor: o.color }} />}{o.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {help && <FieldDescription>{help}</FieldDescription>}
      {errors[key] && <FieldError>{errors[key]}</FieldError>}
    </Field>
  );

  const tabs = [
    { id: "general-tab", label: t("dialog.tabs.general") },
    ...(isUser ? [{ id: "rights-tab", label: t("dialog.tabs.rights") }] : []),
  ];

  return (
    <ModalShell
      onClose={close}
      icon={<EntityIcon kind="contributors" icon={isUser ? UserRoundIcon : HardHatIcon} size="md" />}
      title={title}
      tabs={tabs}
      activeTab={tab}
      onTabChange={goTab}
      footer={
        <>
          {!isEdit && !isConvert && (
            <label className="mr-auto flex items-center gap-2 text-sm">
              <Checkbox checked={createAnother} onCheckedChange={(v) => setCreateAnother(!!v)} />{t("dialog.createAnother")}
            </label>
          )}
          <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
          <Button onClick={submit} disabled={pending || !loaded || !options}>
            {pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}
          </Button>
        </>
      }>
      {!options || !loaded ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : tab === "rights-tab" && isUser ? (
        <FieldGroup>
          {!rightsEligible && <Alert><AlertDescription>{t("rights.notEligible")}</AlertDescription></Alert>}
          {ADDITIONAL_RIGHTS.map((right) => (
            <Field key={right} orientation="horizontal" data-disabled={!rightsEligible}>
              <Checkbox id={`r-${right}`} disabled={!rightsEligible} checked={rightsEligible && form.additional_rights.includes(right)}
                onCheckedChange={(v) => set("additional_rights", v
                  ? [...form.additional_rights, right] : form.additional_rights.filter((x) => x !== right))} />
              <FieldLabel htmlFor={`r-${right}`} className="font-normal">{t(`rights.${right}`)}</FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      ) : (
        <FieldGroup>
          {isUser && !isEdit && <Alert><AlertDescription>{t("dialog.inviteInfo")}</AlertDescription></Alert>}
          <div className="grid grid-cols-3 gap-4">
            {text("first_name", t("dialog.firstName"), { required: true })}
            {text("last_name", t("dialog.lastName"), { required: true })}
            {text("trigram", t("dialog.trigram"), { required: true, upper: true })}
          </div>
          {isUser && (
            <div className="grid grid-cols-2 gap-4">
              {text("email", t("dialog.email"), { required: true, disabled: isEdit || isConvert, help: isEdit ? t("dialog.emailLocked") : undefined })}
              {text("sso_identifier", t("dialog.sso"))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {select("company_id", t("dialog.company"), options.companies.map((c) => ({ id: c.id, label: c.name })), true)}
            {isUser && (
              <Field data-invalid={!!errors.authority}>
                <FieldLabel>{t("dialog.authority")} *</FieldLabel>
                <Select value={effectiveAuthority ?? undefined} disabled={coContractor} onValueChange={(v) => set("authority", v as Authority)}>
                  <SelectTrigger><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    {(coContractor ? ["co_contractor_user" as Authority] : authorityChoices).map((a) => (
                      <SelectItem key={a} value={a}>{t(`authority.${a}`)}</SelectItem>
                    ))}
                  </SelectGroup></SelectContent>
                </Select>
                {errors.authority && <FieldError>{errors.authority}</FieldError>}
              </Field>
            )}
          </div>
          {coContractor && <Alert><AlertDescription>{t("dialog.coContractorAlert")}</AlertDescription></Alert>}
          <div className="grid grid-cols-2 gap-4">
            {select("function_id", t("dialog.function"), options.functions, true, t("dialog.familyHelp"))}
            {text("complement", t("dialog.complement"))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {select("group_id", t("dialog.group"), options.groups, true)}
            {select("legal_id", t("dialog.legal"), options.legals, false)}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {select("contract_type_id", t("dialog.contract"), options.contracts, false)}
            {text("register_number", t("dialog.registerNumber"))}
          </div>
          <Field>
            <FieldLabel htmlFor="c-hierarchy">{t("dialog.hierarchy")}</FieldLabel>
            <MultiSelect id="c-hierarchy" options={options.hierarchies} value={form.hierarchy_ids}
              onChange={(v) => set("hierarchy_ids", v)} placeholder={t("dialog.hierarchyPlaceholder")} />
          </Field>
        </FieldGroup>
      )}
    </ModalShell>
  );
}
