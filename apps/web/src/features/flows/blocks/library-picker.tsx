"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { FamilyChip } from "@/components/common/status-badge";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SimpleSelect } from "../components/simple-select";
import { ShoppingBasketIcon } from "lucide-react";

export type PickerItem = {
  id: string; name: string; detail?: string | null;
  family: { id: string; short_name: string; long_name: string | null; color: string } | null; disabled?: boolean;
};

/** Modale d'import depuis la bibliothèque : filtres Famille + recherche, compteur, sélection multiple. */
export function LibraryPicker({ title, items, loading, onClose, onConfirm, extra, confirmLabel }: {
  title: string; items: PickerItem[] | null; loading?: boolean; onClose: () => void;
  onConfirm: (ids: string[]) => Promise<void>; extra?: ReactNode; confirmLabel?: string;
}) {
  const t = useTranslations("blocks.picker");
  const tg = useTranslations("global");
  const [q, setQ] = useState("");
  const [family, setFamily] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const families = useMemo(() => {
    const m = new Map<string, NonNullable<PickerItem["family"]>>();
    for (const i of items ?? []) if (i.family) m.set(i.family.id, i.family);
    return [...m.values()];
  }, [items]);
  const visible = (items ?? []).filter((i) => (!family || i.family?.id === family)
    && (!q || `${i.name} ${i.detail ?? ""}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <ModalShell onClose={onClose} size="md" icon={<EntityIcon kind="library" icon={ShoppingBasketIcon} size="md" />} title={title}
      subtitle={t("counter", { current: visible.length, total: items?.length ?? 0 })}
      footer={<>
        <span className="mr-auto self-center text-sm text-muted-foreground">{tg("list.selected", { count: selected.length })}</span>
        <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
        <Button disabled={!selected.length || pending} onClick={async () => { setPending(true); try { await onConfirm(selected); } finally { setPending(false); } }}>
          {pending && <Spinner data-icon="inline-start" />}{confirmLabel ?? tg("actions.import")}
        </Button>
      </>}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder={tg("list.searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
          <SimpleSelect value={family} onChange={setFamily} placeholder={t("family")}
            options={families.map((f) => ({ value: f.id, label: f.long_name ? `${f.short_name} - ${f.long_name}` : f.short_name, color: f.color }))} />
        </div>
        {extra}
        {!items || loading ? <div className="flex justify-center py-10"><Spinner /></div> : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{tg("list.emptySearch")}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {visible.map((i) => (
              <li key={i.id}>
                <label className={"flex items-center gap-3 px-3 py-2 text-sm " + (i.disabled ? "opacity-50" : "cursor-pointer hover:bg-row-hover")}>
                  <Checkbox disabled={i.disabled} checked={selected.includes(i.id)}
                    onCheckedChange={(v) => setSelected((s) => (v ? [...s, i.id] : s.filter((x) => x !== i.id)))} />
                  <FamilyChip color={i.family?.color} shortName={i.family?.short_name} longName={i.family?.long_name} />
                  <span className="min-w-0 flex-1 truncate font-medium">{i.name}</span>
                  {i.detail && <span className="truncate text-xs text-muted-foreground">{i.detail}</span>}
                  {i.disabled && <span className="text-xs text-muted-foreground">{t("alreadyLinked")}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  );
}
