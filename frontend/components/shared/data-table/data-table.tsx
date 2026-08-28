"use client";

// The shared TanStack-table-based grid for every "listing" screen in the app (companies,
// users, orders, tasks, ...) — sorting/filtering/pagination/row-selection come straight from
// @tanstack/react-table as before, but column order/visibility/width are now owned entirely
// by the SAME useGridColumns hook every Excel-style legacy-erp grid already uses, rendered
// through the same resize-handle/colgroup/header-drag markup pattern, so both grid families in
// the app share one mechanism and one "Manage Columns" UI instead of two.
//
// Deliberately does NOT wire TanStack's own columnSizing/columnOrder/columnVisibility state:
// syncing two independent state machines (the hook's and TanStack's) for the same concern would
// just be a second source of truth to keep consistent. Instead this renders the header row and
// each body row by iterating the hook's own `displayColumnDefs` (looking up the matching
// TanStack `header`/`cell` object by column id for `flexRender`), the same way every migrated
// legacy-erp grid iterates its own `displayColumnDefs` instead of a static column array —
// TanStack's sorting/filtering/faceting keep working unmodified since those don't depend on
// column visibility or render order.
//
// A column with `enableHiding: false` (every screen's own "select" checkbox / "actions" menu
// column already sets this) is treated as pinned — rendered outside the customizable set,
// leading columns before the first customizable one stay first, trailing ones stay last —
// exactly like every legacy-erp grid's own Delete/action column.

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  RowSelectionState,
  SortingState,
  Table as TanstackTable,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table";
