"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EllipsisIcon, EyeIcon, PencilIcon, PowerIcon, PowerOffIcon, Trash2Icon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ConfirmDialog } from "@/components/common/type-to-confirm";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteItem, setItemDisabled } from "../block-actions";
import { contentError } from "../content/errors";

type Table = "block_emm_items" | "block_adr_items" | "block_rhp_items";

/** Actions de ligne d'un élément de bloc : Voir, Éditer, Désactiver/Activer, Supprimer (R-BL-12). */
export function ItemActions({ table, id, name, disabled, canEdit, onView, onEdit }: {
  table: Table; id: string; name: string; disabled: boolean; canEdit: boolean; onView?: () => void; onEdit?: () => void;
}) {
  const tb = useTranslations("blocks");
  const tf = useTranslations("flowContent");
  const tg = useTranslations("global");
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const res = await fn();
    if (!res.ok) { notify.error(contentError(tf, tg, res.error)); return; }
    notify.success(tg("toast.saved")); router.refresh();
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={tg("actions.more")}><EllipsisIcon /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {onView && <DropdownMenuItem onSelect={onView}><EyeIcon />{tb("items.view")}</DropdownMenuItem>}
            {onEdit && canEdit && (
              <DropdownMenuItem onSelect={() => (disabled ? notify.warning(tb("items.disabledEdit")) : onEdit())}><PencilIcon />{tg("actions.edit")}</DropdownMenuItem>
            )}
            {canEdit && (
              <DropdownMenuItem onSelect={() => run(() => setItemDisabled(table, id, !disabled))}>
                {disabled ? <PowerIcon /> : <PowerOffIcon />}{disabled ? tg("actions.activate") : tg("actions.deactivate")}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}><Trash2Icon />{tg("actions.delete")}</DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={tb("items.deleteTitle", { name })} description={tg("confirm.noTrash")}
        confirmLabel={tg("actions.delete")} onConfirm={() => run(() => deleteItem(table, id))} />
    </>
  );
}
