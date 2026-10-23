"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CopyIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { duplicateFlow } from "../actions";
import type { FlowType } from "../meta";

/** « Dupliquer un flow » : copie profonde synchrone, validations remises à zéro (§2.7 action 1). */
export function FlowDuplicateDialog({ flowId, close }: { flowId: string; close: () => void }) {
  const t = useTranslations("flows.duplicate");
  const tf = useTranslations("flows");
  const tg = useTranslations("global");
  const router = useRouter();
  const { projectId } = useParams<{ projectId: string }>();
  const [type, setType] = useState<FlowType | null>(null);
  const [name, setName] = useState("");
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    createClient().from("flows").select("name, flow_type").eq("id", flowId).single().then(({ data }) => {
      if (!data) return;
      setType(data.flow_type);
      setName(`${t("copyPrefix")} ${data.name}`.slice(0, 255));
    });
  }, [flowId, t]);

  const submit = () => {
    if (name.length < 3) { setError(tg("validators.minLength", { min: 3 })); return; }
    if (name !== name.trim()) { setError(tf("validators.trim")); return; }
    start(async () => {
      const res = await duplicateFlow(flowId, { name, ref_int: ref || null });
      if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error")); return; }
      notify.success(t("success"));
      router.refresh();
      close();
      router.push(`/explore/projects/${projectId}/dashboard/flow-management/vue-list`);
    });
  };

  return (
    <ModalShell onClose={close} size="sm" icon={<EntityIcon kind="project" icon={CopyIcon} size="md" />}
      title={type ? t("title", { type: tf(`types.${type}`) }) : t("title", { type: "" })}
      footer={<>
        <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
        <Button onClick={submit} disabled={pending || !type}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.duplicate")}</Button>
      </>}>
      {!type ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <FieldGroup>
          <Alert><AlertDescription>{t("info")}</AlertDescription></Alert>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="dup-name">{tf("dialog.name")} *</FieldLabel>
            <Input id="dup-name" value={name} aria-invalid={!!error} onChange={(e) => { setName(e.target.value); setError(null); }} />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="dup-ref">{t("reference")}</FieldLabel>
            <Input id="dup-ref" value={ref} onChange={(e) => setRef(e.target.value)} />
          </Field>
        </FieldGroup>
      )}
    </ModalShell>
  );
}
