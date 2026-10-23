import { cn } from "@/lib/utils";

/** Carré coloré + libellé (statut personnalisé). */
export function StatusBadge({ color, label, className }: { color?: string | null; label?: string | null; className?: string }) {
  if (!label) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", className)}>
      <span className="size-3 shrink-0 rounded-[2px]" style={{ backgroundColor: color ?? "#828282" }} />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Puce de famille : nom court coloré (+ nom long en infobulle). */
export function FamilyChip({ color, shortName, longName }: { color?: string | null; shortName?: string | null; longName?: string | null }) {
  if (!shortName) return <span className="text-muted-foreground">—</span>;
  return (
    <span title={longName ?? undefined}
      className="inline-flex max-w-full items-center truncate rounded px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: color ?? "#5e5a5a" }}>
      {shortName}
    </span>
  );
}
