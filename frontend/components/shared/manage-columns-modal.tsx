"use client";

// Shared "Manage Columns" dialog for every Excel-style grid in the app — show/hide,
// drag-reorder, reset to default, and the two-tier "Save for This Session" / "Save
// Permanently" persistence, all driven by useGridColumns' `manageColumns` state.
// Ported from components/legacy-erp/purchase-order-line-grid.tsx's original inline
// Column Manager modal (the most complete existing UX in the app) so every grid gets
// the identical dialog instead of re-implementing it per screen.

import { GripVertical, Lock, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { GridColumnDef, ManageColumnsState } from "@/hooks/use-grid-columns";

export interface ManageColumnsModalProps<K extends string> {
  state: ManageColumnsState<K>;
  fixedColumns: K[];
  columns: GridColumnDef<K>[];
  title?: string;
  description?: string;
}

export function ManageColumnsModal<K extends string>({
  state,
  fixedColumns,
  columns,
  title = "Column Manager",
  description = "Show, hide and reorder columns.",
}: ManageColumnsModalProps<K>) {
  const columnByKey = new Map(columns.map((c) => [c.key, c]));

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && state.closeModal()}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={state.search}
              onChange={(e) => state.setSearch(e.target.value)}
              placeholder="Search columns..."
              aria-label="Search columns"
              className="h-8 pl-8 text-[13px]"
            />
          </div>
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
          {fixedColumns.map((key) => {
            const col = columnByKey.get(key);
            if (!col) return null;
            return (
              <div key={key} className="flex items-center gap-3 rounded-md border border-transparent bg-muted/40 px-3 py-2.5">
                <Checkbox checked disabled aria-label={`${col.label} is a required column and cannot be hidden`} />
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 text-[13px] font-medium">{col.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Required
                </span>
              </div>
            );
          })}

          {state.orderFiltered.length === 0 && state.search.trim() !== "" && (
            <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">
              No columns match &ldquo;{state.search}&rdquo;
            </p>
          )}

          {state.orderFiltered.map((key) => {
            const col = columnByKey.get(key);
            if (!col) return null;
            const visible = !state.hidden.has(key);
            return (
              <div
                key={key}
                onDragOver={state.getRowDragProps(key).onDragOver}
                onDrop={state.getRowDragProps(key).onDrop}
                className={cn(
                  "flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors",
                  state.dragOverKey === key ? "border-primary bg-primary/10" : "border-border bg-card",
                  !visible && "opacity-60",
                )}
              >
                <Checkbox
                  checked={visible}
                  onCheckedChange={(checked) => state.toggleHidden(key, checked === true)}
                  aria-label={`Show ${col.label} column`}
                />
                {/* Drag source is this handle only — not the row — so the checkbox's own
                    click never gets swallowed by a draggable ancestor. */}
                <span
                  draggable
                  onDragStart={state.getRowDragProps(key).onDragStart}
                  onDragEnd={state.getRowDragProps(key).onDragEnd}
                  className="flex shrink-0 cursor-grab items-center active:cursor-grabbing"
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </span>
                <span className="flex-1 text-[13px] font-medium">{col.label}</span>
              </div>
            );
          })}
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border px-5 py-3 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={state.closeModal}>Cancel</Button>
            <Button variant="ghost" size="sm" onClick={state.resetToDefault}>Reset Default</Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={state.saveForSession}>Save for This Session</Button>
            <Button size="sm" onClick={state.savePermanently} disabled={state.saving}>
              {state.saving ? "Saving..." : "Save Permanently"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
