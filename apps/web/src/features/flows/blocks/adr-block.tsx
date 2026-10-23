"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { FamilyChip } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { addAdrItems, deleteSpecificParade, saveSpecificParade, updateAdrItem } from "../block-actions";
import { contentError } from "../content/errors";
import type { StepBlock } from "../queries";
import type { BlockProps } from "./block-panel";
import { ItemActions } from "./item-actions";
import { LibraryPicker, type PickerItem } from "./library-picker";

type Item = StepBlock["adr"][number];
const picto = (n: number | null) => (n ? `SFX_PICTO_${String(n).padStart(4, "0")}` : "—");

/** ADR — risques de la bibliothèque, majeur, parades génériques et spécifiques (§5.5). */
export function AdrBlock({ block, canEdit }: BlockProps) {
  const t = useTranslations("blocks.adr");
  const tb = useTranslations("blocks");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const [picker, setPicker] = useState<PickerItem[] | null | false>(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = block.adr.find((i) => i.id === viewingId) ?? null;

  const openPicker = async () => {
    setPicker(null);
    const { data } = await createClient().from("library_risks")
      .select("id, name, source, family:label_families(id, short_name, long_name, color)").eq("active", true).is("deleted_at", null).order("name");
    const linked = new Set(block.adr.map((i) => i.library_risk_id));
    setPicker(((data ?? []) as unknown as (PickerItem & { source: string | null })[]).map((r) => ({ ...r, detail: r.source, disabled: linked.has(r.id) })));
  };

  return (
    <div className="flex flex-col gap-3">
      {canEdit && <Button className="self-start" onClick={openPicker}><PlusIcon data-icon="inline-start" />{t("add")}</Button>}
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-table-head">
          <th className="py-2 pr-3">{t("columns.family")}</th><th className="pr-3">{t("columns.risk")}</th><th className="pr-3">{t("columns.source")}</th>
          <th className="pr-3">{t("columns.major")}</th><th className="pr-3">{t("columns.pictogram")}</th><th className="w-10" />
        </tr></thead>
        <tbody>
          {block.adr.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">{t("empty")}</td></tr>}
          {block.adr.map((i) => (
            <tr key={i.id} className={cn("border-b", i.disabled && "text-muted-foreground line-through")}>
              <td className="py-2 pr-3"><FamilyChip color={i.risk?.family?.color} shortName={i.risk?.family?.short_name} longName={i.risk?.family?.long_name} /></td>
              <td className="pr-3 font-medium">{i.risk?.name}<div className="text-xs font-normal text-muted-foreground">{t("paradesCount", { count: (i.risk?.parades.length ?? 0) + i.parades.length })}</div></td>
              <td className="pr-3">{i.risk?.source ?? "—"}</td>
              <td className="pr-3">{i.major ? tg("yes") : tg("no")}</td>
              <td className="pr-3 text-xs">{picto(i.risk?.pictogram ?? null)}</td>
              <td><ItemActions table="block_adr_items" id={i.id} name={i.risk?.name ?? ""} disabled={i.disabled} canEdit={canEdit}
                onView={() => setViewingId(i.id)} onEdit={() => setEditing(i)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {picker !== false && (
        <LibraryPicker title={t("importTitle")} items={picker} onClose={() => setPicker(false)}
          onConfirm={async (ids) => {
            const res = await addAdrItems(block.id, ids);
            if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
            notify.success(tb("items.imported")); setPicker(false); router.refresh();
          }} />
      )}
      {editing && <AdrEditDialog item={editing} onClose={() => setEditing(null)} />}
      {viewing && <AdrViewDialog item={viewing} canEdit={canEdit && !viewing.disabled} onClose={() => setViewingId(null)} />}
    </div>
  );
}

function AdrEditDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const t = useTranslations("blocks.adr");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const [major, setMajor] = useState(item.major);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const res = await updateAdrItem(item.id, major);
    if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
    notify.success(tg("toast.saved")); router.refresh(); onClose();
  });
  return (
    <ModalShell onClose={onClose} size="sm" title={t("editTitle")} subtitle={item.risk?.name}
      footer={<><Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button><Button onClick={save} disabled={pending}>{tg("actions.save")}</Button></>}>
      <Field orientation="horizontal"><Switch id="adr-major" checked={major} onCheckedChange={setMajor} /><FieldLabel htmlFor="adr-major">{t("columns.major")}</FieldLabel></Field>
    </ModalShell>
  );
}

function AdrViewDialog({ item, canEdit, onClose }: { item: Item; canEdit: boolean; onClose: () => void }) {
  const t = useTranslations("blocks.adr");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const [form, setForm] = useState<{ id?: string; name: string; pictogram: string } | null>(null);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [pending, start] = useTransition();
  const r = item.risk;
  const save = () => start(async () => {
    if (!form) return;
    const res = await saveSpecificParade(item.id, { id: form.id, name: form.name, pictogram: form.pictogram ? Number(form.pictogram) : null });
    if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
    notify.success(tg("toast.saved")); setForm(null); router.refresh();
  });
  return (
    <ModalShell onClose={onClose} size="md" title={t("viewTitle")} subtitle={r?.name}>
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("columns.family")}</dt><dd>{r?.family?.short_name ?? "—"}</dd>
          <dt className="text-muted-foreground">{t("reference")}</dt><dd>{r?.reference ?? "—"}</dd>
          <dt className="text-muted-foreground">{t("columns.source")}</dt><dd>{r?.source ?? "—"}</dd>
          <dt className="text-muted-foreground">{t("landmark")}</dt><dd>{r?.landmark ?? "—"}</dd>
          <dt className="text-muted-foreground">{t("columns.pictogram")}</dt><dd>{picto(r?.pictogram ?? null)}</dd>
          <dt className="text-muted-foreground">{t("columns.major")}</dt><dd>{item.major ? tg("yes") : tg("no")}</dd>
        </dl>
        <section>
          <h4 className="mb-2 text-sm font-medium">{t("genericParades")}</h4>
          {(r?.parades.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">{t("noParade")}</p> : (
            <ul className="flex flex-col divide-y rounded-md border text-sm">
              {r!.parades.map((p) => <li key={p.id} className="flex gap-3 px-3 py-2"><span className="flex-1">{p.name}</span><span className="text-xs text-muted-foreground">{picto(p.pictogram)}</span></li>)}
            </ul>
          )}
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium">{t("specificParades")}</h4>
            {canEdit && <Button size="sm" variant="secondary" onClick={() => setForm({ name: "", pictogram: "" })}><PlusIcon data-icon="inline-start" />{t("addParade")}</Button>}
          </div>
          {item.parades.length === 0 ? <p className="text-sm text-muted-foreground">{t("noParade")}</p> : (
            <ul className="flex flex-col divide-y rounded-md border text-sm">
              {item.parades.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1">{p.name}</span><span className="text-xs text-muted-foreground">{picto(p.pictogram)}</span>
                  {canEdit && <>
                    <Button variant="ghost" size="icon-sm" aria-label={tg("actions.edit")} onClick={() => setForm({ id: p.id, name: p.name, pictogram: p.pictogram?.toString() ?? "" })}><PencilIcon /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={tg("actions.delete")} onClick={() => setToDelete({ id: p.id, name: p.name })}><Trash2Icon /></Button>
                  </>}
                </li>
              ))}
            </ul>
          )}
          {form && (
            <FieldGroup className="mt-3 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">{t("riskReminder", { name: r?.name ?? "" })}</p>
              <Field><FieldLabel htmlFor="par-name">{t("paradeName")} *</FieldLabel><Input id="par-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="par-picto">{t("pictogramNumber")}</FieldLabel><Input id="par-picto" type="number" min={1} max={240} value={form.pictogram} onChange={(e) => setForm({ ...form, pictogram: e.target.value })} /></Field>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setForm(null)}>{tg("actions.cancel")}</Button>
                <Button size="sm" onClick={save} disabled={pending || !form.name.trim()}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
              </div>
            </FieldGroup>
          )}
        </section>
      </div>
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }} title={t("deleteParade", { name: toDelete?.name ?? "" })}
        confirmLabel={tg("actions.delete")} onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteSpecificParade(toDelete.id);
          if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
          notify.success(tg("toast.deleted")); router.refresh();
        }} />
    </ModalShell>
  );
}
