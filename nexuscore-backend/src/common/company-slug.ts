/**
 * Company slugs: the first segment of every signed-in frontend URL (`/nexus-core/plm/...`, see
 * frontend/lib/company-path.ts). Unique across companies and never equal to a reserved root route.
 */

/**
 * Frontend root routes a slug must not shadow: the app module roots (top-level folders of
 * frontend/app/[company]/(auth)) plus root-level pages and static folders. Keep in sync with
 * RESERVED_SEGMENTS in frontend/lib/company-path.ts.
 */
export const RESERVED_COMPANY_SLUGS = new Set([
  'academy', 'administration', 'apps', 'bpm', 'collaboration', 'crm', 'crypto', 'default', 'dockets',
  'ecommerce', 'file-manager', 'finance', 'finance-erp', 'hospital-management', 'hotel', 'legacy-erp',
  'logistics', 'module-map', 'my-menu', 'pages', 'payment', 'plm', 'project-list', 'project-management',
  'sales', 'website-analytics', 'widgets',
  'api', 'brand', 'dashboard', 'error', 'forgot-password', 'images', 'login', 'onboarding',
  'onboarding-flow', 'register', 'reset-password', 'shared', '_next',
]);

/** Lowercase, hyphenated slug for a company name: "Nexus Core" -> "nexus-core". */
export function slugifyCompanyName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'company';
}

/**
 * A slug for `name` that is not reserved and not taken (`isTaken` checks the Company table):
 * "acme", then "acme-2", "acme-3", ...
 */
export async function uniqueCompanySlug(name: string, isTaken: (slug: string) => Promise<boolean>): Promise<string> {
  const base = slugifyCompanyName(name);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!RESERVED_COMPANY_SLUGS.has(candidate) && !(await isTaken(candidate))) return candidate;
  }
}
