import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { registerPdfFonts } from "./fonts";

/*
 * @react-pdf réutilise l'objet police (sous-ensemble de glyphes) d'un rendu à l'autre : deux rendus
 * successifs dans le même processus produisent alors des correspondances de glyphes erronées
 * (caractères substitués, coupures de mots). On recharge les polices avant chaque rendu et on
 * sérialise les rendus (file d'attente en mémoire) pour qu'aucun rendu concurrent ne partage l'état.
 */
let queue: Promise<unknown> = Promise.resolve();

/** Rendu @react-pdf → octets (Node uniquement). */
export function renderPdf(element: ReactElement<DocumentProps>): Promise<Uint8Array> {
  const job = queue.then(async () => {
    registerPdfFonts(true);
    return new Uint8Array(await renderToBuffer(element));
  });
  queue = job.catch(() => undefined);
  return job;
}
