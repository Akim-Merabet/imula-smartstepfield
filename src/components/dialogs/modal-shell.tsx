"use client";

import type { ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ModalTab = { id: string; label: string; disabled?: boolean };

/** Modale à onglets (spec 00 §5.4) : en-tête, onglets soulignés, contenu défilant, pied. */
export function ModalShell({
  open = true, onClose, icon, title, subtitle, tabs, activeTab, onTabChange, children, footer, size = "lg", onPrevious, onNext,
}: {
  open?: boolean; onClose: () => void; icon?: ReactNode; title: ReactNode; subtitle?: ReactNode;
  tabs?: ModalTab[]; activeTab?: string; onTabChange?: (id: string) => void; children: ReactNode; footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl"; onPrevious?: () => void; onNext?: () => void;
}) {
  const sizes = { sm: "sm:max-w-[38rem]", md: "sm:max-w-[50rem]", lg: "sm:max-w-[60rem]", xl: "sm:max-w-[72rem]" };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={cn("flex max-h-[90vh] min-h-[35rem] flex-col gap-0 p-0", sizes[size])}>
        <DialogHeader className="flex-row items-start gap-3 border-b px-8 py-4 text-left">
          {icon}
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-xl font-medium">{title}</DialogTitle>
            <DialogDescription className={cn("text-sm text-subtle", !subtitle && "sr-only")}>{subtitle ?? title}</DialogDescription>
          </div>
          {(onPrevious || onNext) && (
            <div className="mr-8 flex gap-1">
              <Button variant="ghost" size="icon-sm" disabled={!onPrevious} onClick={onPrevious}><ChevronLeftIcon /></Button>
              <Button variant="ghost" size="icon-sm" disabled={!onNext} onClick={onNext}><ChevronRightIcon /></Button>
            </div>
          )}
        </DialogHeader>
        {tabs && tabs.length > 1 && (
          <div className="flex gap-6 border-b px-8">
            {tabs.map((tab) => (
              <button key={tab.id} type="button" disabled={tab.disabled} onClick={() => onTabChange?.(tab.id)}
                className={cn(
                  "-mb-px border-b-2 py-3 text-sm font-medium transition-colors disabled:opacity-40",
                  tab.id === activeTab ? "border-primary text-primary" : "border-transparent text-tab-inactive hover:text-primary",
                )}>
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t px-8 py-3">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}
