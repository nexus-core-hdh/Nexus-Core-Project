"use client";

import { useEffect, useRef } from "react";
import { settingsApi } from "@/lib/api";

interface UseDraftFormOptions<T> {
  /** UserSettings.tablePreferences key this screen's draft is namespaced under — must be
   *  unique per screen (e.g. "purchaseOrderDraft"), the same per-screen-key convention
   *  useWorklist already established for custom worklists (see use-worklist.ts). */
  storageKey: string;
  /** Only active on a genuine New-record flow (no id yet) — false while editing/viewing an
   *  existing record, so a saved draft never gets restored onto, or overwritten by, an Edit
   *  screen. */
  enabled: boolean;
  form: T;
  setForm: (next: T) => void;
}

// Same debounce MasterDetailLayout already uses for its own tablePreferences writes (panel
// width) — reused here, not reinvented, for the same "don't PATCH on every keystroke" reason.
const SAVE_DEBOUNCE_MS = 600;

// Temporary New-record draft preservation, built on the exact same UserSettings.tablePreferences
// JSON column and load/merge/save choreography useWorklist already uses for custom worklists —
// no new table, no new endpoint. A screen's unsaved New-record form is written here debounced
// while `enabled`; navigating away (e.g. clicking the parent breadcrumb) does NOT clear it, so
// returning to the same New-record flow restores exactly what was typed. clearDraft() must be
// called explicitly after a successful Save (or an explicit Cancel/Discard) — see callers.
export function useDraftForm<T>({ storageKey, enabled, form, setForm }: UseDraftFormOptions<T>) {
  const restored = useRef(false);
  // Suppresses the save effect's very next run — used both right after restoring (so the
  // restored value isn't immediately re-saved as if it were a fresh edit) and right after
  // clearDraft() (so the form's own reset-to-blank doesn't resurrect the draft it just cleared).
  const skipNextSave = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || restored.current) return;
    restored.current = true;
    settingsApi.getCurrentSettings()
      .then((s: any) => {
        const draft = s?.tablePreferences?.[storageKey];
        if (draft && typeof draft === "object") setForm(draft as T);
      })
      .catch(() => {})
      .finally(() => { skipNextSave.current = true; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      settingsApi.updateCurrentSettings({ tablePreferences: { [storageKey]: form } }).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, enabled]);

  const clearDraft = () => {
    if (timer.current) clearTimeout(timer.current);
    skipNextSave.current = true;
    settingsApi.updateCurrentSettings({ tablePreferences: { [storageKey]: null } }).catch(() => {});
  };

  return { clearDraft };
}
