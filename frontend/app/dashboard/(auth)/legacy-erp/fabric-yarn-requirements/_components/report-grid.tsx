"use client";

// Shared read-only report grid for this screen's three tables (Requirements, Total
// Requirements, Transaction Details) — same resize/reorder/Manage Columns/horizontal-scroll
// mechanism every other grid in the app already uses (useGridColumns, extracted from
// purchase-order-line-grid.tsx), just with no per-cell editing/add-row since all three grids
// here are reports over already-persisted data, not something this screen itself edits inline.

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  getRowActions, selectedId, onRowClick,
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
  onRowClick?: (row: T) => void;
}) {
  const gridColumnDefs = useMemo<GridColumnDef<string>[]>(
    () => columns.map((c) => ({ key: c.key, label: c.label, defaultWidth: c.defaultWidth, minWidth: c.minWidth ?? 80 })),
    [columns],
  );
  const gridColumns = useGridColumns<string>({ storageKey, columns: gridColumnDefs });
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
      <div className="rounded-md border overflow-x-auto">
        <Table className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
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
              const tr = (
                <TableRow
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "[&>td]:border-r [&>td]:h-8",
                    onRowClick && "cursor-pointer",
                    selectedId != null && String(selectedId) === String(row.id) && "bg-primary/10 hover:bg-primary/15",
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
        </Table>
      </div>
      <ManageColumnsModal state={gridColumns.manageColumns} fixedColumns={[]} columns={gridColumnDefs} />
    </div>
  );
}
