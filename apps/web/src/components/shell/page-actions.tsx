"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Ctx = {
  onAdd: (() => void) | null; setOnAdd: (fn: (() => void) | null) => void;
  /** Lien « Retour au menu de l'entité » affiché à la place du « + » (spec 00 §3.1). */
  backHref: string | null; setBackHref: (href: string | null) => void;
};
const PageActionsContext = createContext<Ctx>({ onAdd: null, setOnAdd: () => {}, backHref: null, setBackHref: () => {} });

/** Fournit l'action « + » du rail, enregistrée par la page courante (spec 00 §3.1.1). */
export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [onAdd, setOnAddState] = useState<(() => void) | null>(null);
  const [backHref, setBackHref] = useState<string | null>(null);
  const setOnAdd = useCallback((fn: (() => void) | null) => setOnAddState(() => fn), []);
  return <PageActionsContext.Provider value={{ onAdd, setOnAdd, backHref, setBackHref }}>{children}</PageActionsContext.Provider>;
}

export function usePageAdd() {
  return useContext(PageActionsContext).onAdd;
}

/** À appeler dans une page cliente pour activer le bouton « + » du rail (fn peut changer à chaque rendu). */
export function useRegisterPageAdd(fn: (() => void) | null) {
  const { setOnAdd } = useContext(PageActionsContext);
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  const enabled = fn !== null;
  useEffect(() => {
    setOnAdd(enabled ? () => ref.current?.() : null);
    return () => setOnAdd(null);
  }, [enabled, setOnAdd]);
}

export function usePageBack() {
  return useContext(PageActionsContext).backHref;
}

/** Remplace le « + » du rail par un lien de retour (ex. contenu d'un flow → liste des flows). */
export function useRegisterPageBack(href: string | null) {
  const { setBackHref } = useContext(PageActionsContext);
  useEffect(() => {
    setBackHref(href);
    return () => setBackHref(null);
  }, [href, setBackHref]);
}

/** Variante composant pour les pages serveur. */
export function RegisterPageBack({ href }: { href: string }) {
  useRegisterPageBack(href);
  return null;
}
