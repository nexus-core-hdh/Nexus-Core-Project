"use client";

import { useCallback } from "react";

import { useScreenIndexStore } from "@/lib/store/screen-index-store";
import type { ScreenEntry } from "@/lib/search/screen-index";
import type { NavGroup } from "@/components/layout/sidebar/nav-main";

interface UseGlobalScreenSearchResult {
  entries: ScreenEntry[];
  /** Same permission-filtered screens as `entries`, kept as a tree (sections preserved) instead of flattened — used by the Module Launcher. */
  groups: NavGroup[];
  loading: boolean;
  /** Fetches + permission-filters the screen index if it hasn't been loaded yet. Safe to call from any consumer — it's a no-op once loaded, and the result is shared app-wide. */
  ensureLoaded: () => void;
  /** Forces a refetch — call after menu/navigation data or the user's permissions change. */
  refresh: () => void;
}

/**
 * The reusable core of the Global Screen Search: every screen the current user
 * has permission to access, across the whole ERP. Backed by a shared store
 * (lib/store/screen-index-store.ts) so this hook can be called from as many
 * components as needed — the search palette, the Workspace Tab Bar, the My
 * Menu screen — without each one independently re-fetching and re-filtering.
 */
export function useGlobalScreenSearch(): UseGlobalScreenSearchResult {
  const entries = useScreenIndexStore((s) => s.entries);
  const groups = useScreenIndexStore((s) => s.groups);
  const loading = useScreenIndexStore((s) => s.loading);
  const load = useScreenIndexStore((s) => s.load);
  const invalidate = useScreenIndexStore((s) => s.invalidate);

  const ensureLoaded = useCallback(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    invalidate();
    void load();
  }, [invalidate, load]);

  return { entries, groups, loading, ensureLoaded, refresh };
}
