"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_WORDING_COLORS, type WordingFields, type WordingKey } from "../meta";

/** Valeur / tooltip / couleur d'une clé de suivi : configuration de la famille, sinon libellés par défaut. */
export function useWordingResolver(fields: WordingFields | null | undefined) {
  const t = useTranslations("documents.wording");
  return (key: WordingKey) => {
    const e = fields?.[key];
    return {
      value: e?.value || t(`${key}.value`),
      tooltip: e?.tooltip || t(`${key}.tooltip`),
      color: e?.color || DEFAULT_WORDING_COLORS[key] || "#828282",
    };
  };
}

export function WordingBadge({ fields, wkey }: { fields: WordingFields | null | undefined; wkey: WordingKey | null }) {
  const resolve = useWordingResolver(fields);
  if (!wkey) return <span className="text-muted-foreground">---</span>;
  const w = resolve(wkey);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="size-3 shrink-0 rounded-[2px]" style={{ backgroundColor: w.color }} />
          <span className="truncate">{w.value}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{w.tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** Charge (client) les libellés de suivi d'une configuration dans la langue courante. */
export function useWordingFields(configId: string | null | undefined) {
  const locale = useLocale();
  const [fields, setFields] = useState<WordingFields | null>(null);
  useEffect(() => {
    if (!configId) return;
    let active = true;
    createClient().from("wording_configuration_languages").select("language, fields").eq("wording_configuration_id", configId)
      .then(({ data }) => {
        if (!active) return;
        const row = data?.find((r) => r.language === locale) ?? data?.find((r) => r.language === "fr") ?? data?.[0];
        setFields((row?.fields ?? {}) as WordingFields);
      });
    return () => { active = false; };
  }, [configId, locale]);
  return configId ? fields : null;
}
