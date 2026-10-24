// Action d'écriture déclenchée par un bouton : un double appui pendant l'écriture ne doit pas la rejouer
// (deux réponses, deux signatures…). Le verrou est synchrone (ref) ; `pending` sert à griser le bouton.
import { useRef, useState } from "react";

export function useSingleFlight<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const run = async (...args: A) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await fn(...args);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return [run, pending] as const;
}
