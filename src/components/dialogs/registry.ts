import dynamic from "next/dynamic";
import type { DialogComponent } from "./types";

/** Registre des modales-routes. Une entrée par préfixe d'URL (spec 00 §2.4). */
export const DIALOG_REGISTRY: Record<string, DialogComponent> = {
  project: dynamic(() => import("@/features/projects/dialogs")),
};
