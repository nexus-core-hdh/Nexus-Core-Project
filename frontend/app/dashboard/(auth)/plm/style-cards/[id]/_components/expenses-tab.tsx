"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ListOrdered, Plus, Save, Trash2 } from "lucide-react";
import { plmApi } from "@/lib/nexuscore-api";
import { cn } from "@/lib/utils";
import { GridInput, uid, num } from "./grid-input";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";

type ExpenseRow = { id: string; expenseType: string; explanation: string; quantity: number; unitPrice: number; forex: string };

const blankRow = (): ExpenseRow => ({ id: uid(), expenseType: "", explanation: "", quantity: 0, unitPrice: 0, forex: "" });

// ---- Column resize/reorder/hide/persist — shared across every grid via useGridColumns,
// same pattern as bom-tab.tsx. storageKey "styleCardExpensesGrid" is net-new (this tab never
// had column customization before). "amount" is the computed Quantity x Unit Price column.
type ColKey = "expenseType" | "explanation" | "quantity" | "unitPrice" | "forex" | "amount";
type ColumnDef = { key: ColKey; label: string; align?: "left" | "right" };
const COLUMNS: ColumnDef[] = [
  { key: "expenseType", label: "Expense Type" },
  { key: "explanation", label: "Explanation" },
  { key: "quantity", label: "Quantity", align: "right" },
  { key: "unitPrice", label: "Unit Price", align: "right" },
  { key: "forex", label: "Forex" },
  { key: "amount", label: "Amount", align: "right" },
];
const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));
// Expense Type identifies the row and always stays first & visible.
const FIXED_COLS: ColKey[] = ["expenseType"];
const DEFAULT_WIDTHS: Record<ColKey, number> = { expenseType: 160, explanation: 200, quantity: 100, unitPrice: 100, forex: 90, amount: 100 };
const MIN_WIDTHS: Record<ColKey, number> = { expenseType: 120, explanation: 150, quantity: 70, unitPrice: 70, forex: 70, amount: 80 };
const DEL_W = 40;

