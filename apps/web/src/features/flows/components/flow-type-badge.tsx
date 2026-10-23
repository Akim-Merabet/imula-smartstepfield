"use client";

import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FlowType } from "../meta";

const TYPE_CLASSES: Partial<Record<FlowType, string>> = {
  specific: "bg-entity-project-bg text-entity-project",
  generic: "bg-success-bg text-success",
  group: "bg-warning-bg text-warning",
  flow_form: "bg-info-bg text-info",
  template: "bg-entity-template-bg text-entity-template",
};

/** Pastille-lettre du type de flow (S/G/C/I/M/R), avec infobulle du rôle du type (§2.1). */
export function FlowTypeBadge({ type, size = "md", className }: { type: FlowType; size?: "sm" | "md"; className?: string }) {
  const t = useTranslations("flows");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn(
          "inline-flex shrink-0 items-center justify-center rounded font-semibold",
          size === "sm" ? "size-5 text-[0.65rem]" : "size-7 text-xs",
          TYPE_CLASSES[type] ?? "bg-entity-referential-bg text-entity-referential",
          className,
        )}>
          {t(`letters.${type}`)}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="font-medium">{t(`types.${type}`)}</div>
        <div className="max-w-64 text-xs">{t(`typeHelp.${type}`)}</div>
      </TooltipContent>
    </Tooltip>
  );
}
