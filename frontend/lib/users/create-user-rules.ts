// Decisions of the create-user dialog (app/[company]/(auth)/pages/users/create-user-dialog.tsx),
// kept pure so they are tested directly (scripts/company-actions.test.mjs).

/**
 * Whether the selected role must be cleared because the loaded role list no longer offers it.
 * Never in Create First Admin mode: there the role is fixed (Admin, resolved by the server) and no
 * role list is loaded — clearing it emptied the hidden required field, so the form failed
 * validation silently and nothing was submitted.
 */
export function shouldClearUnofferedRole(opts: {
  firstAdminMode: boolean;
  role: string | undefined;
  status: string;
  offeredIds: string[];
}): boolean {
  if (opts.firstAdminMode || !opts.role || opts.status === "loading") return false;
  return !opts.offeredIds.includes(opts.role);
}

/**
 * Validation errors on fields the user cannot see or fix in the current mode (e.g. the fixed
 * role/company of Create First Admin), as messages to show — so a hidden field can never make
 * the form fail without telling anyone.
 */
export function hiddenFieldErrors(errors: Record<string, { message?: unknown } | undefined>, visibleFields: string[]): string[] {
  return Object.entries(errors)
    .filter(([field, e]) => e && !visibleFields.includes(field))
    .map(([field, e]) => `${field}: ${typeof e!.message === "string" && e!.message ? e!.message : "invalid"}`);
}

/** The form field a server error is about, so it is shown under that field too. */
export function fieldForCreateUserError(message: string): "email" | "name" | null {
  if (/email/i.test(message)) return "email";
  if (/\bname\b/i.test(message)) return "name";
  return null;
}
