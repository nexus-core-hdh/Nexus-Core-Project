"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Plus, Trash2, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import { AutocompleteTextCell, type AutocompleteOption } from "@/components/legacy-erp/autocomplete-text-cell";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";

// Financial Receipt detail grid — the per-line allocation against FI_ReceiptItem (curated
// ITEM_COLUMNS: CurrentAccountId, DocumentNo, Explanation, SpecialCode, Debit, Credit — see
// fi-receipt.service.ts). Simpler than inventory-receipt-line-grid.tsx's full spreadsheet
// (no roving-cursor keyboard nav/click-to-edit engine — cells commit on blur/select instead) —
// FI_ReceiptItem is a shared, generic payment-line table across many legacy modules with no
// reference screenshot/spec for this screen's own Detail tab beyond add/edit/remove rows, same
// draft-then-commit pre-save mechanics as Inventory Receipt's own grid. Column resize/reorder/
// hide/persist now come from the shared useGridColumns hook (hooks/use-grid-columns.ts), under
// storageKey "financialReceiptLineGrid" (net-new — this grid never had column customization or
// any saved layout to preserve).

const uid = () => Math.random().toString(36).slice(2, 10);
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

type ColKey = "currentAccount" | "documentNo" | "explanation" | "specialCode" | "debit" | "credit";
interface ColumnDef { key: ColKey; label: string; align?: "left" | "right" }
const COLUMNS: ColumnDef[] = [
  { key: "currentAccount", label: "Current Account" },
  { key: "documentNo", label: "Document No" },
  { key: "explanation", label: "Explanation" },
  { key: "specialCode", label: "Special Code" },
  { key: "debit", label: "Debit", align: "right" },
  { key: "credit", label: "Credit", align: "right" },
];
const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));
// Current Account identifies the line and always stays first & visible.
const FIXED_COLS: ColKey[] = ["currentAccount"];
const DEFAULT_WIDTHS: Record<ColKey, number> = {
  currentAccount: 220, documentNo: 150, explanation: 220, specialCode: 140, debit: 120, credit: 120,
};
const MIN_WIDTHS: Record<ColKey, number> = {
  currentAccount: 150, documentNo: 100, explanation: 140, specialCode: 90, debit: 80, credit: 80,
};
const DEL_W = 44;

interface LineRow {
  clientId: string;
  __rowId: number | null;
  currentAccountId: number | null;
  accountLabel: string;
  documentNo: string;
  explanation: string;
  specialCode: string;
  debit: string;
  credit: string;
}

const emptyLine = (): LineRow => ({
  clientId: uid(), __rowId: null, currentAccountId: null, accountLabel: "",
  documentNo: "", explanation: "", specialCode: "", debit: "", credit: "",
});

const isBlankLine = (row: LineRow) => !row.currentAccountId && !row.accountLabel.trim();

/** The subset of legacyErpApi.financialReceipts this grid needs. */
export interface FinancialReceiptItemsApi {
  listItems: (id: number) => Promise<any>;
  createItem: (id: number, d: any) => Promise<any>;
  updateItem: (id: number, itemId: number, d: any) => Promise<any>;
  removeItem: (id: number, itemId: number) => Promise<any>;
}

interface Props {
  fiReceiptId: number | null;
  readOnly?: boolean;
  api?: FinancialReceiptItemsApi;
}

export interface FinancialReceiptLineGridHandle {
  commitDrafts: (newFiReceiptId: number) => Promise<void>;
}

