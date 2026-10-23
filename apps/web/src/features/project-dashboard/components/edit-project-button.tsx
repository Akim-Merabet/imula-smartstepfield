"use client";

import { PencilIcon } from "lucide-react";
import { useDialog } from "@/components/shell/use-dialog";
import { Button } from "@/components/ui/button";

export function EditProjectButton({ projectId, label }: { projectId: string; label: string }) {
  const dialog = useDialog();
  return (
    <Button onClick={() => dialog.open(`project/edit/${projectId}/general-tab`)}>
      <PencilIcon data-icon="inline-start" />{label}
    </Button>
  );
}
