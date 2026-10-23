"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { notify } from "@/components/common/notify";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { moveCollaborator } from "../actions";
import { useErrorMessage } from "./action-runner";

/** « Déplacer » un collaborateur vers une autre applicabilité (SFA, GA). */
export function MoveDialog({ item, onClose, accounts }: {
  item: { id: string; first_name: string; last_name: string; account_id: string } | null; onClose: () => void;
  accounts: { id: string; name: string }[];
}) {
  const t = useTranslations("collaborators");
  const tg = useTranslations("global");
  const router = useRouter();
  const message = useErrorMessage();
  const [account, setAccount] = useState("");
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    if (!item) return;
    const res = await moveCollaborator(item.id, account);
    if (!res.ok) { notify.error(message(res.error)); return; }
    notify.success(t("toast.moved"));
    onClose();
    router.refresh();
  });
  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("move.title", { name: item ? `${item.first_name} ${item.last_name}` : "" })}</DialogTitle>
          <DialogDescription className="sr-only">{t("move.account")}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>{t("move.account")}</FieldLabel>
          <Select value={account || undefined} onValueChange={setAccount}>
            <SelectTrigger><SelectValue placeholder={tg("actions.select")} /></SelectTrigger>
            <SelectContent><SelectGroup>
              {accounts.filter((a) => a.id !== item?.account_id).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{tg("actions.cancel")}</Button>
          <Button disabled={!account || pending} onClick={submit}>{t("actions.move")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
