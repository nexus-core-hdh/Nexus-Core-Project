"use client";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LineColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  width?: string;
  render: (row: T, rowIndex: number) => React.ReactNode;
}

/** Generic editable line-items grid used by every Finance document form (Demand, Receipt,
 *  Issuance, Purchase/Sales Order, Invoices, Credit/Debit Notes, Journal Entries). Callers own
 *  their row shape/state and supply per-cell render functions (typically an EditableGridInput or
 *  a Select) — this component only handles the table chrome, add/remove-row affordances, and an
 *  optional totals footer row. */
export function LineItemsTable<T>({
  columns, rows, onAddRow, onRemoveRow, addLabel = "Add Line", footer, minRows = 1,
}: {
  columns: LineColumn<T>[];
  rows: T[];
  onAddRow?: () => void;
  onRemoveRow?: (rowIndex: number) => void;
  addLabel?: string;
  footer?: React.ReactNode;
  minRows?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted hover:bg-muted">
              <TableHead className="w-10 text-center text-[11px]">#</TableHead>
              {columns.map((c) => (
                <TableHead key={c.key} style={c.width ? { width: c.width } : undefined} className={cn("text-[11px]", c.align === "right" && "text-right", c.align === "center" && "text-center")}>
                  {c.label}
                </TableHead>
              ))}
              {onRemoveRow && <TableHead className="w-10 text-center text-[11px]">—</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (onRemoveRow ? 2 : 1)} className="py-8 text-center text-sm text-muted-foreground">
                  No line items yet. Click &ldquo;{addLabel}&rdquo; to add one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={cn("p-1.5", c.align === "right" && "text-right", c.align === "center" && "text-center")}>
                      {c.render(row, i)}
                    </TableCell>
                  ))}
                  {onRemoveRow && (
                    <TableCell className="text-center">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" disabled={rows.length <= minRows} onClick={() => onRemoveRow(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between border-t bg-muted/10 px-3 py-2">
        {onAddRow ? (
          <Button type="button" variant="outline" size="sm" onClick={onAddRow}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />{addLabel}
          </Button>
        ) : <span />}
        {footer}
      </div>
    </div>
  );
}
