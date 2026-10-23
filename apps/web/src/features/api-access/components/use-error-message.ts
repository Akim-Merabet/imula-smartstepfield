"use client";

import { useTranslations } from "next-intl";

const KNOWN = new Set(["expiry_past", "account_invalid", "revoked"]);

/** Message traduit d'une erreur de server action du module Accès API. */
export function useApiErrorMessage() {
  const t = useTranslations("apiAccess.errors");
  const tg = useTranslations("global.toast");
  return (error: string) => (KNOWN.has(error) ? t(error as "revoked") : error === "forbidden" ? tg("forbidden") : tg("error"));
}
