"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleCheckBigIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { bulkBlockTransition } from "../actions";
import { BLOCK_STATES, BLOCK_TYPES, type BlockState, type BlockType } from "../meta";
import { contentError } from "./errors";

type Row = { id: string; type: BlockType; state: BlockState; step: { name: string } | null };
type Action = "next" | "retry" | "reject";

/** « Validation interne du flow » : sélection des blocs par type puis action groupée (§4.9). */
export function InternalValidationDialog({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const t = useTranslations("flowContent");
  const tb = useTranslations("blocks");
  const tg = useTranslations("global");
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [types, setTypes] = useState<BlockType[]>([]);
  const [state, setState] = useState<BlockState>("redaction");
  const [action, setAction] = useState<Action>("next");
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    createClient().from("blocks").select("id, type, state, step:steps(name)").eq("flow_id", flowId).eq("enabled", true)
      .then(({ data }) => setRows((data as unknown as Row[]) ?? []));
  }, [flowId]);

  const concerned = useMemo(() => (rows ?? []).filter((r) => types.includes(r.type) && r.state === state), [rows, types, state]);
  const present = BLOCK_TYPES.filter((ty) => (rows ?? []).some((r) => r.type === ty));

  const submit = () => {
    if (!concerned.length) { notify.warning(t("validation.noBlock")); return; }
    start(async () => {
      const res = await bulkBlockTransition(flowId, concerned.map((r) => r.id), action, comment || null);
      if (!res.ok) { notify.error(res.error === "no_valid_block" ? t("validation.invalidState") : contentError(t, tg, res.error)); return; }
      notify.success(t("validation.success", { count: res.data.count }));
      if (res.data.conflicts) notify.warning(t("errors.role_conflict"));
      router.refresh();
      onClose();
    });
  };

  return (
    <ModalShell onClose={onClose} size="md" icon={<EntityIcon kind="project" icon={CircleCheckBigIcon} size="md" />} title={t("validation.title")}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !rows}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.validate")}</Button>
      </>}>
      {!rows ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <FieldGroup>
          <FieldSet>
            <FieldLegend>{t("validation.blocks")}</FieldLegend>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={present.length > 0 && types.length === present.length} onCheckedChange={(v) => setTypes(v ? present : [])} />
              {t("validation.selectAll")}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {present.map((ty) => (
                <label key={ty} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={types.includes(ty)} onCheckedChange={(v) => setTypes((cur) => (v ? [...cur, ty] : cur.filter((x) => x !== ty)))} />
                  {tb(`title.${ty}`)}
                </label>
              ))}
            </div>
          </FieldSet>
          <Field>
            <FieldLabel>{t("validation.currentState")}</FieldLabel>
            <RadioGroup value={state} onValueChange={(v) => setState(v as BlockState)} className="flex gap-4">
              {BLOCK_STATES.map((s) => <label key={s} className="flex items-center gap-2 text-sm"><RadioGroupItem value={s} />{tb(`states.${s}`)}</label>)}
            </RadioGroup>
          </Field>
          <Field>
            <FieldLabel>{t("validation.action")}</FieldLabel>
            <RadioGroup value={action} onValueChange={(v) => setAction(v as Action)} className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="next" />{t("validation.actions.next")}</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="retry" />{t("validation.actions.retry")}</label>
              <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="reject" />{t("validation.actions.reject")}</label>
            </RadioGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="iv-comment">{tb("validation.comment")}</FieldLabel>
            <Textarea id="iv-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <p className="text-sm font-medium">{t("validation.count", { count: concerned.length })}</p>
        </FieldGroup>
      )}
    </ModalShell>
  );
}
