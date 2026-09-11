// Central "normal business quantity/value can never be negative" guard — see the project-wide
// negative-value protection task. Reused by EditableGridInput and any plain <input type="number">
// bound to a field where negative is never valid business data (Quantity, Consumption, Weight,
// Market Length/Width, Percentage, Extra Cutting %, ordinary Price/Amount fields, ...).
//
// Do NOT use this on a field with a genuine signed business meaning (Credit Note amount, ledger
// Debit/Credit, an accounting reversal/adjustment) — those must keep accepting negative values
// completely untouched.

// Strips every "-" as the user types/pastes, so a negative number can never even be entered into
// a non-negative field — covers keyboard entry, paste, and programmatic values (e.g. a decrement
// button) alike, without fighting the user mid-keystroke on anything else (digits, ".", etc.).
export function stripNegativeInput(raw: string): string {
  return raw.replace(/-/g, "");
}

// Blur/commit-time + calculation-result safety net: coerces any value that still parses as
// negative (or doesn't parse at all) back to 0. Mirrors this codebase's existing, already-
// pervasive `parseFloat(x) || 0` convention (NaN -> 0) and additionally floors negatives at 0.
export function normalizeNonNegative(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n;
}
