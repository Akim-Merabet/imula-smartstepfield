"use client";

import { Fragment, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { InfoIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import type { FlowType } from "../meta";

type P = {
  id: string; name: string; flow_type: FlowType; ref_int: string | null; ref_ext: string | null; sourced_from_index: string | null;
  created_at: string; updated_at: string; content_updated_at: string | null;
  family: { short_name: string; long_name: string | null } | null;
  account: { name: string } | null;
  source: { name: string; project: { designation: string } | null } | null;
  creator: { first_name: string; last_name: string } | null; updater: { first_name: string; last_name: string } | null;
};

/** Propriétés du flow (lecture seule, §2.7 action 7). */
export function FlowPropertiesDialog({ flowId, close }: { flowId: string; close: () => void }) {
  const t = useTranslations("flows");
  const tg = useTranslations("global");
  const format = useFormatter();
  const [p, setP] = useState<P | null>(null);

  useEffect(() => {
    createClient().from("flows").select(`id, name, flow_type, ref_int, ref_ext, sourced_from_index, created_at, updated_at, content_updated_at,
      family:label_families!flows_family_id_fkey(short_name, long_name), account:accounts(name),
      source:sourced_from_flow_id(name, project:projects(designation)),
      creator:collaborators!flows_created_by_fkey(first_name, last_name), updater:collaborators!flows_updated_by_fkey(first_name, last_name)`)
      .eq("id", flowId).single().then(({ data }) => setP(data as unknown as P));
  }, [flowId]);

  const name = (c: { first_name: string; last_name: string } | null) => (c ? `${c.first_name} ${c.last_name}` : "—");
  const dt = (v: string) => format.dateTime(new Date(v), { dateStyle: "short", timeStyle: "short" });
  const modified = p ? (p.content_updated_at && p.content_updated_at > p.updated_at ? p.content_updated_at : p.updated_at) : "";
  const rows: [string, string][] = p ? [
    [t("properties.name"), p.name],
    [t("properties.type"), t(`types.${p.flow_type}`)],
    [t("properties.family"), p.family ? `${p.family.short_name}${p.family.long_name ? ` - ${p.family.long_name}` : ""}` : "—"],
    [t("properties.applicability"), p.account?.name ?? "—"],
    [t("properties.refInt"), p.ref_int ?? "—"],
    [t("properties.refExt"), p.ref_ext ?? "—"],
    [t("properties.entitySource"), p.source?.project?.designation ?? "—"],
    [t("properties.entityIndex"), p.sourced_from_index ?? "—"],
    [t("properties.uuid"), p.id],
    [tg("createdOn"), `${dt(p.created_at)} ${tg("by", { name: name(p.creator) })}`],
    [tg("updatedOn"), `${dt(modified)} ${tg("by", { name: name(p.updater) })}`],
  ] : [];

  return (
    <ModalShell onClose={close} size="sm" icon={<EntityIcon kind="project" icon={InfoIcon} size="md" />} title={t("properties.title")}>
      {!p ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <dl className="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-3">
          {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-all">{v}</dd></Fragment>))}
        </dl>
      )}
    </ModalShell>
  );
}
