"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect, type SelectOption } from "../components/simple-select";

/** Modale « Commentaire » obligatoire (activation / désactivation d'une phase ou d'une étape). */
export function CommentDialog({ title, description, onClose, onConfirm, required = true }: {
  title: string; description?: string; onClose: () => void; onConfirm: (comment: string) => Promise<void>; required?: boolean;
}) {
  const t = useTranslations("flowContent");
  const tg = useTranslations("global");
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? t("comment.subtitle")}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="tree-comment">{t("comment.label")}{required && " *"}</FieldLabel>
          <Textarea id="tree-comment" value={comment} onChange={(e) => setComment(e.target.value)} autoFocus />
        </Field>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button disabled={pending || (required && !comment.trim())} onClick={async () => { setPending(true); try { await onConfirm(comment); } finally { setPending(false); } }}>
            {pending && <Spinner data-icon="inline-start" />}{tg("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Choix d'une position : « Dupliquer … juste avant » / « Déplacer … juste après ».
 * `groups` = phases (pour les étapes : phase cible puis étape de référence).
 */
export function PlacementDialog({ title, mode, phases, steps, initialPhase, onClose, onConfirm }: {
  title: string; mode: "before" | "after";
  phases: SelectOption[];
  /** Étapes par phase ; absent pour le placement d'une phase. */
  steps?: Record<string, SelectOption[]>;
  initialPhase?: string;
  onClose: () => void;
  onConfirm: (phaseId: string | null, refId: string | null) => Promise<void>;
}) {
  const t = useTranslations("flowContent");
  const tg = useTranslations("global");
  const [phase, setPhase] = useState<string | null>(initialPhase ?? phases[0]?.value ?? null);
  const [ref, setRef] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const refOptions = steps ? (phase ? steps[phase] ?? [] : []) : phases;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{mode === "before" ? t("placement.beforeHelp") : t("placement.afterHelp")}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {steps && (
            <Field>
              <FieldLabel>{t("placement.phase")}</FieldLabel>
              <SimpleSelect value={phase} clearable={false} onChange={(v) => { setPhase(v); setRef(null); }} options={phases} />
            </Field>
          )}
          <Field>
            <FieldLabel>{mode === "before" ? t("placement.before") : t("placement.after")}</FieldLabel>
            <SimpleSelect value={ref} onChange={setRef} options={refOptions}
              placeholder={mode === "before" ? t("placement.last") : t("placement.first")} />
          </Field>
          <p className="text-xs text-muted-foreground">{mode === "before" ? t("placement.noneBefore") : t("placement.noneAfter")}</p>
        </FieldGroup>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button disabled={pending || (!!steps && !phase)} onClick={async () => { setPending(true); try { await onConfirm(phase, ref); } finally { setPending(false); } }}>
            {pending && <Spinner data-icon="inline-start" />}{tg("actions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
