"use client";

// Shared read-only report grid for this screen's three tables (Requirements, Total
// Requirements, Transaction Details) — same resize/reorder/Manage Columns/horizontal-scroll
// mechanism every other grid in the app already uses (useGridColumns, extracted from
// purchase-order-line-grid.tsx), just with no per-cell editing/add-row since all three grids
// here are reports over already-persisted data, not something this screen itself edits inline.

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGridColumns, type GridColumnDef } from "@/hooks/use-grid-columns";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";
import { RowContextMenu, type RowAction } from "@/components/legacy-erp/row-actions";

export interface ReportColumn<T> {
  key: string;
  label: string;
  defaultWidth: number;
  minWidth?: number;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
}

export function ReportGrid<T extends { id: string | number }>({
  storageKey, columns, rows, loading, emptyLabel,
  getRowActions, selectedId, onRowClick, selectedIds, onRowContextMenu, fixedColumns, maxHeight,
}: {
  storageKey: string;
  columns: ReportColumn<T>[];
  rows: T[];
  loading?: boolean;
  emptyLabel: string;
  // Row-level right-click menu (Delete this specific record, etc.) — when omitted, rows render
  // exactly as before (no menu, no click/selection handling), so the other ReportGrid instances
  // on this screen (Total Requirements, Transaction Details) are completely unaffected.
  getRowActions?: (row: T) => RowAction[];
  selectedId?: string | number | null;
  // `event` is additive — existing callers passing a single-arg `(row) => ...` keep working
  // unchanged (JS/TS both allow a handler with fewer params to satisfy a prop expecting more); a
  // caller that needs it (multi-select via ctrl/shift-click) can now read `event.ctrlKey`/
  // `event.metaKey`/`event.shiftKey` without a second click-handling path.
  onRowClick?: (row: T, event: React.MouseEvent) => void;
  // Multi-row selection — opt-in, separate from `selectedId` (which is the single "active" row
  // driving a caller's own Transaction Details / detail-pane concept, unchanged). When provided,
  // every row whose id is in this Set renders the same selected highlight `selectedId` already
  // uses; the two are independent so a caller can keep "clicked row -> detail pane" and "ctrl/
  // shift-selected rows -> bulk action target" as two co-existing, non-conflicting concepts. Every
  // existing caller omits this and is completely unaffected.
  selectedIds?: Set<string | number>;
  // Fires on a row's native `contextmenu` event, BEFORE `getRowActions(row)` is read for that same
  // row (both originate from the same native event dispatch, so React batches the state update
  // this typically drives — via the caller's own `selectedIds` — ahead of the menu actually
  // painting; same proven pattern PageContextMenu's own `target` state already uses in row-
  // actions.tsx). Lets a caller implement "right-click an unselected row -> make it the sole
  // selection; right-click an already-selected row -> preserve the existing multi-selection"
  // entirely in its own state, with zero special-casing inside this shared component. Omitted,
  // right-click behaves exactly as before (RowContextMenu opens, selection untouched).
  onRowContextMenu?: (row: T, event: React.MouseEvent) => void;
  // Column keys always rendered first, in this order, never hidden/reordered — the same
  // order-locked-first convention useGridColumns/ManageColumnsModal already establish elsewhere
  // (see purchase-order-line-grid.tsx's own FIXED_COLS). Optional and previously always `[]`
  // (every existing ReportGrid instance on the Fabric/Trim/Yarn Requirements screen has none); a
  // caller with genuinely identifying leading columns (Fabric Planning's Order No/Fabric) can now
  // opt in without forking this component.
  fixedColumns?: string[];
  // Opt-in only — omitted (the default), this renders byte-for-byte as before: an unbounded-
  // height table whose own horizontal scrollbar sits at the very bottom of the ENTIRE dataset (the
  // page itself is the only scroll container). Passing a CSS height (e.g. "65vh") instead bounds
  // THIS SAME wrapper div's height and adds vertical scrolling to it, so its real horizontal
  // scrollbar now sits at the bottom of the visible grid box instead of the bottom of however many
  // rows exist — never a second/fake scrollbar, the existing overflow-x-auto div just also scrolls
  // y now. This is also what makes the header's existing `sticky top-0` (ui/table.tsx's own
  // TableHeader) actually activate: sticky is contained by the nearest ancestor that establishes a
  // scrolling box, and this wrapper div (overflow-x-auto, i.e. already a scrolling-box per the CSS
  // Overflow spec's own "non-visible on one axis forces auto on the other" rule) was always that
  // nearest ancestor — it just had no bounded height for the header to visibly stick within until
  // now. A caller with many rows and a wide grid (Yarn Planning) opts in; every other existing
  // caller (Fabric Planning, the Requirements grids, both screens' own Transaction Details grids)
  // passes nothing and is completely unaffected.
  maxHeight?: string;
}) {
  const gridColumnDefs = useMemo<GridColumnDef<string>[]>(
    () => columns.map((c) => ({ key: c.key, label: c.label, defaultWidth: c.defaultWidth, minWidth: c.minWidth ?? 80 })),
    [columns],
  );
  const gridColumns = useGridColumns<string>({ storageKey, columns: gridColumnDefs, fixedColumns });
  const displayColumnDefs = gridColumns.displayColumnDefs;
  const colByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const totalTableWidth = gridColumns.totalWidth();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]" onClick={gridColumns.manageColumns.openModal}>
          <ListOrdered className="h-3.5 w-3.5 mr-1" />Manage Columns
        </Button>
      </div>
      <div
        className={cn("rounded-md border overflow-x-auto", maxHeight && "overflow-y-auto")}
        style={maxHeight ? { maxHeight } : undefined}
      >
        {/* Plain <table>, not the shared <Table> primitive — that component wraps itself in a
            second `overflow-x-auto` div, which (per the CSS Overflow spec's own "non-visible on
            one axis forces auto on the other" rule) is ALSO a scrolling-box ancestor, sitting
            between this div and <thead>. With that redundant inner wrapper present, the header's
            sticky positioning contains to that inner div instead of this one — and the inner div
            always sizes exactly to its own content (never actually clipped/scrolled itself), so
            sticky has nothing to stick within and silently no-ops. Dropping straight to <table>
            here (this file's own TableHeader/TableBody/TableRow/TableHead/TableCell are plain
            thead/tbody/tr/th/td, they don't add a wrapper of their own) makes this div the ONE
            real scrolling ancestor, which is what both the maxHeight scroll box above and the
            header's own sticky top-0 (ui/table.tsx) need to work correctly. Every existing caller
            (no maxHeight) renders identically either way — removing this pass-through wrapper
            changes nothing visually when there's nothing here to scroll vertically. */}
        <table className="w-full caption-bottom text-sm table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
          <colgroup>
            {displayColumnDefs.map((col) => <col key={col.key} style={{ width: gridColumns.colWidths[col.key] }} />)}
          </colgroup>
          <TableHeader>
            <TableRow className="[&>th]:border-r [&>th]:text-[11px] [&>th]:h-8 [&>th]:whitespace-nowrap">
              {displayColumnDefs.map((col) => {
                const def = colByKey.get(col.key)!;
                return (
                  <TableHead
                    key={col.key}
                    className={cn("relative p-0", gridColumns.dragOverColumn === col.key && "bg-primary/15")}
                    onDragOver={gridColumns.getHeaderDragProps(col.key).onDragOver}
                    onDrop={gridColumns.getHeaderDragProps(col.key).onDrop}
                  >
                    <span
                      title={col.label}
                      draggable
                      onDragStart={gridColumns.getHeaderDragProps(col.key).onDragStart}
                      onDragEnd={gridColumns.getHeaderDragProps(col.key).onDragEnd}
                      className={cn(
                        "flex h-8 w-full min-w-0 items-center truncate px-2 cursor-grab active:cursor-grabbing",
                        def.align === "right" ? "justify-end" : "justify-start",
                      )}
                    >
                      {col.label}
                    </span>
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary"
                      onMouseDown={gridColumns.startResize(col.key)}
                      onDoubleClick={() => gridColumns.resetWidth(col.key)}
                      title="Drag to resize · double-click to reset width"
                      aria-hidden="true"
                    />
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={displayColumnDefs.length} className="text-center text-sm text-muted-foreground py-8">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={displayColumnDefs.length} className="text-center text-sm text-muted-foreground py-8">{emptyLabel}</TableCell></TableRow>
            ) : rows.map((row) => {
              const isSelected = (selectedId != null && String(selectedId) === String(row.id)) || !!selectedIds?.has(row.id);
              const tr = (
                <TableRow
                  key={row.id}
                  data-row-id={String(row.id)}
                  onClick={onRowClick ? (e) => onRowClick(row, e) : undefined}
                  onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(row, e) : undefined}
                  className={cn(
                    "[&>td]:border-r [&>td]:h-8",
                    onRowClick && "cursor-pointer",
                    isSelected && "bg-primary/10 hover:bg-primary/15",
                  )}
                >
                  {displayColumnDefs.map((col) => {
                    const def = colByKey.get(col.key)!;
                    return (
                      <TableCell key={col.key} className={cn("px-2 text-xs truncate", def.align === "right" && "text-right font-mono")}>
                        {def.render(row)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
              if (!getRowActions) return tr;
              return <RowContextMenu key={row.id} actions={getRowActions(row)}>{tr}</RowContextMenu>;
            })}
          </TableBody>
        </table>
      </div>
      <ManageColumnsModal state={gridColumns.manageColumns} fixedColumns={fixedColumns ?? []} columns={gridColumnDefs} />
    </div>
  );
}
