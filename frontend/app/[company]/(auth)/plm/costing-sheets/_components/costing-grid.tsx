"use client";

import { Fragment, useRef, useState, type ReactNode } from "react";
import { Columns3, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";
import { useGridColumns, type GridColumnDef } from "@/hooks/use-grid-columns";
import { useGridKeyboardNav } from "@/hooks/use-grid-keyboard-nav";
import type { DecimalFieldKey } from "@/lib/legacy-erp/decimal-parameters";
import { cn } from "@/lib/utils";

// One Costing sheet section grid (Raw Material Costs / Labor Costs / Others): the existing dark
// section header, an Excel-style grid and "Add Row". Column resize / reorder / show-hide and their
// per-user persistence come from the ERP's shared useGridColumns + ManageColumnsModal (the same
// ones the Style Card BOM and Purchase Order grids use); keyboard movement from
// useGridKeyboardNav. The page supplies the columns (cell renderers + footer totals), so the
// section's data and calculations stay entirely in the page — column order/visibility is display
// only.

type CellNav = "text" | "number" | "lookup";

export interface CostingColumn<R, K extends string> extends GridColumnDef<K> {
  align?: "left" | "right";
  /** Keyboard-navigable editable cell kind; omit for read-only / calculated cells. A function
   *  decides per row (e.g. a cell that is read-only on some rows). */
  nav?: CellNav | ((row: R) => CellNav | undefined);
  render: (row: R) => ReactNode;
  /** Footer (Total row) content under this column, e.g. the column's total. */
  footer?: ReactNode;
}

export function SectionHeaderBar({ title, totalText, actions }: { title: string; totalText: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-slate-700 dark:bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded-t-md">
      <span>{title}</span>
      <span className="flex items-center gap-3">
        {actions}
        <span className="font-mono">{totalText}</span>
      </span>
    </div>
  );
}

export function CostingGrid<R extends { id: string }, K extends string>({
  title, totalText, storageKey, columns, rows, onAddRow, renderActions, actionsWidth = 40,
}: {
  title: string;
  totalText: string;
  /** Unique per grid — namespaces the saved column layout (per user). */
  storageKey: string;
  columns: CostingColumn<R, K>[];
  rows: R[];
  onAddRow: () => void;
  renderActions: (row: R) => ReactNode;
  actionsWidth?: number;
}) {
  const gridColumns = useGridColumns<K>({ storageKey, columns });
  const nav = useGridKeyboardNav();
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const visible = gridColumns.displayColumnDefs.map((d) => byKey.get(d.key)!);
  const firstFooterIdx = visible.findIndex((c) => c.footer !== undefined);

  return (
    <div>
      <SectionHeaderBar
        title={title}
        totalText={totalText}
        actions={
          <button
            type="button"
            onClick={gridColumns.manageColumns.openModal}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-white/85 hover:bg-white/15 hover:text-white"
          >
            <Columns3 className="h-3.5 w-3.5" /> Manage Columns
          </button>
        }
      />
      {/* Horizontal scrolling comes from <Table>'s own scroll container. */}
      <div className="rounded-b-md border border-t-0">
        <Table className="table-fixed" style={{ width: gridColumns.totalWidth(actionsWidth), minWidth: "100%" }}>
          <colgroup>
            {visible.map((c) => <col key={c.key} style={{ width: gridColumns.getWidth(c.key) }} />)}
            <col style={{ width: actionsWidth }} />
          </colgroup>
          <TableHeader>
            <TableRow className="[&>th]:border-r [&>th]:text-[11px] [&>th]:h-8">
              {visible.map((c) => {
                const drag = gridColumns.getHeaderDragProps(c.key);
                return (
                  <TableHead
                    key={c.key}
                    className={cn("relative p-0", gridColumns.dragOverColumn === c.key && "bg-primary/15")}
                    onDragOver={drag.onDragOver}
                    onDrop={drag.onDrop}
                  >
                    <span
                      title={`${c.label} — drag to move`}
                      draggable={drag.draggable}
                      onDragStart={drag.onDragStart}
                      onDragEnd={drag.onDragEnd}
                      className={cn("flex h-8 w-full min-w-0 cursor-grab items-center truncate px-2 active:cursor-grabbing", c.align === "right" ? "justify-end" : "justify-start")}
                    >
                      {c.label}
                    </span>
                    <div
                      data-resize={c.key}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary"
                      onMouseDown={gridColumns.startResize(c.key)}
                      onDoubleClick={() => gridColumns.resetWidth(c.key)}
                      title="Drag to resize · double-click to reset width"
                      aria-hidden="true"
                    />
                  </TableHead>
                );
              })}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody onKeyDown={nav.onKeyDown}>
            {rows.map((r) => (
              <TableRow key={r.id} className="[&>td]:border-r [&>td]:p-0">
                {visible.map((c) => {
                  const nav = typeof c.nav === "function" ? c.nav(r) : c.nav;
                  return (
                    <TableCell key={c.key} data-col={c.key} data-nav={nav} className={cn("overflow-hidden", !nav && "px-2 text-xs", c.align === "right" && !nav && "text-right font-mono")}>
                      {c.render(r)}
                    </TableCell>
                  );
                })}
                <TableCell className="p-0 text-center whitespace-nowrap">{renderActions(r)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 font-semibold [&>td]:border-r">
              {visible.map((c, i) => (
                <Fragment key={c.key}>
                  <TableCell className={cn("px-2 text-xs", c.footer !== undefined ? "text-right font-mono" : "text-right")}>
                    {c.footer !== undefined ? c.footer : i === firstFooterIdx - 1 ? "Total" : null}
                  </TableCell>
                </Fragment>
              ))}
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <Button variant="outline" size="sm" className="mt-1.5 h-7 text-xs" onClick={onAddRow}><Plus className="h-3.5 w-3.5 mr-1" />Add Row</Button>
      <ManageColumnsModal
        state={gridColumns.manageColumns}
        fixedColumns={[]}
        columns={columns}
        title={`${title} — Columns`}
        description="Show, hide and reorder columns. Hidden columns keep their data and still count in totals."
      />
    </div>
  );
}

// Editable text / numeric cell for these grids, on the shared EditableGridInput.
//  - number: numeric text input (not type=number, whose ArrowUp/Down and mouse-wheel silently
//    change the value); only digits and one decimal point can be typed or pasted, and the
//    in-progress text (e.g. "12.") is kept while editing.
//  - Escape restores the value the cell had when it was entered.
//  - Ctrl+C with nothing selected copies the whole cell value.
export function SheetCellInput({
  value, onChange, kind = "text", decimalKey, nonNegative,
}: {
  value: string | number;
  onChange: (v: string) => void;
  kind?: "text" | "number";
  decimalKey?: DecimalFieldKey;
  nonNegative?: boolean;
}) {
  const isNumber = kind === "number";
  const [draft, setDraft] = useState<string | null>(null);
  const original = useRef("");
  const numeric = (s: string) => /^\d*\.?\d*$/.test(s);
  return (
    <EditableGridInput
      type="text"
      inputMode={isNumber ? "decimal" : undefined}
      align={isNumber ? "right" : "left"}
      decimalKey={decimalKey}
      nonNegative={nonNegative}
      value={draft ?? value}
      onFocus={() => { original.current = String(value ?? ""); if (isNumber) setDraft(String(value ?? "")); }}
      onChange={(v) => {
        if (isNumber && !numeric(v)) return;
        if (isNumber) setDraft(v);
        onChange(v);
      }}
      onBlur={() => setDraft(null)}
      onPaste={(e) => {
        if (!isNumber) return;
        const text = e.clipboardData.getData("text").trim().replace(/,/g, "");
        if (!numeric(text)) { e.preventDefault(); toast.error("Only a number can be pasted into this cell"); }
      }}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (isNumber) setDraft(original.current);
          onChange(original.current);
          requestAnimationFrame(() => el.select());
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && el.selectionStart === el.selectionEnd) {
          e.preventDefault();
          navigator.clipboard?.writeText(el.value).catch(() => {});
        }
      }}
    />
  );
}
