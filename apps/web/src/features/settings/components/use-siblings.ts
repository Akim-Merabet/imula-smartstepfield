"use client";

import { useEffect, useState } from "react";

/** Navigation « élément précédent / suivant » dans une modale d'édition (ids dans l'ordre de la liste). */
export function useSiblings(load: () => PromiseLike<string[]>, currentId: string | null, deps: unknown[] = []) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    load().then((v) => { if (active) setIds(v); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  const index = currentId ? ids.indexOf(currentId) : -1;
  return {
    previous: index > 0 ? ids[index - 1] : null,
    next: index >= 0 && index < ids.length - 1 ? ids[index + 1] : null,
  };
}
