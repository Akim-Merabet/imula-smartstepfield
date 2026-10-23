"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { notify } from "@/components/common/notify";
import type { ActionResult } from "@/lib/actions";

type Result = ActionResult<unknown>;

/** Exécute une server action et affiche le toast adapté (succès, droits, doublon, dépendances…). */
export function useRun() {
  const tg = useTranslations("global");
  const t = useTranslations("settings.errors");
  const router = useRouter();

  const message = useCallback((res: Extract<Result, { ok: false }>) => {
    if (res.error === "forbidden") return { title: tg("toast.forbidden") };
    if (res.error === "in_use") {
      const usages = (res.details as { label: string; count: number }[] | undefined) ?? [];
      return {
        title: t("inUse"),
        description: usages.map((u) => (t.has(`usage.${u.label}`) ? t(`usage.${u.label}` as never, { count: u.count } as never) : u.label)).join(" · "),
      };
    }
    if (t.has(res.error)) return { title: t(res.error as never) };
    return { title: tg("toast.error") };
  }, [t, tg]);

  return useCallback(async (fn: () => Promise<Result>, success?: string | false) => {
    const res = await fn();
    if (res.ok) {
      if (success !== false) notify.success(success ?? tg("toast.saved"));
      router.refresh();
      return true;
    }
    const m = message(res);
    notify.error(m.title, m.description);
    return false;
  }, [message, router, tg]);
}
