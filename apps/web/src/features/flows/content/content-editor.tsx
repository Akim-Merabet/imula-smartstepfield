"use client";

import { useEffect, useMemo, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleCheckIcon, CircleSlashIcon, ExternalLinkIcon, PencilIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { useDialog } from "@/components/shell/use-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { BlockPanel, type BlockEnv } from "../blocks/block-panel";
import { BLOCK_TYPES, numberItems, type BlockType } from "../meta";
import { markStepOpened, setStepValidation } from "../content-actions";
import type { ContentPhase, FlowHeader, StepDetail } from "../queries";
import { ContentTree } from "./content-tree";
import { SequenceLockAlert } from "./sequence-lock";
import { contentError } from "./errors";

export type EditorPermissions = {
  edit: boolean; delete: boolean; deactivate: boolean; validateStep: boolean; devalidateStep: boolean;
  validateBlock: boolean; sign: boolean; fieldData: boolean; deleteSignature: boolean; unlockSequence?: boolean;
};

/** Éditeur de contenu : arbre à gauche, zone étape à droite (§4.1). */
export function ContentEditor({ flow, phases, step, blockParam, candidates, multiPrStatuses, me, permissions, sequenceBlockers = [] }: {
  flow: FlowHeader; phases: ContentPhase[]; step: StepDetail | null; blockParam: string | null; sequenceBlockers?: string[];
  candidates: BlockEnv["candidates"]; multiPrStatuses: BlockEnv["multiPrStatuses"]; me: BlockEnv["me"];
  permissions: EditorPermissions;
}) {
  const t = useTranslations("flowContent");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const numbers = useMemo(() => {
    const map = numberItems(phases, t("prefix.phase"));
    for (const p of phases) for (const [k, v] of numberItems(p.steps, t("prefix.step"))) map.set(k, v);
    return map;
  }, [phases, t]);

  const select = (params: Record<string, string | null>) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) { if (v) sp.set(k, v); else sp.delete(k); }
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border bg-card">
      <aside className="w-80 shrink-0 border-r">
        <ContentTree flowId={flow.id} phases={phases} numbers={numbers} selectedStepId={step?.id ?? null}
          onSelectStep={(id) => select({ step: id, block: null })} permissions={permissions} />
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        {step ? (
          <StepZone key={step.id} flow={flow} phases={phases} step={step} numbers={numbers} blockParam={blockParam} blockers={sequenceBlockers}
            onSelectBlock={(type) => select({ block: type })} env={{ candidates, multiPrStatuses, me }} permissions={permissions} />
        ) : (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyTitle>{t("step.selectTitle")}</EmptyTitle>
              <EmptyDescription>{phases.length ? t("step.selectSubtitle") : t("tree.emptySubtitle")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </div>
  );
}

function StepZone({ flow, phases, step, numbers, blockParam, blockers, onSelectBlock, env, permissions }: {
  flow: FlowHeader; phases: ContentPhase[]; step: StepDetail; numbers: Map<string, string>; blockParam: string | null; blockers: string[];
  onSelectBlock: (type: BlockType) => void; env: Omit<BlockEnv, "flow" | "step" | "permissions">; permissions: EditorPermissions;
}) {
  const t = useTranslations("flowContent");
  const tb = useTranslations("blocks");
  const tg = useTranslations("global");
  const router = useRouter();
  const dialog = useDialog();
  const [pending, start] = useTransition();
  const phase = phases.find((p) => p.id === step.phase_id);
  const enabled = BLOCK_TYPES.map((type) => step.blocks.find((b) => b.type === type && b.enabled)).filter(Boolean) as StepDetail["blocks"];
  const current = enabled.find((b) => b.type === blockParam) ?? enabled[0];
  const disabled = step.disabled || !!phase?.disabled;
  const linked = phase?.steps.find((s) => s.id === step.id)?.linked_flow;

  useEffect(() => { void markStepOpened(step.id); }, [step.id]);

  const toggleValidation = () => start(async () => {
    const res = await setStepValidation(step.id, !step.validated_at);
    if (!res.ok) {
      if (res.error === "missing_mandatory") {
        const missing = (res.details as string[] | undefined) ?? [];
        if (missing.includes("sequence")) notify.error(t("sequence.lockedTitle"), t("sequence.lockedToast"));
        else notify.error(t("stepValidation.fail"), missing.map((m) => t(`stepValidation.missing.${m}`)).join(" · "));
      } else notify.error(contentError(t, tg, res.error));
      return;
    }
    notify.success(step.validated_at ? t("stepValidation.devalidated") : t("stepValidation.success"));
    router.refresh();
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-3 border-b px-6 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{numbers.get(step.phase_id)} - {phase?.name}</div>
          <h2 className={cn("truncate text-lg font-medium", disabled && "line-through")}>{numbers.get(step.id)} - {step.name}</h2>
          {step.additional_comment && <div className="text-sm text-muted-foreground">{step.additional_comment}</div>}
        </div>
        {linked && (
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/explore/projects/${flow.project_id}/flow/${linked.id}/content-view`}><ExternalLinkIcon data-icon="inline-start" />{t("step.openLinked", { value: linked.name })}</Link>
          </Button>
        )}
        {permissions.edit && (
          <Button variant="ghost" size="icon-sm" aria-label={t("tree.editStep")} onClick={() => dialog.open(`flow-content/step-edit/${step.id}/general-tab`)}><PencilIcon /></Button>
        )}
        {(step.validated_at ? permissions.devalidateStep : permissions.validateStep) && !disabled && (
          <Button size="sm" variant={step.validated_at ? "secondary" : "default"} onClick={toggleValidation} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : step.validated_at ? <CircleSlashIcon data-icon="inline-start" /> : <CircleCheckIcon data-icon="inline-start" />}
            {step.validated_at ? t("stepValidation.devalidate") : t("stepValidation.validate")}
          </Button>
        )}
      </div>
      {!disabled && !step.validated_at && blockers.length > 0 && (
        <SequenceLockAlert stepId={step.id} canUnlock={!!permissions.unlockSequence}
          steps={blockers.map((id) => {
            const s = phases.flatMap((p) => p.steps).find((x) => x.id === id);
            return s ? `${numbers.get(s.phase_id)}-${numbers.get(s.id)} ${s.name}` : id;
          })} />
      )}
      {disabled && (
        <Alert className="mx-6 mt-3 w-auto"><AlertDescription>{t("step.disabledInfo", { comment: (step.disabled ? step.disabled_comment : phase?.disabled_comment) ?? "—" })}</AlertDescription></Alert>
      )}
      {step.description && <p className="mx-6 mt-3 rounded bg-info-bg px-3 py-2 text-sm">{step.description}</p>}
      {enabled.length === 0 ? (
        <Empty className="flex-1"><EmptyHeader><EmptyTitle>{t("step.noBlock")}</EmptyTitle></EmptyHeader></Empty>
      ) : (
        <>
          <div className="flex gap-1 border-b px-6 pt-2">
            {enabled.map((b) => (
              <button key={b.id} type="button" onClick={() => onSelectBlock(b.type)} title={tb("show", { block: tb(`title.${b.type}`) })}
                className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", b.id === current?.id ? "border-primary text-primary" : "border-transparent text-tab-inactive hover:text-primary")}>
                {tb(`title.${b.type}`)}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {current && (
              <BlockPanel key={current.id} block={current}
                env={{
                  ...env,
                  flow: {
                    id: flow.id, projectId: flow.project_id, name: flow.name, ref_int: flow.ref_int, flow_type: flow.flow_type,
                    supervision: flow,
                  },
                  step: {
                    id: step.id, phaseId: step.phase_id, phaseNumber: numbers.get(step.phase_id) ?? "", stepNumber: numbers.get(step.id) ?? "",
                    name: step.name, disabled, blocks: step.blocks,
                  },
                  permissions,
                }} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
