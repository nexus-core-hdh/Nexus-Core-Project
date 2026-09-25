// Shared number/date formatting for the Finance module — every report/ledger/invoice screen
// should format money and quantities through these instead of ad hoc toFixed/toLocaleString
// calls, so "1,250,000.00" style formatting (spec section 19) stays consistent everywhere.

export function formatCurrency(value: number | null | undefined, currency = "PKR"): string {
  const n = Number(value ?? 0);
  const formatted = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? "-" : "";
  return `${sign}${currency ? currency + " " : ""}${formatted}`;
}

/** Same as formatCurrency but without the currency prefix — for dense table cells/ledgers. */
export function formatAmount(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  const formatted = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-${formatted}` : formatted;
}

export function formatNumber(value: number | null | undefined, fractionDigits = 0): string {
  return Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

/** Negative amounts render visually distinguishable per spec section 19. */
export function amountColorClass(value: number | null | undefined): string {
  return Number(value ?? 0) < 0 ? "text-rose-600 dark:text-rose-400" : "";
}
