"use client";

import { Fragment, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { InfoIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { useWordingFields, WordingBadge } from "../components/wording-badge";
import { stateKey, type DocumentNature, type DocumentState, type DocumentStep } from "../meta";

type P = {
  name: string; nature: DocumentNature; source: string; origin: string; ref_int: string | null; ref_ext: string | null;
  created_at: string; updated_at: string;
  family: { short_name: string; long_name: string | null; wording_configuration_id: string | null } | null;
  account: { name: string } | null;
  creator: { first_name: string; last_name: string } | null; updater: { first_name: string; last_name: string } | null;
  versions: { state: DocumentState; step: DocumentStep | null; is_last: boolean }[];
};

/** « Propriétés du document » (§3.5). */
export function DocumentPropertiesDialog({ documentId, close }: { documentId: string; close: () => void }) {
  const t = useTranslations("documents");
  const format = useFormatter();
  const [p, setP] = useState<P | null>(null);
  const wording = useWordingFields(p?.family?.wording_configuration_id);
  useEffect(() => {
    createClient().from("documents").select(`name, nature, source, origin, ref_int, ref_ext, created_at, updated_at,
      family:label_families!documents_family_id_fkey(short_name, long_name, wording_configuration_id), account:accounts(name),
      creator:collaborators!documents_created_by_fkey(first_name, last_name), updater:collaborators!documents_updated_by_fkey(first_name, last_name),
      versions:document_versions(state, step, is_last)`).eq("id", documentId).single().then(({ data }) => setP(data as unknown as P));
  }, [documentId]);
  const name = (c: { first_name: string; last_name: string } | null) => (c ? `${c.first_name} ${c.last_name}` : "—");
  const dt = (v: string) => format.dateTime(new Date(v), { dateStyle: "short", timeStyle: "short" });
  const last = p?.versions.find((v) => v.is_last);
  const rows: [string, React.ReactNode][] = p ? [
    [t("properties.name"), p.name],
    [t("properties.type"), t(`natures.${p.nature}`)],
    [t("properties.source"), t(`sources.${p.source}` as never)],
    [t("properties.family"), p.family ? `${p.family.short_name}${p.family.long_name ? ` - ${p.family.long_name}` : ""}` : "—"],
    [t("properties.applicability"), p.account?.name ?? "—"],
    [t("properties.provenance"), t(`provenances.${p.origin}` as never)],
    [t("properties.refInt"), p.ref_int ?? "—"],
    [t("properties.refExt"), p.ref_ext ?? "—"],
    [t("properties.state"), <WordingBadge key="s" fields={wording} wkey={last ? stateKey(last) : "other"} />],
  ] : [];
  return (
    <ModalShell onClose={close} size="sm" icon={<EntityIcon kind="project" icon={InfoIcon} size="md" />} title={t("properties.title")}>
      {!p ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-3 text-sm">
            {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-all">{v}</dd></Fragment>))}
          </dl>
          <p className="text-sm text-muted-foreground">{t("properties.created", { date: dt(p.created_at), name: name(p.creator) })}</p>
          <p className="text-sm text-muted-foreground">{t("properties.updated", { date: dt(p.updated_at), name: name(p.updater) })}</p>
        </div>
      )}
    </ModalShell>
  );
}
