"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

/** Confirmation destructive avec saisie d'un mot (SUPPRIMER, REINITIALISER…) — spec 00 §5.4. */
export function ConfirmDialog({ open, onOpenChange, title, description, word, confirmLabel, onConfirm, destructive = true }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: ReactNode;
  word?: string; confirmLabel?: string; onConfirm: () => void | Promise<void>; destructive?: boolean;
}) {
  const t = useTranslations("global");
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const blocked = word ? typed.trim().toUpperCase() !== word : false;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) setTyped(""); onOpenChange(o); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {word && (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">{t("confirm.typeToConfirm", { word })}</span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={blocked || pending}
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            onClick={async (e) => {
              e.preventDefault();
              setPending(true);
              try { await onConfirm(); onOpenChange(false); setTyped(""); } finally { setPending(false); }
            }}>
            {confirmLabel ?? t("actions.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
