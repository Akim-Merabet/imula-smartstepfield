"use client";

import { useTranslations } from "next-intl";

/** Traduit un code d'erreur d'action Documents en message. */
export function useDocError() {
  const t = useTranslations("documents.follow.errors");
  const tg = useTranslations("global.toast");
  return (code: string | undefined) => {
    if (code === "forbidden") return tg("forbidden");
    if (code && t.has(code as never)) return t(code as never);
    return tg("error");
  };
}
