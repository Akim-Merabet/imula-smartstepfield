"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { PasswordField } from "@/components/auth/password-field";
import { notify } from "@/components/common/notify";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { checkPassword } from "@/lib/validation/password";
import { changePassword } from "../actions";

export function PasswordForm() {
  const t = useTranslations("profile.password");
  const tg = useTranslations("global");
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const valid = Object.values(checkPassword(newPassword)).every(Boolean) && newPassword === confirm && !!oldPassword;
  const messages: Record<string, string> = {
    mismatch: t("mismatch"), invalid_password: t("invalid"), weak: t("weak"), same: t("same"),
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) { setError("mismatch"); return; }
    start(async () => {
      const res = await changePassword({ oldPassword, newPassword, confirm });
      if (!res.ok) {
        setError(res.error);
        notify.error(messages[res.error] ?? tg("toast.error"));
        return;
      }
      setError(null); setOld(""); setNew(""); setConfirm("");
      notify.success(t("success"));
    });
  };

  return (
    <form onSubmit={submit} className="flex max-w-md flex-col gap-6 overflow-y-auto pb-6">
      <FieldGroup>
        <Field data-invalid={error === "invalid_password"}>
          <FieldLabel htmlFor="old-password">{t("old")} *</FieldLabel>
          <Input id="old-password" type="password" autoComplete="current-password" value={oldPassword}
            aria-invalid={error === "invalid_password"} onChange={(e) => setOld(e.target.value)} />
          {error === "invalid_password" && <FieldError>{t("invalid")}</FieldError>}
        </Field>
        <PasswordField id="new-password" name="new-password" value={newPassword} onChange={setNew} />
        <Field data-invalid={!!confirm && confirm !== newPassword}>
          <FieldLabel htmlFor="confirm-password">{t("confirm")} *</FieldLabel>
          <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm}
            aria-invalid={!!confirm && confirm !== newPassword} onChange={(e) => setConfirm(e.target.value)} />
          {!!confirm && confirm !== newPassword && <FieldError>{t("mismatch")}</FieldError>}
        </Field>
        {error && error !== "invalid_password" && error !== "mismatch" && <FieldError>{messages[error] ?? tg("toast.error")}</FieldError>}
      </FieldGroup>
      <div>
        <Button type="submit" disabled={pending || !valid}>{pending && <Spinner data-icon="inline-start" />}{t("submit")}</Button>
      </div>
    </form>
  );
}
