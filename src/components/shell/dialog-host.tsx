"use client";

import { useSearchParams } from "next/navigation";
import { DIALOG_REGISTRY } from "@/components/dialogs/registry";
import { DIALOG_PARAM, useDialog } from "./use-dialog";

/**
 * Rend la modale décrite par ?dialog=<prefix>/<action>/<id>/<onglet> (spec 00 §2.4).
 * Chaque préfixe est enregistré dans components/dialogs/registry.ts.
 */
export function DialogHost() {
  const searchParams = useSearchParams();
  const { close } = useDialog();
  const value = searchParams.get(DIALOG_PARAM);
  if (!value) return null;

  const segments = value.split("/").filter(Boolean);
  // Préfixe le plus long d'abord (ex. « block-emm » avant « block »).
  const prefix = Object.keys(DIALOG_REGISTRY)
    .sort((a, b) => b.length - a.length)
    .find((p) => value === p || value.startsWith(`${p}/`));
  if (!prefix) return null;

  const Component = DIALOG_REGISTRY[prefix];
  const rest = segments.slice(prefix.split("/").length);
  return <Component key={value.split("/").slice(0, -1).join("/") || value} segments={rest} close={close} />;
}
