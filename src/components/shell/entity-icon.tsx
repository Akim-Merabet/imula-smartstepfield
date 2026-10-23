import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type EntityKind =
  | "default" | "project" | "referential" | "template" | "pgac" | "folder"
  | "library" | "settings" | "contributors" | "account" | "documents";

const KIND_CLASSES: Record<EntityKind, string> = {
  default: "bg-entity-default-bg text-entity-default",
  project: "bg-entity-project-bg text-entity-project",
  referential: "bg-entity-referential-bg text-entity-referential",
  folder: "bg-entity-referential-bg text-entity-referential",
  template: "bg-entity-template-bg text-entity-template",
  pgac: "bg-entity-pgac-bg text-entity-pgac",
  library: "bg-module-library-bg text-module-library",
  settings: "bg-module-settings-bg text-module-settings",
  contributors: "bg-module-contributors-bg text-module-contributors",
  account: "bg-module-account-bg text-module-account",
  documents: "bg-module-documents-bg text-module-documents",
};

const SIZES = { sm: "size-[22px] text-[0.7rem]", md: "size-6 text-xs", lg: "size-10 text-base" } as const;

/** Carré arrondi coloré par type d'entité / module (spec 00 §6.1). */
export function EntityIcon({ kind, icon: Icon, letter, size = "lg", className }: {
  kind: EntityKind; icon?: LucideIcon; letter?: string; size?: keyof typeof SIZES; className?: string;
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded font-semibold", KIND_CLASSES[kind], SIZES[size], className)}>
      {Icon ? <Icon className={size === "lg" ? "size-5" : "size-3.5"} /> : letter}
    </span>
  );
}
