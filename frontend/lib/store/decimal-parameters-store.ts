import { create } from "zustand";
import { screenParametersApi } from "@/lib/nexuscore-api";
import { DECIMAL_PARAMETERS_SCREEN_KEY, DEFAULT_DECIMAL_CONFIG, parseDecimalParameterRows, type DecimalParametersConfig } from "@/lib/legacy-erp/decimal-parameters";

interface DecimalParametersState {
  config: DecimalParametersConfig;
  loading: boolean;
  hasLoaded: boolean;
  load: () => Promise<void>;
  invalidate: () => void;
}

// The single shared fetch of Decimal Parameters — backed by Zustand (not per-component
// useState) so every consumer (EditableGridInput, any future numeric field, the admin form's own
// read-back) shares one in-flight request/cache instead of each firing its own, same rationale as
// lib/store/screen-index-store.ts. Rows come from the existing, generic
// GET /general-settings/screen-parameters/active?screenKey=... — no new endpoint.
export const useDecimalParametersStore = create<DecimalParametersState>((set, get) => ({
  config: DEFAULT_DECIMAL_CONFIG,
  loading: false,
  hasLoaded: false,

  load: async () => {
    if (get().hasLoaded || get().loading) return;
    set({ loading: true });
    try {
      const rows: any = await screenParametersApi.listActive(DECIMAL_PARAMETERS_SCREEN_KEY);
      const list = Array.isArray(rows) ? rows : [];
      // An inactive or malformed row was already excluded by /active, or falls back to the
      // existing default inside the parser — never lets a bad stored value corrupt calculations.
      set({ config: parseDecimalParameterRows(list) as DecimalParametersConfig, hasLoaded: true });
    } catch (error) {
      console.error("Failed to load Decimal Parameters:", error);
      set({ config: DEFAULT_DECIMAL_CONFIG });
    } finally {
      set({ loading: false });
    }
  },

  invalidate: () => set({ hasLoaded: false }),
}));
