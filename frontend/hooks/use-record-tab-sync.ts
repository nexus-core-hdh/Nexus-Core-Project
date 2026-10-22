"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "@/lib/app-navigation";

import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { findRecordRoute, isNewRecordPath } from "@/lib/workspace/registry";

/**
 * Opens/activates the Workspace tab for a record page (e.g. /dashboard/plm/style-cards/<id>), keyed
 * by that record's own pathname so it stays in the tab bar after navigating to another screen and
 * one click brings the same record back. Reopening an already-open record activates its existing
 * tab; the query string is kept on the tab's href (not its key) so returning restores it. A no-op
 * for any route that isn't a record route.
 */
export function syncRecordRouteTab(pathname: string, query: string) {
  if (!findRecordRoute(pathname)) return;
  const href = query ? `${pathname}?${query}` : pathname;
  const { tabs, activeKey, openTab, replaceTab } = useWorkspaceStore.getState();
  const existing = tabs.find((t) => t.key === pathname);
  if (existing && activeKey === pathname && existing.href === href) return;
  // A create form that just saved swaps its URL for the new record's — carry its tab over
  // instead of leaving a stale "New ..." tab behind.
  if (!existing && activeKey && isNewRecordPath(activeKey) && findRecordRoute(activeKey) === findRecordRoute(pathname)) {
    replaceTab(activeKey, { key: pathname, href });
    return;
  }
  openTab({ key: pathname, href });
}

/**
 * Record-route counterpart of WorkspaceContentStack's own route->tab sync (record pages aren't
 * hosted by the stack, so it never sees them) — covers list-row links, deep links and refreshes.
 * Waits for the store's async backend hydration first: a tab opened before it lands would be
 * overwritten by the persisted tab list.
 */
export function useRecordTabSync() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hydrated, setHydrated] = useState(() => useWorkspaceStore.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;
    const unsubscribe = useWorkspaceStore.persist.onFinishHydration(() => setHydrated(true));
    if (useWorkspaceStore.persist.hasHydrated()) setHydrated(true);
    return unsubscribe;
  }, [hydrated]);

  useEffect(() => {
    if (hydrated && pathname) syncRecordRouteTab(pathname, searchParams.toString());
  }, [hydrated, pathname, searchParams]);
}
