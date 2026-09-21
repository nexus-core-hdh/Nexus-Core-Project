"use client";

// Shared row-selection + Transaction Details + right-click receipt-menu logic for every Planning
// screen (Fabric/Yarn/Trim Planning) — extracted from Fabric Planning's own original inline
// implementation (the first screen this shipped on) rather than copy-pasted a second and third
// time. Fabric Planning itself was refactored to call this hook too, so all Planning screens now
// share exactly one implementation — its own behavior is unchanged (same state shape, same plain/
// ctrl/shift-click rules, same right-click collapse-vs-preserve rule), only where the code lives
// moved. Generic over the row type — this file has no knowledge of Fabric/Yarn/Trim.
//
// One hook call per Planning screen instance (each screen calls this once, passing its OWN
// current `rows` + a `source` identity for Inventory Statement's own "back" link) — never shared/
// global state, so Fabric/Yarn/Trim Planning's selections are always fully independent of each
// other (each is a separate mounted component instance with its own hook call, same as any other
// useState would be).
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { buildPlanningReceiptActions, useSubcontractTypes, type PlanningMenuSource, type PlanningRowContext } from "./receipt-menu";

export function usePlanningRowSelection<T extends PlanningRowContext & { id: string | number }>(
  rows: T[],
  source: PlanningMenuSource,
) {
  const router = useRouter();
  // Real Subcontract Types (MD_SubcontractType, Active-only) for the "Subcontractor Transactions"
  // submenu — fetched once (shared cache across every Planning screen instance, see
  // useSubcontractTypes' own comment), not per-row/per-click. Every caller of this hook (Fabric/
  // Yarn/Trim Planning) picks this up automatically without any change of its own.
  const subcontractTypes = useSubcontractTypes();

  const [selectedRow, setSelectedRow] = useState<T | null>(null);
  const [transactionRows, setTransactionRows] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);

  // Multi-row selection for the right-click receipt menu — independent of `selectedRow` above
  // (which stays exactly what it always was: the single row driving Transaction Details). Plain
  // click still does only what it always did (select + load Transaction Details); ctrl/shift-click
  // build this Set without touching Transaction Details at all. `lastPlainClickId` is the anchor a
  // Shift-click range-selects from — the last row a PLAIN (no-modifier) click landed on.
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const lastPlainClickId = useRef<string | number | null>(null);

  const loadTransactionsFor = async (row: T) => {
    setSelectedRow(row);
    setShowTransactions(true);
    setLoadingTransactions(true);
    try {
      const data: any = await legacyErpApi.workOrders.requirements.getTransactions(row.workOrderId, {
        inventoryId: row.inventoryId,
        colorCardId: row.colorCardId,
      });
      setTransactionRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load Transaction Details");
      setTransactionRows([]);
    } finally {
      setLoadingTransactions(false);
    }
  };

  // Plain click (no modifier): exactly the original, unchanged behavior — select this one row,
  // load its Transaction Details. Ctrl/Cmd-click: toggle this row in/out of the multi-selection,
  // Transaction Details untouched. Shift-click: range-select between the last plain-clicked row
  // and this one (in the grid's current row order), Transaction Details untouched.
  const selectRow = (row: T, e?: React.MouseEvent) => {
    if (e?.shiftKey && lastPlainClickId.current != null) {
      const ids = rows.map((r) => r.id);
      const a = ids.indexOf(lastPlainClickId.current);
      const b = ids.indexOf(row.id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedIds(new Set(ids.slice(lo, hi + 1)));
      }
      return;
    }
    if (e?.ctrlKey || e?.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
        return next;
      });
      lastPlainClickId.current = row.id;
      return;
    }
    lastPlainClickId.current = row.id;
    setSelectedIds(new Set([row.id]));
    void loadTransactionsFor(row);
  };

  // Right-click an unselected row -> collapse selection to just that row (the "make it the active
  // context row" rule). Right-click a row that's already part of the current multi-selection ->
  // leave `selectedIds` untouched entirely, preserving the multi-selection — this handler simply
  // never runs the "collapse" branch in that case. Functional update so this never reads a stale
  // `selectedIds` closure between the fast series of native events a right-click dispatches.
  const handleRowContextMenu = (row: T) => {
    setSelectedIds((prev) => (prev.has(row.id) ? prev : new Set([row.id])));
  };

  // Real IDs only (inventoryId/workOrderId/colorCardId from the row itself — see receipt-menu.ts's
  // own top comment on why no item is ever identified by display name alone). Falls back to just
  // the right-clicked row when selectedIds is somehow empty (defensive only — handleRowContextMenu
  // above already guarantees it contains at least this row by the time this runs, since both fire
  // off the same native contextmenu event and React batches the state update ahead of paint).
  const getRowActions = (row: T) => {
    const active = selectedIds.size ? rows.filter((r) => selectedIds.has(r.id)) : [row];
    return buildPlanningReceiptActions(active, router, source, subcontractTypes);
  };

  const clearSelection = () => {
    setSelectedRow(null);
    setTransactionRows([]);
    setShowTransactions(false);
    setSelectedIds(new Set());
    lastPlainClickId.current = null;
  };

  const closeTransactions = () => {
    setSelectedRow(null);
    setTransactionRows([]);
    setShowTransactions(false);
  };

  return {
    selectedRow, transactionRows, loadingTransactions, showTransactions, selectedIds,
    selectRow, handleRowContextMenu, getRowActions, clearSelection, closeTransactions,
  };
}
