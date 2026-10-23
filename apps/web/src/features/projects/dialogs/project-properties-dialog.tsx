"use client";

import { Fragment, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { InfoIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";

type P = {
  designation: string; type: string; business_ref: string | null; contract_ref: string | null; published: boolean;
  organization_id: string; created_at: string; updated_at: string;
  family: { short_name: string; long_name: string | null } | null; client: { name: string } | null;
  status: { name: string } | null; account: { name: string } | null;
  creator: { first_name: string; last_name: string } | null; updater: { first_name: string; last_name: string } | null;
};

export function ProjectPropertiesDialog({ projectId, close }: { projectId: string; close: () => void }) {
  const t = useTranslations("projects");
  const tg = useTranslations("global");
  const format = useFormatter();
  const [p, setP] = useState<P | null>(null);

  useEffect(() => {
    createClient().from("projects").select(`designation, type, business_ref, contract_ref, published, organization_id, created_at, updated_at,
      family:label_families!projects_family_id_fkey(short_name, long_name), client:clients(name),
      status:custom_statuses!projects_custom_status_id_fkey(name), account:accounts(name),
      creator:collaborators!projects_created_by_fkey(first_name, last_name), updater:collaborators!projects_updated_by_fkey(first_name, last_name)`)
      .eq("id", projectId).single().then(({ data }) => setP(data as unknown as P));
  }, [projectId]);

  const name = (c: { first_name: string; last_name: string } | null) => (c ? `${c.first_name} ${c.last_name}` : "—");
  const rows: [string, string][] = p ? [
    [t("columns.designation"), p.designation],
    [t("columns.type"), t(`types.${p.type}` as never)],
    [t("columns.family"), p.family ? `${p.family.short_name}${p.family.long_name ? ` - ${p.family.long_name}` : ""}` : "—"],
    [t("columns.client"), p.client?.name ?? "—"],
    [t("properties.account"), p.account?.name ?? "—"],
    [t("columns.reference"), p.business_ref ?? "—"],
    [t("columns.contractRef"), p.contract_ref ?? "—"],
    [t("properties.shared"), p.published ? tg("yes") : tg("no")],
    [t("columns.status"), p.status?.name ?? "—"],
    [t("properties.organizationId"), p.organization_id],
    [tg("createdOn"), `${format.dateTime(new Date(p.created_at), { dateStyle: "short", timeStyle: "short" })} ${tg("by", { name: name(p.creator) })}`],
    [tg("updatedOn"), `${format.dateTime(new Date(p.updated_at), { dateStyle: "short", timeStyle: "short" })} ${tg("by", { name: name(p.updater) })}`],
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
