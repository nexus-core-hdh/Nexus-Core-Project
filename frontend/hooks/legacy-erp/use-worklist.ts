"use client";

import { useEffect, useMemo, useState } from "react";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { settingsApi } from "@/lib/api";
import { toast } from "sonner";
import { humanizeColumn } from "@/lib/legacy-erp/humanize";
import { STANDARD_WORKLIST_ID, fieldKey, type Worklist } from "@/lib/legacy-erp/worklist-types";

interface UseWorklistOptions {
  /** UserSettings.tablePreferences key this screen's worklists are namespaced under — must be
   * unique per screen (e.g. "yarnCardsListWorklists") so worklists never leak between screens,
   * exactly like receipt-master-data's own "receiptMasterDataWorklists" key. */
  storageKey: string;
}

// Extracted from receipt-master-data/page.tsx's original inline worklist state/load/save
// choreography (see that file's git history) so every Legacy ERP list screen gets the exact
// same Standard/custom-worklist behavior without re-implementing it. Callers still own their own
// `load()`/rows fetching — this hook only owns the worklist *selection and persistence* half, and
// derives the resulting `columns`/`columnLabel` once a worklist is active.
export function useWorklist({ storageKey }: UseWorklistOptions) {
  const [worklists, setWorklists] = useState<Worklist[]>([]);
  const [activeWorklistId, setActiveWorklistIdState] = useState<string>(STANDARD_WORKLIST_ID);
  const [designOpen, setDesignOpen] = useState(false);

  useEffect(() => {
    settingsApi.getCurrentSettings()
      .then((s: any) => setWorklists(Array.isArray(s?.tablePreferences?.[storageKey]) ? s.tablePreferences[storageKey] : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const activeWorklist = activeWorklistId === STANDARD_WORKLIST_ID
    ? null
    : worklists.find((w) => w.id === activeWorklistId) ?? null;

  // Standard = caller's own existing rows/columns, untouched. A custom worklist's columns come
  // directly from its saved field order, not filtered against loaded row keys — a configured
  // field is always shown as a column even when it can't resolve for a given row, rendering
  // blank rather than silently disappearing (same rule as receipt-master-data).
  const columnsFor = (standardColumns: string[]) =>
    activeWorklist ? activeWorklist.fields.map((f) => fieldKey(f)) : standardColumns;

  const columnLabel = (c: string, standardLabel?: (c: string) => string) => {
    if (!activeWorklist) return (standardLabel ?? humanizeColumn)(c);
    return activeWorklist.fields.find((f) => fieldKey(f) === c)?.label ?? humanizeColumn(c);
  };

  // worklistFields.resolve() rows are raw table rows (`r.*`) — primary key "RecId", not the "id"
  // alias each screen's own Standard .list() call already produces (`"RecId" as id`). Existing
  // row actions (View/Update/Delete, React keys, keyboard nav) all read `row.id` — this
  // normalizes a worklist result's identity onto that same key so those keep working completely
  // unchanged in worklist mode, without every screen re-deriving this itself. Call on a custom
  // worklist's resolved rows only; Standard rows already have `id` and pass through untouched.
  const normalizeRows = (rows: any[]): any[] => rows.map((r) => (r && r.id === undefined && r.RecId !== undefined ? { ...r, id: r.RecId } : r));

  const setActiveWorklistId = (id: string) => setActiveWorklistIdState(id);

  // Returns the (possibly adjusted) next active id + whether it changed, so callers can decide
  // whether to re-fetch. Mirrors receipt-master-data's saveWorklists: if the active worklist was
  // deleted in Design, fall back to Standard rather than pointing at a now-nonexistent id.
  const saveWorklists = async (next: Worklist[]): Promise<{ nextActiveId: string; activeWorklist: Worklist | null }> => {
    setWorklists(next);
    const stillExists = activeWorklistId === STANDARD_WORKLIST_ID || next.some((w) => w.id === activeWorklistId);
    const nextActiveId = stillExists ? activeWorklistId : STANDARD_WORKLIST_ID;
    if (!stillExists) setActiveWorklistIdState(STANDARD_WORKLIST_ID);
    try {
      await settingsApi.updateCurrentSettings({ tablePreferences: { [storageKey]: next } });
    } catch (e: any) {
      toast.error(e?.message || "Failed to save worklist");
    }
    return { nextActiveId, activeWorklist: nextActiveId === STANDARD_WORKLIST_ID ? null : next.find((w) => w.id === nextActiveId) ?? null };
  };

  return {
    worklists,
    activeWorklistId,
    setActiveWorklistId,
    activeWorklist,
    designOpen,
    setDesignOpen,
    columnsFor,
    columnLabel,
    normalizeRows,
    saveWorklists,
  };
}

export { STANDARD_WORKLIST_ID };
