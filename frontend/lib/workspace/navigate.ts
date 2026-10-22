import type { useRouter } from "@/lib/app-navigation";

import { toBrowserPath } from "@/lib/company-path";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { findWorkspaceModule, resolveTabKey } from "@/lib/workspace/registry";

type Router = ReturnType<typeof useRouter>;

/**
 * Single call-in point used by both the sidebar (nav-main.tsx) and the global
 * search command palette (search.tsx): if `href` belongs to a registered
 * workspace module, open/activate its tab instead of letting Next.js unmount the
 * current page and mount a new one. Anything not registered falls back to a
 * normal `router.push`, so every other screen in the app is unaffected.
 *
 * `options.title` is an optional explicit tab label for callers that already
 * know it (e.g. a list row's "Edit" action opening a specific record) — see
 * lib/workspace/resolve-tab-title.ts, priority 1. Omit it and the tab bar
 * resolves a title automatically from the menu/route.
 */
export function navigateOrOpenTab(router: Router, href: string, options?: { title?: string }) {
  const [pathname] = href.split("?");
  const mod = findWorkspaceModule(pathname);
  if (!mod) {
    router.push(href);
    return;
  }
  useWorkspaceStore.getState().openTab({ key: resolveTabKey(mod.path, href), href, title: options?.title });
  replaceWorkspaceUrl(router, href);
}

/**
 * Points the address bar at `href` after a tab has been opened/activated in the store.
 *
 * A tab's screen is rendered by WorkspaceContentStack straight from the registry, never from the
 * Next.js route tree, so for a workspace route a real navigation (router.replace) is pure
 * overhead: a server round-trip for a route payload nobody renders (and, in dev, compiling that
 * route first). history.replaceState just updates the URL — Next.js keeps usePathname/
 * useSearchParams in sync with it, which is all ContentContainer and the content stack need — so
 * the URL still matches the tab for refresh and bookmarks. Anything that is not a workspace
 * route (the default dashboard after closing every tab, dynamic [id] pages, ...) really does
 * need its route rendered, so it still gets a real navigation.
 */
export function replaceWorkspaceUrl(router: Router, href: string) {
  if (!findWorkspaceModule(href.split("?")[0])) {
    router.replace(href, { scroll: false });
    return;
  }
  // `href` is an app path; the address bar carries the company slug (lib/company-path.ts).
  const browserHref = toBrowserPath(href);
  if (window.location.pathname + window.location.search !== browserHref) {
    window.history.replaceState(null, "", browserHref);
  }
}
