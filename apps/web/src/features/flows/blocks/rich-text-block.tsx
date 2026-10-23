"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { notify } from "@/components/common/notify";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BlockDocuments } from "@/features/documents/block/block-documents";
import { saveBlockContent, setTxtVisibility } from "../block-actions";
import { contentError } from "../content/errors";
import type { BlockProps } from "./block-panel";
import { RichEditor } from "./rich-editor";

/** PR (instruction) et TXT (texte, visibilité MobileApp / Document) — §5.2, §5.3. */
export function RichTextBlock({ block, env, canEdit }: BlockProps) {
  const t = useTranslations("blocks");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const [draft, setDraft] = useState<{ html: string; json: unknown } | null>(null);
  const [pending, start] = useTransition();
  const isTxt = block.type === "txt";
  const visibility = block.txt_visibility ?? "mobile_app";

  const save = () => start(async () => {
    if (!draft) return;
    const res = await saveBlockContent(block.id, draft.html, draft.json);
    if (!res.ok) { notify.error(res.error === "too_large" ? t("errors.tooLarge") : contentError(tf, tg, res.error)); return; }
    notify.success(tg("toast.saved")); setDraft(null); router.refresh();
  });
  const setVisibility = (v: string) => start(async () => {
    if (!v || v === visibility) return;
    const res = await setTxtVisibility(block.id, v as "mobile_app" | "document");
    if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-3">
      {isTxt && (
        <div className="flex flex-col gap-2">
          <ToggleGroup type="single" variant="outline" value={visibility} onValueChange={setVisibility} disabled={!canEdit} className="justify-start">
            <ToggleGroupItem value="mobile_app" className="px-3">{t("txt.mobileApp")}</ToggleGroupItem>
            <ToggleGroupItem value="document" className="px-3">{t("txt.document")}</ToggleGroupItem>
          </ToggleGroup>
          <Alert><AlertDescription>{t(visibility === "document" ? "txt.documentHelp" : "txt.mobileAppHelp")}</AlertDescription></Alert>
        </div>
      )}
      <RichEditor
        content={block.content_json ?? block.content_html}
        editable={canEdit}
        placeholder={isTxt ? t(visibility === "document" ? "txt.placeholderClient" : "txt.placeholderOperator") : t("pr.placeholder")}
        onChange={(html, json) => setDraft({ html, json })}
      />
      {canEdit && (
        <div className="flex justify-end gap-2">
          {draft && <span className="self-center text-xs text-muted-foreground">{t("unsaved")}</span>}
          <Button onClick={save} disabled={!draft || pending}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
        </div>
      )}
      <BlockDocuments block={{ id: block.id, type: isTxt ? "txt" : "pr" }} flowId={env.flow.id} projectId={env.flow.projectId} canEdit={canEdit} />
    </div>
  );
}
