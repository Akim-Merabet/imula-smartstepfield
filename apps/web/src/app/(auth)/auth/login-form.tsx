"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { login, type LoginState } from "./actions";

export function LoginForm({ returnUrl }: { returnUrl?: string }) {
  const t = useTranslations("auth.login");
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="returnUrl" value={returnUrl ?? ""} />
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error === "blocked" ? t("blocked") : t("error")}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Spinner data-icon="inline-start" />}
        {t("submit")}
      </Button>
      <Link href="/reset-password" className="text-center text-sm text-info hover:underline">
        {t("forgot")}
      </Link>
    </form>
  );
}
