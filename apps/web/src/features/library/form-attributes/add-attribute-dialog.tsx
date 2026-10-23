"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { GroupIcon } from "lucide-react";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useBuilder } from "@/features/forms/builder/builder-context";
import { addObjectAttributeQuestions, listObjectAttributes, type AttributeOption } from "./actions";

/** Bouton « Ajouter un attribut d'objet » d'une rubrique question (option du formulaire activée, spec 03 §3.7). */
export function AddObjectAttributeButton({ rubricId }: { rubricId: string }) {
  const t = useTranslations("technicalObjects.formAttributes");
  const { data, run, formId, editable } = useBuilder();
  const [items, setItems] = useState<AttributeOption[] | null | false>(false);
  if (!editable || data.form.object_attributes_link === "disabled") return null;
  return (
    <>
      <Button variant="outline" onClick={async () => {
        setItems(null);
        const res = await run(() => listObjectAttributes(formId));
        setItems(res.ok ? res.data : false);
      }}><GroupIcon data-icon="inline-start" />{t("add")}</Button>
      {items !== false && <AttributePicker items={items} onClose={() => setItems(false)}
        onConfirm={async (ids) => {
          const res = await run(() => addObjectAttributeQuestions(formId, rubricId, ids), t("added", { count: ids.length }));
          if (res.ok) setItems(false);
        }} />}
    </>
  );
}

/** « Ajout d'attribut d'objet » : liste des attributs groupés par famille, recherche, sélection multiple. */
function AttributePicker({ items, onClose, onConfirm }: { items: AttributeOption[] | null; onClose: () => void; onConfirm: (ids: string[]) => Promise<void> }) {
  const t = useTranslations("technicalObjects.formAttributes");
  const tg = useTranslations("global");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, AttributeOption[]>();
    for (const i of items ?? []) {
      if (search && !i.name.toLowerCase().includes(search.toLowerCase())) continue;
      const k = i.group ?? t("defaultGroup");
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return [...m.entries()];
  }, [items, search, t]);
  return (
    <ModalShell onClose={onClose} size="sm" title={t("title")}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
        <Button disabled={!selected.size || busy} onClick={async () => { setBusy(true); await onConfirm([...selected]); setBusy(false); }}>
          {busy && <Spinner data-icon="inline-start" />}{t("confirm")}
        </Button>
      </>}>
      {!items ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">{t("list")}</span>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tg("list.searchPlaceholder")} aria-label={tg("actions.search")} />
          {groups.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>}
          {groups.map(([group, list]) => (
            <div key={group} className="flex flex-col gap-1">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group}</div>
              {list.map((i) => (
                <label key={i.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                  <Checkbox checked={selected.has(i.id) || i.used} disabled={i.used}
                    onCheckedChange={(v) => setSelected((s) => { const n = new Set(s); if (v) n.add(i.id); else n.delete(i.id); return n; })} />
                  <span className="flex-1">{i.name}</span>
                  <span className="text-xs text-muted-foreground">{t.has(`types.${i.type}`) ? t(`types.${i.type}` as never) : i.type}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}
