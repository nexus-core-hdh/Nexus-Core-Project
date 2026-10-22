"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { findRecordRoute } from "@/lib/workspace/registry";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";

/**
 * Lets a hosted screen give its own Workspace tab an exact, explicit title
 * (e.g. "Edit PO-1024" once a record has loaded) instead of the automatic
 * menu/route-derived one — see lib/workspace/resolve-tab-title.ts, priority 1.
 * Pass `undefined` (or omit) to fall back to automatic resolution. A no-op
 * when the screen is rendered standalone (outside the workspace stack).
 */
export function useWorkspaceTabTitle(title: string | undefined) {
  const ctx = useWorkspaceTabContext();
  const setTabTitle = useWorkspaceStore((s) => s.setTabTitle);
  // Depend on the stable tabKey string, not `ctx` itself: WorkspaceContentStack's Provider
  // passes a brand-new `{ tabKey, params }` object on every one of its own re-renders (including
  // the one setTabTitle's own store update causes), so depending on `ctx` re-fires this effect
  // every render -> calls setTabTitle again -> re-renders -> "Maximum update depth exceeded".
  const tabKey = ctx?.tabKey;

  useEffect(() => {
    if (!tabKey) return;
    setTabTitle(tabKey, title);
    return () => setTabTitle(tabKey, undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey, title, setTabTitle]);
}

/**
 * Lets a hosted detail/edit screen report just its loaded record's own display
 * identity (Name, or Code if it has no Name — never a raw internal id) once
 * available. resolveWorkspaceTabTitle (lib/workspace/resolve-tab-title.ts)
 * combines this with the screen's own resolved name into
 * "{Screen Name} [{recordLabel}]" — the screen never needs to know or repeat
 * its own menu title. Pass `undefined` while no record is loaded yet (a
 * create route, or still fetching) so the tab falls back to the automatic
 * "New {Screen Name}" resolution. Prefer this over useWorkspaceTabTitle
 * above, which takes priority over it and is only for a screen whose title
 * needs a shape this composition can't produce.
 */
export function useWorkspaceRecordLabel(recordLabel: string | undefined) {
  const ctx = useWorkspaceTabContext();
  const pathname = usePathname();
  const setTabRecordLabel = useWorkspaceStore((s) => s.setTabRecordLabel);
  // A record page (dynamic `[id]` route) isn't hosted by the stack — its tab key is its own
  // pathname (see hooks/use-record-tab-sync.ts).
  const recordTabKey = !ctx && pathname && findRecordRoute(pathname) ? pathname : undefined;
  const tabKey = ctx?.tabKey ?? recordTabKey;
  // The record tab is opened by an ancestor's effect (which runs after this one) — re-apply once it exists.
  const tabOpen = useWorkspaceStore((s) => !!tabKey && s.tabs.some((t) => t.key === tabKey));

  useEffect(() => {
    if (!tabKey) return;
    if (recordLabel !== undefined || !recordTabKey) setTabRecordLabel(tabKey, recordLabel);
    // A record tab's key IS its record, so its label stays valid after the page unmounts (the
    // tab lives on in the bar) — only a hosted tab, which can be re-pointed, clears it.
    if (recordTabKey) return;
    return () => setTabRecordLabel(tabKey, undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey, tabOpen, recordLabel, setTabRecordLabel]);
}
