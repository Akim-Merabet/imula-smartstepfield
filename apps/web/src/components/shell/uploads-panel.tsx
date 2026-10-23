"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FileInputIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { uploadsStore, useUploads } from "@/features/documents/upload/uploads-store";
import { cn } from "@/lib/utils";

/** Panneau « Imports de documents » du rail (spec 00 §5.6) : visible dès qu'un import a eu lieu dans la session. */
export function UploadsPanel() {
  const t = useTranslations("documents.uploads");
  const items = useUploads();
  const [open, setOpen] = useState(false);
  const running = items.some((i) => i.status === "uploading");
  const unread = items.filter((i) => !i.read && i.status !== "uploading").length;

  // Avertissement avant fermeture de l'onglet tant qu'un import est en cours.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  if (items.length === 0) return null;
  const count = items.length;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) uploadsStore.markAllRead(); }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger aria-label={t("title")} className="relative flex h-[38px] w-[53px] items-center justify-center rounded hover:bg-rail-hover">
            <FileInputIcon className="size-5" />
            <Badge className={cn("absolute -top-1 right-0 h-5 min-w-5 border-2 border-white px-1 text-[0.65rem]", unread ? "bg-destructive" : "bg-primary")}>
              {count > 9 ? "9+" : count}
            </Badge>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{t("tooltip")}</TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="end" className="w-96 p-0">
        <div className="border-b p-3 font-medium">{t("title")}</div>
        {running && <p className="border-b bg-warning-bg px-3 py-2 text-xs text-warning">{t("doNotClose")}</p>}
        <ul className="max-h-[30rem] min-h-40 divide-y overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className={cn("flex flex-col gap-1 p-3", !item.read && item.status !== "uploading" && "bg-row-focus")}>
              <span className="truncate font-medium" title={item.name}>{item.name}</span>
              {item.context && <span className="truncate text-xs text-muted-foreground">{item.context}</span>}
              {item.status === "uploading" ? (
                <div className="flex items-center gap-2" title={t("inProgress")}>
                  <Progress value={item.progress} className="h-1.5" /><span className="text-xs tabular-nums">{item.progress}%</span>
                </div>
              ) : (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn("size-3 rounded-[2px]", item.status === "done" ? "bg-success" : "bg-destructive")} />
                  {item.status === "done" ? t("done") : item.error === "too_large" ? t("tooLarge") : t("failed")}
                  {" · "}{new Date(item.startedAt).toLocaleString()}
                </span>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
