"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CopyIcon, InfoIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { watchJob } from "@/features/jobs/watch-job";
import { duplicateProject } from "../folder-actions";
import type { ProjectType } from "../meta";

type Source = { id: string; type: ProjectType; designation: string; client_id: string; is_sub_folder: boolean; project_index: string | null };
type Destination = "project" | "referential" | "template" | "folder";

/** Types de destination cohérents : projet ↔ référentiel ↔ modèle ; un sous-dossier reste un sous-dossier. */
function destinations(source: Source): Destination[] {
  if (source.type === "folder") return ["folder"];
  const order: Destination[] = ["project", "referential", "template"];
  return [source.type as Destination, ...order.filter((x) => x !== source.type)];
}

/** Message de fin d'un job de création d'entité (duplication ou préparation) et rafraîchissement de la page. */
export function followEntityJob(jobId: string, messages: { done: string; failed: (code: string) => string }, refresh: () => void) {
  void watchJob(jobId).then((outcome) => {
    if (outcome.ok) notify.success(messages.done);
    else notify.error(messages.failed(outcome.error));
    refresh();
  });
}

/** ?dialog=project/duplicate/<id> — ProjectDuplicateModal / ProjectFolderDuplicateModal (spec 01 §5.6). */
export function ProjectDuplicateDialog({ projectId, close }: { projectId: string; close: () => void }) {
  const t = useTranslations("projects");
  const tg = useTranslations("global");
  const router = useRouter();
  const [source, setSource] = useState<Source | null>(null);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [type, setType] = useState<Destination>("project");
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [index, setIndex] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    void Promise.all([
      supabase.from("projects").select("id, type, designation, client_id, is_sub_folder, project_index").eq("id", projectId).maybeSingle(),
      supabase.from("clients").select("id, name").order("name"),
    ]).then(([{ data: p }, { data: c }]) => {
      if (!active || !p) return;
      setSource(p as Source);
      setClients(c ?? []);
      setType(p.type === "folder" ? "folder" : (p.type as Destination));
      setName(t("duplicate.defaultName", { name: p.designation }).slice(0, 255));
      setClientId(p.client_id);
      setIndex(p.project_index ?? "");
    });
    return () => { active = false; };
  }, [projectId, t]);

  const isSubFolder = source?.type === "folder";
  const typeLabel = (x: string) => (x === "folder" ? t("duplicate.subFolder") : t(`types.${x}` as never));

  const submit = () => {
    if (name.trim().length < 3) { setError(tg("validators.minLength", { min: 3 })); return; }
    setError(null);
    start(async () => {
      const res = await duplicateProject({ sourceId: projectId, type, name: name.trim(), clientId, index: isSubFolder ? index : undefined });
      if (!res.ok) {
        notify.error(res.error === "forbidden" ? tg("toast.forbidden") : res.error === "not_duplicable" ? t("duplicate.notDuplicable") : tg("toast.error"));
        return;
      }
      notify.info(t("duplicate.inProgress"), t("duplicate.inProgressDescription"));
      close();
      const finalName = name.trim();
      followEntityJob(res.data.jobId, {
        done: t("duplicate.done", { name: finalName }),
        failed: (code) => (code === "forbidden" ? tg("toast.forbidden") : t("duplicate.failed")),
      }, () => router.refresh());
    });
  };

  return (
    <ModalShell
      onClose={close}
      size="md"
      icon={<EntityIcon kind={source?.type ?? "project"} icon={CopyIcon} size="md" />}
      title={isSubFolder ? t("duplicate.titleSubFolder") : t("duplicate.title")}
      subtitle={source?.designation}
      footer={
        <>
          <Button variant="secondary" onClick={close}>{tg("actions.cancel")}</Button>
          <Button onClick={submit} disabled={pending || !source || !clientId}>
            {pending && <Spinner data-icon="inline-start" />}{t("actions.duplicate")}
          </Button>
        </>
      }>
      {!source ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3 text-sm leading-8">
            <span>{t("duplicate.sentence.source")}</span>
            <Badge variant="secondary">{typeLabel(source.type)}</Badge>
            <span>{t("duplicate.sentence.named")}</span>
            <span className="font-medium">{source.designation}</span>
            <span>{t("duplicate.sentence.into")}</span>
            <Select value={type} onValueChange={(v) => setType(v as Destination)} disabled={isSubFolder}>
              <SelectTrigger className="w-44" aria-label={t("duplicate.destinationType")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {destinations(source).map((d) => <SelectItem key={d} value={d}>{typeLabel(d)}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
            <span>{t("duplicate.sentence.named")}</span>
            <Field data-invalid={!!error} className="w-72">
              <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={t("duplicate.destinationName")} aria-invalid={!!error} maxLength={255} />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            {isSubFolder && (
              <>
                <span>{t("duplicate.sentence.index")}</span>
                <Input className="w-28" value={index} onChange={(e) => setIndex(e.target.value)} aria-label={t("duplicate.index")} maxLength={255} />
              </>
            )}
            <span>{t("duplicate.sentence.client")}</span>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="w-56" aria-label={t("dialog.client")}><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <Alert>
            <InfoIcon />
            <AlertTitle>{t("duplicate.info.title")}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                <li>{t("duplicate.info.validation")}</li>
                <li>{t("duplicate.info.otherDocuments")}</li>
                <li>{t("duplicate.info.library")}</li>
                <li>{t("duplicate.info.signatures")}</li>
                <li>{t("duplicate.info.collaborators")}</li>
                {type === "template" && <li>{t("duplicate.info.template")}</li>}
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      )}
    </ModalShell>
  );
}
