"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { MonitorIcon, PenLineIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { BlockDocuments } from "@/features/documents/block/block-documents";
import { deleteSignature, updateDsiConfig } from "../block-actions";
import { contentError } from "../content/errors";
import { applicableSupervisors, expectedNatures, natureCode, supervisorName, type SignatureNature, type SupervisionFlow } from "../meta";
import type { StepBlock } from "../queries";
import type { DsiConfigInput } from "../schema";
import type { BlockProps } from "./block-panel";
import { SignatureDialog } from "./signature-dialog";

/** Libellé d'une nature de signature (« Point d'arrêt externe - {surveillant} » ou mono). */
export function useNatureLabel(flow: SupervisionFlow) {
  const t = useTranslations("signatures.natures");
  return (n: SignatureNature) => {
    if (n === "realisation" || n === "tech_control") return t(n);
    const m = /^(breakpoint|convocation)_(int|ext)_(\d)$/.exec(n)!;
    const kind = `${m[1]}_${m[2]}` as "breakpoint_int";
    const mono = applicableSupervisors(flow, m[2] as "int" | "ext")[0]?.mono;
    const name = supervisorName(n, flow);
    return mono ? t(`${kind}Mono`) : t(kind, { n: Number(m[3]), name: name ?? `${m[3]}` });
  };
}

type Signature = StepBlock["signatures"][number];

