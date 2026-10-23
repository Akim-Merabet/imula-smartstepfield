"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { checkPassword, PASSWORD_MAX, PASSWORD_MIN, passwordLevel } from "@/lib/validation/password";

const LEVEL_VALUE = { insufficient: 10, weak: 35, medium: 65, strong: 100 } as const;

/** Champ « nouveau mot de passe » avec exigences et jauge de complexité (spec 01 §2.4). */
export function PasswordField({ value, onChange, id = "password", name = "password" }: {
  value: string; onChange: (v: string) => void; id?: string; name?: string;
}) {
  const t = useTranslations("auth.newPassword");
  const rules = checkPassword(value);
  const level = passwordLevel(value);
  const items = [
    ["length", t("rules.length", { min: PASSWORD_MIN, max: PASSWORD_MAX })],
    ["letter", t("rules.letter")],
    ["digit", t("rules.digit")],
    ["special", t("rules.special")],
    ["common", t("rules.common")],
  ] as const;

  return (
    <Field>
      <FieldLabel htmlFor={id}>{t("password")}</FieldLabel>
      <Input id={id} name={name} type="password" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" required />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{t("complexity")}</span>
        <Progress value={value ? LEVEL_VALUE[level] : 0} className="h-1.5 flex-1" />
        <span>{value ? t(`levels.${level}`) : ""}</span>
      </div>
      <ul className="flex flex-col gap-1 text-xs">
        {items.map(([key, label]) => (
          <li key={key} className={cn("flex items-center gap-2", rules[key] ? "text-success" : "text-muted-foreground")}>
            {rules[key] ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
            {label}
          </li>
        ))}
      </ul>
    </Field>
  );
}
