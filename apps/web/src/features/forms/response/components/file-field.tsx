"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileTextIcon, ImagePlusIcon, PaperclipIcon, XIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MAX_PDF_BYTES } from "../../meta";
import type { FileRef } from "../../types";
import { signedUrl, uploadResponseFile } from "./storage";

function Thumb({ file, kind }: { file: FileRef; kind: "photo" | "file" }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; void signedUrl(file.fileId).then((u) => { if (on) setUrl(u); }); return () => { on = false; }; }, [file.fileId]);
  if (kind === "photo") {
    return url
      // eslint-disable-next-line @next/next/no-img-element
      ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={file.name ?? ""} className="size-20 rounded border object-cover" /></a>
      : <div className="flex size-20 items-center justify-center rounded border"><Spinner /></div>;
  }
  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-info hover:underline">
      <FileTextIcon className="size-4" />{file.name ?? file.fileId}
    </a>
  );
}

/** Photos (images, ordre d'ajout conservé) ou fichiers PDF (≤ 40 Mo) déposés dans Storage. */
export function FileField({ kind, value, onChange, disabled, responseId, compact }: {
  kind: "photo" | "file"; value: FileRef[] | null; onChange: (v: FileRef[] | null) => void; disabled: boolean;
  responseId: string; compact?: boolean;
}) {
  const t = useTranslations("responses.fields");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const files = value ?? [];

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    const next = [...files];
    try {
      for (const f of Array.from(list)) {
        if (kind === "file" && f.type !== "application/pdf") { notify.error(t("pdfOnly")); continue; }
        if (kind === "file" && f.size > MAX_PDF_BYTES) { notify.error(t("fileTooLarge")); continue; }
        if (kind === "photo" && !f.type.startsWith("image/")) { notify.error(t("imageOnly")); continue; }
        const path = await uploadResponseFile(responseId, f, f.name, kind === "photo" ? "photos" : "files");
        next.push({ fileId: path, name: f.name, position: next.length + 1, mime: f.type });
      }
      onChange(next.length ? next : null);
    } catch {
      notify.error(t("uploadFail"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = (fileId: string) => {
    const next = files.filter((f) => f.fileId !== fileId).map((f, i) => ({ ...f, position: i + 1 }));
    onChange(next.length ? next : null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className={compact ? "flex flex-wrap gap-1" : "flex flex-wrap gap-2"}>
        {files.map((f) => (
          <div key={f.fileId} className="relative flex items-center gap-1">
            <Thumb file={f} kind={kind} />
            {!disabled && (
              <Button variant="ghost" size="icon-xs" aria-label={t("removeFile")} onClick={() => remove(f.fileId)}><XIcon /></Button>
            )}
          </div>
        ))}
      </div>
      {!disabled && (
        <div>
          <input ref={input} type="file" hidden multiple={kind === "photo"} accept={kind === "photo" ? "image/*" : "application/pdf"}
            onChange={(e) => void add(e.target.files)} />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Spinner data-icon="inline-start" /> : kind === "photo" ? <ImagePlusIcon data-icon="inline-start" /> : <PaperclipIcon data-icon="inline-start" />}
            {kind === "photo" ? t("addPhoto") : t("addFile")}
          </Button>
        </div>
      )}
      {disabled && files.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
    </div>
  );
}
