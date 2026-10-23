"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { EyeIcon, PenLineIcon, Trash2Icon } from "lucide-react";
import { notify } from "@/components/common/notify";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { SignatorySlotDef, SignatureValue } from "../../types";
import { useResponse } from "./context";
import { SignatureCanvas, type SignatureCanvasHandle } from "./signature-canvas";
import { dataUrlToBlob, signedUrl, uploadResponseFile } from "./storage";

const NOT_LISTED = "__not_listed__";

/** Demande de collaborateur (identification + date + signature) — spec 03 §3.6. */
export function SignatureSlot({ slot, value, onChange, disabled }: {
  slot: SignatorySlotDef; value: SignatureValue | null; onChange: (v: SignatureValue | null) => void; disabled: boolean;
}) {
  const t = useTranslations("responses.signature");
  const tg = useTranslations("global");
  const format = useFormatter();
  const { members, responseId } = useResponse();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!view || !value?.signaturePath) return;
    void signedUrl(value.signaturePath).then(setUrl);
  }, [view, value?.signaturePath]);

  const name = value ? [value.firstName, value.lastName].filter(Boolean).join(" ") : "";
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="text-sm font-medium">{slot.name || t("defaultName", { order: slot.position })}</div>
      {slot.description && <div className="text-xs text-muted-foreground">{slot.description}</div>}
      {value ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            {value.signedAt && !slot.disableSignature
              ? t("signedOn", { name, date: format.dateTime(new Date(value.signedAt), { dateStyle: "short", timeStyle: "short" }) })
              : t("identified", { name })}
            {value.function && <span className="text-muted-foreground"> · {value.function}</span>}
            {value.proxied && <span className="text-muted-foreground"> · {t("byProxyShort", { principal: value.principal ?? "" })}</span>}
          </span>
          {value.signaturePath && (
            <Button variant="ghost" size="sm" onClick={() => setView(true)}><EyeIcon data-icon="inline-start" />{t("view")}</Button>
          )}
          {!disabled && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}><Trash2Icon data-icon="inline-start" />{t("delete")}</Button>
          )}
        </div>
      ) : disabled ? <span className="text-sm text-muted-foreground">—</span> : (
        <div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <PenLineIcon data-icon="inline-start" />{slot.disableSignature ? t("identify") : t("sign")}
          </Button>
        </div>
      )}
      {open && <SignDialog slot={slot} members={members} responseId={responseId} onClose={() => setOpen(false)} onDone={(v) => { onChange(v); setOpen(false); }} />}
      <Dialog open={view} onOpenChange={setView}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("viewTitle", { name })}</DialogTitle><DialogDescription className="sr-only">{name}</DialogDescription></DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt={name} className="mx-auto max-h-64" /> : <div className="flex justify-center py-8"><Spinner /></div>}
          {value?.comment && <p className="text-sm text-muted-foreground">{value.comment}</p>}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteSubtitle")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tg("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => onChange(null)}>{tg("actions.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SignDialog({ slot, members, responseId, onClose, onDone }: {
  slot: SignatorySlotDef; members: ReturnType<typeof useResponse>["members"]; responseId: string;
  onClose: () => void; onDone: (v: SignatureValue) => void;
}) {
  const t = useTranslations("responses.signature");
  const tg = useTranslations("global");
  const pad = useRef<SignatureCanvasHandle>(null);
  const [who, setWho] = useState<string>("");
  const [ext, setExt] = useState({ firstName: "", lastName: "", email: "", function: "", companyName: "" });
  const [proxied, setProxied] = useState(false);
  const [principal, setPrincipal] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const member = members.find((m) => m.id === who);

  const submit = async () => {
    const extern = who === NOT_LISTED;
    if (!who) { notify.error(t("selectRequired")); return; }
    if (extern && (!ext.firstName.trim() || !ext.lastName.trim() || (slot.disableSignature && !ext.function.trim()))) {
      notify.error(t("identityRequired")); return;
    }
    if (!slot.disableSignature && pad.current?.isEmpty()) { notify.error(t("signatureRequired")); return; }
    setBusy(true);
    try {
      let signaturePath: string | undefined;
      if (!slot.disableSignature && pad.current) {
        signaturePath = await uploadResponseFile(responseId, dataUrlToBlob(pad.current.toDataURL()), "signature.png", "signatures");
      }
      const now = new Date().toISOString();
      onDone({
        contributorType: extern ? "extern" : "intern",
        userId: extern ? undefined : member?.id,
        firstName: extern ? ext.firstName.trim() : member?.first_name,
        lastName: extern ? ext.lastName.trim() : member?.last_name,
        email: extern ? ext.email.trim() || undefined : member?.email ?? undefined,
        function: extern ? ext.function.trim() || undefined : undefined,
        companyName: extern ? ext.companyName.trim() || undefined : member?.company?.name,
        signaturePath, signedAt: now, localCreatedAt: now,
        proxied, principal: proxied ? principal.trim() : undefined,
        proxy: proxied ? [member?.first_name ?? ext.firstName, member?.last_name ?? ext.lastName].join(" ").trim() : undefined,
        proxyDate: proxied ? now : undefined,
        comment: comment.trim() || undefined,
      });
    } catch {
      notify.error(tg("toast.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{slot.name || t("defaultName", { order: slot.position })}</DialogTitle>
          <DialogDescription>{slot.disableSignature ? t("identifySubtitle") : t("signSubtitle")}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{t("collaborator")}</FieldLabel>
            <Select value={who || undefined} onValueChange={setWho}>
              <SelectTrigger><SelectValue placeholder={t("selectCollaborator")} /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.first_name} {m.last_name}</SelectItem>)}
                  <SelectItem value={NOT_LISTED}>{t("notListed")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {who === NOT_LISTED && (
            <div className="grid grid-cols-2 gap-3">
              {(["firstName", "lastName", "email", "function", "companyName"] as const).map((k) => (
                <Field key={k}>
                  <FieldLabel htmlFor={`sig-${k}`}>{t(`fields.${k}`)}</FieldLabel>
                  <Input id={`sig-${k}`} value={ext[k]} onChange={(e) => setExt((x) => ({ ...x, [k]: e.target.value }))} />
                </Field>
              ))}
            </div>
          )}
          <Field orientation="horizontal">
            <Checkbox id="sig-proxy" checked={proxied} onCheckedChange={(v) => setProxied(!!v)} />
            <FieldLabel htmlFor="sig-proxy">{t("byProxy")}</FieldLabel>
          </Field>
          {proxied && (
            <Field>
              <FieldLabel htmlFor="sig-principal">{t("principal")}</FieldLabel>
              <Input id="sig-principal" value={principal} placeholder={t("principalHint")} onChange={(e) => setPrincipal(e.target.value)} />
            </Field>
          )}
          {!slot.disableSignature && (
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel>{t("signature")}</FieldLabel>
                <Button variant="ghost" size="sm" onClick={() => pad.current?.clear()}>{t("clear")}</Button>
              </div>
              <SignatureCanvas ref={pad} />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="sig-comment">{t("comment")}</FieldLabel>
            <Textarea id="sig-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button disabled={busy} onClick={() => void submit()}>{busy && <Spinner data-icon="inline-start" />}{tg("actions.validate")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
