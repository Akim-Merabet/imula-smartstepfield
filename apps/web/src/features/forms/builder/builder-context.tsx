"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { notify } from "@/components/common/notify";
import type { ActionResult } from "@/lib/actions";
import { indexPositions, type BuilderStructure, type PositionIndex } from "./model";
import type { BuilderData } from "./queries";

type Ctx = {
  data: BuilderData;
  s: BuilderStructure;
  setS: (fn: (s: BuilderStructure) => BuilderStructure) => void;
  idx: PositionIndex;
  formId: string;
  /** Édition possible (droits + mode édition). */
  editable: boolean;
  locale: "fr" | "en";
  /** Exécute une server action ; affiche l'erreur traduite. Renvoie true si succès. */
  run: <T>(fn: () => Promise<ActionResult<T>>, success?: string) => Promise<ActionResult<T>>;
  /** Copie dans le presse-papier avec toast. */
  copy: (text: string) => void;
};

const BuilderContext = createContext<Ctx | null>(null);

export function BuilderProvider({ data, editable, children }: { data: BuilderData; editable: boolean; children: ReactNode }) {
  const t = useTranslations("formBuilder");
  const tg = useTranslations("global");
  const [s, setState] = useState<BuilderStructure>(data.structure);
  // Les props (rechargées après chaque action via revalidatePath) restent la source de vérité.
  const [prev, setPrev] = useState(data.structure);
  if (prev !== data.structure) { setPrev(data.structure); setState(data.structure); }
  const idx = useMemo(() => indexPositions(s), [s]);

  const run = useCallback(async <T,>(fn: () => Promise<ActionResult<T>>, success?: string) => {
    let res: ActionResult<T>;
    try { res = await fn(); } catch { res = { ok: false, error: "unknown" }; }
    if (!res.ok) {
      const key = `errors.${res.error}`;
      notify.error(t.has(key) ? t(key) : res.error === "forbidden" ? tg("toast.forbidden") : tg("toast.error"));
      setState(data.structure);
    } else if (success) notify.success(success);
    return res;
  }, [t, tg, data.structure]);

  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => notify.success(t("menu.copied")), () => notify.error(tg("toast.error")));
  }, [t, tg]);

  const value = useMemo<Ctx>(() => ({
    data, s, setS: (fn) => setState(fn), idx, formId: data.form.id, editable, locale: data.numberFormat, run, copy,
  }), [data, s, idx, editable, run, copy]);
  return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>;
}

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("useBuilder outside BuilderProvider");
  return ctx;
}
