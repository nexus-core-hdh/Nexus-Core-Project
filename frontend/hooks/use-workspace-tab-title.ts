"use client";

import { useEffect } from "react";

import { useWorkspaceStore } from "@/lib/store/workspace-store";
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
