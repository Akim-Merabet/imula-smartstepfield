"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ClipboardListIcon, PlusIcon, UnlinkIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { LinkFormsDialog } from "@/features/library/objects/link-forms-dialog";
import { checkUnlinkObject, linkObjects, unlinkObject, type UnlinkCheck } from "../block-actions";
import { contentError } from "../content/errors";
import type { BlockProps } from "./block-panel";
import { LibraryPicker, type PickerItem } from "./library-picker";

/** OBJECT — objets techniques liés, dissociation avec pré-contrôle (§5.10). */
export function ObjectBlock({ block, canEdit }: BlockProps) {
  const t = useTranslations("blocks.object");
  const tb = useTranslations("blocks");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const format = useFormatter();
  const router = useRouter();
  const [picker, setPicker] = useState<PickerItem[] | null | false>(false);
  const [unlink, setUnlink] = useState<{ id: string; name: string } | null>(null);
  const [blocked, setBlocked] = useState<UnlinkCheck | null>(null);
  const [linkForms, setLinkForms] = useState<{ id: string; name: string } | null>(null);
  const tl = useTranslations("technicalObjects.linkForms");

  const openPicker = async () => {
    setPicker(null);
    const { data } = await createClient().from("technical_objects")
      .select("id, name, item_code, family:label_families(id, short_name, long_name, color)").is("deleted_at", null).order("name");
    const linked = new Set(block.objects.map((o) => o.technical_object_id));
    setPicker(((data ?? []) as unknown as (PickerItem & { item_code: string | null })[]).map((o) => ({ ...o, detail: o.item_code, disabled: linked.has(o.id) })));
  };
  const askUnlink = async (id: string, name: string) => {
    const res = await checkUnlinkObject(block.id, id);
    if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
    if (res.data.result !== "allowed") { setBlocked(res.data); return; }
    setUnlink({ id, name });
  };

  return (
    <div className="flex flex-col gap-3">
      {canEdit && <Button className="self-start" onClick={openPicker}><PlusIcon data-icon="inline-start" />{t("add")}</Button>}
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-table-head">
          <th className="py-2 pr-3">{t("columns.family")}</th><th className="pr-3">{t("columns.name")}</th><th className="pr-3">{t("columns.reference")}</th>
          <th className="pr-3">{t("columns.index")}</th><th className="pr-3">{t("columns.modification")}</th><th className="w-10" />
        </tr></thead>
        <tbody>
          {block.objects.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">{t("empty")}</td></tr>}
          {block.objects.map((o) => (
            <tr key={o.id} className="border-b">
              <td className="py-2 pr-3"><FamilyChip color={o.object?.family?.color} shortName={o.object?.family?.short_name} longName={o.object?.family?.long_name} /></td>
              <td className="pr-3 font-medium">{o.object?.name}</td>
              <td className="pr-3">{o.object?.item_code ?? "—"}</td>
              <td className="pr-3">{o.object?.object_index ?? "—"}</td>
              <td className="pr-3">{o.object ? format.dateTime(new Date(o.object.updated_at), { dateStyle: "short" }) : "—"}</td>
              <td className="whitespace-nowrap">{canEdit && <>
                <Button variant="ghost" size="icon-sm" aria-label={tl("action")} title={tl("action")} onClick={() => setLinkForms({ id: o.technical_object_id, name: o.object?.name ?? "" })}><ClipboardListIcon /></Button>
                <Button variant="ghost" size="icon-sm" aria-label={t("unlink")} onClick={() => askUnlink(o.technical_object_id, o.object?.name ?? "")}><UnlinkIcon /></Button>
              </>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {picker !== false && (
        <LibraryPicker title={t("importTitle")} items={picker} confirmLabel={t("link")} onClose={() => setPicker(false)}
          onConfirm={async (ids) => {
            const res = await linkObjects(block.id, ids);
            if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
            notify.success(tb("items.imported")); setPicker(false); router.refresh();
          }} />
      )}
      <ConfirmDialog open={!!unlink} onOpenChange={(o) => { if (!o) setUnlink(null); }} title={t("unlinkTitle", { name: unlink?.name ?? "" })}
        word="DISSOCIER" confirmLabel={t("unlink")} onConfirm={async () => {
          if (!unlink) return;
          const res = await unlinkObject(block.id, unlink.id);
          if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
          notify.success(t("unlinked")); router.refresh();
        }} />
      {linkForms && <LinkFormsDialog blockId={block.id} object={linkForms} onClose={() => setLinkForms(null)} />}
      {blocked && (
        <ModalShell onClose={() => setBlocked(null)} size="sm" title={t("blockedTitle")}>
          <div className="flex flex-col gap-3 text-sm">
            <p>{tf(`errors.${blocked.result}` as never)}</p>
            {blocked.forms.map((f) => (
              <div key={f.name}><div className="font-medium">{t("formResponses", { formName: f.name })}</div><ul className="list-disc pl-6">{f.responses.map((r) => <li key={r}>{r}</li>)}</ul></div>
            ))}
          </div>
        </ModalShell>
      )}
    </div>
  );
}
