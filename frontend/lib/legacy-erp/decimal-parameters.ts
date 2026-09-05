// Decimal Parameters — a fixed, known set of numeric-precision settings (Quantity, Unit Price,
// Amount, Forex fields, ...) plus a global Rounding mode and a Unit Price override flag. Stored
// as ordinary rows in the EXISTING, generic ScreenParameter table (see
// nexuscore-backend/src/modules/general-settings/) under one synthetic, non-navigable screenKey
// — this is deliberately NOT a new table/service: every read/write here goes through the same
// screenParametersApi (lib/nexuscore-api.ts) every other Screen Parameter already uses. Pure
// constants/types/math live here (no React, no API calls) so both the admin form
// (general-settings/screen-parameters/page.tsx) and the consumer store/hook
// (lib/store/decimal-parameters-store.ts / hooks/use-decimal-parameters.ts) share one definition
// of what these fields mean and how rounding is computed.

export const DECIMAL_PARAMETERS_SCREEN_KEY = "system:decimal-parameters";

export type DecimalFieldKey =
  | "quantity"
  | "unit-price"
  | "cost-unit-price"
  | "amount"
  | "discount-percent"
  | "forex-unit-price"
  | "forex-amount"
  | "forex-rate"
  | "variant-quantity"
  | "recipe-percent"
  | "salary";

// Defaults match the reference legacy screen's own "Decimal" parameter tab exactly (Quantity/
// Unit Price/Cost Unit Price/Forex Unit Price/Forex Rate/Amount/Forex Amount/Recipe % at 4,
// Discount-Fix Term %/Variant Qty/Salary at 2) — corrected from this app's own earlier
// placeholder guesses for Amount/Forex Amount/Variant Quantity/Recipe %, which didn't match that
// reference. Still only ever a form pre-fill/display fallback (see roundDecimalValue's own
// comment) — no live calculation changes until an admin actually visits Settings and saves.
export const DECIMAL_FIELD_DEFS: { key: DecimalFieldKey; label: string; defaultDecimals: number }[] = [
  { key: "quantity", label: "Quantity", defaultDecimals: 4 },
  { key: "unit-price", label: "Unit Price", defaultDecimals: 4 },
  { key: "cost-unit-price", label: "Cost Unit Price", defaultDecimals: 4 },
  { key: "amount", label: "Amount", defaultDecimals: 4 },
  { key: "discount-percent", label: "Discount / Fix Term %", defaultDecimals: 2 },
  { key: "forex-unit-price", label: "Forex Unit Price", defaultDecimals: 4 },
  { key: "forex-amount", label: "Forex Amount", defaultDecimals: 4 },
  { key: "forex-rate", label: "Forex Rate", defaultDecimals: 4 },
  { key: "variant-quantity", label: "Variant Quantity", defaultDecimals: 2 },
  { key: "recipe-percent", label: "Recipe %", defaultDecimals: 4 },
  { key: "salary", label: "Salary", defaultDecimals: 2 },
];

export type RoundingMode = "none" | "round-up" | "round-down" | "standard";

export const ROUNDING_MODES: { value: RoundingMode; label: string }[] = [
  { value: "none", label: "None" },
  { value: "round-up", label: "Round Up" },
  { value: "round-down", label: "Round Down" },
  { value: "standard", label: "Standard Rounding" },
];

// ParamKey for the two non-per-field settings, stored as rows in the same table/screenKey.
export const ROUNDING_MODE_PARAM_KEY = "rounding-mode";
export const UNIT_PRICE_NO_DECIMAL_OVERRIDE_PARAM_KEY = "unit-price-no-decimal-override";

// `decimals[key]` is only ever present once an admin has actually saved a value for that field
// — absent (not defaulted) means genuinely unconfigured. This is what lets roundDecimalValue()
// below tell "nothing configured, don't touch the value" apart from "configured to round to N
// places" — collapsing that distinction (e.g. by defaulting every key to a baseline precision)
// would silently round every unconfigured field's PERSISTED value the moment any consumer calls
// round() for it, which is not "preserve existing behavior when not configured".
export interface DecimalParametersConfig {
  decimals: Partial<Record<DecimalFieldKey, number>>;
  roundingMode: RoundingMode;
  unitPriceNoDecimalOverride: boolean;
}

// The "existing behavior when Decimal Parameters are not configured" baseline: nothing
// configured for any field, Rounding = None (matching the reference screen's own default —
// irrelevant until a field IS configured, since roundDecimalValue() never applies a rounding mode
// to an unconfigured field regardless), no Unit Price override. Every consumer (store, admin
// form) starts from this.
export const DEFAULT_DECIMAL_CONFIG: DecimalParametersConfig = {
  decimals: {},
  roundingMode: "none",
  unitPriceNoDecimalOverride: false,
};

