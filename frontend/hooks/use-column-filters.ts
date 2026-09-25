"use client";

// Shared ERP grid column-filtering primitive — the Excel-style funnel-icon header filter, usable
// by ANY grid (ReportGrid or WorklistTable) whose columns declare `filterable`/`filterValue`. Built
// once here so both grid families inherit identical filter STATE/matching logic instead of each
// re-deriving its own `visibleRows` — only the header UI (funnel icon placement) differs per grid,
// which stays in each grid component itself.
//
// Filtering is always client-side over the CALLER'S CURRENTLY LOADED `rows` (never a re-fetch) —
// safe because every grid using this already loads its full working set. `filterValue` must return
// the real underlying value (a code, a raw ISO date, a raw number) — never a formatted display
// string or row index — so filtering matches this file's own "real identity, not display text"
// convention, same as row selection's own `getId`.
import { useMemo, useState } from "react";

export type ColumnFilterType = "select" | "number" | "date";

export interface FilterableColumnDef<T> {
  key: string;
  filterable?: boolean;
  // Default "select" — an Excel-style checkbox multi-select over distinct values (covers text,
  // code/name, and enum/status/boolean columns alike: a boolean column's own filterValue simply
  // returns "Yes"/"No", which then behaves as a 2-option select). "number"/"date" render a
  // min/max range control instead of an unbounded checkbox list (impractical for a column with
  // many/continuous distinct values).
  filterType?: ColumnFilterType;
  filterValue?: (row: T) => string | number | null | undefined;
}

export interface ColumnFilterState {
  /** "select" type: the checked values. */
  values?: Set<string>;
  /** "number"/"date" type: inclusive range bounds, as raw strings (parsed at filter time). */
  min?: string;
  max?: string;
}

const EMPTY_STATE: ColumnFilterState = {};

function isActive(state: ColumnFilterState | undefined): boolean {
  if (!state) return false;
  return !!(state.values?.size || state.min || state.max);
}

export function useColumnFilters<T, C extends FilterableColumnDef<T>>(rows: T[], columns: C[]) {
  const [filters, setFilters] = useState<Record<string, ColumnFilterState>>({});

  const filterableColumns = useMemo(() => columns.filter((c) => c.filterable && c.filterValue), [columns]);
  const colByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);

  // Distinct option lists — only computed for "select"-type columns (a "number"/"date" column
  // renders a range input instead, never an enumerated checkbox list).
  const selectOptionsByColumn = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of filterableColumns) {
      if ((c.filterType ?? "select") !== "select") continue;
      const values = new Set<string>();
      for (const row of rows) {
        const v = c.filterValue!(row);
        if (v != null && v !== "") values.add(String(v));
      }
      out[c.key] = Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
    return out;
  }, [filterableColumns, rows]);

  const visibleRows = useMemo(() => {
    const active = Object.entries(filters).filter(([, s]) => isActive(s));
    if (!active.length) return rows;
    return rows.filter((row) =>
      active.every(([key, state]) => {
        const col = colByKey.get(key);
        if (!col?.filterValue) return true;
        const raw = col.filterValue(row);
        const type = col.filterType ?? "select";
        if (type === "select") {
          return raw != null && state.values?.has(String(raw));
        }
        if (raw == null || raw === "") return false;
        const num = type === "number" ? Number(raw) : new Date(raw).getTime();
        if (Number.isNaN(num)) return false;
        if (state.min) {
          const min = type === "number" ? Number(state.min) : new Date(state.min).getTime();
          if (!Number.isNaN(min) && num < min) return false;
        }
        if (state.max) {
          const max = type === "number" ? Number(state.max) : new Date(state.max).getTime();
          if (!Number.isNaN(max) && num > max) return false;
        }
        return true;
      }),
    );
  }, [rows, filters, colByKey]);

  const filtersActive = Object.values(filters).some(isActive);

  const setColumnFilter = (key: string, next: ColumnFilterState) =>
    setFilters((prev) => ({ ...prev, [key]: next }));
  const clearAllFilters = () => setFilters({});
  const getColumnFilter = (key: string) => filters[key] ?? EMPTY_STATE;

  return {
    columnFilters: filters, visibleRows, selectOptionsByColumn, filtersActive,
    setColumnFilter, clearAllFilters, getColumnFilter,
  };
}
