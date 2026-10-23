"use client";

import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CircleCheckBigIcon, HistoryIcon, InfoIcon, LockIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { transitionBlock, updateBlockRefs } from "../block-actions";
import { contentError } from "../content/errors";
import type { EditorPermissions } from "../content/content-editor";
import { nextBlockState, type BlockState, type SupervisionFlow } from "../meta";
import type { StepBlock, StepDetail } from "../queries";
import { AdrBlock } from "./adr-block";
import { DsiBlock } from "./dsi-block";
import { EmmBlock } from "./emm-block";
import { MultiPrBlock } from "./multi-pr-block";
import { ObjectBlock } from "./object-block";
import { RhpBlock } from "./rhp-block";
import { RichTextBlock } from "./rich-text-block";

export type Candidate = { id: string; first_name: string; last_name: string; trigram: string; profession: string | null };

export type BlockEnv = {
  flow: { id: string; projectId: string; name: string; ref_int: string | null; flow_type: string; supervision: SupervisionFlow };
  step: { id: string; phaseId: string; phaseNumber: string; stepNumber: string; name: string; disabled: boolean; blocks: StepDetail["blocks"] };
  permissions: EditorPermissions;
  candidates: { restricted: boolean; candidates: Candidate[] };
  multiPrStatuses: { id: string; name: string; color: string; category: string }[];
  me: { id: string; name: string; company: string | null };
};

export type BlockProps = { block: StepBlock; env: BlockEnv; canEdit: boolean };

/** Bloc Formulaire fourni par le module Formulaires (contrat CONVENTIONS) ; repli si indisponible. */
const FormBlock = dynamic(
  () => import("@/features/forms/block/form-block")
    .then((m) => (m as unknown as { FormBlock?: React.ComponentType<FormBlockProps>; default?: React.ComponentType<FormBlockProps> }).FormBlock
      ?? (m as unknown as { default: React.ComponentType<FormBlockProps> }).default)
    .catch(() => FormBlockFallback),
  { loading: () => <div className="flex justify-center py-10"><Spinner /></div> },
);
type FormBlockProps = {
  block: { id: string; state: BlockState };
  flow: { id: string; projectId: string; name: string; ref_int: string | null };
  step: { id: string; phaseId: string; phaseNumber: string; stepNumber: string; name: string };
  canEdit: boolean;
};
function FormBlockFallback() {
  const t = useTranslations("blocks.form");
  return <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">{t("moduleUnavailable")}</p>;
}

const STATE_CLASSES: Record<BlockState, string> = {
  redaction: "bg-muted text-foreground", verification: "bg-info-bg text-info", approbation: "bg-warning-bg text-warning", validated: "bg-success-bg text-success",
};

export function BlockStateBadge({ state }: { state: BlockState }) {
  const t = useTranslations("blocks.states");
  return <Badge className={cn("rounded", STATE_CLASSES[state])}>{t(state)}</Badge>;
}

