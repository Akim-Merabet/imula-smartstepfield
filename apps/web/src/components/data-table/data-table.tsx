"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ColumnSizingState, type RowSelectionState, type SortingState, type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { readJson, readStorage, writeJson, writeStorage } from "@/lib/storage";
import { cn } from "@/lib/utils";

export type DataTableMeta = {
  /** Colonne figée à droite (actions). */
  sticky?: boolean;
  /** Colonne non masquable dans « Personnaliser les colonnes ». */
  locked?: boolean;
  className?: string;
};

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type
  interface ColumnMeta<TData, TValue> extends DataTableMeta {}
}

export type DataTableProps<T> = {
  /** Identifiant de table pour la persistance (largeurs, colonnes, dernier élément). */
  tableId: string;
  columns: ColumnDef<T, unknown>[];
  data: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
  /** Tri côté client (sinon les données arrivent déjà triées du serveur). */
  clientSorting?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  footer?: ReactNode;
  columnVisibility?: VisibilityState;
};

const LAST_FOCUS_PREFIX = "table_last_focus_";

/** Mémorise le dernier élément ouvert d'une table (surlignage au retour, RN92). */
export function rememberFocusedRow(tableId: string, rowId: string) {
  try { window.sessionStorage.setItem(LAST_FOCUS_PREFIX + tableId, rowId); } catch { /* ignore */ }
}

export function DataTable<T>({
  tableId, columns, data, getRowId, onRowClick, selectable, onSelectionChange, clientSorting,
  emptyTitle, emptyDescription, footer, columnVisibility,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasHScroll, setHasHScroll] = useState(false);

  useEffect(() => {
    setColumnSizing(readJson<ColumnSizingState>(`table_column_widths_${tableId}`, {}));
    try { setFocusedId(window.sessionStorage.getItem(LAST_FOCUS_PREFIX + tableId)); } catch { /* ignore */ }
  }, [tableId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHasHScroll(el.scrollWidth > el.clientWidth + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const allColumns = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!selectable) return columns;
    return [{
      id: "__select",
      size: 40,
      enableResizing: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false}
          onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
          aria-label="select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)}
          onClick={(e) => e.stopPropagation()} aria-label="select row" />
      ),
    }, ...columns];
  }, [columns, selectable]);

  const table = useReactTable({
    data,
    columns: allColumns,
    getRowId,
    state: { sorting, rowSelection, columnSizing, columnVisibility: columnVisibility ?? {} },
    onSortingChange: setSorting,
    onRowSelectionChange: (updater) => {
      setRowSelection((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        onSelectionChange?.(Object.keys(next).filter((k) => next[k]));
        return next;
      });
    },
    onColumnSizingChange: (updater) => {
      setColumnSizing((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        writeJson(`table_column_widths_${tableId}`, next);
        return next;
      });
    },
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    enableSorting: !!clientSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: clientSorting ? getSortedRowModel() : undefined,
    defaultColumn: { size: 160, minSize: 60 },
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: table.getTotalSize() }}>
          <thead className="sticky top-0 z-20 bg-white">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const sorted = header.column.getIsSorted();
                  return (
                    <th key={header.id}
                      style={{ width: header.getSize() }}
                      className={cn(
                        "relative h-12 border-b-2 px-4 text-left text-[0.9rem] font-semibold whitespace-nowrap text-table-head",
                        header.column.id === "__select" && "px-2",
                        meta?.sticky && "sticky right-0 z-30 bg-white",
                        meta?.sticky && hasHScroll && "shadow-[inset_8px_0_8px_-8px_rgba(0,0,0,0.16)]",
                        meta?.className,
                      )}>
                      {header.isPlaceholder ? null : !header.column.getCanSort() ? (
                        <span className="inline-flex items-center gap-1">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                      ) : (
                        <button type="button" disabled={!header.column.getCanSort()}
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 disabled:cursor-default">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === "asc" && <ArrowUpIcon className="size-3.5" />}
                          {sorted === "desc" && <ArrowDownIcon className="size-3.5" />}
                        </button>
                      )}
                      {header.column.getCanResize() && !meta?.sticky && (
                        <div onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()}
                          className="absolute top-2 right-0 bottom-2 w-1 cursor-col-resize border-r border-[#c5c5c5] select-none" />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => {
              const focused = row.id === focusedId;
              return (
                <tr key={row.id}
                  onClick={onRowClick ? () => { rememberFocusedRow(tableId, row.id); onRowClick(row.original); } : undefined}
                  className={cn("group", onRowClick && "cursor-pointer", focused ? "bg-row-focus" : "hover:bg-row-hover")}>
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    return (
                      <td key={cell.id} style={{ width: cell.column.getSize() }}
                        className={cn(
                          "h-16 border-b border-row-hover px-4 py-1 align-middle",
                          cell.column.id === "__select" && "px-2",
                          meta?.sticky && "sticky right-0 z-10 text-right",
                          meta?.sticky && (focused ? "bg-row-focus" : "bg-white group-hover:bg-row-hover"),
                          meta?.sticky && hasHScroll && "shadow-[inset_8px_0_8px_-8px_rgba(0,0,0,0.16)]",
                          meta?.className,
                        )}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              {emptyDescription && <EmptyDescription>{emptyDescription}</EmptyDescription>}
            </EmptyHeader>
          </Empty>
        )}
      </div>
      {footer && <div className="border-t px-4 py-2">{footer}</div>}
    </div>
  );
}

/** Préférences de colonnes visibles (« Personnaliser les colonnes », max 30) persistées en localStorage. */
export function useColumnPreferences(storageKey: string, defaults: VisibilityState) {
  const [visibility, setVisibility] = useState<VisibilityState>(defaults);
  useEffect(() => {
    const saved = readStorage(storageKey);
    if (saved) {
      try { setVisibility({ ...defaults, ...JSON.parse(saved) }); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const update = (next: VisibilityState | null) => {
    const value = next ?? defaults;
    setVisibility(value);
    if (next) writeStorage(storageKey, JSON.stringify(next));
    else { try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ } }
  };
  return [visibility, update] as const;
}
