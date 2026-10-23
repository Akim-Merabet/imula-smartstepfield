"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CircleAlertIcon, CircleXIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import type { NumberLocale } from "@/lib/formula/engine";
import type { CheckResult, FileRef } from "../../types";
import type { ChangeSignature } from "../actions";
import type { RtQuestion } from "../engine/model";
import { formatValue } from "./format";
import { SignatureCanvas, type SignatureCanvasHandle } from "./signature-canvas";
import { dataUrlToBlob, uploadResponseFile } from "./storage";

/** Fenêtre « Questions échouées » (obligatoire / invalide), groupée par rubrique. */
export function FailedQuestionsDialog({ results, onClose, onGo }: {
  results: CheckResult[] | null; onClose: () => void; onGo: (rubricLineageId: string, questionLineageId: string) => void;
}) {
  const t = useTranslations("responses.failed");
  const tg = useTranslations("global");
  return (
    <Dialog open={!!results} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {(results ?? []).map((r) => (
            <div key={r.rubricLineageId} className="flex flex-col gap-1">
              <div className="text-sm font-medium">{t("rubric", { position: r.position, name: r.name })}</div>
              {r.questions.map((q) => (
                <button key={q.questionLineageId} type="button" onClick={() => onGo(r.rubricLineageId, q.questionLineageId)}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                  <span className="flex items-center gap-2">
                    {q.error === "mandatory" ? <CircleAlertIcon className="size-4 text-warning" /> : <CircleXIcon className="size-4 text-destructive" />}
                    {q.name}
                  </span>
                  <Badge variant={q.error === "mandatory" ? "secondary" : "destructive"}>{t(q.error)}</Badge>
                </button>
              ))}
            </div>
          ))}
        </div>
        <DialogFooter><Button onClick={onClose}>{tg("actions.close")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type HistoryRow = {
  id: number; option_lineage_id: string; changed_at: string; provenance: string; old_value: unknown; new_value: unknown;
  files_added: FileRef[] | null; files_removed: FileRef[] | null; change_signature: { comment?: string | null } | null;
  changer: { first_name: string; last_name: string } | null;
};

/** « Historique des modifications » d'une question. */
export function HistoryDialog({ responseId, question, locale, onClose }: {
  responseId: string; question: RtQuestion | null; locale: NumberLocale; onClose: () => void;
}) {
  const t = useTranslations("responses.history");
  const tf = useTranslations("responses.fields");
  const format = useFormatter();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  useEffect(() => {
    if (!question) return;
    setRows(null);
    void createClient().from("form_response_value_history")
      .select("id, option_lineage_id, changed_at, provenance, old_value, new_value, files_added, files_removed, change_signature, changer:collaborators!form_response_value_history_changed_by_fkey(first_name, last_name)")
      .eq("response_id", responseId).in("option_lineage_id", question.cells.map((c) => c.lineageId))
      .order("changed_at", { ascending: false })
      .then(({ data }) => setRows((data as unknown as HistoryRow[]) ?? []));
  }, [question, responseId]);

  const labels = { true: tf("true"), false: tf("false"), checked: tf("checked") };
  const fileType = question?.type === "photo" || question?.type === "file";
  const cellName = (lineage: string) => {
    const c = question?.cells.find((x) => x.lineageId === lineage);
    return question && question.cells.length > 1 ? c?.opt?.name || c?.slot?.name || c?.coord : null;
  };
  return (
    <Dialog open={!!question} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{question?.name}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col divide-y overflow-y-auto">
          {!rows ? <div className="flex justify-center py-8"><Spinner /></div> : rows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">{t("empty")}</p>
          ) : rows.map((r) => {
            const name = r.changer ? `${r.changer.first_name} ${r.changer.last_name}` : "—";
            const date = format.dateTime(new Date(r.changed_at), { dateStyle: "short", timeStyle: "short" });
            const old = question ? formatValue(question.type, r.old_value, locale, labels) : "";
            const neu = question ? formatValue(question.type, r.new_value, locale, labels) : "";
            const option = cellName(r.option_lineage_id);
            return (
              <div key={r.id} className="flex flex-col gap-1 py-3 text-sm">
                <span>{t.rich("changed", { name, date, provenance: t(`provenance.${r.provenance}`), b: (c) => <strong>{c}</strong> })}
                  {option && <span className="text-muted-foreground"> · {option}</span>}</span>
                {fileType ? (
                  <>
                    {(r.files_added ?? []).map((f) => <span key={`a-${f.fileId}`} className="text-success">{t("fileAdded", { name: f.name ?? f.fileId })}</span>)}
                    {(r.files_removed ?? []).map((f) => <span key={`r-${f.fileId}`} className="text-destructive">{t("fileRemoved", { name: f.name ?? f.fileId })}</span>)}
                  </>
                ) : (
                  <span className="text-muted-foreground">{t("fromTo", { old: old || t("empty_value"), new: neu || t("empty_value") })}</span>
                )}
                {r.change_signature?.comment && <span className="italic">{t("comment", { comment: r.change_signature.comment })}</span>}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** « Signature des changements » : signature de l'utilisateur courant + commentaire, avant d'enregistrer des valeurs verrouillées. */
export function ChangeSignatureDialog({ open, me, responseId, onCancel, onSigned }: {
  open: boolean; me: { id: string; firstName: string; lastName: string }; responseId: string;
  onCancel: () => void; onSigned: (s: ChangeSignature) => void;
}) {
  const t = useTranslations("responses.changes");
  const tg = useTranslations("global");
  const pad = useRef<SignatureCanvasHandle>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (pad.current?.isEmpty()) { notify.error(t("signatureRequired")); return; }
    setBusy(true);
    try {
      const path = await uploadResponseFile(responseId, dataUrlToBlob(pad.current!.toDataURL()), "change-signature.png", "signatures");
      onSigned({ user_id: me.id, name: `${me.firstName} ${me.lastName}`, image_path: path, signed_at: new Date().toISOString(), comment: comment.trim() || null });
      setComment("");
    } catch {
      notify.error(tg("toast.error"));
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle", { name: `${me.firstName} ${me.lastName}` })}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel>{t("signature")}</FieldLabel>
              <Button variant="ghost" size="sm" onClick={() => pad.current?.clear()}>{t("clear")}</Button>
            </div>
            {open && <SignatureCanvas ref={pad} />}
          </Field>
          <Field>
            <FieldLabel htmlFor="change-comment">{t("comment")}</FieldLabel>
            <Textarea id="change-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{tg("actions.cancel")}</Button>
          <Button disabled={busy} onClick={() => void submit()}>{busy && <Spinner data-icon="inline-start" />}{t("validate")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
