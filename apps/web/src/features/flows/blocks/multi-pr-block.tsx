"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownToLineIcon, ArrowUpToLineIcon, ChevronDownIcon, ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, CopyIcon, EllipsisIcon,
  EyeIcon, EyeOffIcon, GripVerticalIcon, PenLineIcon, PlusIcon, PowerIcon, PowerOffIcon, Trash2Icon,
} from "lucide-react";
import { notify } from "@/components/common/notify";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { ModalShell } from "@/components/dialogs/modal-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BlockDocuments } from "@/features/documents/block/block-documents";
import {
  addMultiPrItem, deleteMultiPrItem, deleteMultiPrSignature, duplicateMultiPrItem, reorderMultiPrItems, setMultiPrField,
  signMultiPrItem, updateMultiPrItem, updateMultiPrOptions,
} from "../block-actions";
import { SimpleSelect } from "../components/simple-select";
import { contentError } from "../content/errors";
import { MULTI_PR_MAX_ITEMS } from "../meta";
import type { StepBlock } from "../queries";
import type { BlockEnv, BlockProps } from "./block-panel";
import { RichEditor } from "./rich-editor";
import { SignatureCanvas } from "./signature-canvas";

type Item = StepBlock["mpr"][number];

/** MULTI_PR — sous-blocs ordonnés avec statut, signature et observation (§5.9). */
export function MultiPrBlock({ block, env, canEdit }: BlockProps) {
  const t = useTranslations("blocks.multiPr");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(block.mpr.slice(0, 1).map((i) => i.id)));
  const [order, setOrder] = useState<string[] | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const items = order ? (order.map((id) => block.mpr.find((i) => i.id === id)).filter(Boolean) as Item[]) : block.mpr;
  const requirement = block.multi_pr_requires_signature ? "both" : block.multi_pr_requires_status ? "status" : null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok = tg("toast.saved")) => {
    const res = await fn();
    if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return false; }
    notify.success(ok); router.refresh(); return true;
  };
  const setOption = (patch: Partial<{ multi_pr_title_hidden: boolean; multi_pr_requires_status: boolean; multi_pr_requires_signature: boolean }>) => {
    const next = { multi_pr_title_hidden: block.multi_pr_title_hidden, multi_pr_requires_status: block.multi_pr_requires_status, multi_pr_requires_signature: block.multi_pr_requires_signature, ...patch };
    if (!next.multi_pr_requires_status) next.multi_pr_requires_signature = false;
    void run(() => updateMultiPrOptions(block.id, next));
  };
  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    if (expanded.size) { notify.warning(t("collapseFirst")); return; }
    const ids = items.map((i) => i.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    setOrder(next);
    if (!(await run(() => reorderMultiPrItems(block.id, next)))) setOrder(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 rounded-md border px-4 py-2 text-sm">
        <label className="flex items-center gap-2"><Switch checked={!block.multi_pr_title_hidden} disabled={!canEdit} onCheckedChange={(v) => setOption({ multi_pr_title_hidden: !v })} />{t("showTitles")}</label>
        <label className="flex items-center gap-2"><Switch checked={block.multi_pr_requires_status} disabled={!canEdit} onCheckedChange={(v) => setOption({ multi_pr_requires_status: v })} />{t("requiresStatus")}</label>
        <label className="flex items-center gap-2" title={t("signatureRequiresStatus")}>
          <Switch checked={block.multi_pr_requires_signature} disabled={!canEdit || !block.multi_pr_requires_status} onCheckedChange={(v) => setOption({ multi_pr_requires_signature: v })} />{t("requiresSignature")}
        </label>
        {requirement && <Badge variant="secondary">{t(`requirement.${requirement}`)}</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">{t("count", { count: items.length, max: MULTI_PR_MAX_ITEMS })}</span>
        <Button variant="ghost" size="icon-sm" aria-label={expanded.size ? t("collapseAll") : t("expandAll")} onClick={() => setExpanded(expanded.size ? new Set() : new Set(items.map((i) => i.id)))}>
          {expanded.size ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
        </Button>
      </div>
      <DndContext id={`mpr-${block.id}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item, idx) => (
            <MultiPrItem key={item.id} item={item} index={idx + 1} block={block} env={env} canEdit={canEdit} run={run}
              open={expanded.has(item.id)} toggle={() => setExpanded((s) => { const n = new Set(s); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; })} />
          ))}
        </SortableContext>
      </DndContext>
      {canEdit && items.length < MULTI_PR_MAX_ITEMS && (
        <Button variant="secondary" className="self-start" onClick={() => run(() => addMultiPrItem(block.id, null, "end"))}><PlusIcon data-icon="inline-start" />{t("add")}</Button>
      )}
      <BlockDocuments block={{ id: block.id, type: "multi_pr" }} flowId={env.flow.id} projectId={env.flow.projectId} canEdit={canEdit} />
    </div>
  );
}

function MultiPrItem({ item, index, block, env, canEdit, run, open, toggle }: {
  item: Item; index: number; block: StepBlock; env: BlockEnv; canEdit: boolean; open: boolean; toggle: () => void;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => Promise<boolean>;
}) {
  const t = useTranslations("blocks.multiPr");
  const tg = useTranslations("global");
  const format = useFormatter();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id, disabled: !canEdit || open });
  const [title, setTitle] = useState(item.title ?? "");
  const [draft, setDraft] = useState<{ html: string; json: unknown } | null>(null);
  const [obs, setObs] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "deleteSignature" | null>(null);
  const fieldEditable = env.permissions.fieldData && !item.disabled && !env.step.disabled;
  const shownTitle = item.title || t("defaultTitle", { index });

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-md border bg-white", item.disabled && "opacity-60")}>
      <div className="flex items-center gap-2 px-3 py-2">
        {canEdit && !open && <button type="button" className="cursor-grab text-muted-foreground" aria-label="drag" {...attributes} {...listeners}><GripVerticalIcon className="size-4" /></button>}
        <button type="button" onClick={toggle} aria-label={open ? t("collapse") : t("expand")}>{open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}</button>
        <span className="text-xs font-semibold text-muted-foreground">{index}</span>
        {!block.multi_pr_title_hidden && (canEdit ? (
          <Input className="h-8 max-w-md" value={title} placeholder={t("defaultTitle", { index })} onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title !== (item.title ?? "")) void run(() => updateMultiPrItem(item.id, { title })); }} />
        ) : <span className={cn("font-medium", item.disabled && "line-through")}>{shownTitle}</span>)}
        <span className="flex-1" />
        {item.hide_on_export && <Badge variant="outline"><EyeOffIcon />{t("hiddenOnExport")}</Badge>}
        {item.status && <Badge className="text-white" style={{ backgroundColor: item.status.color }}>{item.status.name}</Badge>}
        {item.signature && <Badge className="bg-success-bg text-success"><PenLineIcon />{item.signature.signatory?.trigram ?? ""}</Badge>}
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => run(() => updateMultiPrItem(item.id, { disabled: !item.disabled }))}>{item.disabled ? <PowerIcon /> : <PowerOffIcon />}{item.disabled ? tg("actions.activate") : tg("actions.deactivate")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => run(() => updateMultiPrItem(item.id, { hide_on_export: !item.hide_on_export }))}>{item.hide_on_export ? <EyeIcon /> : <EyeOffIcon />}{item.hide_on_export ? t("showOnExport") : t("hideOnExport")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => run(() => addMultiPrItem(block.id, item.id, "above"))}><ArrowUpToLineIcon />{t("insertAbove")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => run(() => addMultiPrItem(block.id, item.id, "below"))}><ArrowDownToLineIcon />{t("insertBelow")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => run(() => duplicateMultiPrItem(item.id))}><CopyIcon />{tg("actions.duplicate")}</DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup><DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}><Trash2Icon />{tg("actions.delete")}</DropdownMenuItem></DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-t px-3 py-3">
          <RichEditor content={item.content_json ?? item.content_html} editable={canEdit && !item.disabled} placeholder={t("placeholder")} onChange={(html, json) => setDraft({ html, json })} />
          {canEdit && draft && (
            <Button size="sm" className="self-end" onClick={async () => { if (await run(() => updateMultiPrItem(item.id, { content_html: draft.html, content_json: draft.json }))) setDraft(null); }}>{tg("actions.save")}</Button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>{t("status")}{block.multi_pr_requires_status && " *"}</FieldLabel>
              <SimpleSelect value={item.custom_status_id} disabled={!fieldEditable}
                options={env.multiPrStatuses.map((s) => ({ value: s.id, label: s.name, color: s.color }))}
                onChange={(v) => void run(() => setMultiPrField(item.id, { custom_status_id: v }))} />
            </Field>
            <Field>
              <FieldLabel>{t("signature")}{block.multi_pr_requires_signature && " *"}</FieldLabel>
              {item.signature ? (
                <div className="flex items-center gap-2 text-sm">
                  {item.signature.signature_path && <img src={item.signature.signature_path} alt={t("signature")} className="h-9 rounded border" />}
                  <span>{item.signature.signatory ? `${item.signature.signatory.first_name} ${item.signature.signatory.last_name}` : "—"} · {format.dateTime(new Date(item.signature.signed_at), { dateStyle: "short", timeStyle: "short" })}</span>
                  {env.permissions.deleteSignature && <Button variant="ghost" size="icon-sm" aria-label={t("deleteSignature")} onClick={() => setConfirm("deleteSignature")}><Trash2Icon /></Button>}
                </div>
              ) : env.permissions.sign && fieldEditable ? (
                <Button size="sm" variant="secondary" className="self-start" onClick={() => setSigning(true)}><PenLineIcon data-icon="inline-start" />{t("sign")}</Button>
              ) : <span className="text-sm text-muted-foreground">—</span>}
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor={`obs-${item.id}`}>{t("observation")}</FieldLabel>
            <Textarea id={`obs-${item.id}`} maxLength={4000} disabled={!fieldEditable} value={obs ?? item.observation ?? ""} onChange={(e) => setObs(e.target.value)} />
            {obs !== null && obs !== (item.observation ?? "") && (
              <Button size="sm" className="self-end" onClick={async () => { if (await run(() => setMultiPrField(item.id, { observation: obs }))) setObs(null); }}>{t("saveObservation")}</Button>
            )}
          </Field>
        </div>
      )}
      {signing && <MultiPrSignDialog itemId={item.id} title={shownTitle} onClose={() => setSigning(false)} run={run} />}
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title={confirm === "delete" ? t("deleteTitle", { name: shownTitle }) : t("deleteSignatureTitle")} description={tg("confirm.noTrash")}
        word={confirm === "deleteSignature" ? "SUPPRIMER" : undefined} confirmLabel={tg("actions.delete")}
        onConfirm={async () => { await run(() => (confirm === "delete" ? deleteMultiPrItem(item.id) : deleteMultiPrSignature(item.id)), tg("toast.deleted")); }} />
    </div>
  );
}

function MultiPrSignDialog({ itemId, title, onClose, run }: {
  itemId: string; title: string; onClose: () => void; run: (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => Promise<boolean>;
}) {
  const t = useTranslations("blocks.multiPr");
  const tg = useTranslations("global");
  const [image, setImage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <ModalShell onClose={onClose} size="sm" title={t("signTitle")} subtitle={title}
      footer={<><Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
        <Button disabled={!image || pending} onClick={() => start(async () => { if (await run(() => signMultiPrItem(itemId, { signature_data: image!, signed_at: new Date().toISOString() }))) onClose(); })}>
          {pending && <Spinner data-icon="inline-start" />}{t("sign")}
        </Button></>}>
      <SignatureCanvas onChange={setImage} />
    </ModalShell>
  );
}
