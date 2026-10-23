"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { EllipsisVerticalIcon, EyeIcon, EyeOffIcon, LockIcon, PlusIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Tables } from "@/lib/supabase/database.types";
import { createLayer, deleteLayer, updateLayer } from "./actions";

type Layer = Tables<"project_geojson_layers">;
const MAX_BYTES = 5_000_000;

/** Couches GeoJSON de l'entité (§3.3) : ajout, couleur, afficher / masquer, bloquer / débloquer, supprimer. */
export function LayersSheet({ open, onOpenChange, projectId, layers, permissions }: {
  open: boolean; onOpenChange: (o: boolean) => void; projectId: string; layers: Layer[];
  permissions: { add: boolean; edit: boolean; delete: boolean };
}) {
  const t = useTranslations("flowViews.map.geoJson");
  const tg = useTranslations("global");
  const locale = useLocale();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ name: string; color: string; visible: boolean; file: File | null }>({ name: "", color: "#16a34a", visible: true, file: null });
  const [toDelete, setToDelete] = useState<Layer | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, failKey: string) => start(async () => {
    const res = await fn();
    if (!res.ok) { notify.error(res.error === "forbidden" ? tg("toast.forbidden") : t(failKey)); return; }
    notify.success(success);
    router.refresh();
  });

  const add = () => {
    const file = form.file;
    if (!file || !form.name.trim()) { notify.error(t("required")); return; }
    if (file.size > MAX_BYTES) { notify.error(t("tooLarge")); return; }
    start(async () => {
      let data: Record<string, unknown>;
      try { data = JSON.parse(await file.text()); } catch { notify.error(t("invalidFile")); return; }
      const res = await createLayer(projectId, { name: form.name, file_name: file.name, color: form.color, visible: form.visible, data });
      if (!res.ok) { notify.error(res.error === "invalid_geojson" ? t("invalidFile") : res.error === "forbidden" ? tg("toast.forbidden") : t("addFail")); return; }
      notify.success(t("added"));
      setAdding(false); setForm({ name: "", color: "#16a34a", visible: true, file: null });
      router.refresh();
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
          {permissions.add && !adding && (
            <Button className="self-start" onClick={() => setAdding(true)}><PlusIcon data-icon="inline-start" />{t("add")}</Button>
          )}
          {adding && (
            <FieldGroup className="rounded-md border p-3">
              <div className="font-medium">{t("fileSelectionTitle")}</div>
              <Field><FieldLabel htmlFor="layer-name">{t("name")} *</FieldLabel>
                <Input id="layer-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor="layer-file">{t("file")} *</FieldLabel>
                <Input id="layer-file" type="file" accept=".geojson,.json,application/geo+json,application/json"
                  onChange={(e) => { const f = e.target.files?.[0] ?? null; setForm((s) => ({ ...s, file: f, name: s.name || (f?.name.replace(/\.(geo)?json$/i, "") ?? "") })); }} /></Field>
              <div className="flex items-end gap-4">
                <Field className="w-24"><FieldLabel htmlFor="layer-color">{t("color")}</FieldLabel>
                  <Input id="layer-color" type="color" className="h-9 p-1" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></Field>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <Checkbox checked={form.visible} onCheckedChange={(v) => setForm({ ...form, visible: !!v })} />{t("showOnMap")}
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setAdding(false)}>{tg("actions.cancel")}</Button>
                <Button onClick={add} disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{tg("actions.save")}</Button>
              </div>
            </FieldGroup>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead><TableHead>{t("color")}</TableHead><TableHead>{t("createdAt")}</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {layers.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">{t("empty")}</TableCell></TableRow>}
              {layers.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {l.visible ? <EyeIcon className="size-3.5 text-muted-foreground" /> : <EyeOffIcon className="size-3.5 text-muted-foreground" />}
                      {l.locked && <LockIcon className="size-3.5 text-muted-foreground" aria-label={t("locked")} />}
                      <span className="truncate">{l.name}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <input type="color" aria-label={t("changeColor")} value={l.color} disabled={!permissions.edit || l.locked}
                      className="h-6 w-10 cursor-pointer rounded border disabled:cursor-not-allowed"
                      onChange={(e) => { const color = e.target.value; run(() => updateLayer(l.id, { color }), tg("toast.saved"), "updateFail"); }} />
                  </TableCell>
                  <TableCell className="text-xs">{new Date(l.created_at).toLocaleDateString(locale)}</TableCell>
                  <TableCell className="text-right">
                    {(permissions.edit || permissions.delete) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t("options")}><EllipsisVerticalIcon /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            {permissions.edit && <DropdownMenuItem onSelect={() => run(() => updateLayer(l.id, { visible: !l.visible }), tg("toast.saved"), "updateFail")}>{l.visible ? t("hide") : t("show")}</DropdownMenuItem>}
                            {permissions.edit && <DropdownMenuItem onSelect={() => run(() => updateLayer(l.id, { locked: !l.locked }), tg("toast.saved"), "updateFail")}>{l.locked ? t("unlock") : t("lock")}</DropdownMenuItem>}
                            {permissions.delete && <DropdownMenuItem variant="destructive" disabled={l.locked} onSelect={() => setToDelete(l)}>{tg("actions.delete")}</DropdownMenuItem>}
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title={t("deleteConfirm")}
          onConfirm={async () => {
            if (!toDelete) return;
            const res = await deleteLayer(toDelete.id);
            if (!res.ok) { notify.error(t("deleteFail")); return; }
            notify.success(t("deleted"));
            setToDelete(null);
            router.refresh();
          }} />
      </SheetContent>
    </Sheet>
  );
}
