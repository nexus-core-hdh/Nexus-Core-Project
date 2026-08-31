"use client";

import { useCallback } from "react";
import { useDecimalParametersStore } from "@/lib/store/decimal-parameters-store";
import { roundDecimalValue, formatDecimalValue, type DecimalFieldKey } from "@/lib/legacy-erp/decimal-parameters";

interface UseDecimalParametersResult {
  /** True once Decimal Parameters have been fetched at least once (see loading below). */
  loaded: boolean;
  loading: boolean;
  /** Fetches Decimal Parameters if not already loaded — safe to call from any consumer, a no-op
   *  once loaded, shared app-wide. Call this from a `useEffect`, not on every render. */
  ensureLoaded: () => void;
  /** Forces a refetch — call after saving changes in the admin Decimal Parameters form. */
  refresh: () => void;
  /** Rounds a value for calculation/storage per the configured precision + rounding mode (and
   *  the Unit Price override, when applicable). Falls back to this app's existing de-facto
   *  defaults when nothing is configured — see DEFAULT_DECIMAL_CONFIG. */
  round: (value: unknown, fieldKey: DecimalFieldKey) => number;
  /** Formats a value for display at the field's configured decimal count. Returns "—" for
   *  null/undefined/empty, matching every existing grid's own empty-cell convention. */
  format: (value: unknown, fieldKey: DecimalFieldKey) => string;
}

/**
 * The reusable core of Decimal Parameters consumption: any numeric field/grid can call this
 * instead of hand-rolling its own `num()`/`toFixed`/`toLocaleString` precision logic (see
 * purchase-order-line-grid.tsx / inventory-receipt-line-grid.tsx's own locally-duplicated
 * versions of exactly that). Backed by a shared store (lib/store/decimal-parameters-store.ts) so
 * this hook can be called from as many components as needed without each one independently
 * re-fetching. See components/ui/editable-grid-input.tsx for the one place this is currently
 * wired into a truly shared primitive.
 */
export function useDecimalParameters(): UseDecimalParametersResult {
  const config = useDecimalParametersStore((s) => s.config);
  const loading = useDecimalParametersStore((s) => s.loading);
  const hasLoaded = useDecimalParametersStore((s) => s.hasLoaded);
  const load = useDecimalParametersStore((s) => s.load);
  const invalidate = useDecimalParametersStore((s) => s.invalidate);

  const ensureLoaded = useCallback(() => { void load(); }, [load]);
  const refresh = useCallback(() => { invalidate(); void load(); }, [invalidate, load]);

  const round = useCallback((value: unknown, fieldKey: DecimalFieldKey) => roundDecimalValue(value, fieldKey, config), [config]);
  const format = useCallback((value: unknown, fieldKey: DecimalFieldKey) => formatDecimalValue(value, fieldKey, config), [config]);

  return { loaded: hasLoaded, loading, ensureLoaded, refresh, round, format };
}
