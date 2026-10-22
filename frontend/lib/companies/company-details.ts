// Companies screen (app/[company]/(auth)/pages/companies) — company details, the Create Company
// form's rules, and why Delete is not offered.
//
// GET /company returns the signed-in user's OWN company. Registering companies and viewing other
// companies (POST/GET /companies) is platform-level: the backend allows it only for users of the
// platform-owner company holding companies:create / companies:read (CompanyProvisioningService);
// the screen asks GET /companies/access what to offer, but the backend re-checks every request.

export const COMPANY_DELETE_UNAVAILABLE =
  "Deleting a company isn't supported: a company owns its users, branches and every business record (deleting it would remove them all), and no deletion policy has been set up.";

export const COMPANY_REGISTER_PLATFORM_ONLY =
  "Registering new companies is available to administrators of the platform-owner company.";

export interface CompanyDetailsSource {
  id: string;
  name: string;
  slug?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  industry?: string | null;
  accountType?: string | null;
  plan?: string | null;
  subscriptionStatus?: string | null;
  trialEndDate?: string | null;
  /** Computed by the backend for platform users: status Trial and the end date has passed. */
  trialExpired?: boolean;
  billingCycle?: string | null;
  subscriptionStartDate?: string | null;
  subscriptionEndDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  branches?: { id: string; name: string }[];
  _count?: { users?: number };
}

/** The response of GET /company, which some callers receive still wrapped as { data }. */
export function unwrapCompany(res: any): CompanyDetailsSource | null {
  const c = res && typeof res === "object" && "data" in res && res.data && typeof res.data === "object" ? res.data : res;
  return c && typeof c === "object" && c.id ? (c as CompanyDetailsSource) : null;
}

/** The loaded company must be the row that was asked for — never show another company's data. */
export function sameCompanyOrError(requestedId: string, loaded: CompanyDetailsSource | null): string | null {
  if (!loaded) return "Company details could not be loaded.";
  if (loaded.id !== requestedId) return "You can only view your own company.";
  return null;
}

/** Label/value rows for the details view, in display order; empty values show as "—". */
export function companyDetailRows(c: CompanyDetailsSource, formatDate: (iso: string) => string): [string, string][] {
  const v = (x: unknown) => (x == null || String(x).trim() === "" ? "—" : String(x));
  const d = (x?: string | null) => (x ? formatDate(x) : "—");
  return [
    ["Name", v(c.name)],
    ["Company URL", v(c.slug)],
    ["Email", v(c.email)],
    ["Phone", v(c.phone)],
    ["Address", v(c.address)],
    ["Website", v(c.website)],
    ["Industry", v(c.industry)],
    ["Account Type", v(c.accountType)],
    ["Plan", v(c.plan)],
    ["Status", subscriptionLabel(c)],
    ["Billing Cycle", v(c.billingCycle)],
    ["Subscription Start", d(c.subscriptionStartDate)],
    ["Trial Ends", c.subscriptionStatus === "Trial" ? trialEndLabel(c.trialEndDate) : "—"],
    ["Subscription End", d(c.subscriptionEndDate)],
    ["Branches", c.branches ? (c.branches.length ? c.branches.map((b) => b.name).join(", ") : "—") : "—"],
    ["Users", c._count?.users != null ? String(c._count.users) : "—"],
    ["Created At", d(c.createdAt)],
    ["Updated At", d(c.updatedAt)],
  ];
}

/** A trial's last day as the backend defines it (it ends 23:59:59.999 UTC that day), shown as that
 *  UTC day — never shifted into the viewer's timezone, which could display the following day. */
export function trialEndLabel(iso?: string | null): string {
  return iso ? `${String(iso).slice(0, 10)} (end of day, UTC)` : "—";
}

