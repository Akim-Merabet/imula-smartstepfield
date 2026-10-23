"use client";

import { useTranslations } from "next-intl";
import { FileImageIcon, BoxesIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NATURE_CLASSES: Record<string, string> = {
  model: "bg-entity-template-bg text-entity-template",
  generic: "bg-entity-project-bg text-entity-project",
  local: "bg-entity-pgac-bg text-entity-pgac",
  other: "bg-entity-default-bg text-entity-default",
  archived: "bg-muted text-muted-foreground",
};

/** Puce de type de formulaire (M / G / L / O). */
export function NatureChip({ nature, className }: { nature: string; className?: string }) {
  const t = useTranslations("forms");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded text-xs font-semibold", NATURE_CLASSES[nature], className)}>
          {t(`letters.${nature}` as never)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t(`natures.${nature}` as never)}</TooltipContent>
    </Tooltip>
  );
}

/** Icônes d'information : trame PDF personnalisée, formulaire à lier avec un objet. */
export function FormFlags({ pdfTemplate, objectLink }: { pdfTemplate?: boolean; objectLink?: boolean }) {
  const t = useTranslations("forms.tooltips");
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      {pdfTemplate && (
        <Tooltip><TooltipTrigger asChild><FileImageIcon className="size-3.5" aria-label={t("formWeft")} /></TooltipTrigger><TooltipContent>{t("formWeft")}</TooltipContent></Tooltip>
      )}
      {objectLink && (
        <Tooltip><TooltipTrigger asChild><BoxesIcon className="size-3.5" aria-label={t("toBeLinkedToObject")} /></TooltipTrigger><TooltipContent>{t("toBeLinkedToObject")}</TooltipContent></Tooltip>
      )}
    </span>
  );
}

/** Message d'erreur d'action traduit (codes de src/lib/actions.ts + codes métier du module). */
export function useActionError() {
  const tg = useTranslations("global");
  const t = useTranslations("forms.errors");
  return (code: string) => {
    if (code === "forbidden") return tg("toast.forbidden");
    const known = ["disabled", "unique_response", "size_limit", "form_imported", "form_in_use", "source_missing", "duplicate", "in_use", "reference_too_short", "not_found", "version"];
    return known.includes(code) ? t(code as never) : tg("toast.error");
  };
}
