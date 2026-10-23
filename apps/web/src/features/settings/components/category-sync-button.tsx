"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCwIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { Button } from "@/components/ui/button";
import { assignDefaultCategoriesToAllProjects, updateProjectDefaultCategories } from "../actions/families";
import { useRun } from "./use-run";

/** « Affecter à tous les projets » (catégories par défaut) ou « Mettre à jour les catégories par défaut » (entité). */
export function CategorySyncButton({ projectId }: { projectId?: string }) {
  const t = useTranslations("settings.categories");
  const run = useRun();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <RefreshCwIcon data-icon="inline-start" />{projectId ? t("sync") : t("assignAll")}
      </Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} destructive={false} word={projectId ? "METTRE A JOUR" : undefined}
        title={projectId ? t("sync") : t("assignAll")} description={projectId ? t("syncHelp") : t("assignAllHelp")}
        confirmLabel={projectId ? t("syncConfirm") : t("assignAllConfirm")}
        onConfirm={async () => {
          await run(() => (projectId ? updateProjectDefaultCategories(projectId) : assignDefaultCategoriesToAllProjects()), t("synced"));
        }} />
    </>
  );
}
