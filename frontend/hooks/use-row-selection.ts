"use client";

// Shared ERP grid row-selection primitive — the generic plain/ctrl/shift-click + right-click
// preserve/collapse semantics originally built (and still verified correct) inside Fabric/Yarn/
// Trim Planning's own use-planning-row-selection.ts. Extracted here so ANY grid (ReportGrid or
// WorklistTable) can opt into the exact same selection behavior instead of a second, competing
// implementation. Pure extraction — behavior is unchanged from the original, only the
// Planning-specific pieces (Transaction Details loading, receipt-menu building) stay in
// use-planning-row-selection.ts, which now composes this hook instead of hand-rolling the same
// logic (see that file's own comment).
//
// Selection is always keyed by a real row identity (never array index), so it survives sorting/
// filtering/pagination/refresh as long as the same real record keeps the same id — exactly the
// convention ReportGrid's own `isSelected` check already relies on. Most callers' rows already
// have a plain `.id` field, so `getId` defaults to that; a screen whose row identity lives under a
// different key (e.g. receipt-master-data's own `row.RecId`, same field its `WorklistTable`
// `getRowKey` already uses) passes its own `getId` — the same "row identity is caller-supplied,
// never assumed" convention `WorklistTable.getRowKey` already established.
import { useRef, useState } from "react";

export interface UseRowSelectionResult<T> {
  selectedIds: Set<string | number>;
  /** Plain click replaces the selection with just this row; ctrl/cmd-click toggles it in/out of
   *  the current selection; shift-click range-selects from the last plain-clicked anchor to this
   *  row (using `rows`' current order). Omit `e` to always treat it as a plain click. */
  selectRow: (row: T, e?: React.MouseEvent) => void;
  /** Checkbox-click equivalent of ctrl-click — toggles this one row, sets it as the new shift
   *  anchor, never replaces the rest of the selection. */
  toggleRow: (row: T) => void;
  /** Right-click an unselected row -> collapse selection to just that row (make it the active
   *  context). Right-click a row that's already part of the current selection -> leave the whole
   *  multi-selection untouched, so a context menu / bulk action operates on the full set. */
  handleRowContextMenu: (row: T) => void;
  /** Selects every row currently in `rows` (the array passed to this hook call). */
  selectAll: () => void;
  clearSelection: () => void;
  isSelected: (row: T) => boolean;
  allSelected: boolean;
  someSelected: boolean;
  /** Resolves the current `selectedIds` Set back to real row objects from `rows`. */
  getSelectedRows: () => T[];
}

export function useRowSelection<T>(
  rows: T[],
  options?: { onPlainSelect?: (row: T) => void; getId?: (row: T) => string | number },
): UseRowSelectionResult<T> {
  const getId = options?.getId ?? ((row: T) => (row as unknown as { id: string | number }).id);
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const lastPlainClickId = useRef<string | number | null>(null);

  const selectRow = (row: T, e?: React.MouseEvent) => {
    const rowId = getId(row);
    if (e?.shiftKey && lastPlainClickId.current != null) {
      const ids = rows.map(getId);
      const a = ids.indexOf(lastPlainClickId.current);
      const b = ids.indexOf(rowId);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedIds(new Set(ids.slice(lo, hi + 1)));
      }
      return;
    }
    if (e?.ctrlKey || e?.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
        return next;
      });
      lastPlainClickId.current = rowId;
      return;
    }
    lastPlainClickId.current = rowId;
    setSelectedIds(new Set([rowId]));
    options?.onPlainSelect?.(row);
  };

  const toggleRow = (row: T) => {
    const rowId = getId(row);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
      return next;
    });
    lastPlainClickId.current = rowId;
  };

  const handleRowContextMenu = (row: T) => {
    const rowId = getId(row);
    setSelectedIds((prev) => (prev.has(rowId) ? prev : new Set([rowId])));
  };

  const selectAll = () => setSelectedIds(new Set(rows.map(getId)));
  const clearSelection = () => {
    setSelectedIds(new Set());
    lastPlainClickId.current = null;
  };

  const isSelected = (row: T) => selectedIds.has(getId(row));
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(getId(r)));
  const someSelected = !allSelected && rows.some((r) => selectedIds.has(getId(r)));
  const getSelectedRows = () => rows.filter((r) => selectedIds.has(getId(r)));

  return {
    selectedIds, selectRow, toggleRow, handleRowContextMenu, selectAll, clearSelection,
    isSelected, allSelected, someSelected, getSelectedRows,
  };
}
