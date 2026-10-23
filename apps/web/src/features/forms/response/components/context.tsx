"use client";

import { createContext, useContext } from "react";
import type { NumberLocale } from "@/lib/formula/engine";
import type { RtCell, RtModel, RtQuestion, RtRubric } from "../engine/model";
import type { DynamicCtx, ValuesMap } from "../engine/values";

export type Member = { id: string; first_name: string; last_name: string; email: string | null; company: { name: string } | null };

export type ResponseCtx = {
  responseId: string;
  model: RtModel;
  values: ValuesMap;
  setValue: (lineageId: string, value: unknown) => void;
  setExclusive: (question: RtQuestion, lineageId: string, checked: boolean) => void;
  observations: Record<string, string>;
  setObservation: (questionLineageId: string, text: string) => void;
  /** Rubrique / réponse non modifiable (terminée, droits, rubrique non autorisée). */
  rubricReadOnly: boolean;
  isQuestionLocked: (q: RtQuestion) => boolean;
  locale: NumberLocale;
  createdAt: string;
  dynamicCtx: DynamicCtx;
  members: Member[];
  me: { id: string; firstName: string; lastName: string };
  canUnlock: boolean;
  /** Verrouillage manuel proposé (faux en mode partagé). */
  canLock?: boolean;
  requestLock: (q: RtQuestion) => void;
  requestUnlock: (q: RtQuestion) => void;
  openHistory: (q: RtQuestion) => void;
  historyCount: (q: RtQuestion) => number;
  calculate: (rubric: RtRubric, q: RtQuestion, cell: RtCell) => void;
  setObservationOpen?: (q: string) => void;
};

const Ctx = createContext<ResponseCtx | null>(null);
export const ResponseProvider = Ctx.Provider;
export function useResponse() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ResponseProvider missing");
  return ctx;
}
