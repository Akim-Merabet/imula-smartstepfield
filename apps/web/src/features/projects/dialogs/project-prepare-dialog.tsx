"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { InfoIcon, PackageOpenIcon, TriangleAlertIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { prepareSubFolder } from "../folder-actions";
import { followEntityJob } from "./project-duplicate-dialog";

const REFERENTIAL_FLOW_TYPES = ["referential", "referential_generic", "group_referential", "referential_intervention", "local_referential"] as const;

/** ?dialog=project/prepare/<id> — préparation d'un sous-dossier référentiel en entité Projet (spec 01 §5.7). */
export function ProjectPrepareDialog({ projectId, close }: { projectId: string; close: () => void }) {
  const t = useTranslations("folders");
  const tp = useTranslations("projects");
  const tg = useTranslations("global");
  const router = useRouter();
  const [sub, setSub] = useState<{ designation: string; project_index: string | null; client_id: string } | null>(null);
  const [flowCount, setFlowCount] = useState(0);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    void Promise.all([
      supabase.from("projects").select("designation, project_index, client_id").eq("id", projectId).maybeSingle(),
      supabase.from("flows").select("id", { count: "exact", head: true }).eq("project_id", projectId).is("deleted_at", null)
        .in("flow_type", [...REFERENTIAL_FLOW_TYPES]),
      supabase.from("clients").select("id, name").order("name"),
    ]).then(([{ data: p }, { count }, { data: c }]) => {
      if (!active || !p) return;
      setSub(p); setFlowCount(count ?? 0); setClients(c ?? []);
      setName(p.designation); setClientId(p.client_id);
    });
    return () => { active = false; };
  }, [projectId]);

  const submit = () => {
    if (name.trim().length < 3) { setError(tg("validators.minLength", { min: 3 })); return; }
    setError(null);
    start(async () => {
      const res = await prepareSubFolder({ subFolderId: projectId, name: name.trim(), clientId });
      if (!res.ok) {
        notify.error(res.error === "no_flows" ? t("prepare.noFlowsTitle") : res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error"),
          res.error === "no_flows" ? t("prepare.noFlows") : undefined);
        return;
      }
      notify.info(t("prepare.inProgress"), t("prepare.inProgressDescription"));
      close();
      followEntityJob(res.data.jobId, {
        done: t("prepare.done", { name: name.trim() }),
        failed: (code) => (code === "no_flows" ? t("prepare.noFlows") : code === "forbidden" ? tg("toast.forbidden") : t("prepare.failed")),
      }, () => router.refresh());
    });
  };

  return (
    <ModalShell
      onClose={close}
      size="sm"
      icon={<EntityIcon kind="folder" icon={PackageOpenIcon} size="md" />}
      title={sub ? t("prepare.title", { title: sub.designation, index: sub.project_index ?? "-" }) : t("prepare.action")}
      footer={
        <>
          <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
          <Button onClick={submit} disabled={pending || !sub || !flowCount || !clientId}>
            {pending && <Spinner data-icon="inline-start" />}{t("prepare.action")}
          </Button>
        </>
      }>
      {!sub ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : flowCount === 0 ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>{t("prepare.noFlowsTitle")}</AlertTitle>
          <AlertDescription>{t("prepare.noFlows")}</AlertDescription>
        </Alert>
      ) : (
        <FieldGroup>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="prepare-name">{tp("dialog.designation")} *</FieldLabel>
            <Input id="prepare-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!error} maxLength={255} />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <Field>
            <FieldLabel>{tp("dialog.client")} *</FieldLabel>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
              <SelectContent><SelectGroup>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
          <Alert>
            <InfoIcon />
            <AlertDescription>{t("prepare.info", { count: flowCount })}</AlertDescription>
          </Alert>
        </FieldGroup>
      )}
    </ModalShell>
  );
}
