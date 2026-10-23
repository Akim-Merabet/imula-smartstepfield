"use client";

import { useTranslations } from "next-intl";
import { CopyIcon, TriangleAlertIcon } from "lucide-react";
import { notify } from "@/components/common/notify";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { API_V2_BASE } from "../meta";

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const t = useTranslations("apiAccess");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      notify.success(t("copied"));
    } catch {
      // presse-papiers indisponible : la valeur reste sélectionnable
    }
  };
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input id={id} readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" onClick={copy} aria-label={`${t("copy")} — ${label}`}>
          <CopyIcon data-icon="inline-start" />{t("copy")}
        </Button>
      </div>
    </Field>
  );
}

/** Affichage unique des identifiants (création / rotation). Le secret n'existe qu'en mémoire du navigateur. */
export function SecretReveal({ clientId, clientSecret }: { clientId: string; clientSecret: string }) {
  const t = useTranslations("apiAccess.secret");
  const url = typeof window === "undefined" ? `${API_V2_BASE}/authenticate` : `${window.location.origin}${API_V2_BASE}/authenticate`;
  return (
    <FieldGroup>
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertDescription>{t("warning")}</AlertDescription>
      </Alert>
      <CopyField id="api-client-id" label={t("clientId")} value={clientId} />
      <CopyField id="api-client-secret" label={t("clientSecret")} value={clientSecret} />
      <p className="text-sm text-muted-foreground">
        {t("usage", { url, body: "{\"clientId\": \"…\", \"clientSecret\": \"…\"}" })}
      </p>
    </FieldGroup>
  );
}
