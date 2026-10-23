"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { addEmmItems, updateEmmItem } from "../block-actions";
import { contentError } from "../content/errors";
import type { StepBlock } from "../queries";
import type { BlockProps } from "./block-panel";
import { ItemActions } from "./item-actions";
import { LibraryPicker, type PickerItem } from "./library-picker";

type Item = StepBlock["emm"][number];

/** EMM — moyens issus de la bibliothèque (§5.4). */
export function EmmBlock({ block, canEdit }: BlockProps) {
  const t = useTranslations("blocks.emm");
  const tb = useTranslations("blocks");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const [picker, setPicker] = useState<PickerItem[] | null | false>(false);
  const [opts, setOpts] = useState({ quantity: "", unit: "", consumable: false });
  const [editing, setEditing] = useState<Item | null>(null);
  const [viewing, setViewing] = useState<Item | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const openPicker = async () => {
    setPicker(null);
    const { data } = await createClient().from("library_equipments")
      .select("id, name, reference, provider, family:label_families(id, short_name, long_name, color)").eq("active", true).is("deleted_at", null).order("name");
    setPicker(((data ?? []) as unknown as PickerItem[]).map((e) => ({ ...e, detail: (e as unknown as { reference: string | null }).reference })));
  };

  return (
    <div className="flex flex-col gap-3">
      {canEdit && <Button className="self-start" onClick={openPicker}><PlusIcon data-icon="inline-start" />{t("add")}</Button>}
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-table-head">
          <th className="py-2 pr-3">{t("columns.family")}</th><th className="pr-3">{t("columns.name")}</th><th className="pr-3">{t("columns.qu")}</th>
          <th className="pr-3">{t("columns.reference")}</th><th className="pr-3">{t("columns.provider")}</th><th className="w-10" />
        </tr></thead>
        <tbody>
          {block.emm.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">{t("empty")}</td></tr>}
          {block.emm.map((i) => (
            <tr key={i.id} className={cn("border-b", i.disabled && "text-muted-foreground line-through")}>
              <td className="py-2 pr-3"><FamilyChip color={i.family?.color} shortName={i.family?.short_name} longName={i.family?.long_name} /></td>
              <td className="pr-3">
                <div className="font-medium">{i.name}</div>
                <div className="flex flex-wrap gap-1">
                  {i.consumable && <Badge variant="secondary">{t("badges.consumable")}</Badge>}
                  {i.equipment?.subject_to_verification && <Badge variant="secondary">{t("badges.verification")}</Badge>}
                  {i.equipment?.validity_date && i.equipment.validity_date < today && <Badge variant="destructive">{t("badges.expired")}</Badge>}
                </div>
                {i.comment && <div className="text-xs text-muted-foreground">{i.comment}</div>}
              </td>
              <td className="pr-3">{i.quantity ?? "—"} {i.unit ?? ""}</td>
              <td className="pr-3">{i.reference ?? "—"}</td>
              <td className="pr-3">{i.provider ?? "—"}</td>
              <td><ItemActions table="block_emm_items" id={i.id} name={i.name} disabled={i.disabled} canEdit={canEdit}
                onView={() => setViewing(i)} onEdit={() => setEditing(i)} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {picker !== false && (
        <LibraryPicker title={t("importTitle")} items={picker} onClose={() => setPicker(false)}
          extra={
            <div className="grid grid-cols-3 items-end gap-3 rounded-md border p-3">
              <span className="col-span-3 text-xs font-medium text-muted-foreground">{t("importOptions")}</span>
              <Field><FieldLabel htmlFor="emm-q">{t("quantity")}</FieldLabel><Input id="emm-q" type="number" min={0} value={opts.quantity} onChange={(e) => setOpts({ ...opts, quantity: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="emm-u">{t("unit")}</FieldLabel><Input id="emm-u" value={opts.unit} onChange={(e) => setOpts({ ...opts, unit: e.target.value })} /></Field>
              <label className="flex items-center gap-2 pb-2 text-sm"><Checkbox checked={opts.consumable} onCheckedChange={(v) => setOpts({ ...opts, consumable: !!v })} />{t("consumable")}</label>
            </div>
          }
          onConfirm={async (ids) => {
            const res = await addEmmItems(block.id, ids, { quantity: opts.quantity ? Number(opts.quantity) : null, unit: opts.unit || null, consumable: opts.consumable || null });
            if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
            notify.success(tb("items.imported")); setPicker(false); router.refresh();
          }} />
      )}
      {editing && <EmmEditDialog item={editing} onClose={() => setEditing(null)} />}
      {viewing && (
        <ModalShell onClose={() => setViewing(null)} size="sm" title={t("viewTitle")}>
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t("columns.family")}</dt><dd>{viewing.family?.short_name ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("columns.name")}</dt><dd>{viewing.name}</dd>
            <dt className="text-muted-foreground">{t("columns.reference")}</dt><dd>{viewing.reference ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("columns.provider")}</dt><dd>{viewing.provider ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("validityDate")}</dt><dd>{viewing.equipment?.validity_date ?? "—"}</dd>
          </dl>
        </ModalShell>
      )}
    </div>
  );
}

function EmmEditDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const t = useTranslations("blocks.emm");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const [v, setV] = useState({ quantity: item.quantity?.toString() ?? "", unit: item.unit ?? "", consumable: item.consumable, comment: item.comment ?? "", display_comment: item.display_comment });
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const res = await updateEmmItem(item.id, { quantity: v.quantity ? Number(v.quantity) : null, unit: v.unit, consumable: v.consumable, comment: v.comment, display_comment: v.display_comment });
    if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
    notify.success(tg("toast.saved")); router.refresh(); onClose();
  });
  return (
    <ModalShell onClose={onClose} size="sm" title={t("editTitle")} subtitle={item.name}
      footer={<><Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button><Button onClick={save} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button></>}>
      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Field><FieldLabel htmlFor="ee-q">{t("quantity")}</FieldLabel><Input id="ee-q" type="number" min={0} value={v.quantity} onChange={(e) => setV({ ...v, quantity: e.target.value })} /></Field>
          <Field><FieldLabel htmlFor="ee-u">{t("unit")}</FieldLabel><Input id="ee-u" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.consumable} onCheckedChange={(x) => setV({ ...v, consumable: !!x })} />{t("consumable")}</label>
        <Field><FieldLabel htmlFor="ee-c">{t("comment")}</FieldLabel><Textarea id="ee-c" value={v.comment} onChange={(e) => setV({ ...v, comment: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={v.display_comment} onCheckedChange={(x) => setV({ ...v, display_comment: !!x })} />{t("displayComment")}</label>
      </FieldGroup>
    </ModalShell>
  );
}
