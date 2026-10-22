"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { entitiesApi } from "@/lib/nexuscore-api";
import type { GridColumnDef } from "@/hooks/use-grid-columns";

// Grid-level User Defined Fields — the one runtime every shared detail grid plugs into (backend:
// nexuscore-backend/src/modules/entities/custom-field-grids.ts). A grid passes its LOGICAL grid key
// ("OrderLine", "ContractLine", ...), never its page, so a definition shows up in every screen
// that renders that grid, while each value stays on its own row.
//
//  - Definitions: the caller's active fields for the grid, fetched once per grid mount.
//  - Values: every live row of the current document in one request (never one per row).
//  - Columns: one GridColumnDef per field with the stable key `udf:<field code>`, fed into the
//    grid's existing useGridColumns, so Manage Columns / resize / reorder / persistence apply.
//  - Editing is buffered per row and stored by the document's normal Save: the screen calls
//    validate(rowIds) before writing the document and save(rowIds) after it — one batched PUT of
//    every saved row (unchanged values are not rewritten server-side, so Required and Default
//    Values are applied to every row exactly like a screen's Customized Fields).
//  - Rows not saved yet have no id the server could verify, so their UDF cells stay read-only
//    until the row exists (the server refuses unknown rows regardless).

export type UdfColumnKey = `udf:${string}`;

export interface GridUdfField {
  id: string;
  code: string;
  name: string;
  type: "text" | "textarea" | "email" | "number" | "date" | "checkbox" | "select";
  required: boolean;
  options: string[] | null;
  defaultValue: unknown;
}

export const isUdfColumnKey = (key: string): key is UdfColumnKey => key.startsWith("udf:");

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

type RowValues = Record<string, Record<string, unknown>>; // rowId -> fieldId -> value

export interface GridUdf {
  fields: GridUdfField[];
  columnDefs: GridColumnDef<UdfColumnKey>[];
  fieldForColumn: (key: string) => GridUdfField | undefined;
  /** What the cell shows: the edit, else the stored value, else the field's Default Value. */
  valueOf: (rowId: string | number | null | undefined, fieldId: string) => unknown;
  setValue: (rowId: string | number, fieldId: string, value: unknown) => void;
  /** Cells to highlight after a failed validate(). */
  isMissing: (rowId: string | number | null | undefined, fieldId: string) => boolean;
  dirty: boolean;
  /** Required check over the given saved rows; highlights and reports what is missing. */
  validate: (rowIds: (string | number)[]) => boolean;
  /** Stores every given saved row's values against `parentId` (one request). True when done. */
  save: (parentId: string | number, rowIds: (string | number)[]) => Promise<boolean>;
}

