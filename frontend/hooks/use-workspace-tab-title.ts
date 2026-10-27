"use client";

import { useEffect } from "react";
import { usePathname } from "@/lib/app-navigation";

import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { findRecordRoute } from "@/lib/workspace/registry";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";

/**
 * The Workspace tab a screen owns: a hosted screen's tab (WorkspaceContentStack's context), or —
 * for a record page (dynamic `[id]` route), which isn't hosted by the stack — its own pathname
 * (see hooks/use-record-tab-sync.ts). The app's usePathname is slug-free, same as the tab keys:
 * next/navigation's would carry the company slug and never match a tab. `isRecordTab` marks the
 * latter, whose tab is opened by an ancestor's effect (which runs after the screen's own) —
 * `tabOpen` lets a caller re-apply once it exists.
 */
function useOwnTab() {
  const ctx = useWorkspaceTabContext();
  const pathname = usePathname();
  const recordTabKey = !ctx && pathname && findRecordRoute(pathname) ? pathname : undefined;
  const tabKey = ctx?.tabKey ?? recordTabKey;
  const tabOpen = useWorkspaceStore((s) => !!tabKey && s.tabs.some((t) => t.key === tabKey));
  return { tabKey, isRecordTab: !!recordTabKey, tabOpen };
}

// Neither hook clears its value on unmount. Hosted screens unmount whenever the user is on a
// non-workspace route (e.g. a Style Card record page) while their tabs stay in the bar — clearing
// there dropped every open Work Order / Receipt back to its generic screen name. A tab re-pointed
// at another record remounts its screen, whose own effect then re-applies the right value.

/**
 * Lets a screen give its own Workspace tab an exact, explicit title (e.g. the Inventory Receipt's
 * full legacy label) instead of the automatic menu/route-derived one — see
 * lib/workspace/resolve-tab-title.ts, priority 1. Pass `undefined` (or omit) to fall back to
 * automatic resolution — on a record page, `undefined` keeps the last title while it loads. A
 * no-op when the screen is rendered standalone (outside the workspace and not a record route).
 */
export function useWorkspaceTabTitle(title: string | undefined) {
  const { tabKey, isRecordTab, tabOpen } = useOwnTab();
  const setTabTitle = useWorkspaceStore((s) => s.setTabTitle);

  // Depends on the stable tabKey string, not the tab context object: WorkspaceContentStack's
  // Provider passes a brand-new `{ tabKey, params }` on every one of its own re-renders (including
  // the one setTabTitle's own store update causes), so depending on it re-fires this effect every
  // render -> setTabTitle -> re-render -> "Maximum update depth exceeded".
  useEffect(() => {
    if (!tabKey) return;
    if (title !== undefined || !isRecordTab) setTabTitle(tabKey, title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey, tabOpen, title, setTabTitle]);
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
  const { tabKey, isRecordTab, tabOpen } = useOwnTab();
  const setTabRecordLabel = useWorkspaceStore((s) => s.setTabRecordLabel);

  useEffect(() => {
    if (!tabKey) return;
    // A record tab's key IS its record, so its label stays valid while the page reloads it.
    if (recordLabel !== undefined || !isRecordTab) setTabRecordLabel(tabKey, recordLabel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey, tabOpen, recordLabel, setTabRecordLabel]);
}
