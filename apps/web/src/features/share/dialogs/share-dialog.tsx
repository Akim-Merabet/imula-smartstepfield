"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { MailIcon, RotateCwIcon, Share2Icon, Trash2Icon, XIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createShares, listShares, resendShare, revokeShare, type ShareRow, type ShareTarget, type ShareTargetInfo } from "../actions";
import { dialogErrorKey } from "../components/errors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Modale « Partager » : formulaire vierge, réponse ou document (spec 03 §9.1, spec 04 §5.8). */
export function ShareDialog({ target, close }: { target: ShareTarget; close: () => void }) {
  const t = useTranslations("share.dialog");
  const tg = useTranslations("global");
  const format = useFormatter();
  const locale = useLocale();
  const [info, setInfo] = useState<ShareTargetInfo | null>(null);
  const [items, setItems] = useState<ShareRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState(false);
  const [comment, setComment] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">(locale === "en" ? "en" : "fr");
  const [pending, start] = useTransition();
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [toRevoke, setToRevoke] = useState<ShareRow | null>(null);
  const kind = target.kind === "document" ? "document" : "form";
  const targetKey = JSON.stringify(target);

  const apply = useCallback((res: Awaited<ReturnType<typeof listShares>>) => {
    if (!res.ok) { setLoadError(res.error); return; }
    setInfo(res.data.info);
    setItems(res.data.items);
  }, []);
  const reload = useCallback(async () => apply(await listShares(JSON.parse(targetKey) as ShareTarget)), [apply, targetKey]);
  useEffect(() => {
    let active = true;
    void listShares(JSON.parse(targetKey) as ShareTarget).then((res) => { if (active) apply(res); });
    return () => { active = false; };
  }, [apply, targetKey]);

  const addDraft = (): string[] | null => {
    const parts = draft.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return emails;
    if (parts.some((p) => !EMAIL_RE.test(p))) { setDraftError(true); return null; }
    const next = [...new Set([...emails, ...parts])];
    setEmails(next);
    setDraft("");
    setDraftError(false);
    return next;
  };

  const submit = () => {
    const list = addDraft();
    if (!list || !list.length) return;
    start(async () => {
      const res = await createShares(target, { emails: list, comment: comment || null, language });
      if (!res.ok) {
        notify.error(res.error in BLOCKERS ? t(`blockers.${res.error as keyof typeof BLOCKERS}`) : t(`errors.${dialogErrorKey(res.error)}`));
        return;
      }
      const { sent, failed } = res.data;
      if (sent.length) notify.success(t("sent", { count: sent.length }));
      for (const f of failed) notify.error(t(`errors.${dialogErrorKey(f.error)}`), f.email);
      setEmails(failed.map((f) => f.email));
      if (sent.length) setComment("");
      await reload();
    });
  };

  const rowAction = (row: ShareRow, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setRowBusy(row.id);
    void fn().then(async (res) => {
      setRowBusy(null);
      if (!res.ok) { notify.error(t(`errors.${dialogErrorKey(res.error ?? "")}`)); return; }
      notify.success(success);
      await reload();
    });
  };

  const title = target.kind === "document" ? t("titleDocument") : target.kind === "response" ? t("titleResponse") : t("titleForm");
  const canShare = !!info?.canShare && !info.blocker;

  return (
    <ModalShell onClose={close} size="md" icon={<Share2Icon className="mt-1 size-5 text-primary" />} title={title}
      subtitle={info ? [info.name, info.reference].filter(Boolean).join(" · ") : undefined}
      footer={<>
        <Button variant="outline" onClick={close}>{tg("actions.close")}</Button>
        {info?.canShare && (
          <Button disabled={!canShare || pending || (!emails.length && !draft.trim())} onClick={submit}>
            {pending ? <Spinner data-icon="inline-start" /> : <MailIcon data-icon="inline-start" />}{t("send")}
          </Button>
        )}
      </>}>
      {loadError ? <p className="text-sm text-destructive">{t(`errors.${dialogErrorKey(loadError)}`)}</p> : !info ? <Spinner /> : (
        <div className="flex flex-col gap-6">
          {info.blocker && <div className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">{t(`blockers.${info.blocker}`)}</div>}
          {!info.canShare && <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{t("forbidden")}</div>}
          {info.canShare && (
            <FieldGroup>
              <Field data-invalid={draftError}>
                <FieldLabel htmlFor="share-email">{t("emails")}</FieldLabel>
                {emails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {emails.map((e) => (
                      <Badge key={e} variant="secondary" className="gap-1 pr-1">
                        {e}
                        <button type="button" className="rounded-sm p-0.5 hover:bg-background" aria-label={t("removeEmail", { email: e })}
                          onClick={() => setEmails((l) => l.filter((x) => x !== e))}><XIcon className="size-3" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input id="share-email" type="email" placeholder={t("emailPlaceholder")} value={draft} disabled={!canShare} aria-invalid={draftError}
                    onChange={(e) => { setDraft(e.target.value); setDraftError(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === "," || e.key === ";") { e.preventDefault(); addDraft(); } }}
                    onBlur={() => { if (draft.trim()) addDraft(); }} />
                  <Button type="button" variant="outline" disabled={!canShare || !draft.trim()} onClick={() => addDraft()}>{t("addEmail")}</Button>
                </div>
                {draftError && <FieldError>{t("invalidEmail")}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="share-language">{t("language")}</FieldLabel>
                <Select value={language} onValueChange={(v) => setLanguage(v as "fr" | "en")} disabled={!canShare}>
                  <SelectTrigger id="share-language" className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="fr">{t("languages.fr")}</SelectItem>
                      <SelectItem value="en">{t("languages.en")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="share-comment">{t("comment")}</FieldLabel>
                <Textarea id="share-comment" rows={3} maxLength={1000} value={comment} disabled={!canShare} onChange={(e) => setComment(e.target.value)} />
                <FieldDescription>{t("commentHint")}</FieldDescription>
              </Field>
            </FieldGroup>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("access")}</h3>
            {!items.length ? <p className="text-sm text-muted-foreground">{t(`empty.${target.kind}`)}</p> : (
              <ul className="flex flex-col divide-y rounded-md border">
                {items.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{row.name ?? row.email}</div>
                      <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        {row.name && <span>{row.email}</span>}
                        {row.sentAt && <span>{t("sentOn", { date: format.dateTime(new Date(row.sentAt), { dateStyle: "medium" }) })}</span>}
                        <span>· {t(`languages.${row.language === "fr" ? "fr" : "en"}`)}</span>
                      </div>
                    </div>
                    <StatusChip row={row} kind={kind} />
                    {info.canShare && (
                      <div className="flex gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={t("resend")} disabled={rowBusy === row.id || info.blocker === "response_done"}
                              onClick={() => rowAction(row, () => resendShare({ kind, id: row.id }), t("resent"))}>
                              {rowBusy === row.id ? <Spinner /> : <RotateCwIcon />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("resend")}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={t("revoke")} disabled={rowBusy === row.id} onClick={() => setToRevoke(row)}><Trash2Icon /></Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("revoke")}</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <AlertDialog open={!!toRevoke} onOpenChange={(o) => { if (!o) setToRevoke(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("revokeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("revokeText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tg("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => {
              const row = toRevoke;
              setToRevoke(null);
              if (row) rowAction(row, () => revokeShare({ kind, id: row.id }), t("revoked"));
            }}>{t("revoke")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ModalShell>
  );
}

const BLOCKERS = { response_done: 1, no_shared_question: 1, disabled: 1, no_pdf: 1 } as const;

function StatusChip({ row, kind }: { row: ShareRow; kind: "form" | "document" }) {
  const t = useTranslations("share.dialog.status");
  const format = useFormatter();
  if (row.status === "blocked") return <Badge variant="destructive">{t("blocked")}</Badge>;
  if (row.status === "expired") return <Badge variant="outline">{t("expired")}</Badge>;
  if (row.status === "responded" && row.respondedAt) {
    const datetime = format.dateTime(new Date(row.respondedAt), { dateStyle: "short", timeStyle: "short" });
    return <Badge className="bg-success-bg text-success">{kind === "document" ? t("downloaded", { datetime }) : t("responded", { datetime })}</Badge>;
  }
  return <Badge variant="secondary">{t("pending")}</Badge>;
}