export const FinancialReceiptLineGrid = forwardRef<FinancialReceiptLineGridHandle, Props>(function FinancialReceiptLineGrid(
  { fiReceiptId, readOnly = false, api = legacyErpApi.financialReceipts },
  ref,
) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LineRow[]>(() => [emptyLine()]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // Decimal Parameters (Settings -> Screen Parameters -> Decimal) — round-on-blur for
  // Debit/Credit (Amount) cells below, via the shared decimalKey mechanism.
  const { round, ensureLoaded: ensureDecimalParamsLoaded } = useDecimalParameters();
  useEffect(() => { ensureDecimalParamsLoaded(); }, [ensureDecimalParamsLoaded]);
  const [accountOptions, setAccountOptions] = useState<AutocompleteOption[]>([]);
  const editingClientId = useRef<string | null>(null);

  useEffect(() => {
    legacyErpApi.accounts.list().then((r: any) => setAccountOptions(
      (Array.isArray(r) ? r : []).map((a: any) => ({ id: String(a.id), code: a.code, name: a.name })),
    )).catch(() => {});
  }, []);

  const fromApiRow = (r: any): LineRow => ({
    clientId: uid(), __rowId: r.id, currentAccountId: r.currentAccountId ?? null,
    accountLabel: "", documentNo: r.documentNo ?? "", explanation: r.explanation ?? "",
    specialCode: r.specialCode ?? "", debit: r.debit != null ? String(r.debit) : "", credit: r.credit != null ? String(r.credit) : "",
  });

  const hydrateAccounts = (list: LineRow[]): LineRow[] => {
    if (!accountOptions.length) return list;
    const byId = new Map(accountOptions.map((a) => [a.id, a]));
    return list.map((row) => {
      if (!row.currentAccountId) return row;
      const match = byId.get(String(row.currentAccountId));
      return match ? { ...row, accountLabel: match.code ? `${match.code} — ${match.name}` : (match.name ?? "") } : row;
    });
  };

  const load = async (idOverride?: number | null) => {
    const id = idOverride ?? fiReceiptId;
    if (!id) { setRows([emptyLine()]); return; }
    setLoading(true);
    try {
      const r: any = await api.listItems(id);
      const list = (Array.isArray(r) ? r : []).map(fromApiRow);
      setRows(hydrateAccounts(list).length ? hydrateAccounts(list) : [emptyLine()]);
    } catch (e: any) {
      toast.error(e.message || "Failed to load financial receipt lines");
      setRows([emptyLine()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fiReceiptId]);
  useEffect(() => { if (accountOptions.length) setRows((prev) => hydrateAccounts(prev)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [accountOptions]);

  // Decimal Parameters rounding happens HERE (not just via each cell's own EditableGridInput
  // decimalKey, which is visual round-on-blur only) — every commit path for this grid converges
  // on buildDto before hitting the API, so rounding the DTO value right here guarantees the
  // persisted value is correct regardless of which commit path fired. See
  // purchase-order-line-grid.tsx's own buildDto for the identical rationale/precedent.
  const buildDto = useCallback((row: LineRow) => ({
    currentAccountId: row.currentAccountId ?? undefined,
    documentNo: row.documentNo === "" ? undefined : row.documentNo,
    explanation: row.explanation === "" ? undefined : row.explanation,
    specialCode: row.specialCode === "" ? undefined : row.specialCode,
    debit: row.debit === "" ? undefined : round(row.debit, "amount"),
    credit: row.credit === "" ? undefined : round(row.credit, "amount"),
  }), [round]);

  const persistRow = useCallback(async (clientId: string, row: LineRow) => {
    if (!fiReceiptId) return;
    if (row.__rowId == null && isBlankLine(row)) return;
    try {
      if (row.__rowId == null) {
        const saved: any = await api.createItem(fiReceiptId, buildDto(row));
        setRows((prev) => prev.map((r) => (r.clientId === clientId && r.__rowId == null ? { ...r, __rowId: saved.id } : r)));
      } else {
        await api.updateItem(fiReceiptId, row.__rowId, buildDto(row));
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save line");
    }
  }, [fiReceiptId, buildDto, api]);

  const commitDrafts = async (newFiReceiptId: number) => {
    const draftRows = rows.filter((r) => !isBlankLine(r) && r.__rowId == null);
    for (const row of draftRows) {
      try {
        await api.createItem(newFiReceiptId, buildDto(row));
      } catch (e: any) {
        toast.error(e.message || "Failed to save a line item");
      }
    }
    await load(newFiReceiptId);
  };

  useImperativeHandle(ref, () => ({ commitDrafts }), [rows]);

  const addRow = () => setRows((prev) => [...prev, emptyLine()]);

  const confirmRemove = async () => {
    const clientId = pendingDeleteId;
    setPendingDeleteId(null);
    if (!clientId) return;
    const row = rows.find((r) => r.clientId === clientId);
    if (!row) return;
    if (row.__rowId != null && fiReceiptId) {
      try {
        await api.removeItem(fiReceiptId, row.__rowId);
      } catch (e: any) {
        toast.error(e.message);
        return;
      }
    }
    setRows((prev) => prev.filter((r) => r.clientId !== clientId));
  };

  const updateRow = useCallback((clientId: string, patch: Partial<LineRow>) => {
    setRows((prev) => prev.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)));
  }, []);

  const visibleRows = useMemo(
    () => rows.filter((r) => isBlankLine(r) || !searchTerm.trim() ||
      [r.accountLabel, r.documentNo, r.explanation, r.specialCode].some((v) => (v || "").toLowerCase().includes(searchTerm.trim().toLowerCase()))),
    [rows, searchTerm],
  );

  const CELL = "px-3.5 h-12 border-r border-b border-border";
  const CELL_BORDER = "border-r border-b border-border";
  const EDITOR_CONTROL = "h-full! w-full min-w-0 rounded-none border-0 bg-background px-3.5 text-[13px] font-medium shadow-none focus-visible:ring-0";

  // ---- Column resize/reorder/hide/persist — shared across every grid via useGridColumns ----
  const gridColumnDefs = useMemo(
    () => COLUMNS.map((c) => ({ key: c.key, label: c.label, defaultWidth: DEFAULT_WIDTHS[c.key], minWidth: MIN_WIDTHS[c.key] })),
    [],
  );
  const gridColumns = useGridColumns<ColKey>({
    storageKey: "financialReceiptLineGrid",
    columns: gridColumnDefs,
    fixedColumns: FIXED_COLS,
  });
  const displayColumnDefs = useMemo(
    () => gridColumns.displayColumnDefs.map((c) => COLUMN_BY_KEY.get(c.key)!),
    [gridColumns.displayColumnDefs],
  );
  const totalTableWidth = gridColumns.totalWidth(!readOnly ? DEL_W : 0);

  if (loading) return <Skeleton className="h-48 w-full rounded-lg" />;

  return (
    <div className="fr-grid rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      <style>{`
        .fr-grid [data-slot="table-container"] { max-height: 420px; overflow: auto; }
      `}</style>

      <div className="flex h-11 items-center justify-between gap-3 border-b border-border px-3">
        <div className="relative w-full max-w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search lines..."
            className="h-7 border-0 bg-muted/40 pl-8 text-[13px] shadow-none focus-visible:ring-1"
          />
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]" onClick={gridColumns.manageColumns.openModal}>
              <ListOrdered className="h-3.5 w-3.5 mr-1" />Manage Columns
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-[13px]" onClick={addRow}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add Row
            </Button>
          </div>
        )}
      </div>

      <Table className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
        <colgroup>
          {displayColumnDefs.map((col) => <col key={col.key} style={{ width: gridColumns.colWidths[col.key] }} />)}
          {!readOnly && <col style={{ width: DEL_W }} />}
        </colgroup>
        <TableHeader>
          <TableRow className="h-11 bg-muted hover:bg-muted">
            {displayColumnDefs.map((col) => {
              const fixed = FIXED_COLS.includes(col.key);
              return (
                <TableHead
                  key={col.key}
                  className={cn("relative p-0", CELL_BORDER, gridColumns.dragOverColumn === col.key && "bg-primary/15")}
                  onDragOver={gridColumns.getHeaderDragProps(col.key).onDragOver}
                  onDrop={gridColumns.getHeaderDragProps(col.key).onDrop}
                >
                  <span
                    title={col.label}
                    draggable={!fixed}
                    onDragStart={gridColumns.getHeaderDragProps(col.key).onDragStart}
                    onDragEnd={gridColumns.getHeaderDragProps(col.key).onDragEnd}
                    className={cn(
                      "flex h-11 w-full min-w-0 items-center truncate px-3.5 text-[11px] font-semibold uppercase tracking-wide",
                      col.align === "right" ? "justify-end" : "justify-start",
                      !fixed && "cursor-grab active:cursor-grabbing",
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
            {!readOnly && <TableHead className="h-11 w-11" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row) => {
            const cells: Record<ColKey, React.ReactNode> = {
              currentAccount: (
                <TableCell key="currentAccount" className={cn(CELL, "p-0")}>
                  {readOnly ? (
                    <div className="flex h-12 items-center px-3.5 text-[13px]">{row.accountLabel || "—"}</div>
                  ) : (
                    <AutocompleteTextCell
                      value={row.accountLabel}
                      options={accountOptions}
                      showDropdownIcon
                      onChange={(v) => updateRow(row.clientId, { accountLabel: v })}
                      onCommit={(v) => { updateRow(row.clientId, { accountLabel: v }); persistRow(row.clientId, { ...row, accountLabel: v }); }}
                      onCancel={() => {}}
                      onSelectOption={(o) => {
                        const label = o.code ? `${o.code} — ${o.name}` : (o.name ?? "");
                        const updated = { ...row, currentAccountId: Number(o.id), accountLabel: label };
                        updateRow(row.clientId, updated);
                        persistRow(row.clientId, updated);
                      }}
                    />
                  )}
                </TableCell>
              ),
              documentNo: (
                <TableCell key="documentNo" className={cn(CELL, "p-0")}>
                  <EditableGridInput
                    value={row.documentNo}
                    disabled={readOnly}
                    onChange={(v) => updateRow(row.clientId, { documentNo: v })}
                    onBlur={() => persistRow(row.clientId, row)}
                    className={EDITOR_CONTROL}
                  />
                </TableCell>
              ),
              explanation: (
                <TableCell key="explanation" className={cn(CELL, "p-0")}>
                  <EditableGridInput
                    value={row.explanation}
                    disabled={readOnly}
                    onChange={(v) => updateRow(row.clientId, { explanation: v })}
                    onBlur={() => persistRow(row.clientId, row)}
                    className={EDITOR_CONTROL}
                  />
                </TableCell>
              ),
              specialCode: (
                <TableCell key="specialCode" className={cn(CELL, "p-0")}>
                  <EditableGridInput
                    value={row.specialCode}
                    disabled={readOnly}
                    onChange={(v) => updateRow(row.clientId, { specialCode: v })}
                    onBlur={() => persistRow(row.clientId, row)}
                    className={EDITOR_CONTROL}
                  />
                </TableCell>
              ),
              debit: (
                <TableCell key="debit" className={cn(CELL, "p-0")}>
                  <EditableGridInput
                    type="number" align="right"
                    value={row.debit}
                    disabled={readOnly}
                    decimalKey="amount"
                    onChange={(v) => updateRow(row.clientId, { debit: v })}
                    onBlur={() => persistRow(row.clientId, row)}
                    className={EDITOR_CONTROL}
                  />
                </TableCell>
              ),
              credit: (
                <TableCell key="credit" className={cn(CELL, "p-0")}>
                  <EditableGridInput
                    type="number" align="right"
                    value={row.credit}
                    disabled={readOnly}
                    decimalKey="amount"
                    onChange={(v) => updateRow(row.clientId, { credit: v })}
                    onBlur={() => persistRow(row.clientId, row)}
                    className={EDITOR_CONTROL}
                  />
                </TableCell>
              ),
            };
            return (
              <TableRow key={row.clientId} className="h-12">
                {displayColumnDefs.map((col) => cells[col.key])}
                {!readOnly && (
                  <TableCell className="h-12 border-b border-border p-0 text-center">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setPendingDeleteId(row.clientId)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <ManageColumnsModal
        state={gridColumns.manageColumns}
        fixedColumns={FIXED_COLS}
        columns={gridColumnDefs}
        description="Show, hide and reorder columns. Current Account is required and always stays first."
      />

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete line</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this line? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmRemove}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
