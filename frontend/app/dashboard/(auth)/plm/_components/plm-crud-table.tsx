"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, MousePointerClick, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";

export interface Column<T> { key: keyof T | string; label: string; render?: (row: T) => React.ReactNode; }

interface Props<T extends { id: string }> {
  title: string;
  data: T[];
  loading: boolean;
  columns: Column<T>[];
  /** Namespaces this screen's saved column order/visibility/widths — unique per caller, e.g.
   *  "sizeCards", "warehouses". Every PlmCrudTable caller shares this one component's resize/
   *  reorder/hide mechanism (useGridColumns, same as every other grid in the app), so this must
   *  be unique or two screens' saved layouts would collide. */
  storageKey: string;
  onAdd?: () => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => Promise<void>;
  searchPlaceholder?: string;
  searchKey?: string;
  emptyMessage?: string;
  addLabel?: string;
  /** When set alongside `onSelectRow`, renders an extra "Select" action per row (and makes a
   *  row double-click select it too) — used when this table is opened as an F2 lookup target
   *  (see hooks/use-plm-lookup-return.ts). Full CRUD stays available at the same time; this is
   *  purely additive and every existing caller that omits it sees no behavior change. */
  lookupMode?: boolean;
  onSelectRow?: (row: T) => void;
  /** "full" (default): this component owns reorder/hide/Manage-Columns, same as every other
   *  migrated grid. "widthOnly": for the one caller (warehouses) that already gets its column
   *  SET/ORDER from its own Worklist-preset system (useWorklist) — layering this component's own
   *  reorder/hide on top would fight that. In this mode `columns` renders in the exact order/set
   *  the caller passes, no Manage Columns button, resize only, and widths auto-persist (no modal
   *  Save button exists in this mode) exactly like the Worklist screen family's own WorklistTable. */
  columnCustomization?: "full" | "widthOnly";
}