/** DSI — configuration des contrôles et signatures (§5.7, §6). */
export function DsiBlock({ block, env, canEdit }: BlockProps) {
  const t = useTranslations("blocks.dsi");
  const ts = useTranslations("signatures");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const format = useFormatter();
  const router = useRouter();
  const [config, setConfig] = useState(false);
  const [signing, setSigning] = useState<SignatureNature | null>(null);
  const [toDelete, setToDelete] = useState<Signature | null>(null);
  const flow = env.flow.supervision;
  const natureLabel = useNatureLabel(flow);
  const c = block.dsi;
  const natures = expectedNatures(c, flow);
  const signatures = block.signatures.filter((s) => !s.disabled);
  const stepSignatures = env.step.blocks.flatMap((b) => b.signatures).filter((s) => !s.disabled);
  const restrictedMe = env.candidates.restricted && !env.candidates.candidates.some((x) => x.id === env.me.id);

  if (!c) return <p className="text-sm text-muted-foreground">{t("noConfig")}</p>;
  const flags = [
    ["technical_control", c.technical_control], ["technical_control_step", c.technical_control_step], ["aip", c.aip], ["document_required", c.document_required],
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-md border">
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <span className="flex-1 text-sm font-medium">{t("configTitle")}</span>
          <Badge variant="secondary">{t(`statuses.${c.signatories_status}`)}</Badge>
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setConfig(true)}><SettingsIcon data-icon="inline-start" />{t("editConfig")}</Button>}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 text-sm">
          {flags.map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-muted-foreground">{t(`fields.${k}`)}</span><span>{v ? tg("yes") : tg("no")}</span></div>)}
          {c.technical_control_details && <div className="col-span-2"><span className="text-muted-foreground">{t("fields.technical_control_details")} : </span>{c.technical_control_details}</div>}
          {c.observation && <div className="col-span-2"><span className="text-muted-foreground">{t("fields.observation")} : </span>{c.observation}</div>}
          {c.document_reference && <div className="col-span-2"><span className="text-muted-foreground">{t("fields.document_reference")} : </span>{c.document_reference}</div>}
          {c.signatories_status === "disabled" && c.signatory_disabled_comment && <div className="col-span-2 text-muted-foreground">{c.signatory_disabled_comment}</div>}
          {flow.simplified_signature_mode && <div className="col-span-2"><Badge>{t("simplified")}</Badge></div>}
        </div>
      </section>

      <section className="rounded-md border">
        <div className="border-b px-4 py-2 text-sm font-medium">{ts("block.title")}</div>
        {env.step.disabled && <Alert className="m-3 w-auto"><AlertDescription>{ts("errors.stepDisabled")}</AlertDescription></Alert>}
        {restrictedMe && <Alert className="m-3 w-auto"><AlertDescription>{ts("errors.notInRestrictedList")}</AlertDescription></Alert>}
        {natures.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">{t("signaturesDisabled")}</p> : (
          <ul className="flex flex-col divide-y">
            {natures.map((n) => {
              const sig = signatures.find((s) => s.nature === n);
              const who = sig ? (sig.signatory ? `${sig.signatory.first_name} ${sig.signatory.last_name}` : `${sig.first_name ?? ""} ${sig.last_name ?? ""}`) : null;
              return (
                <li key={n} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold">{natureCode(n)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{natureLabel(n)}</div>
                    {sig ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge className={sig.state === "signed" ? "bg-success-bg text-success" : "bg-muted text-foreground"}>{ts(`states.${sig.state}`)}</Badge>
                        {sig.proxied && <Badge variant="outline">{ts("badges.proxied", { name: sig.proxy_principal_name ?? "" })}</Badge>}
                        <span>{who}{sig.company_name && ` (${sig.company_name})`}</span>
                        <span>{format.dateTime(new Date(sig.signed_at), { dateStyle: "short", timeStyle: "short" })}</span>
                        <span className="flex items-center gap-1"><MonitorIcon className="size-3" />{ts(`sources.${sig.source}`)}</span>
                        {sig.comment && <span>· {sig.comment}</span>}
                      </div>
                    ) : <div className="text-xs text-muted-foreground">{c.signatories_status === "required" ? ts("states.mandatoryFree") : ts("states.free")}</div>}
                  </div>
                  {sig?.signature_path && /* eslint-disable-next-line @next/next/no-img-element */ <img src={sig.signature_path} alt={ts("block.image")} className="h-10 rounded border bg-white" />}
                  {!sig && env.permissions.sign && !env.step.disabled && (
                    <Button size="sm" onClick={() => setSigning(n)}><PenLineIcon data-icon="inline-start" />{ts("block.sign")}</Button>
                  )}
                  {sig && env.permissions.deleteSignature && (
                    <Button size="icon-sm" variant="ghost" aria-label={ts("block.delete")} onClick={() => setToDelete(sig)}><Trash2Icon /></Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <BlockDocuments block={{ id: block.id, type: "dsi" }} flowId={env.flow.id} projectId={env.flow.projectId} canEdit={canEdit} />

      {config && <DsiConfigDialog block={block} flow={flow} onClose={() => setConfig(false)} />}
      {signing && (
        <SignatureDialog blockId={block.id} nature={signing} natureLabel={natureLabel(signing)} env={env}
          usedSignatories={stepSignatures.map((s) => s.signatory_id).filter(Boolean) as string[]} onClose={() => setSigning(null)} />
      )}
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }} title={ts("block.deleteTitle")} description={ts("block.deleteSubtitle")}
        word="SUPPRIMER" confirmLabel={tg("actions.delete")} onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteSignature(toDelete.id);
          if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
          notify.success(ts("block.deleted")); router.refresh();
        }} />
    </div>
  );
}

function DsiConfigDialog({ block, flow, onClose }: { block: StepBlock; flow: SupervisionFlow; onClose: () => void }) {
  const t = useTranslations("blocks.dsi");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const c = block.dsi!;
  const [v, setV] = useState<DsiConfigInput>({
    signatories_status: c.signatories_status, signatory_disabled_comment: c.signatory_disabled_comment ?? "",
    technical_control: c.technical_control, technical_control_step: c.technical_control_step, technical_control_details: c.technical_control_details ?? "",
    aip: c.aip, document_required: c.document_required, observation: c.observation ?? "", document_reference: c.document_reference ?? "",
    breakpoint_int_1: c.breakpoint_int_1, breakpoint_int_2: c.breakpoint_int_2, breakpoint_int_3: c.breakpoint_int_3,
    convocation_int_1: c.convocation_int_1, convocation_int_2: c.convocation_int_2, convocation_int_3: c.convocation_int_3,
    breakpoint_ext_1: c.breakpoint_ext_1, breakpoint_ext_2: c.breakpoint_ext_2, breakpoint_ext_3: c.breakpoint_ext_3,
    convocation_ext_1: c.convocation_ext_1, convocation_ext_2: c.convocation_ext_2, convocation_ext_3: c.convocation_ext_3,
  });
  const [pending, start] = useTransition();
  const signed = new Set(block.signatures.filter((s) => !s.disabled).map((s) => s.nature));
  const set = (k: keyof DsiConfigInput, val: unknown) => setV((x) => ({ ...x, [k]: val }));
  const save = () => start(async () => {
    const res = await updateDsiConfig(block.id, v);
    if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
    notify.success(tg("toast.saved")); router.refresh(); onClose();
  });
  const box = (k: keyof DsiConfigInput, label: string, nature?: SignatureNature) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={!!v[k]} disabled={!!nature && signed.has(nature) && !!v[k]} onCheckedChange={(x) => set(k, !!x)} />{label}
    </label>
  );
  return (
    <ModalShell onClose={onClose} size="md" title={t("configDialogTitle")}
      footer={<><Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button><Button onClick={save} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button></>}>
      <FieldGroup>
        <Field>
          <FieldLabel>{t("signatoriesStatus")}</FieldLabel>
          <RadioGroup value={v.signatories_status} onValueChange={(x) => set("signatories_status", x)} className="flex flex-wrap gap-4">
            {(["required", "optional", "enabled", "disabled"] as const).map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm"><RadioGroupItem value={s} disabled={s === "disabled" && signed.size > 0} />{t(`statuses.${s}`)}</label>
            ))}
          </RadioGroup>
          {signed.size > 0 && <FieldDescription>{t("signedLock")}</FieldDescription>}
        </Field>
        {v.signatories_status === "disabled" && (
          <Field><FieldLabel htmlFor="dsi-dc">{t("disabledComment")} *</FieldLabel><Textarea id="dsi-dc" value={v.signatory_disabled_comment ?? ""} onChange={(e) => set("signatory_disabled_comment", e.target.value)} /></Field>
        )}
        <FieldSet>
          <FieldLegend>{t("controls")}</FieldLegend>
          <p className="text-sm text-muted-foreground">{t("realisationAlways")}</p>
          {box("technical_control", t("fields.technical_control"), "tech_control")}
          {box("technical_control_step", t("fields.technical_control_step"))}
          <Field><FieldLabel htmlFor="dsi-tcd">{t("fields.technical_control_details")}</FieldLabel><Textarea id="dsi-tcd" value={v.technical_control_details ?? ""} onChange={(e) => set("technical_control_details", e.target.value)} /></Field>
          <div className="flex gap-6">{box("aip", t("fields.aip"))}{box("document_required", t("fields.document_required"))}</div>
        </FieldSet>
        {flow.simplified_signature_mode ? <Alert><AlertDescription>{t("simplifiedInfo")}</AlertDescription></Alert> : (["int", "ext"] as const).map((kind) => (
          <FieldSet key={kind}>
            <FieldLegend>{t(`supervision.${kind}`)}</FieldLegend>
            {applicableSupervisors(flow, kind).map(({ n, name, mono }) => (
              <div key={n} className="grid grid-cols-[14rem_1fr_1fr] items-center gap-3">
                <span className="text-sm">{mono ? t("supervision.mono") : name ?? t("supervision.n", { n })}</span>
                {box(`breakpoint_${kind}_${n}` as keyof DsiConfigInput, t("supervision.breakpoint"), `breakpoint_${kind}_${n}` as SignatureNature)}
                {box(`convocation_${kind}_${n}` as keyof DsiConfigInput, t("supervision.convocation"), `convocation_${kind}_${n}` as SignatureNature)}
              </div>
            ))}
          </FieldSet>
        ))}
        <Field><FieldLabel htmlFor="dsi-obs">{t("fields.observation")}</FieldLabel><Textarea id="dsi-obs" value={v.observation ?? ""} onChange={(e) => set("observation", e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="dsi-ref">{t("fields.document_reference")}</FieldLabel><Input id="dsi-ref" value={v.document_reference ?? ""} onChange={(e) => set("document_reference", e.target.value)} /></Field>
      </FieldGroup>
    </ModalShell>
  );
}