import { ListOrdered, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
// Pure string-formatting helper, not legacy-erp-specific despite its path — already shared by
// every Worklist-enabled screen for the identical "turn a column id into a display label" need.
import { humanizeColumn } from "@/lib/legacy-erp/humanize";
import { GridColumnDef, useGridColumns } from "@/hooks/use-grid-columns";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";
import { DataTablePagination } from "./data-table-pagination";

const HEADER_H = "h-10";
const CELL_BORDER = "border-r border-b border-border";
const FIRST_COL_BORDER = "border-l border-border";

function columnLabel(col: ColumnDef<any, any>): string {
  const meta = (col as any).meta;
  if (meta?.label) return meta.label as string;
  if (typeof col.header === "string") return col.header;
  const id = (col as any).id ?? (col as any).accessorKey;
  return id ? humanizeColumn(String(id)) : "Column";
}

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Unique per screen — namespaces this grid's saved layout, same convention as every
   *  legacy-erp grid's own storageKey. */
  storageKey: string;
  /** Column id the toolbar's search box filters on, e.g. "name". Omit to hide the search box. */
  searchColumn?: string;
  searchPlaceholder?: string;
  onAddClick?: () => void;
  addLabel?: string;
  /** Extra toolbar content (faceted filters, a Reset button, ...) rendered next to the search
   *  box — a render-prop since filters typically need to bind to this table's own instance
   *  (e.g. `table.getColumn("status")`), which is created internally by this component. */
  toolbarExtra?: (table: TanstackTable<TData>) => React.ReactNode;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  storageKey,
  searchColumn,
  searchPlaceholder = "Search...",
  onAddClick,
  addLabel = "Add",
  toolbarExtra
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, rowSelection },
    initialState: { pagination: { pageSize: 25 } },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues()
  });

  // Leading/trailing pinned columns (enableHiding === false, e.g. "select"/"actions") stay
  // outside the customizable set entirely, in their original relative position — same rule as
  // every legacy-erp grid's own action column.
  const firstCustomizable = columns.findIndex((c) => c.enableHiding !== false);
  const lastCustomizableRev = [...columns].reverse().findIndex((c) => c.enableHiding !== false);
  const lastCustomizable = lastCustomizableRev === -1 ? -1 : columns.length - 1 - lastCustomizableRev;
  const leadingFixed = firstCustomizable <= 0 ? [] : columns.slice(0, firstCustomizable);
  const trailingFixed = lastCustomizable === -1 || lastCustomizable === columns.length - 1 ? [] : columns.slice(lastCustomizable + 1);
  const customizable = firstCustomizable === -1 ? [] : columns.slice(firstCustomizable, lastCustomizable + 1);

  const idOf = (c: ColumnDef<TData, TValue>) => String((c as any).id ?? (c as any).accessorKey ?? "");
  const gridColumnDefs: GridColumnDef<string>[] = React.useMemo(
    () => customizable.map((c) => ({
      key: idOf(c),
      label: columnLabel(c),
      defaultWidth: (c as any).size ?? 160,
      minWidth: (c as any).minSize ?? 90
    })),
    [customizable]
  );
  const gridColumns = useGridColumns<string>({ storageKey, columns: gridColumnDefs });

  const gridRootRef = React.useRef<HTMLDivElement>(null);
  const leadingIds = leadingFixed.map(idOf);
  const trailingIds = trailingFixed.map(idOf);
  const totalTableWidth = gridColumns.totalWidth(0) +
    leadingFixed.reduce((s, c) => s + ((c as any).size ?? 48), 0) +
    trailingFixed.reduce((s, c) => s + ((c as any).size ?? 48), 0);

  const headerById = React.useMemo(
    () => new Map(table.getFlatHeaders().map((h) => [h.column.id, h])),
    // table identity is stable across renders from useReactTable; header objects change when
    // sorting/filters/data change, which these deps already track via `table` re-creating them.
    [table, sorting, columnFilters, data, columns]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {searchColumn && (
            <Input
              placeholder={searchPlaceholder}
              value={(table.getColumn(searchColumn)?.getFilterValue() as string) ?? ""}
              onChange={(e) => table.getColumn(searchColumn)?.setFilterValue(e.target.value)}
              className="h-8 w-[200px]"
            />
          )}
          {toolbarExtra?.(table)}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={gridColumns.manageColumns.openModal}>
            <ListOrdered className="h-3.5 w-3.5 mr-1.5" />Manage Columns
          </Button>
          {onAddClick && (
            <Button size="sm" className="h-8" onClick={onAddClick}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />{addLabel}
            </Button>
          )}
        </div>
      </div>

      <div ref={gridRootRef} className="rounded-md border overflow-hidden">
        <Table className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
          <colgroup>
            {leadingFixed.map((c) => <col key={idOf(c)} style={{ width: (c as any).size ?? 48 }} />)}
            {gridColumns.displayColumnDefs.map((col) => <col key={col.key} style={{ width: gridColumns.getWidth(col.key) }} />)}
            {trailingFixed.map((c) => <col key={idOf(c)} style={{ width: (c as any).size ?? 48 }} />)}
          </colgroup>
          <TableHeader>
            <TableRow className="bg-muted hover:bg-muted">
              {leadingFixed.map((c, i) => {
                const header = headerById.get(idOf(c));
                return (
                  <TableHead key={idOf(c)} className={cn(CELL_BORDER, i === 0 && FIRST_COL_BORDER, "px-2")}>
                    {header && !header.isPlaceholder ? flexRender(header.column.columnDef.header, header.getContext()) : null}
                  </TableHead>
                );
              })}
              {gridColumns.displayColumnDefs.map((col, i) => {
                const header = headerById.get(col.key);
                const dragProps = gridColumns.getHeaderDragProps(col.key);
                return (
                  <TableHead
                    key={col.key}
                    role="columnheader"
                    scope="col"
                    onDragOver={dragProps.onDragOver}
                    onDrop={dragProps.onDrop}
                    className={cn(
                      "relative p-0",
                      CELL_BORDER,
                      leadingFixed.length === 0 && i === 0 && FIRST_COL_BORDER,
                      gridColumns.dragOverColumn === col.key && "bg-primary/15"
                    )}
                  >
                    <div
                      draggable
                      onDragStart={dragProps.onDragStart}
                      onDragEnd={dragProps.onDragEnd}
                      data-col={col.key}
                      title={col.label}
                      className={cn(HEADER_H, "flex w-full min-w-0 items-center truncate px-1 cursor-grab active:cursor-grabbing")}
                    >
                      {header && !header.isPlaceholder ? flexRender(header.column.columnDef.header, header.getContext()) : col.label}
                    </div>
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary"
                      onMouseDown={gridColumns.startResize(col.key)}
                      onDoubleClick={() => gridColumns.autoFitColumn(col.key, gridRootRef.current)}
                      title="Drag to resize · double-click to auto-fit"
                      aria-hidden="true"
                    />
                  </TableHead>
                );
              })}
              {trailingFixed.map((c) => {
                const header = headerById.get(idOf(c));
                return (
                  <TableHead key={idOf(c)} className={cn(CELL_BORDER, "px-2")}>
                    {header && !header.isPlaceholder ? flexRender(header.column.columnDef.header, header.getContext()) : null}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const cellById = new Map(row.getAllCells().map((c) => [c.column.id, c]));
                return (
                  <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                    {leadingIds.map((id) => {
                      const cell = cellById.get(id);
                      return <TableCell key={id} className={CELL_BORDER}>{cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null}</TableCell>;
                    })}
                    {gridColumns.displayColumnDefs.map((col) => {
                      const cell = cellById.get(col.key);
                      return (
                        <TableCell key={col.key} className={cn(CELL_BORDER, "truncate")}>
                          <span data-col={col.key}>{cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null}</span>
                        </TableCell>
                      );
                    })}
                    {trailingIds.map((id) => {
                      const cell = cellById.get(id);
                      return <TableCell key={id} className={CELL_BORDER}>{cell ? flexRender(cell.column.columnDef.cell, cell.getContext()) : null}</TableCell>;
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={leadingFixed.length + gridColumns.displayColumnDefs.length + trailingFixed.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} />

      <ManageColumnsModal
        state={gridColumns.manageColumns}
        fixedColumns={[]}
        columns={gridColumnDefs}
        description="Show, hide and reorder columns."
      />
    </div>
  );
}
