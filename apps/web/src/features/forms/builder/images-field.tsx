"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlusIcon, XIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { FORM_FILES_BUCKET } from "../meta";
import { addFormFile, deleteFormFile } from "./actions";
import { useBuilder } from "./builder-context";

/** Images attachées à une rubrique / question / option (Storage privé, chemin forms/<formId>/…). */
export function ImagesField({ ownerKind, ownerId }: { ownerKind: "rubric" | "question" | "option"; ownerId: string }) {
  const t = useTranslations("formBuilder.images");
  const { s, formId, editable, run } = useBuilder();
  const files = s.files.filter((f) => f.owner_id === ownerId).sort((a, b) => a.position - b.position);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const paths = files.map((f) => f.storage_path).join("|");

  useEffect(() => {
    if (!paths) return;
    createClient().storage.from(FORM_FILES_BUCKET).createSignedUrls(paths.split("|"), 3600).then(({ data }) => {
      setUrls(Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path ?? "", d.signedUrl as string])));
    });
  }, [paths]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    const supabase = createClient();
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) { notify.error(t("typeError")); continue; }
      const path = `forms/${formId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage.from(FORM_FILES_BUCKET).upload(path, file, { contentType: file.type });
      if (error) { notify.error(t("uploadError")); continue; }
      await run(() => addFormFile(formId, ownerKind, ownerId, path, file.name));
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{t("title")}</span>
        <span className="text-xs text-muted-foreground">{t("count", { count: files.length })}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {files.map((f) => (
          <div key={f.id} className="group relative size-20 overflow-hidden rounded border bg-muted">
            {urls[f.storage_path] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[f.storage_path]} alt={f.name ?? ""} className="size-full object-cover" />
            )}
            {editable && (
              <button type="button" aria-label={t("remove")} onClick={() => run(() => deleteFormFile(formId, f.id))}
                className="absolute top-0.5 right-0.5 hidden rounded bg-background/90 p-0.5 group-hover:block">
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        {editable && (
          <Button variant="outline" className="size-20 flex-col text-xs" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Spinner /> : <ImagePlusIcon />}{t("add")}
          </Button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
    </div>
  );
}
