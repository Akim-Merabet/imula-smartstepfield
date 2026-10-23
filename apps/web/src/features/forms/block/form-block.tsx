"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CompassIcon, EllipsisIcon, ListChecksIcon, LockIcon, PlusIcon, PowerIcon, PowerOffIcon, SendIcon, Settings2Icon, Share2Icon, Trash2Icon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { useDialog } from "@/components/shell/use-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";
import { NatureChip, useActionError } from "../components/form-chips";
import { deleteBlockLink, updateBlockLink } from "./actions";

export const FORM_BLOCK_CHANGED = "form-block:changed";
export const notifyFormBlockChanged = () => window.dispatchEvent(new Event(FORM_BLOCK_CHANGED));

type Link = {
  id: string; enabled: boolean; mandatory: boolean; unique_response: boolean; unique_mode: Enums<"unique_mode">;
  initial_rubric_lineage_id: string | null; fillable_rubric_lineage_ids: string[] | null; position: number;
  form: { id: string; name: string; nature: string; index_label: string | null; enabled: boolean;
    family: { short_name: string; long_name: string | null; color: string } | null } | null;
  responses: { id: string; state: Enums<"response_state">; deleted_at: string | null }[];
};

export type FormBlockProps = {
  block: { id: string; state: Enums<"block_state"> };
  flow: { id: string; projectId: string; name: string; ref_int: string | null };
  step: { id: string; phaseId: string; phaseNumber: string; stepNumber: string; name: string };
  canEdit: boolean;
};

/**
 * Bloc « Formulaires » d'une étape de flow (spec 03 §6.3) : liaisons formulaire ↔ bloc,
 * paramètres (obligatoire, réponse unique + mode, guider vers, rubriques autorisées), réponses.
 */
export function FormBlock({ block, flow, step, canEdit }: FormBlockProps) {
  const t = useTranslations("forms.block");
  const tg = useTranslations("global");
  const tShare = useTranslations("share.actions");
  const dialog = useDialog();
  const errorText = useActionError();
  const [links, setLinks] = useState<Link[] | null>(null);

  const load = useCallback(() => {
    createClient().from("form_block_links")
      .select(`id, enabled, mandatory, unique_response, unique_mode, initial_rubric_lineage_id, fillable_rubric_lineage_ids, position,
        form:forms(id, name, nature, index_label, enabled, family:label_families!forms_family_id_fkey(short_name, long_name, color)),
        responses:form_responses(id, state, deleted_at)`)
      .eq("block_id", block.id).order("position")
      .then(({ data }) => setLinks((data ?? []) as unknown as Link[]));
  }, [block.id]);

  useEffect(() => {
    load();
    window.addEventListener(FORM_BLOCK_CHANGED, load);
    return () => window.removeEventListener(FORM_BLOCK_CHANGED, load);
  }, [load]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const res = await fn();
    if (res.ok) { notify.success(tg("toast.saved")); load(); } else notify.error(res.error === "link_has_responses" ? t("linkHasResponses") : errorText(res.error ?? "unknown"));
  };

  return (
    <div className="flex flex-col gap-3" data-flow={flow.id} data-step={step.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {t("stepLabel", { phase: /^\d/.test(step.phaseNumber) ? `P${step.phaseNumber}` : step.phaseNumber, step: /^\d/.test(step.stepNumber) ? `${t("stepPrefix")}${step.stepNumber}` : step.stepNumber, name: step.name })}
        </span>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => dialog.open(`form-lib/link/${block.id}`)}>
            <PlusIcon data-icon="inline-start" />{t("link")}
          </Button>
        )}
      </div>
      {!links ? <div className="flex justify-center py-6"><Spinner /></div> : links.length === 0 ? (
        <Empty className="border py-8">
          <EmptyHeader>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{canEdit ? t("emptyEdit") : t("emptyRead")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {links.map((l) => {
            const responses = l.responses.filter((r) => !r.deleted_at);
            const done = responses.filter((r) => r.state === "done").length;
            const disabled = !l.enabled || !l.form?.enabled;
            return (
              <li key={l.id} className={`flex items-center gap-3 px-3 py-2 ${disabled ? "opacity-60" : ""}`}>
                {l.form && <NatureChip nature={l.form.nature} />}
                <FamilyChip color={l.form?.family?.color} shortName={l.form?.family?.short_name} longName={l.form?.family?.long_name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{l.form?.name ?? "—"}</span>
                    {l.form?.index_label && <span className="text-xs text-muted-foreground">{t("index", { index: l.form.index_label })}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    {l.mandatory && <Badge variant="secondary">{t("badges.mandatory")}</Badge>}
                    {l.unique_response && <Badge variant="secondary">{t("badges.unique", { mode: t(`uniqueModes.${l.unique_mode}`) })}</Badge>}
                    {l.initial_rubric_lineage_id && <Badge variant="secondary"><CompassIcon />{t("badges.guide")}</Badge>}
                    {l.fillable_rubric_lineage_ids && <Badge variant="secondary"><LockIcon />{t("badges.restricted")}</Badge>}
                    {disabled && <Badge variant="outline">{t("badges.disabled")}</Badge>}
                  </div>
                </div>
                <span className="text-sm whitespace-nowrap text-muted-foreground">{t("responsesCount", { count: responses.length, done })}</span>
                <Button size="sm" disabled={disabled} onClick={() => l.form && dialog.open(`form-lib/reply/${l.form.id}/${l.id}`)}>
                  <SendIcon data-icon="inline-start" />{t("reply")}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onSelect={() => dialog.open(`form-lib/link-responses/${l.id}`)}><ListChecksIcon />{t("viewResponses")}</DropdownMenuItem>
                      {canEdit && (
                        <>
                          <DropdownMenuItem onSelect={() => dialog.open(`form-lib/link-settings/${l.id}/${block.state}`)}><Settings2Icon />{t("settings")}</DropdownMenuItem>
                          {l.form && <DropdownMenuItem onSelect={() => dialog.open(`share/form/${l.form!.id}`)}><Share2Icon />{tShare("share")}</DropdownMenuItem>}
                          <DropdownMenuItem onSelect={() => run(() => updateBlockLink(l.id, { enabled: !l.enabled }))}>
                            {l.enabled ? <PowerOffIcon /> : <PowerIcon />}{l.enabled ? tg("actions.deactivate") : tg("actions.activate")}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuGroup>
                    {canEdit && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuItem variant="destructive" onSelect={() => run(() => deleteBlockLink(l.id))}><Trash2Icon />{t("unlink")}</DropdownMenuItem>
                        </DropdownMenuGroup>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default FormBlock;
