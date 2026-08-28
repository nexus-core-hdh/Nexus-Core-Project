"use client";

// Shared table renderer for every Worklist-preset legacy-erp list screen (purchase-orders-list,
// inventory-cards-list, fabric-cards-list, ...). Those screens already have a working, genuinely
// shared column PRESET system (useWorklist + WorklistBar + WorklistDesignModal — named, saved
// column sets you design and switch between, with add/remove/reorder-via-buttons/restore-
// default) that this file does NOT touch or replace. The one thing that system never had is
// column WIDTH resize, since it has no live in-grid header markup of its own to hang a resize
// handle on — each screen hand-rolled its own <Table>/<TableHead>/<TableCell> JSX, and (for the
// "Standard" preset) an entirely separate hardcoded column set with its own sortable headers.
//
// This component unifies both cases (Standard's fixed columns and a custom worklist's dynamic
// columns) behind one `columns: WorklistTableColumn[]` shape the caller builds either way, then
// renders them through the shared useGridColumns hook in WIDTH-ONLY mode: no fixedColumns, no
// reorder, no hide, no Manage Columns modal (order/visibility already come from the worklist
// system, or are simply fixed for Standard) — just a resize handle per header, persisted
// automatically (no Save button exists on this screen family, so widths auto-persist: instantly
// to sessionStorage, debounced to the backend) via the hook's persistWidthsSession/
// persistWidthsPermanently. Widths key off column KEY, not position, so a width sticks with its
// column across a worklist switch and comes back if that column reappears later.

import { Fragment, useEffect, useMemo, useRef } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useGridColumns } from "@/hooks/use-grid-columns";

export interface WorklistTableColumn<T = any> {
  key: string;
  label: React.ReactNode;
  align?: "left" | "right" | "center";
  /** Shows the sort-direction affordance and calls `onSort(key)` on click. */
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
}

export interface WorklistTableProps<T = any> {
  columns: WorklistTableColumn<T>[];
  rows: T[];
  /** Namespaces this screen's saved column widths — e.g. "purchaseOrdersList". */
  storageKey: string;
  getRowKey: (row: T) => string | number;
  loading?: boolean;
  skeletonRowCount?: number;
  emptyState?: React.ReactNode;
  onRowDoubleClick?: (row: T) => void;
  /** Rightmost fixed (non-resizable) cell per row — typically a row-actions menu. */
  renderRowActions?: (row: T) => React.ReactNode;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  /** Wrap a fully-built row element — e.g. in a RowContextMenu — without this component needing
   *  to know about that concern. */
  wrapRow?: (row: T, rowElement: React.ReactNode) => React.ReactNode;
  /** Escape hatch for screens needing more than the built-in onDoubleClick per row (keyboard
   *  navigation, focus/ref tracking, a selected-row highlight, etc — e.g. a lookup-picker mode).
   *  Merged onto the row's own props; an `onDoubleClick`/`className` returned here wins over the
   *  defaults. */
  getRowProps?: (row: T, index: number) => Partial<React.ComponentProps<typeof TableRow>>;
  /** Width of the trailing `renderRowActions` cell — default 56px. */
  actionsColumnWidth?: number;
}

const HEADER_H = "h-10";
const CELL_BORDER = "border-b border-border";