/** En-tête commun + contenu du bloc (§5.1). Le contenu n'est modifiable qu'en Rédaction (R-BL-3). */
export function BlockPanel({ block, env }: { block: StepBlock; env: BlockEnv }) {
  const t = useTranslations("blocks");
  const [dialog, setDialog] = useState<"validation" | "history" | "properties" | null>(null);
  const canEdit = env.permissions.edit && block.state === "redaction" && !env.step.disabled;
  const actors = [
    ["redactor", block.redactor_id, block.redacted_at], ["verifier", block.verifier_id, block.verified_at], ["approver", block.approver_id, block.approved_at],
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-md border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{t(`title.${block.type}`)}</h3>
            <BlockStateBadge state={block.state} />
            {!canEdit && block.state !== "redaction" && <span className="flex items-center gap-1 text-xs text-muted-foreground"><LockIcon className="size-3" />{t("readOnly")}</span>}
          </div>
          <p className="text-xs text-muted-foreground">{t(`subtitle.${block.type}`)}</p>
          <ActorLines actors={actors} />
        </div>
        {env.permissions.validateBlock && (
          <Button size="sm" onClick={() => setDialog("validation")}><CircleCheckBigIcon data-icon="inline-start" />{t("validation.button")}</Button>
        )}
        <Button size="icon-sm" variant="ghost" aria-label={t("history.title")} onClick={() => setDialog("history")}><HistoryIcon /></Button>
        <Button size="icon-sm" variant="ghost" aria-label={t("properties.title")} onClick={() => setDialog("properties")}><InfoIcon /></Button>
      </div>
      {block.type === "pr" || block.type === "txt" ? <RichTextBlock block={block} env={env} canEdit={canEdit} />
        : block.type === "emm" ? <EmmBlock block={block} env={env} canEdit={canEdit} />
        : block.type === "adr" ? <AdrBlock block={block} env={env} canEdit={canEdit} />
        : block.type === "rhp" ? <RhpBlock block={block} env={env} canEdit={canEdit} />
        : block.type === "dsi" ? <DsiBlock block={block} env={env} canEdit={canEdit} />
        : block.type === "multi_pr" ? <MultiPrBlock block={block} env={env} canEdit={canEdit} />
        : block.type === "object" ? <ObjectBlock block={block} env={env} canEdit={canEdit} />
        : block.type === "form" ? (
          <FormBlock block={{ id: block.id, state: block.state }}
            flow={{ id: env.flow.id, projectId: env.flow.projectId, name: env.flow.name, ref_int: env.flow.ref_int }}
            step={{ id: env.step.id, phaseId: env.step.phaseId, phaseNumber: env.step.phaseNumber, stepNumber: env.step.stepNumber, name: env.step.name }}
            canEdit={canEdit} />
        ) : null}
      {dialog === "validation" && <BlockValidationDialog block={block} onClose={() => setDialog(null)} />}
      {dialog === "history" && <BlockHistoryDialog blockId={block.id} onClose={() => setDialog(null)} />}
      {dialog === "properties" && <BlockPropertiesDialog block={block} canEdit={env.permissions.edit} onClose={() => setDialog(null)} />}
    </div>
  );
}

