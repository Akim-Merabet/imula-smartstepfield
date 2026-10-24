"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import QRCode from "qrcode";
import { LinkIcon, QrCodeIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { ModalShell } from "@/components/dialogs/modal-shell";
import type { DialogProps } from "@/components/dialogs/types";
import { EntityIcon } from "@/components/shell/entity-icon";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { useErrorMessage } from "../components/action-runner";
import { familyLabel } from "../meta";
import { generateQuickConnection, unlinkQuickConnectionDevice, type QuickConnectionTarget } from "../quick-connection";

type Info = { name: string; family?: string | null; status?: string; disabled?: boolean };

/** ?dialog=quick-connection/user/<collaboratorId> · quick-connection/tablet/<tabletId> (spec 01 §2.9, §4.8). */
export default function QuickConnectionDialog({ segments, close }: DialogProps) {
  const t = useTranslations("collaborators.quickConnection");
  const tt = useTranslations("collaborators.tablet");
  const tg = useTranslations("global");
  const format = useFormatter();
  const message = useErrorMessage();
  const [type, id] = segments;
  const target: QuickConnectionTarget = { type: type === "tablet" ? "tablet" : "user", id };
  const isTablet = target.type === "tablet";
  const [info, setInfo] = useState<Info | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [qr, setQr] = useState<{ image: string; expiresAt: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    if (isTablet) {
      supabase.from("tablets").select("name, status, profile_status, family:label_families!tablets_family_id_fkey(short_name, long_name)")
        .eq("id", id).maybeSingle().then(({ data }) => {
          if (data) setInfo({ name: data.name, family: familyLabel(data.family), status: data.status, disabled: data.profile_status === "inactive" });
        });
    } else {
      supabase.from("collaborators").select("first_name, last_name").eq("id", id).maybeSingle().then(({ data }) => {
        if (data) setInfo({ name: `${data.first_name} ${data.last_name}` });
      });
    }
  }, [isTablet, id]);

  const generate = () => {
    if (!isTablet && !password) { setPasswordError(tg("validators.required")); return; }
    setPasswordError(null);
    start(async () => {
      const res = await generateQuickConnection(target, isTablet ? undefined : password);
      if (!res.ok) {
        if (res.error === "wrong_password") setPasswordError(t("wrongPassword"));
        else notify.error(message(res.error));
        return;
      }
      setQr({ image: await QRCode.toDataURL(res.data.payload, { width: 320, margin: 1 }), expiresAt: res.data.expiresAt });
      setPassword("");
    });
  };

  const unlink = () => start(async () => {
    const res = await unlinkQuickConnectionDevice(target);
    if (res.ok) notify.success(t("unlinkSuccess"));
    else notify.error(message(res.error));
  });

  return (
    <ModalShell onClose={close} size="sm" icon={<EntityIcon kind="contributors" icon={QrCodeIcon} size="md" />}
      title={t("title")} subtitle={info?.name}
      footer={<>
        <Button variant="secondary" className="mr-auto" onClick={unlink} disabled={pending || !info}>
          <LinkIcon data-icon="inline-start" />{t("unlink")}
        </Button>
        <Button variant="secondary" onClick={close}>{tg("actions.close")}</Button>
      </>}>
      {!info ? <div className="flex justify-center py-12"><Spinner /></div> : (
        <FieldGroup>
          {isTablet && (
            <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{tt("name")}</dt><dd>{info.name}</dd>
              <dt className="text-muted-foreground">{tt("family")}</dt><dd>{info.family ?? "—"}</dd>
              <dt className="text-muted-foreground">{tt("status")}</dt><dd>{info.status ? tt(`statuses.${info.status}` as never) : "—"}</dd>
            </dl>
          )}
          <p className="text-sm text-muted-foreground">{isTablet ? t("tabletHint") : t("userHint")}</p>
          {isTablet && info.disabled ? (
            <p className="text-sm text-destructive">{t("tabletDisabled")}</p>
          ) : qr ? (
            <div className="flex flex-col items-center gap-2">
              <img src={qr.image} alt={t("title")} width={320} height={320} className="rounded border" />
              <p className="text-xs text-muted-foreground">
                {t("expiresAt", { date: format.dateTime(new Date(qr.expiresAt), { dateStyle: "short", timeStyle: "short" }) })}
              </p>
            </div>
          ) : (
            <>
              {!isTablet && (
                <Field data-invalid={!!passwordError}>
                  <FieldLabel htmlFor="qc-password">{t("password")} *</FieldLabel>
                  <Input id="qc-password" type="password" autoComplete="current-password" value={password}
                    aria-invalid={!!passwordError} onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") generate(); }} />
                  {passwordError && <FieldError>{passwordError}</FieldError>}
                </Field>
              )}
              <Button onClick={generate} disabled={pending} className="self-start">
                {pending ? <Spinner data-icon="inline-start" /> : <QrCodeIcon data-icon="inline-start" />}{t("show")}
              </Button>
            </>
          )}
        </FieldGroup>
      )}
    </ModalShell>
  );
}