export function ExpensesTab({ styleCardId }: { styleCardId: string; card: any; onReloadCard: () => void }) {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Decimal Parameters (Settings -> Screen Parameters -> Decimal) — round-on-blur for
  // Quantity/Unit Price cells below, via the shared decimalKey mechanism.
  const { round, ensureLoaded: ensureDecimalParamsLoaded } = useDecimalParameters();
  useEffect(() => { ensureDecimalParamsLoaded(); }, [ensureDecimalParamsLoaded]);

  const load = async () => {
    setLoading(true);
    try {
      const lines = await plmApi.styleExpenses.get(styleCardId);
      setRows((Array.isArray(lines) ? lines : []).map((l: any) => ({
        id: l.id, expenseType: l.expenseType || "", explanation: l.explanation || "",
        quantity: num(l.quantity), unitPrice: num(l.unitPrice), forex: l.forex || "",
      })));
    } catch (e: any) {
      toast.error(e.message || "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [styleCardId]);

  const update = (id: string, patch: Partial<ExpenseRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));

  const total = rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);

  const save = async () => {
    setSaving(true);
    try {
      // Decimal Parameters rounding happens HERE (not just via each cell's own GridInput
      // decimalKey, which is visual round-on-blur only) — this is the one place `rows` is
      // actually sent to the API. Same rationale as bom-tab.tsx's own save().
      const roundedRows = rows.map((r) => ({ ...r, quantity: round(r.quantity, "quantity"), unitPrice: round(r.unitPrice, "unit-price") }));
      await plmApi.styleExpenses.upsertLines(styleCardId, roundedRows);
      toast.success("Expenses saved");
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save expenses");
    } finally {
      setSaving(false);
    }
  };

  const gridColumnDefs = useMemo(
    () => COLUMNS.map((c) => ({ key: c.key, label: c.label, defaultWidth: DEFAULT_WIDTHS[c.key], minWidth: MIN_WIDTHS[c.key] })),
    [],
  );
  const gridColumns = useGridColumns<ColKey>({
    storageKey: "styleCardExpensesGrid",
    columns: gridColumnDefs,
    fixedColumns: FIXED_COLS,
  });
  const displayColumnDefs = useMemo(
    () => gridColumns.displayColumnDefs.map((c) => COLUMN_BY_KEY.get(c.key)!),
    [gridColumns.displayColumnDefs],
  );
  const colWidths = gridColumns.colWidths;
  const startResize = gridColumns.startResize;
  const resetColumnWidth = gridColumns.resetWidth;
  const totalTableWidth = gridColumns.totalWidth(DEL_W);

  const renderCell = (r: ExpenseRow, key: ColKey) => {
    switch (key) {
      case "expenseType":
        return <GridInput value={r.expenseType} onChange={(v) => update(r.id, { expenseType: v })} />;
      case "explanation":
        return <GridInput value={r.explanation} onChange={(v) => update(r.id, { explanation: v })} />;
      case "quantity":
        return <GridInput type="number" align="right" value={r.quantity} decimalKey="quantity" onChange={(v) => update(r.id, { quantity: parseFloat(v) || 0 })} />;
      case "unitPrice":
        return <GridInput type="number" align="right" value={r.unitPrice} decimalKey="unit-price" onChange={(v) => update(r.id, { unitPrice: parseFloat(v) || 0 })} />;
      case "forex":
        return <GridInput value={r.forex} onChange={(v) => update(r.id, { forex: v })} />;
      case "amount":
        return <span className="block px-2 text-right font-mono text-xs">{(r.quantity * r.unitPrice).toFixed(2)}</span>;
      default:
        return null;
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-1.5">
        <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]" onClick={gridColumns.manageColumns.openModal}>
          <ListOrdered className="h-3.5 w-3.5 mr-1" />Manage Columns
        </Button>
        <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
          <colgroup>
            {displayColumnDefs.map((col) => <col key={col.key} style={{ width: colWidths[col.key] }} />)}
            <col style={{ width: DEL_W }} />
          </colgroup>
          <TableHeader>
            <TableRow className="[&>th]:border-r [&>th]:text-[11px] [&>th]:h-8 [&>th]:whitespace-nowrap">
              {displayColumnDefs.map((col) => {
                const fixed = FIXED_COLS.includes(col.key);
                return (
                  <TableHead
                    key={col.key}
                    className={cn("relative p-0", gridColumns.dragOverColumn === col.key && "bg-primary/15")}
                    onDragOver={gridColumns.getHeaderDragProps(col.key).onDragOver}
                    onDrop={gridColumns.getHeaderDragProps(col.key).onDrop}
                  >
                    <span
                      title={col.label}
                      draggable={!fixed}
                      onDragStart={gridColumns.getHeaderDragProps(col.key).onDragStart}
                      onDragEnd={gridColumns.getHeaderDragProps(col.key).onDragEnd}
                      className={cn(
                        "flex h-8 w-full min-w-0 items-center truncate px-2",
                        col.align === "right" ? "justify-end" : "justify-start",
                        !fixed && "cursor-grab active:cursor-grabbing",
                      )}
                    >
                      {col.label}
                    </span>
                    <div
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary"
                      onMouseDown={startResize(col.key)}
                      onDoubleClick={() => resetColumnWidth(col.key)}
                      title="Drag to resize · double-click to reset width"
                      aria-hidden="true"
                    />
                  </TableHead>
                );
              })}
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="[&>td]:border-r [&>td]:p-0">
                {displayColumnDefs.map((col) => (
                  <TableCell key={col.key}>{renderCell(r, col.key)}</TableCell>
                ))}
                <TableCell className="p-0 text-center"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(r.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 font-semibold [&>td]:border-r">
              {displayColumnDefs.map((col, i) => (
                <TableCell key={col.key} className={col.key === "amount" ? "text-right font-mono text-xs px-2" : "text-right text-xs pr-2"}>
                  {col.key === "amount" ? total.toFixed(2) : i === 0 ? "Total" : ""}
                </TableCell>
              ))}
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <Button variant="outline" size="sm" className="mt-1.5 h-7 text-xs" onClick={addRow}><Plus className="h-3.5 w-3.5 mr-1" />Add Row</Button>

      <ManageColumnsModal
        state={gridColumns.manageColumns}
        fixedColumns={FIXED_COLS}
        columns={gridColumnDefs}
        description="Show, hide and reorder columns. Expense Type is required and always stays first."
      />
    </div>
  );
}
