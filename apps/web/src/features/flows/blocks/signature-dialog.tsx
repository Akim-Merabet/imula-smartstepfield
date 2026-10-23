"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PenLineIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createSignature } from "../block-actions";
import { SimpleSelect } from "../components/simple-select";
import type { SignatureNature } from "../meta";
import type { BlockEnv } from "./block-panel";
import { SignatureCanvas } from "./signature-canvas";

type Mode = "person" | "proxy" | "not_applicable";
type Contributor = "intern" | "extern" | "not_listed_intern";

const nowLocal = () => {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Signer en personne / par procuration / signature non applicable (§6.1-6.3). */
export function SignatureDialog({ blockId, nature, natureLabel, env, usedSignatories, onClose }: {
  blockId: string; nature: SignatureNature; natureLabel: string; env: BlockEnv; usedSignatories: string[]; onClose: () => void;
}) {
  const t = useTranslations("signatures");
  const tg = useTranslations("global");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("person");
  const [contributor, setContributor] = useState<Contributor>("intern");
  const meAllowed = !env.candidates.restricted || env.candidates.candidates.some((c) => c.id === env.me.id);
  const [signatory, setSignatory] = useState<string | null>(meAllowed ? env.me.id : env.candidates.candidates[0]?.id ?? null);
  const [v, setV] = useState({ first_name: "", last_name: "", email: "", company_name: env.me.company ?? "", profession: "", comment: "", proxy_principal_name: "", proxy_date: "" });
  const [signedAt, setSignedAt] = useState(nowLocal());
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  const submit = () => {
    setError(null);
    if (mode !== "not_applicable" && !image) { setError(t("errors.signature_required")); return; }
    if (mode === "not_applicable" && !v.comment.trim()) { setError(t("errors.comment_required")); return; }
    if (mode === "proxy" && (!v.proxy_principal_name || !v.proxy_date)) { setError(tg("validators.required")); return; }
    if (mode === "proxy" && new Date(v.proxy_date) > new Date(signedAt)) { setError(t("errors.proxy_date_after")); return; }
    if (mode !== "proxy" && contributor === "intern" && signatory && usedSignatories.includes(signatory)) { setError(t("errors.sign_twice")); return; }
    start(async () => {
      const res = await createSignature({
        block_id: blockId, nature, mode, contributor_type: mode === "proxy" ? "intern" : contributor,
        signatory_id: contributor === "intern" ? signatory : null,
        first_name: v.first_name, last_name: v.last_name, email: v.email, company_name: v.company_name, profession: v.profession,
        signed_at: new Date(signedAt).toISOString(), comment: v.comment, signature_data: image,
        proxy_principal_name: v.proxy_principal_name, proxy_date: v.proxy_date ? new Date(v.proxy_date).toISOString() : null,
      });
      if (!res.ok) {
        const known = ["sign_twice", "already_signed", "not_in_restricted_list", "proxy_date_after", "signature_required", "step_disabled", "nature_not_available", "comment_required"];
        setError(res.error === "forbidden" ? tg("toast.forbidden") : known.includes(res.error) ? t(`errors.${res.error}` as never) : tg("toast.error"));
        return;
      }
      notify.success(t("dialog.success")); router.refresh(); onClose();
    });
  };

  const candidates = env.candidates.candidates.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name} (${c.trigram})` }));

  return (
    <ModalShell onClose={onClose} size="md" icon={<EntityIcon kind="project" icon={PenLineIcon} size="md" />}
      title={t("dialog.title", { nature: natureLabel })} subtitle={`${env.step.phaseNumber} - ${env.step.stepNumber} · ${env.step.name}`}
      footer={<><Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{mode === "not_applicable" ? tg("actions.validate") : t("dialog.sign")}</Button></>}>
      <FieldGroup>
        <ToggleGroup type="single" variant="outline" value={mode} onValueChange={(x) => x && setMode(x as Mode)} className="justify-start">
          <ToggleGroupItem value="person" className="px-3">{t("dialog.modes.person")}</ToggleGroupItem>
          <ToggleGroupItem value="proxy" className="px-3">{t("dialog.modes.proxy")}</ToggleGroupItem>
          <ToggleGroupItem value="not_applicable" className="px-3">{t("dialog.modes.not_applicable")}</ToggleGroupItem>
        </ToggleGroup>

        {mode === "proxy" ? (
          <>
            <Alert><AlertDescription>{t("dialog.proxyInfo", { name: env.me.name })}</AlertDescription></Alert>
            <div className="grid grid-cols-2 gap-3">
              <Field><FieldLabel htmlFor="sg-principal">{t("dialog.principal")} *</FieldLabel><Input id="sg-principal" value={v.proxy_principal_name} onChange={set("proxy_principal_name")} /></Field>
              <Field><FieldLabel htmlFor="sg-pdate">{t("dialog.proxyDate")} *</FieldLabel><Input id="sg-pdate" type="datetime-local" value={v.proxy_date} onChange={set("proxy_date")} /></Field>
            </div>
          </>
        ) : (
          <>
            <ToggleGroup type="single" variant="outline" size="sm" value={contributor} onValueChange={(x) => x && setContributor(x as Contributor)} className="justify-start">
              <ToggleGroupItem value="intern" className="px-3">{t("dialog.contributors.intern")}</ToggleGroupItem>
              <ToggleGroupItem value="extern" className="px-3">{t("dialog.contributors.extern")}</ToggleGroupItem>
              <ToggleGroupItem value="not_listed_intern" className="px-3">{t("dialog.contributors.not_listed_intern")}</ToggleGroupItem>
            </ToggleGroup>
            {contributor === "intern" ? (
              <Field>
                <FieldLabel>{t("dialog.collaborator")} *</FieldLabel>
                {candidates.length ? <SimpleSelect value={signatory} onChange={setSignatory} options={candidates} clearable={false} />
                  : <p className="text-sm text-muted-foreground">{t("errors.not_in_restricted_list")}</p>}
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field><FieldLabel htmlFor="sg-fn">{t("dialog.firstName")} *</FieldLabel><Input id="sg-fn" value={v.first_name} onChange={set("first_name")} /></Field>
                <Field><FieldLabel htmlFor="sg-ln">{t("dialog.lastName")} *</FieldLabel><Input id="sg-ln" value={v.last_name} onChange={set("last_name")} /></Field>
                <Field><FieldLabel htmlFor="sg-em">{t("dialog.email")}{contributor === "extern" && " *"}</FieldLabel><Input id="sg-em" type="email" value={v.email} onChange={set("email")} /></Field>
                <Field><FieldLabel htmlFor="sg-pr">{t("dialog.profession")}</FieldLabel><Input id="sg-pr" value={v.profession} onChange={set("profession")} /></Field>
              </div>
            )}
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field><FieldLabel htmlFor="sg-date">{t("dialog.date")} *</FieldLabel><Input id="sg-date" type="datetime-local" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} /></Field>
          <Field><FieldLabel htmlFor="sg-co">{t("dialog.company")}</FieldLabel><Input id="sg-co" value={v.company_name} onChange={set("company_name")} /></Field>
        </div>
        {mode !== "not_applicable" && <Field><FieldLabel>{t("dialog.signature")} *</FieldLabel><SignatureCanvas onChange={setImage} /></Field>}
        <Field><FieldLabel htmlFor="sg-cm">{t("dialog.comment")}{mode === "not_applicable" && " *"}</FieldLabel><Textarea id="sg-cm" value={v.comment} onChange={set("comment")} /></Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
    </ModalShell>
  );
}
