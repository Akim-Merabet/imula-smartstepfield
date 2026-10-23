"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { InfoIcon } from "lucide-react";
import { ResponseView, type ResponseViewProps, type ShareMode } from "@/features/forms/response/components/response-view";
import { setResponseStorageAdapter } from "@/features/forms/response/components/storage";
import { shareAddTableItem, shareSaveRubric, shareSendResponse, shareSetLastRubric } from "../public-actions";

type Props = Omit<ResponseViewProps, "share"> & { token: string; contributor: { name: string; email: string } };

/** Remplissage par un contributeur externe : moteur de réponse en mode partagé (spec 03 §9.2 étape 4). */
export function ShareResponse({ token, contributor, ...view }: Props) {
  const t = useTranslations("share.public.fill");
  const router = useRouter();
  const base = `/share/${token}`;

  // Fichiers (photos, PDF, signatures) via les route handlers liés à la session de partage.
  // Initialisé avant le premier rendu des enfants (leurs effets lisent les URL signées).
  useState(() => {
    setResponseStorageAdapter({
      upload: async (_responseId, file, name, sub) => {
        const body = new FormData();
        body.set("file", file, name);
        body.set("sub", sub);
        const res = await fetch(`${base}/files`, { method: "POST", body, credentials: "same-origin" });
        if (!res.ok) throw new Error("upload_failed");
        return ((await res.json()) as { path: string }).path;
      },
      signedUrl: async (path) => {
        const res = await fetch(`${base}/files?path=${encodeURIComponent(path)}`, { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) return null;
        return ((await res.json()) as { url: string | null }).url;
      },
    });
    return true;
  });

  const share: ShareMode = {
    saveRubric: (input) => shareSaveRubric(token, {
      rubricLineageId: input.rubricLineageId, observations: input.observations, activeRedirect: input.activeRedirect,
      lastRubricLineageId: input.lastRubricLineageId,
      cells: input.cells.map((c) => ({ lineageId: c.lineageId, value: c.value, filesAdded: c.filesAdded, filesRemoved: c.filesRemoved })),
    }),
    setLastRubric: (_id, rubric) => shareSetLastRubric(token, rubric),
    addTableItem: (_id, rubric, axis) => shareAddTableItem(token, rubric, axis),
    send: () => shareSendResponse(token),
    onSaveLater: () => router.push(`${base}/later`),
    onSent: () => router.replace(`${base}/finish`),
    labels: { send: t("send"), confirmTitle: t("confirmTitle"), confirmText: t("confirmText") },
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-info-bg px-6 py-2 text-sm text-info">
        <span className="flex items-center gap-1.5"><InfoIcon className="size-4" />{t("banner")}</span>
        <span className="text-muted-foreground">{t("as", contributor)}</span>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
        <ResponseView {...view} share={share} />
      </div>
    </div>
  );
}
