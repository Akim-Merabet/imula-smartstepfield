"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { PasswordField } from "@/components/auth/password-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { setNewPassword, type NewPasswordState } from "../../reset-password/actions";

export function NewPasswordForm() {
  const t = useTranslations("auth");
  const [password, setPassword] = useState("");
  const [state, action, pending] = useActionState<NewPasswordState, FormData>(setNewPassword, undefined);

  if (state?.done) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <AlertDescription>{t("newPassword.success")}</AlertDescription>
        </Alert>
        <Button asChild>
          <Link href="/explore/projects">{t("reset.backToLogin")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error === "mismatch" ? t("newPassword.mismatch") : t("login.error")}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <PasswordField value={password} onChange={setPassword} />
        <Field>
          <FieldLabel htmlFor="confirm">{t("newPassword.confirm")}</FieldLabel>
          <Input id="confirm" name="confirm" type="password" required />
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending}>{t("newPassword.submit")}</Button>
    </form>
  );
}