export function PlmCrudTable<T extends { id: string }>({
  title, data, loading, columns, storageKey, onAdd, onEdit, onDelete,
  searchPlaceholder = "Search...", searchKey, emptyMessage = "No records found", addLabel = "Add",
  lookupMode, onSelectRow, columnCustomization = "full",
}: Props<T>) {
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<T | null>(null);

  const filtered = searchKey
    ? data.filter((r) => String((r as any)[searchKey] || "").toLowerCase().includes(search.toLowerCase()))
    : data;

  // Column resize/reorder/hide/persist — shared across every grid in the app via useGridColumns.
  // The trailing Actions cell (Edit/Delete/Select) is never part of this set, same as every
  // other migrated grid's action column: always last, never hidden.
  const columnByKey = useMemo(() => new Map(columns.map((c) => [String(c.key), c])), [columns]);
  const gridColumnDefs = useMemo(
    () => columns.map((c) => ({ key: String(c.key), label: c.label, defaultWidth: 160, minWidth: 90 })),
    [columns]
  );
  const gridColumns = useGridColumns<string>({ storageKey, columns: gridColumnDefs });
  const widthOnly = columnCustomization === "widthOnly";
  // widthOnly: render in the caller's own order/set (its Worklist preset already decided that),
  // only ever reading resize state from the hook — never its reorder/hide.
  const displayColumns = useMemo(
    () => (widthOnly ? columns : gridColumns.displayColumnDefs.map((c) => columnByKey.get(c.key)!)),
    [widthOnly, columns, gridColumns.displayColumnDefs, columnByKey]
  );

  // widthOnly has no Manage Columns modal (no Save button anywhere), so widths auto-persist —
  // same auto-save rationale as the Worklist screen family's own WorklistTable component.
  const permanentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!widthOnly) return;
    gridColumns.persistWidthsSession();
    if (permanentSaveTimer.current) clearTimeout(permanentSaveTimer.current);
    permanentSaveTimer.current = setTimeout(() => {
      gridColumns.persistWidthsPermanently().catch(() => {});
    }, 800);
    return () => { if (permanentSaveTimer.current) clearTimeout(permanentSaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthOnly, gridColumns.colWidths]);

  const gridRootRef = useRef<HTMLDivElement>(null);
  const hasActionsColumn = !!(onEdit || onDelete || (lookupMode && onSelectRow));
  // NOT gridColumns.totalWidth() — in widthOnly mode `displayColumns` is the caller's own
  // `columns` prop, not the hook's internal (drag-reorder-driven) displayColumnDefs, and the
  // two can diverge if `columns` changes shape after mount (e.g. warehouses switching to a
  // Worklist preset with different fields) — `gridColumns.totalWidth()` would then sum over
  // stale keys missing from columnByKey and throw. Summing the actually-rendered
  // `displayColumns` directly (via the same safe, fallback-having `getWidth`) is correct in
  // both modes and avoids that.
  const totalTableWidth = displayColumns.reduce((sum, c) => sum + gridColumns.getWidth(String(c.key)), 0) + (hasActionsColumn ? 96 : 0);

  const handleDelete = async () => {
    if (!confirmDelete || !onDelete) return;
    setDeleting(confirmDelete.id);
    try {
      await onDelete(confirmDelete);
      toast.success("Deleted successfully");
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          {searchKey && (
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder={searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-48 h-9" />
            </div>
          )}
          {!widthOnly && (
            <Button variant="outline" size="sm" onClick={gridColumns.manageColumns.openModal}>
              <ListOrdered className="h-4 w-4 mr-1" />Manage Columns
            </Button>
          )}
          {onAdd && <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4 mr-1" />{addLabel}</Button>}
        </div>
      </div>

      <div ref={gridRootRef} className="rounded-md border overflow-x-auto">
        <Table className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
          <colgroup>
            {displayColumns.map((c) => <col key={String(c.key)} style={{ width: gridColumns.getWidth(String(c.key)) }} />)}
            {hasActionsColumn && <col style={{ width: 96 }} />}
          </colgroup>
          <TableHeader>
            <TableRow>
              {displayColumns.map((c, i) => {
                const key = String(c.key);
                const dragProps = widthOnly ? {} : gridColumns.getHeaderDragProps(key);
                return (
                  <TableHead
                    key={key}
                    className={cn("relative p-0", "border-r border-b border-border", i === 0 && "border-l")}
                    onDragOver={dragProps.onDragOver}
                    onDrop={dragProps.onDrop}
                  >
                    <div
                      draggable={!widthOnly}
                      onDragStart={dragProps.onDragStart}
                      onDragEnd={dragProps.onDragEnd}
                      data-col={key}
                      title={c.label}
                      className={cn(
                        "flex h-10 w-full min-w-0 items-center truncate px-3",
                        !widthOnly && "cursor-grab active:cursor-grabbing",
                        !widthOnly && gridColumns.dragOverColumn === key && "bg-primary/15"
                      )}
                    >
                      {c.label}
                    </div>
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary"
                      onMouseDown={gridColumns.startResize(key)}
                      onDoubleClick={() => gridColumns.autoFitColumn(key, gridRootRef.current)}
                      title="Drag to resize · double-click to auto-fit"
                      aria-hidden="true"
                    />
                  </TableHead>
                );
              })}
              {hasActionsColumn && <TableHead className="w-24 border-b border-border">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {displayColumns.map((c) => <TableCell key={String(c.key)}><Skeleton className="h-4 w-full" /></TableCell>)}
                {hasActionsColumn && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
              </TableRow>
            )) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={displayColumns.length + 1} className="text-center py-8 text-muted-foreground">{emptyMessage}</TableCell></TableRow>
            ) : filtered.map((row) => (
              <TableRow key={row.id} onDoubleClick={lookupMode && onSelectRow ? () => onSelectRow(row) : undefined} className={lookupMode && onSelectRow ? "cursor-pointer" : undefined}>
                {displayColumns.map((c) => (
                  <TableCell key={String(c.key)} className="truncate">
                    {c.render ? c.render(row) : String((row as any)[c.key] ?? "")}
                  </TableCell>
                ))}
                {hasActionsColumn && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {lookupMode && onSelectRow && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Select" onClick={() => onSelectRow(row)}><MousePointerClick className="h-3.5 w-3.5" /></Button>
                      )}
                      {onEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>}
                      {onDelete && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(row)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!widthOnly && (
        <ManageColumnsModal
          state={gridColumns.manageColumns}
          fixedColumns={[]}
          columns={gridColumnDefs}
          description="Show, hide and reorder columns."
        />
      )}

      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Delete</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!!deleting}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
