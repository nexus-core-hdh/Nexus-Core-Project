/**
 * (No "use client" directive: Next.js rejects `export *` in a client boundary. Only client
 * components import this module, so the hooks still run on the client.)
 *
 *
 * Drop-in replacement for `next/navigation` in client code: identical exports, except that
 * `useRouter` and `usePathname` work with slug-free app paths (`/plm/x`) while the browser URL
 * carries the company slug (`/nexus-core/plm/x`). See lib/company-path.ts.
 */
import { useMemo } from "react";
import {
  usePathname as useNextPathname,
  useRouter as useNextRouter,
} from "next/navigation";

import { stripCompanySlug, slugFromPathname, withCompanySlug, getClientCompanySlug } from "@/lib/company-path";

export * from "next/navigation";

/** The company slug of the current URL (falls back to the login cookie off-company pages). */
export function useCompanySlug(): string | null {
  const pathname = useNextPathname();
  return slugFromPathname(pathname) ?? getClientCompanySlug();
}

/** Current pathname as an app path, i.e. without the leading company slug. */
export function usePathname(): string {
  const pathname = useNextPathname();
  return useMemo(() => (pathname ? stripCompanySlug(pathname) : pathname), [pathname]);
}

/** next/navigation's router, with app paths given to push/replace/prefetch prefixed by the slug. */
export function useRouter(): ReturnType<typeof useNextRouter> {
  const router = useNextRouter();
  const slug = useCompanySlug();
  return useMemo(
    () => ({
      ...router,
      push: (href, options) => router.push(withCompanySlug(href, slug), options),
      replace: (href, options) => router.replace(withCompanySlug(href, slug), options),
      prefetch: (href, options) => router.prefetch(withCompanySlug(href, slug), options),
    }),
    [router, slug]
  );
}