/** "Trial", "Trial (expired)", or the status as stored. Expired is the backend's own computation. */
export function subscriptionLabel(c: Pick<CompanyDetailsSource, "subscriptionStatus" | "trialExpired">): string {
  if (!c.subscriptionStatus) return "—";
  return c.subscriptionStatus === "Trial" && c.trialExpired ? "Trial (expired)" : c.subscriptionStatus;
}

// ── Create Company form ───────────────────────────────────────────────────────────────────────

export interface CompanyForm {
  name: string; slug: string; email: string; phone: string; address: string; industry: string; website: string;
  /** Standard (the registration as before) or Demo (on a Trial until trialEndDate). */
  accountType: "Standard" | "Demo";
  /** Demo only: last day of the trial, YYYY-MM-DD (ends 23:59:59.999 UTC that day). */
  trialEndDate: string;
}
export const EMPTY_COMPANY_FORM: CompanyForm = { name: "", slug: "", email: "", phone: "", address: "", industry: "", website: "", accountType: "Standard", trialEndDate: "" };

/** Today in UTC as YYYY-MM-DD — the backend's date convention for trial days. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The default trial end day the backend would use for `days` (COMPANY_TRIAL_DAYS); "" when there is no default. */
export function defaultTrialEndDate(days: number | null | undefined, now: Date = new Date()): string {
  if (!days) return "";
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Same rule as the backend's slugifyCompanyName (src/common/company-slug.ts): "Acme Apparel" -> "acme-apparel". */
export function suggestCompanySlug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The form's own checks (the backend validates again): field -> message. */
export function validateCompanyForm(f: CompanyForm, now: Date = new Date()): Partial<Record<keyof CompanyForm, string>> {
  const errors: Partial<Record<keyof CompanyForm, string>> = {};
  if (!f.name.trim()) errors.name = "Company Name is required.";
  const slug = f.slug.trim().toLowerCase();
  if (!slug) errors.slug = "Company URL is required.";
  else if (!SLUG_RE.test(slug) || slug.length > 60) errors.slug = "Use lowercase letters, numbers and single hyphens (e.g. acme-apparel).";
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) errors.email = "Enter a valid email address.";
  if (f.accountType === "Demo") {
    if (!f.trialEndDate) errors.trialEndDate = "Choose the trial end date.";
    else if (f.trialEndDate <= utcToday(now)) errors.trialEndDate = "The trial end date must be after today.";
  }
  return errors;
}

/** The POST /companies body: trimmed, blanks left out; the trial end only for a Demo company. */
export function toCreateCompanyPayload(f: CompanyForm): Record<string, string> {
  const out: Record<string, string> = { name: f.name.trim(), slug: f.slug.trim().toLowerCase() };
  for (const k of ["email", "phone", "address", "industry", "website"] as const) if (f[k].trim()) out[k] = f[k].trim();
  if (f.accountType === "Demo") {
    out.accountType = "Demo";
    if (f.trialEndDate) out.trialEndDate = f.trialEndDate;
  }
  return out;
}

/** Puts a server error on the field it is about (taken/reserved Company URL, taken email, trial date). */
export function fieldForServerError(message: string): keyof CompanyForm | null {
  if (/trial/i.test(message)) return "trialEndDate";
  if (/Company URL|slug/i.test(message)) return "slug";
  if (/email/i.test(message)) return "email";
  if (/Company Name|\bname\b/i.test(message)) return "name";
  if (/website/i.test(message)) return "website";
  return null;
}

// ── First administrator ───────────────────────────────────────────────────────────────────────

// Created through the Users dialog (first-admin mode) with a temporary password: awaiting their
// first sign-in until they change it, then active.
export type FirstAdminStatus = "not_configured" | "awaiting_first_sign_in" | "active" | "not_eligible";

export const FIRST_ADMIN_STATUS_LABEL: Record<FirstAdminStatus, string> = {
  not_configured: "Not configured",
  awaiting_first_sign_in: "Awaiting first sign-in",
  active: "Active",
  not_eligible: "Not applicable",
};
