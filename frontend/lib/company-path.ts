/**
 * Company-scoped URLs.
 *
 * Every signed-in screen lives under the user's company slug — `/nexus-core/plm/sample-cards` —
 * served by the `app/[company]/(auth)` route tree. Code, menus (MenuItem.href) and workspace tab
 * keys all use the slug-free *app path* (`/plm/sample-cards`); the slug is only added when a path
 * reaches the address bar (see components/app-link.tsx, lib/app-navigation.ts and proxy.ts) and
 * stripped again when the URL is read back (`usePathname` from lib/app-navigation).
 *
 * Guest pages (login, register, password reset, onboarding) have no company yet, so they stay at
 * the root: `/login/v1`.
 */

/** Cookie holding the signed-in user's company slug (set at login, read by proxy.ts). */
export const COMPANY_SLUG_COOKIE = "company_slug";

/**
 * First segments of the app paths, i.e. the top-level folders of app/[company]/(auth). A path
 * starting with one of these is an app path and gets the company prefix. Keep in sync with that
 * folder when adding a new top-level module.
 */
export const APP_ROOT_SEGMENTS = new Set([
  "academy",
  "administration",
  "apps",
  "bpm",
  "collaboration",
  "crm",
  "crypto",
  "default",
  "dockets",
  "ecommerce",
  "file-manager",
  "finance",
  "finance-erp",
  "hospital-management",
  "hotel",
  "legacy-erp",
  "logistics",
  "module-map",
  "my-menu",
  "pages",
  "payment",
  "plm",
  "project-list",
  "project-management",
  "sales",
  "website-analytics",
  "widgets",
]);

/** Root-level routes and files a company slug must never shadow. */
const RESERVED_SEGMENTS = new Set([
  ...APP_ROOT_SEGMENTS,
  "api",
  "brand",
  "dashboard",
  "error",
  "forgot-password",
  "images",
  "login",
  "onboarding",
  "onboarding-flow",
  "register",
  "reset-password",
  // Serial Card scan page (/s/<Serial No>, app/s/[serial]) — the link earlier label QR codes encode.
  "s",
  "shared",
  "_next",
]);

/** Home screen of a signed-in user (app path). */
export const APP_HOME_PATH = "/default";

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SEGMENTS.has(slug.toLowerCase());
}

/** Lowercase, hyphenated slug for a company name (mirrors the backend's slugifyCompanyName). */
export function slugifyCompanyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstSegment(path: string): string {
  return path.split(/[/?#]/)[1] ?? "";
}

/** Whether `path` (`/plm/x?y=1`) is a slug-free app path. */
export function isAppPath(path: string): boolean {
  return path.startsWith("/") && APP_ROOT_SEGMENTS.has(firstSegment(path));
}

/** The company slug at the start of a browser pathname, or null when there is none. */
export function slugFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const segment = firstSegment(pathname);
  if (!segment || isReservedSlug(segment)) return null;
  return decodeURIComponent(segment);
}

/** `/plm/x` -> `/{slug}/plm/x`. Anything that is not an app path (or no slug) is returned as-is. */
export function withCompanySlug(path: string, slug: string | null | undefined): string {
  if (!slug || !isAppPath(path)) return path;
  return `/${encodeURIComponent(slug)}${path}`;
}

/** `/{slug}/plm/x` -> `/plm/x`. A pathname without a company slug is returned as-is. */
export function stripCompanySlug(pathname: string): string {
  const slug = slugFromPathname(pathname);
  if (!slug) return pathname;
  const rest = pathname.slice(encodeURIComponent(slug).length + 1);
  return rest || APP_HOME_PATH;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Client-side: the current company slug (from the URL, falling back to the login cookie). */
export function getClientCompanySlug(): string | null {
  if (typeof window === "undefined") return null;
  return slugFromPathname(window.location.pathname) ?? readCookie(COMPANY_SLUG_COOKIE);
}

/** Client-side: remembers the signed-in user's company slug for proxy.ts and new tabs. */
export function setCompanySlugCookie(slug: string | null | undefined) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? " Secure;" : "";
  document.cookie = slug
    ? `${COMPANY_SLUG_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax;${secure}`
    : `${COMPANY_SLUG_COOKIE}=; path=/; max-age=0; SameSite=Lax;${secure}`;
}

/** Client-side: an app path as a browser URL for the current company. */
export function toBrowserPath(path: string): string {
  return withCompanySlug(path, getClientCompanySlug());
}

/** Client-side: the current URL as an app path (`/plm/x?y=1`), slug removed. */
export function currentAppPath(includeSearch = true): string {
  if (typeof window === "undefined") return "";
  const path = stripCompanySlug(window.location.pathname);
  return includeSearch ? path + window.location.search : path;
}
