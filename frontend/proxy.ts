import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-next";

import {
  APP_HOME_PATH,
  COMPANY_SLUG_COOKIE,
  isAppPath,
  slugFromPathname,
  withCompanySlug,
} from "@/lib/company-path";

// Guest pages live at the root (no company yet). See lib/company-path.ts for the URL scheme.
const LOGIN_PATH = "/login/v1";
const GUEST_PREFIXES = ["/login", "/register", "/forgot-password", "/reset-password"];
const ONBOARDING_PATH = "/onboarding-flow";

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

/** To the login page; `next` (a same-origin path) is where login returns to afterwards. */
function toLogin(request: NextRequest, next?: string) {
  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = next ? `?next=${encodeURIComponent(next)}` : "";
  return NextResponse.redirect(url);
}

/** Old `/dashboard/...` URLs (bookmarks, emails sent before company slugs) -> the new scheme. */
function legacyDashboardPath(pathname: string): string | null {
  if (pathname !== "/dashboard" && !pathname.startsWith("/dashboard/")) return null;
  let rest = pathname.slice("/dashboard".length) || APP_HOME_PATH;
  if (rest.startsWith("/pages/onboarding-flow")) rest = rest.slice("/pages".length);
  else if (/^\/pages\/error\/(404|500)/.test(rest)) rest = rest.slice("/pages".length);
  return rest;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("auth_token")?.value;
  const slug = request.cookies.get(COMPANY_SLUG_COOKIE)?.value || null;

  // Serial Card scan page — `/s/<Serial No>`, the link earlier label QR codes encode (current labels
  // carry the card data offline). A root route, never a company slug (reserved in lib/company-path.ts).
  // Signed out -> login, then straight back to the card (?next=); the page itself checks the session too.
  if (pathname.startsWith("/s/")) {
    if (!token) return toLogin(request, pathname);
    return NextResponse.next();
  }

  const legacy = legacyDashboardPath(pathname);
  if (legacy) return redirectTo(request, isAppPath(legacy) ? withCompanySlug(legacy, slug) : legacy);

  if (pathname === "/") {
    if (token && slug) return redirectTo(request, withCompanySlug(APP_HOME_PATH, slug));
    return toLogin(request);
  }

  // Signed-in users skip the guest pages (onboarding stays reachable to finish company setup) — to the
  // same-origin return path when the login link carries one (?next=, e.g. a scanned /s/<Serial No>).
  if (GUEST_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (token && slug) {
      const next = safeNextPath(request.nextUrl.searchParams.get("next"));
      if (next) return NextResponse.redirect(new URL(isAppPath(next) ? withCompanySlug(next, slug) : next, request.url));
      return redirectTo(request, withCompanySlug(APP_HOME_PATH, slug));
    }
    return NextResponse.next();
  }
  if (pathname === ONBOARDING_PATH || pathname.startsWith(ONBOARDING_PATH + "/")) return NextResponse.next();

  // App path without a company (`/plm/x`, from a hard navigation such as window.location.href):
  // add the signed-in company's slug.
  if (isAppPath(pathname)) {
    if (!token || !slug) return toLogin(request);
    return redirectTo(request, withCompanySlug(pathname, slug));
  }

  // Company URL `/{slug}/...`.
  const urlSlug = slugFromPathname(pathname);
  if (urlSlug) {
    // Sessions from before company slugs have a token but no slug cookie: sign in again once.
    if (!token || !slug) return toLogin(request);
    const rest = pathname.slice(urlSlug.length + 1);
    // `/{slug}` itself has no page: open the home dashboard.
    if (rest === "" || rest === "/") return redirectTo(request, withCompanySlug(APP_HOME_PATH, slug));
    // A user only ever works inside their own company.
    if (urlSlug !== slug) return redirectTo(request, isAppPath(rest) ? withCompanySlug(rest, slug) : rest);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next.js internals, the API proxy and static files (paths with an extension).
  matcher: ["/((?!_next/|api/|.*\\.[a-zA-Z0-9]+$).*)"],
};
