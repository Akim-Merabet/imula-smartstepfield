"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Ctx = { onAdd: (() => void) | null; setOnAdd: (fn: (() => void) | null) => void };
const PageActionsContext = createContext<Ctx>({ onAdd: null, setOnAdd: () => {} });

/** Fournit l'action « + » du rail, enregistrée par la page courante (spec 00 §3.1.1). */
export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [onAdd, setOnAddState] = useState<(() => void) | null>(null);
  const setOnAdd = useCallback((fn: (() => void) | null) => setOnAddState(() => fn), []);
  return <PageActionsContext.Provider value={{ onAdd, setOnAdd }}>{children}</PageActionsContext.Provider>;
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