export function useGridUdf({ grid, parentId, enabled = true }: {
  grid: string;
  parentId: string | number | null | undefined;
  /** False skips loading entirely (e.g. a usage of a shared component this grid isn't supported in). */
  enabled?: boolean;
}): GridUdf {
  const [fields, setFields] = useState<GridUdfField[]>([]);
  const [stored, setStored] = useState<RowValues>({});
  const [edits, setEdits] = useState<RowValues>({});
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const storedRef = useRef(stored);
  storedRef.current = stored;

  useEffect(() => {
    if (!enabled) { setFields([]); return; }
    let cancelled = false;
    entitiesApi.getCustomFields(grid)
      .then((defs: any) => { if (!cancelled) setFields(Array.isArray(defs) ? defs : []); })
      .catch(() => { if (!cancelled) setFields([]); });
    return () => { cancelled = true; };
  }, [grid, enabled]);

  const parentKey = parentId == null || parentId === "" ? null : String(parentId);
  const loadValues = useCallback(async (id: string) => {
    const vals: any = await entitiesApi.getGridCustomFieldValues(grid, id);
    const next: RowValues = {};
    (Array.isArray(vals) ? vals : []).forEach((v: any) => { (next[v.entityId] ||= {})[v.customFieldId] = v.value; });
    return next;
  }, [grid]);

  useEffect(() => {
    setEdits({});
    setMissing(new Set());
    if (!enabled || !parentKey || !fields.length) { setStored({}); return; }
    let cancelled = false;
    loadValues(parentKey)
      .then((next) => { if (!cancelled) setStored(next); })
      .catch((e: any) => { if (!cancelled) toast.error(e.message || "Failed to load customized grid fields"); });
    return () => { cancelled = true; };
  }, [enabled, parentKey, fields.length, loadValues]);

  const byColumn = useMemo(() => new Map(fields.map((f) => [`udf:${f.code}`, f])), [fields]);
  const columnDefs = useMemo<GridColumnDef<UdfColumnKey>[]>(
    () => fields.map((f) => ({
      key: `udf:${f.code}` as UdfColumnKey,
      label: `${f.name}${f.required && f.type !== "checkbox" ? " *" : ""}`,
      defaultWidth: f.type === "textarea" ? 200 : f.type === "checkbox" ? 90 : 140,
      minWidth: 80,
    })),
    [fields],
  );

  const resolve = (rowId: string, f: GridUdfField, e: RowValues, s: RowValues) => {
    if (e[rowId] && f.id in e[rowId]) return e[rowId][f.id];
    if (s[rowId] && f.id in s[rowId]) return s[rowId][f.id];
    return f.defaultValue ?? null;
  };

  const valueOf = useCallback((rowId: string | number | null | undefined, fieldId: string) => {
    const f = fields.find((x) => x.id === fieldId);
    if (!f || rowId == null) return null;
    return resolve(String(rowId), f, edits, stored);
  }, [fields, edits, stored]);

  const setValue = useCallback((rowId: string | number, fieldId: string, value: unknown) => {
    const id = String(rowId);
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [fieldId]: value } }));
    setMissing((prev) => {
      const key = `${id}:${fieldId}`;
      if (!prev.has(key)) return prev;
      const next = new Set(prev); next.delete(key); return next;
    });
  }, []);

  const dirty = useMemo(() => Object.entries(edits).some(([rowId, vals]) =>
    Object.entries(vals).some(([fieldId, v]) => !same(v, stored[rowId]?.[fieldId]))), [edits, stored]);

  const validate = useCallback((rowIds: (string | number)[]) => {
    const found = new Set<string>();
    const names = new Set<string>();
    for (const raw of rowIds) {
      const rowId = String(raw);
      for (const f of fields) {
        if (!f.required || f.type === "checkbox") continue;
        if (isBlank(resolve(rowId, f, editsRef.current, storedRef.current))) { found.add(`${rowId}:${f.id}`); names.add(f.name); }
      }
    }
    setMissing(found);
    if (found.size) toast.error(`Grid fields required on every line: ${[...names].map((n) => `"${n}"`).join(", ")}.`);
    return found.size === 0;
  }, [fields]);

  const save = useCallback(async (parent: string | number, rowIds: (string | number)[]) => {
    if (!fields.length) return true;
    const ids = [...new Set(rowIds.map(String))];
    if (!ids.length) return true;
    const rows = ids.map((rowId) => ({
      rowId,
      values: fields.map((f) => ({ customFieldId: f.id, value: resolve(rowId, f, editsRef.current, storedRef.current) })),
    }));
    try {
      // The response is the stored values of every row sent — the whole saved grid.
      const saved: any = await entitiesApi.upsertGridCustomFieldValues(grid, String(parent), rows);
      const next: RowValues = {};
      (Array.isArray(saved) ? saved : []).forEach((v: any) => { (next[v.entityId] ||= {})[v.customFieldId] = v.value; });
      setStored(next);
      setEdits({});
      setMissing(new Set());
      return true;
    } catch (e: any) {
      toast.error(`Customized grid fields were not saved: ${e.message || "unknown error"}`);
      return false;
    }
  }, [fields, grid, loadValues]);

  const isMissing = useCallback((rowId: string | number | null | undefined, fieldId: string) =>
    rowId != null && missing.has(`${rowId}:${fieldId}`), [missing]);

  return {
    fields, columnDefs, fieldForColumn: (key: string) => byColumn.get(key),
    valueOf, setValue, isMissing, dirty, validate, save,
  };
}
