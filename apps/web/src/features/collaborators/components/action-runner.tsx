"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { notify } from "@/components/common/notify";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Result = { ok: true; data?: unknown } | { ok: false; error: string; details?: unknown };
export type Dep = { type: string; name: string };

const KNOWN_ERRORS = new Set([
  "email_conflict", "sso_conflict", "register_conflict", "invite_failed", "self", "name_conflict", "device_conflict",
  "tablet_disabled", "skill_duplicate", "skill_dates",
]);

/** Message d'erreur traduit d'une server action du module. */
export function useErrorMessage() {
  const t = useTranslations("collaborators.errors");
  const tg = useTranslations("global.toast");
  return (error: string) => (KNOWN_ERRORS.has(error) ? t(error as never) : error === "forbidden" ? tg("forbidden") : tg("error"));
}

/** Exécute une action, affiche le toast, rafraîchit, et ouvre la liste des dépendances si suppression bloquée. */
export function useActionRunner() {
  const router = useRouter();
  const message = useErrorMessage();
  const [deps, setDeps] = useState<Dep[] | null>(null);
  const run = async (fn: () => Promise<Result>, success: string) => {
    const res = await fn();
    if (res.ok) { notify.success(success); router.refresh(); return true; }
    if (res.error === "in_use" && Array.isArray(res.details)) { setDeps(res.details as Dep[]); return false; }
    notify.error(message(res.error));
    return false;
  };
  return { run, deps, clearDeps: () => setDeps(null) };
}

/** Modale « Impossible d'effectuer la suppression » listant les dépendances. */
export function DependenciesDialog({ deps, onClose }: { deps: Dep[] | null; onClose: () => void }) {
  const t = useTranslations("collaborators.errors");
  const tg = useTranslations("global.actions");
  return (
    <AlertDialog open={!!deps} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("inUseTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("inUseText")}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="flex max-h-64 list-disc flex-col gap-1 overflow-y-auto pl-5 text-sm">
          {deps?.map((d, i) => <li key={`${d.type}-${i}`}>{t(`dep.${d.type}` as "dep.project", { name: d.name })}</li>)}
        </ul>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>{tg("close")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
