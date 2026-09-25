// Centralized frontend-only validation for the Finance module (spec section 9). Every mock
// service's create/update should route uniqueness checks through here instead of re-implementing
// trim/case-insensitive comparisons per screen, so the rules stay identical everywhere and are
// easy to swap for real backend validation later.

export class FinanceValidationError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "FinanceValidationError";
    this.field = field;
  }
}

export function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** True if `value` already exists on `field` among `items`, ignoring case/whitespace and the
 *  record identified by `excludeId` (so updating a record doesn't collide with itself). */
export function isDuplicate<T extends Record<string, any>>(
  items: T[],
  field: keyof T,
  value: string,
  idField: keyof T = "id" as keyof T,
  excludeId?: string | number,
): boolean {
  const target = normalize(value);
  if (!target) return false;
  return items.some((item) => item[idField] !== excludeId && normalize(String(item[field] ?? "")) === target);
}

export function assertNotDuplicate<T extends Record<string, any>>(
  items: T[],
  field: keyof T,
  value: string,
  label: string,
  idField: keyof T = "id" as keyof T,
  excludeId?: string | number,
): void {
  if (isDuplicate(items, field, value, idField, excludeId)) {
    throw new FinanceValidationError(`${label} already exists.`, String(field));
  }
}

export function assertRequired(value: unknown, label: string, field?: string): void {
  const empty = value === null || value === undefined || (typeof value === "string" && value.trim() === "");
  if (empty) throw new FinanceValidationError(`${label} is required.`, field);
}

export function assertBalanced(totalDebit: number, totalCredit: number, tolerance = 0.01): void {
  if (Math.abs(totalDebit - totalCredit) > tolerance) {
    throw new FinanceValidationError(
      `Total Debit (${totalDebit.toFixed(2)}) must equal Total Credit (${totalCredit.toFixed(2)}) before posting.`,
    );
  }
}