export function isValidDecimalPrecision(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 6;
}

export function isValidRoundingMode(v: unknown): v is RoundingMode {
  return typeof v === "string" && ROUNDING_MODES.some((m) => m.value === v);
}

// NaN/Infinity-safe numeric coercion — the same "invalid input becomes 0, never NaN" rule this
// app's own per-grid `num()` helpers already apply (see purchase-order-line-grid.tsx,
// inventory-receipt-line-grid.tsx), reused here as the one canonical version instead of a 12th
// copy.
export function toSafeNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// One shared parser for "raw ScreenParameter rows -> typed DecimalParametersConfig" — both the
// consumer store (lib/store/decimal-parameters-store.ts) and the admin form
// (_components/decimal-parameters-tab.tsx) call this instead of each re-implementing the same
// row-shape parsing, so there is exactly one place that decides how a stored row becomes a
// config value (and exactly one place that guards against a corrupted/malformed stored value).
export function parseDecimalParameterRows(rows: { paramKey: string; value: string | null }[]): DecimalParametersConfig {
  const byKey = new Map(rows.map((r) => [r.paramKey, r]));

  const decimals: Partial<Record<DecimalFieldKey, number>> = {};
  for (const f of DECIMAL_FIELD_DEFS) {
    const row = byKey.get(f.key);
    if (!row) continue; // genuinely unconfigured — left absent, not defaulted
    const n = Number(row.value);
    if (isValidDecimalPrecision(n)) decimals[f.key] = n;
  }

  const roundingRow = byKey.get(ROUNDING_MODE_PARAM_KEY);
  const roundingMode = roundingRow && isValidRoundingMode(roundingRow.value)
    ? (roundingRow.value as RoundingMode)
    : DEFAULT_DECIMAL_CONFIG.roundingMode;

  const overrideRow = byKey.get(UNIT_PRICE_NO_DECIMAL_OVERRIDE_PARAM_KEY);
  const unitPriceNoDecimalOverride = overrideRow ? overrideRow.value === "true" : DEFAULT_DECIMAL_CONFIG.unitPriceNoDecimalOverride;

  return { decimals, roundingMode, unitPriceNoDecimalOverride };
}

function roundByMode(value: number, decimals: number, mode: RoundingMode): number {
  if (mode === "none") return value;
  const factor = 10 ** decimals;
  switch (mode) {
    case "round-up": return Math.ceil(value * factor) / factor;
    case "round-down": return Math.floor(value * factor) / factor;
    case "standard":
    default: return Math.round(value * factor) / factor;
  }
}

// Calculation/input rounding — the value a field should actually be committed/stored/computed
// as. Returns the value COMPLETELY UNCHANGED (only NaN/Infinity-guarded via toSafeNumber) when
// this specific field has never been configured — the "preserve existing behavior when not
// configured" guarantee: no field silently gets rounded just because Decimal Parameters exist
// for OTHER fields, or because a global Rounding mode was set. Unit Price additionally honors
// the override flag (UNIT_PRICE_NO_DECIMAL_OVERRIDE_PARAM_KEY) when it IS configured: a
// manually-typed Unit Price is returned completely unrounded regardless of precision/mode.
export function roundDecimalValue(value: unknown, fieldKey: DecimalFieldKey, config: DecimalParametersConfig): number {
  const n = toSafeNumber(value);
  if (fieldKey === "unit-price" && config.unitPriceNoDecimalOverride) return n;
  const decimals = config.decimals[fieldKey];
  if (decimals === undefined) return n;
  return roundByMode(n, decimals, config.roundingMode);
}

// Display formatting — shown at the field's configured decimal count when configured,
// independent of rounding mode (the rounding mode governs the underlying VALUE via
// roundDecimalValue() above, not how many digits are rendered). Falls back to this field's
// existing de-facto display precision (DECIMAL_FIELD_DEFS' own defaultDecimals — matching this
// app's current fmtCell/fmt2-style formatters) when unconfigured, since a display helper must
// always render SOME digit count and that fallback doesn't touch persisted data.
export function formatDecimalValue(value: unknown, fieldKey: DecimalFieldKey, config: DecimalParametersConfig): string {
  if (value === null || value === undefined || value === "") return "—";
  const decimals = config.decimals[fieldKey] ?? DECIMAL_FIELD_DEFS.find((f) => f.key === fieldKey)!.defaultDecimals;
  const n = toSafeNumber(value);
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
