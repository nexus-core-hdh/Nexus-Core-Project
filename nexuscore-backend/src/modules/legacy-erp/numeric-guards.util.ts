import { BadRequestException } from '@nestjs/common';

// Central "normal business quantity/value can never be negative" guard for the legacy-erp raw-SQL
// services — see the project-wide negative-value protection task. `legacy-db-types.util.ts`'s
// buildDbValueCoercer only knows Postgres column TYPES, not business meaning, and is shared by
// every legacy table including genuinely signed ones (FI_Receipt.Debit/Credit, IM_Receipt.Quantity
// for Stock Adjustment/Return ReceiptTypes) — so it cannot itself enforce this rule. This helper is
// instead called explicitly, per service, only against the specific columns a service already
// knows are normal non-negative business quantities (Quantity, MarkerWidth/Length, Weight,
// Wastage %, ordinary Price) — never against a column with a legitimate signed workflow.
//
// Rejects (rather than silently clamps) so a caller sending a negative value gets a clear 400
// instead of a quietly-different number being persisted — the frontend's own guard (see
// frontend/lib/numeric-guards.ts) already prevents a negative value from being typed/submitted in
// the first place; this is the data-integrity backstop for direct/malicious API calls.
export function assertNonNegative(value: unknown, fieldLabel: string): void {
  if (value === undefined || value === null || value === '') return;
  const n = Number(value);
  if (Number.isFinite(n) && n < 0) {
    throw new BadRequestException(`${fieldLabel} cannot be negative.`);
  }
}

// Convenience for validating several {label, value} pairs from one raw `Record<string, any>` body
// in a single call, so a service's write-loop body stays a short, readable block.
export function assertAllNonNegative(fields: Record<string, unknown>): void {
  for (const [label, value] of Object.entries(fields)) assertNonNegative(value, label);
}