export function WorklistTable<T = any>({
  columns,
  rows,
  storageKey,
  getRowKey,
  loading = false,
  skeletonRowCount = 6,
  emptyState,
  onRowDoubleClick,
  renderRowActions,
  sortKey,
  sortDir = "asc",
  onSort,
  wrapRow,
  getRowProps,
  actionsColumnWidth = 56
}: WorklistTableProps<T>) {
  const gridColumnDefs = useMemo(
    () => columns.map((c) => ({
      key: c.key,
      label: typeof c.label === "string" ? c.label : c.key,
      defaultWidth: c.defaultWidth ?? 160,
      minWidth: c.minWidth ?? 90
    })),
    [columns]
  );
  const gridColumns = useGridColumns<string>({ storageKey, columns: gridColumnDefs });

  // No Save button exists on this screen family — auto-persist widths instead: instantly to
  // sessionStorage (cheap, every change), debounced to the backend (avoids a request per pixel
  // of drag).
  const permanentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    gridColumns.persistWidthsSession();
    if (permanentSaveTimer.current) clearTimeout(permanentSaveTimer.current);
    permanentSaveTimer.current = setTimeout(() => {
      gridColumns.persistWidthsPermanently().catch(() => {});
    }, 800);
    return () => { if (permanentSaveTimer.current) clearTimeout(permanentSaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridColumns.colWidths]);

  const gridRootRef = useRef<HTMLDivElement>(null);
  // NOT gridColumns.totalWidth() — that sums over the hook's OWN internal displayColumnDefs,
  // which is keyed by its `columnOrder` state (only ever set via drag-reorder/the Manage Columns
  // modal, neither of which this width-only component uses). This screen's actual column SET
  // comes from the caller's own `columns` prop instead, and can change shape after mount (e.g.
  // switching to a Worklist preset with different fields) without `columnOrder` following along
  // — so `gridColumns.totalWidth()` could sum over stale keys no longer in `columnByKey`,
  // producing `undefined` entries that throw on `.key` access. Summing over the always-current
  // `columns` prop directly (with the same safe, fallback-having `getWidth`) sidesteps that.
  const totalTableWidth = columns.reduce((sum, c) => sum + gridColumns.getWidth(c.key), 0) + (renderRowActions ? actionsColumnWidth : 0);
  const colCount = columns.length + (renderRowActions ? 1 : 0);

  // No wrapping overflow-x-auto div here — the shared <Table> primitive already renders its own
  // `[data-slot="table-container"]` div with `overflow-x-auto` built in. Nesting a second
  // scrolling container around it is exactly the bug purchase-order-line-grid.tsx's own history
  // warns about: with two ancestors both scrolling, `TableHeader`'s `sticky top-0` (also a shared
  // default, see components/ui/table.tsx) resolves against the wrong one and desyncs from the
  // body while scrolling. `gridRootRef` just needs to be an ancestor of the cells for
  // `autoFitColumn`'s `querySelectorAll('[data-col]')` — it doesn't need to be the scroller.
  return (
    <div ref={gridRootRef}>
      <Table className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
        <colgroup>
          {columns.map((c) => <col key={c.key} style={{ width: gridColumns.getWidth(c.key) }} />)}
          {renderRowActions && <col style={{ width: actionsColumnWidth }} />}
        </colgroup>
        <TableHeader>
          <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
            {columns.map((c) => {
              const active = sortable(c) && sortKey === c.key;
              return (
                <TableHead
                  key={c.key}
                  className={cn(
                    "relative p-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80",
                    CELL_BORDER
                  )}
                >
                  <span
                    data-col={c.key}
                    title={typeof c.label === "string" ? c.label : undefined}
                    onClick={sortable(c) ? () => onSort?.(c.key) : undefined}
                    className={cn(
                      HEADER_H, "flex w-full min-w-0 items-center gap-1 truncate px-2",
                      c.align === "right" ? "justify-end" : c.align === "center" ? "justify-center" : "justify-start",
                      sortable(c) && "cursor-pointer select-none hover:text-foreground",
                    )}
                  >
                    {c.label}
                    {sortable(c) && (
                      active ? (
                        sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-foreground" /> : <ArrowDown className="h-3 w-3 text-foreground" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" />
                      )
                    )}
                  </span>
                  <div
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary"
                    onMouseDown={gridColumns.startResize(c.key)}
                    onDoubleClick={() => gridColumns.autoFitColumn(c.key, gridRootRef.current)}
                    title="Drag to resize · double-click to auto-fit"
                    aria-hidden="true"
                  />
                </TableHead>
              );
            })}
            {renderRowActions && <TableHead className={cn("h-10", CELL_BORDER)} style={{ width: actionsColumnWidth }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: skeletonRowCount }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: colCount }).map((_, j) => (
                  <TableCell key={j} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colCount} className="py-12">{emptyState}</TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => {
              const { className: rowClassNameOverride, onDoubleClick: onDoubleClickOverride, ...restRowProps } = getRowProps?.(row, index) ?? {};
              const rowEl = (
                <TableRow
                  key={getRowKey(row)}
                  className={rowClassNameOverride ?? "group cursor-pointer hover:bg-muted/40"}
                  onDoubleClick={onDoubleClickOverride ?? (onRowDoubleClick ? () => onRowDoubleClick(row) : undefined)}
                  {...restRowProps}
                >
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(
                        "whitespace-nowrap py-3 text-sm truncate",
                        c.align === "right" && "text-right",
                        c.align === "center" && "text-center"
                      )}
                    >
                      {c.render(row)}
                    </TableCell>
                  ))}
                  {renderRowActions && (
                    <TableCell className="py-3 text-right">{renderRowActions(row)}</TableCell>
                  )}
                </TableRow>
              );
              // The Fragment carries the list key regardless of what `wrapRow` returns — a
              // Fragment never contributes a DOM node itself, so it can't break <tbody>'s direct-
              // child requirement even if `wrapRow` renders something other than a bare <tr>
              // wrapper (e.g. RowContextMenu, already used this way in every un-migrated caller).
              return <Fragment key={getRowKey(row)}>{wrapRow ? wrapRow(row, rowEl) : rowEl}</Fragment>;
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function sortable(c: WorklistTableColumn<any>) {
  return !!c.sortable;
}
