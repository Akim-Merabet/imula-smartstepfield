"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { notify } from "@/components/common/notify";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { requestShareCode, verifyShareCode } from "../public-actions";
import { publicErrorKey } from "./errors";

/** Saisie du code secret + « Renvoyer le code » (spec 03 §9.2 étape 2). */
export function LoginForm({ token, cooldownMs }: { token: string; cooldownMs: number }) {
  const t = useTranslations("share.public.login");
  const te = useTranslations("share.public.errors");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [resending, startResend] = useTransition();
  const [wait, setWait] = useState(Math.ceil(cooldownMs / 1000));

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const submit = () => start(async () => {
    setError(null);
    const res = await verifyShareCode(token, code);
    if (res.ok) { router.replace(res.data.next); return; }
    if (res.error === "blocked" || res.error === "expired" || res.error === "revoked" || res.error === "not_found") { router.refresh(); return; }
    setError(te(publicErrorKey(res.error)));
    const left = (res.details as { remaining?: number } | undefined)?.remaining;
    setRemaining(typeof left === "number" ? left : null);
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (code.length === 6) submit(); }}>
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="share-code">{t("code")}</FieldLabel>
          <Input id="share-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
            className="max-w-48 text-center font-mono text-lg tracking-[0.4em]" value={code} aria-invalid={!!error}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          {error && <FieldError>{error}{remaining !== null && ` · ${t("remaining", { count: remaining })}`}</FieldError>}
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || code.length !== 6}>{pending && <Spinner data-icon="inline-start" />}{t("submit")}</Button>
        <Button type="button" variant="ghost" disabled={resending || wait > 0} onClick={() => startResend(async () => {
          const res = await requestShareCode(token);
          if (!res.ok) {
            const ms = (res.details as { cooldownMs?: number } | undefined)?.cooldownMs;
            if (ms) setWait(Math.ceil(ms / 1000));
            notify.error(te(publicErrorKey(res.error)));
            return;
          }
          setWait(Math.ceil(res.data.cooldownMs / 1000));
          setError(null);
          notify.success(t("resent"));
        })}>
          {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
        </Button>
      </div>
    </form>
  );
}
