"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { requestReset, type ResetState } from "./actions";

export function ResetForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<ResetState, FormData>(requestReset, undefined);

  return (
    <form action={action} className="flex flex-col gap-6">
      {state?.sent && (
        <Alert>
          <AlertDescription>{t("reset.sent")}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">{t("login.email")}</FieldLabel>
          <Input id="email" name="email" type="email" required autoFocus />
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending}>
        {pending && <Spinner data-icon="inline-start" />}
        {t("reset.submit")}
      </Button>
      <Link href="/auth" className="text-center text-sm text-info hover:underline">
        {t("reset.backToLogin")}
      </Link>
    </form>
  );
}
