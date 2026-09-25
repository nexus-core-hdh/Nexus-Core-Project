"use client";

// Shared row-selection + Transaction Details + right-click receipt-menu logic for every Planning
// screen (Fabric/Yarn/Trim Planning) — extracted from Fabric Planning's own original inline
// implementation (the first screen this shipped on) rather than copy-pasted a second and third
// time. Fabric Planning itself was refactored to call this hook too, so all Planning screens now
// share exactly one implementation. Generic over the row type — this file has no knowledge of
// Fabric/Yarn/Trim.
//
// The generic plain/ctrl/shift-click + right-click preserve/collapse SELECTION mechanics now live
// in the project-wide `useRowSelection` hook (hooks/use-row-selection.ts) — this file composes
// that hook rather than hand-rolling the same logic a second time, so every grid in the app (this
// one included) shares exactly one selection implementation. What stays here is what's genuinely
// Planning-specific: loading Transaction Details on a plain click, and building the right-click
// receipt menu from the resulting selected set.
//
// One hook call per Planning screen instance (each screen calls this once, passing its OWN
// current `rows` + a `source` identity for Inventory Statement's own "back" link) — never shared/
// global state, so Fabric/Yarn/Trim Planning's selections are always fully independent of each
// other (each is a separate mounted component instance with its own hook call, same as any other
// useState would be).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { useRowSelection } from "@/hooks/use-row-selection";
import { buildPlanningReceiptActions, useSubcontractTypes, type PlanningMenuSource, type PlanningRowContext } from "./receipt-menu";

export function usePlanningRowSelection<T extends PlanningRowContext & { id: string | number }>(
  rows: T[],
  source: PlanningMenuSource,
  // Opens the Received Allocation dialog for a single row's real scope — see
  // buildPlanningReceiptActions' own comment on why this is a callback, not a route. Optional so
  // existing call sites (if any is ever added without allocation support) keep compiling unchanged.
  onOpenAllocation?: (row: T) => void,
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

  // Selection mechanics (plain/ctrl/shift-click, right-click preserve/collapse, `selectedIds`) come
  // from the shared hook — `onPlainSelect` is the one Planning-specific hook point: a plain click
  // still does exactly what it always did (select this one row, load its Transaction Details).
  // Ctrl/shift-click never touch Transaction Details, same as before.
  const {
    selectedIds, selectRow, toggleRow, handleRowContextMenu, getSelectedRows,
    selectAll, allSelected, someSelected,
    clearSelection: clearBaseSelection,
  } = useRowSelection(rows, { onPlainSelect: (row) => void loadTransactionsFor(row) });

  // Header checkbox for the optional checkbox column — toggles between "select every currently
  // loaded row" and "clear", without touching Transaction Details (unlike `clearSelection` below,
  // which is the filter-bar "Clear" button's own full-screen reset).
  const toggleAllRows = () => (allSelected ? clearBaseSelection() : selectAll());

  // Real IDs only (inventoryId/workOrderId/colorCardId from the row itself — see receipt-menu.ts's
  // own top comment on why no item is ever identified by display name alone). Falls back to just
  // the right-clicked row when selectedIds is somehow empty (defensive only — handleRowContextMenu
  // above already guarantees it contains at least this row by the time this runs, since both fire
  // off the same native contextmenu event and React batches the state update ahead of paint).
  const getRowActions = (row: T) => {
    const active = selectedIds.size ? getSelectedRows() : [row];
    return buildPlanningReceiptActions(
      active, router, source, subcontractTypes,
      onOpenAllocation ? (r) => onOpenAllocation(r as T) : undefined,
    );
  };

  const clearSelection = () => {
    setSelectedRow(null);
    setTransactionRows([]);
    setShowTransactions(false);
    clearBaseSelection();
  };

  const closeTransactions = () => {
    setSelectedRow(null);
    setTransactionRows([]);
    setShowTransactions(false);
  };

  return {
    selectedRow, transactionRows, loadingTransactions, showTransactions, selectedIds,
    selectRow, handleRowContextMenu, getRowActions, clearSelection, closeTransactions,
    // Checkbox-column plumbing (ReportGrid's own `selectable`/`onToggleRow`/`onToggleAll`/
    // `allSelected`/`someSelected` props) — additive; a Planning page can opt into the checkbox
    // column with zero extra selection logic of its own.
    toggleRow, toggleAllRows, allSelected, someSelected,
  };
}
