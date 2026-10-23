"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { InfoIcon } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { COLLABORATOR_STATUS_COLORS, familyLabel, type Authority, type CollaboratorStatus } from "../meta";

type Fam = { short_name: string; long_name: string | null } | null;
type P = {
  first_name: string; last_name: string; trigram: string; authority: Authority | null; status: CollaboratorStatus;
  account: { name: string } | null; function: Fam; group: Fam;
  hierarchies: { hierarchy: Fam }[];
};

/** Propriétés d'un collaborateur (spec 01 §4.3). */
export function CollaboratorPropertiesDialog({ id, close }: { id: string; close: () => void }) {
  const t = useTranslations("collaborators");
  const [p, setP] = useState<P | null>(null);
  const [flows, setFlows] = useState<string[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("collaborators").select(`first_name, last_name, trigram, authority, status, account:accounts(name),
      function:label_families!collaborators_function_id_fkey(short_name, long_name),
      group:label_families!collaborators_group_id_fkey(short_name, long_name),
      hierarchies:collaborator_default_hierarchies(hierarchy:label_families(short_name, long_name))`)
      .eq("id", id).single().then(({ data }) => setP(data as unknown as P));
    Promise.all([
      supabase.from("flow_assignees").select("flow:flows(name, deleted_at)").eq("collaborator_id", id),
      supabase.from("flow_collaborators").select("flow:flows(name, deleted_at)").eq("collaborator_id", id),
    ]).then(([a, b]) => {
      const names = [...(a.data ?? []), ...(b.data ?? [])]
        .map((r) => r.flow as { name: string; deleted_at: string | null } | null)
        .filter((f): f is { name: string; deleted_at: string | null } => !!f && !f.deleted_at).map((f) => f.name);
      setFlows([...new Set(names)]);
    });
  }, [id]);

  const rows: [string, React.ReactNode][] = p ? [
    [t("dialog.firstName"), p.first_name],
    [t("dialog.lastName"), p.last_name],
    [t("dialog.trigram"), p.trigram],
    [t("properties.applicability"), p.account?.name ?? "—"],
    ...(p.authority ? [[t("dialog.authority"), t(`authority.${p.authority}`)] as [string, string]] : []),
    [t("dialog.function"), familyLabel(p.function) || "—"],
    [t("dialog.group"), familyLabel(p.group) || "—"],
    [t("columns.hierarchy"), p.hierarchies.map((h) => familyLabel(h.hierarchy)).filter(Boolean).join(" ; ") || "—"],
    [t("columns.status"), <StatusBadge key="s" color={COLLABORATOR_STATUS_COLORS[p.status]} label={t(`status.${p.status}`)} />],
    [t("properties.flows"), flows.length ? flows.join(", ") : t("properties.none")],
  ] : [];

  return (
    <ModalShell onClose={close} size="sm" icon={<EntityIcon kind="contributors" icon={InfoIcon} size="md" />} title={t("properties.title")}
      subtitle={p ? `${p.first_name} ${p.last_name}` : undefined}>
      {!p ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <dl className="grid grid-cols-[12rem_1fr] gap-x-4 gap-y-3 text-sm">
          {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></Fragment>))}
        </dl>
      )}
    </ModalShell>
  );
}
