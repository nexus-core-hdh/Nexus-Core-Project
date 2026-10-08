import type { useRouter } from "next/navigation";

import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { findWorkspaceModule, isCreateHref, resolveTabKey } from "@/lib/workspace/registry";

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
  router.replace(href, { scroll: false });
}

/**
 * Route -> tab sync for workspace module routes (WorkspaceContentStack runs it on every URL change):
 * opens/activates the tab for the URL now showing — one per list screen, one per record (`?id=`).
 * A create form that saved and moved its URL to the new record (`?mode=create` -> `?id=9`) takes
 * that record's identity in place, without remounting mid-save, instead of opening a second tab
 * and leaving a stale "New ..." one behind.
 */
export function syncModuleRouteTab(pathname: string, query: string) {
  const mod = findWorkspaceModule(pathname);
  if (!mod) return;
  const href = query ? `${pathname}?${query}` : pathname;
  const key = resolveTabKey(mod.path, href);
  const { tabs, activeKey, openTab, replaceTab } = useWorkspaceStore.getState();
  const alreadyOpen = tabs.some((t) => t.key === key);
  if (alreadyOpen && activeKey === key) return;
  const current = tabs.find((t) => t.key === activeKey);
  if (!alreadyOpen && current && key !== mod.path && findWorkspaceModule(current.key) === mod && isCreateHref(current.href)) {
    replaceTab(current.key, { key, href });
    return;
  }
  openTab({ key, href });
}
