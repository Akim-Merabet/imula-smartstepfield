"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardListIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { listLinkableForms, saveObjectFormLinks, type LinkableForm } from "./block-link-actions";

/** Bloc Objet › « Lier un formulaire » : liens formulaire de l'étape à associer à l'objet. */
export function LinkFormsDialog({ blockId, object, onClose }: { blockId: string; object: { id: string; name: string }; onClose: () => void }) {
  const t = useTranslations("technicalObjects.linkForms");
  const tg = useTranslations("global");
  const router = useRouter();
  const [items, setItems] = useState<LinkableForm[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    void listLinkableForms(blockId).then((res) => {
      if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error")); closeRef.current(); return; }
      setItems(res.data);
      setSelected(new Set(res.data.filter((l) => l.linkedObjectId === object.id).map((l) => l.id)));
    });
  }, [blockId, object.id, tg]);
  const save = async () => {
    setBusy(true);
    const res = await saveObjectFormLinks(blockId, object.id, [...selected]);
    setBusy(false);
    if (!res.ok) { notify.error(t.has(`errors.${res.error}`) ? t(`errors.${res.error}` as never) : res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error")); return; }
    notify.success(t("saved"));
    router.refresh();
    onClose();
  };
  return (
    <ModalShell onClose={onClose} size="sm" icon={<ClipboardListIcon className="mt-1 size-5 text-primary" />} title={t("title", { name: object.name })} subtitle={t("hint")}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
        <Button onClick={save} disabled={busy || !items?.length}>{busy && <Spinner data-icon="inline-start" />}{t("confirm")}</Button>
      </>}>
      {!items ? <div className="flex justify-center py-12"><Spinner /></div> : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((l) => {
            const locked = l.blockState !== "redaction" || l.responses > 0;
            return (
              <label key={l.id} className="flex items-start gap-2 rounded border px-3 py-2 text-sm">
                <Checkbox checked={selected.has(l.id)} disabled={locked}
                  onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(l.id); else n.delete(l.id); return n; })} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium">{l.formName}</span>
                  {l.linkedObjectName && l.linkedObjectId !== object.id && <span className="text-xs text-muted-foreground">{t("linkedTo", { name: l.linkedObjectName })}</span>}
                  {l.blockState !== "redaction" && <Badge variant="outline" className="self-start">{t("notRedaction")}</Badge>}
                  {l.responses > 0 && <Badge variant="outline" className="self-start">{t("errors.has_responses")}</Badge>}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}