function ActorLines({ actors }: { actors: readonly (readonly [string, string | null, string | null])[] }) {
  const t = useTranslations("blocks.actors");
  const format = useFormatter();
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const ids = actors.map((a) => a[1]).filter(Boolean) as string[];
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    createClient().from("collaborators").select("id, first_name, last_name").in("id", key.split(","))
      .then(({ data }) => setNames(new Map((data ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`]))));
  }, [key]);
  const lines = actors.filter(([, id, at]) => id && at);
  if (!lines.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
      {lines.map(([role, id, at]) => (
        <span key={role}>{t(role, {
          name: names.get(id!) ?? "…",
          date: format.dateTime(new Date(at!), { dateStyle: "short" }),
          time: format.dateTime(new Date(at!), { timeStyle: "short" }),
        })}</span>
      ))}
    </div>
  );
}

/** « Validation interne du bloc » : passer à l'état suivant, rester, ou rejeter (R-BL-4/5). */
function BlockValidationDialog({ block, onClose }: { block: StepBlock; onClose: () => void }) {
  const t = useTranslations("blocks");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const next = nextBlockState(block.state);
  const options = [
    ...(next ? [{ value: "next", label: t("validation.next", { state: t(`states.${next}`) }) }] : []),
    ...(block.state !== "validated" ? [{ value: "retry", label: t("validation.retry", { state: t(`states.${block.state}`) }) }] : []),
    ...(block.state !== "redaction" ? [{ value: "reject", label: t("validation.reject") }] : []),
  ];
  const [action, setAction] = useState(options[0]?.value ?? "reject");
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();

  const submit = () => start(async () => {
    const res = await transitionBlock(block.id, action as "next" | "retry" | "reject", comment || null);
    if (!res.ok) {
      if (res.error === "role_conflict") notify.error(t(`validation.conflict.${block.state}` as never));
      else notify.error(contentError(tf, tg, res.error));
      return;
    }
    notify.success(t("validation.success"));
    router.refresh();
    onClose();
  });

  return (
    <ModalShell onClose={onClose} size="sm" icon={<EntityIcon kind="project" icon={CircleCheckBigIcon} size="md" />} title={t("validation.title")}
      subtitle={t("validation.current", { state: t(`states.${block.state}`) })}
      footer={<><Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.validate")}</Button></>}>
      <FieldGroup>
        <RadioGroup value={action} onValueChange={setAction} className="flex flex-col gap-3">
          {options.map((o) => <label key={o.value} className="flex items-center gap-2 text-sm"><RadioGroupItem value={o.value} />{o.label}</label>)}
        </RadioGroup>
        <Field>
          <FieldLabel htmlFor="bv-comment">{action === "reject" ? t("validation.rejectComment") : t("validation.comment")}</FieldLabel>
          <Textarea id="bv-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </FieldGroup>
    </ModalShell>
  );
}

type StateEvent = { id: number; action: string; from_state: BlockState | null; to_state: BlockState; comment: string | null; occurred_at: string; source: string;
  actor: { first_name: string; last_name: string } | null };

/** Historique des changements d'état (R-BL-7). */
function BlockHistoryDialog({ blockId, onClose }: { blockId: string; onClose: () => void }) {
  const t = useTranslations("blocks");
  const format = useFormatter();
  const [rows, setRows] = useState<StateEvent[] | null>(null);
  useEffect(() => {
    createClient().from("block_state_events").select("id, action, from_state, to_state, comment, occurred_at, source, actor:collaborators(first_name, last_name)")
      .eq("block_id", blockId).order("occurred_at", { ascending: false })
      .then(({ data }) => setRows((data as unknown as StateEvent[]) ?? []));
  }, [blockId]);
  return (
    <ModalShell onClose={onClose} size="md" icon={<EntityIcon kind="project" icon={HistoryIcon} size="md" />} title={t("history.title")}>
      {!rows ? <div className="flex justify-center py-12"><Spinner /></div> : rows.length === 0 ? <p className="py-12 text-center text-muted-foreground">{t("history.empty")}</p> : (
        <ol className="flex flex-col divide-y">
          {rows.map((r) => {
            const user = r.actor ? `${r.actor.first_name} ${r.actor.last_name}` : "—";
            return (
              <li key={r.id} className="flex flex-col gap-1 py-3">
                <span>{r.action === "create" ? t("history.created", { user, state: t(`states.${r.to_state}`) })
                  : r.from_state === r.to_state ? t("history.retry", { user, state: t(`states.${r.to_state}`) })
                  : t("history.changed", { user, from: t(`states.${r.from_state ?? "redaction"}`), to: t(`states.${r.to_state}`) })}</span>
                {r.comment && <span className="rounded bg-muted px-2 py-1 text-sm">{r.comment}</span>}
                <span className="text-xs text-muted-foreground">{format.dateTime(new Date(r.occurred_at), { dateStyle: "short", timeStyle: "short" })} · {r.source}</span>
              </li>
            );
          })}
        </ol>
      )}
    </ModalShell>
  );
}

/** Propriétés du bloc (R-BL-8) ; références interne / externe éditables. */
function BlockPropertiesDialog({ block, canEdit, onClose }: { block: StepBlock; canEdit: boolean; onClose: () => void }) {
  const t = useTranslations("blocks");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const format = useFormatter();
  const router = useRouter();
  const [refInt, setRefInt] = useState(block.ref_int ?? "");
  const [refExt, setRefExt] = useState(block.ref_ext ?? "");
  const [pending, start] = useTransition();
  const dt = (v: string) => format.dateTime(new Date(v), { dateStyle: "short", timeStyle: "short" });
  const save = () => start(async () => {
    const res = await updateBlockRefs(block.id, { ref_int: refInt, ref_ext: refExt });
    if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
    notify.success(tg("toast.saved")); router.refresh(); onClose();
  });
  return (
    <ModalShell onClose={onClose} size="sm" icon={<EntityIcon kind="project" icon={InfoIcon} size="md" />} title={t("properties.title")}
      footer={canEdit ? <><Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button><Button onClick={save} disabled={pending}>{tg("actions.save")}</Button></> : undefined}>
      <FieldGroup>
        <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("properties.type")}</dt><dd>{t(`title.${block.type}`)}</dd>
          <dt className="text-muted-foreground">{t("properties.state")}</dt><dd><BlockStateBadge state={block.state} /></dd>
          <dt className="text-muted-foreground">{tg("createdOn")}</dt><dd>{dt(block.created_at)}</dd>
          <dt className="text-muted-foreground">{tg("updatedOn")}</dt><dd>{dt(block.updated_at)}</dd>
        </dl>
        <Field><FieldLabel htmlFor="bp-int">{t("properties.refInt")}</FieldLabel><Input id="bp-int" value={refInt} disabled={!canEdit} onChange={(e) => setRefInt(e.target.value)} /></Field>
        <Field><FieldLabel htmlFor="bp-ext">{t("properties.refExt")}</FieldLabel><Input id="bp-ext" value={refExt} disabled={!canEdit} onChange={(e) => setRefExt(e.target.value)} /></Field>
      </FieldGroup>
    </ModalShell>
  );
}
