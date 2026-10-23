import type { ComponentType } from "react";

/** segments = [action, id?, onglet?] après le préfixe ; close retire le paramètre d'URL. */
export type DialogProps = { segments: string[]; close: () => void };
export type DialogComponent = ComponentType<DialogProps>;
