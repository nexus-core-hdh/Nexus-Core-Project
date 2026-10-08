"use client";

import { useEffect } from "react";

import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { resolveTabKey, withRecordId } from "@/lib/workspace/registry";

/**
 * Lets a hosted form screen report which record it is showing — the same id its `?id=` param loads.
 * Forms that save/load in place (a create form's first Save, or loading another record by code)
 * never change the URL, so without this their tab would keep the identity it was opened with: a
 * saved "New ..." tab would never become that record's tab, and reopening the record from its list
 * would open a duplicate. When the reported record differs from the tab's own, the tab is re-keyed
 * to it in place (no remount — safe mid-save) unless that record already has its own tab.
 * Pass null/undefined while no record is loaded (a blank create form). A no-op standalone.
 */
export function useWorkspaceRecordId(recordId: string | number | null | undefined) {
  const tabKey = useWorkspaceTabContext()?.tabKey;

  useEffect(() => {
    if (tabKey) adoptWorkspaceRecordId(tabKey, recordId);
  }, [tabKey, recordId]);
}

/** The store-level step behind useWorkspaceRecordId. */
export function adoptWorkspaceRecordId(tabKey: string, recordId: string | number | null | undefined) {
  if (recordId === null || recordId === undefined || recordId === "") return;
  const { tabs, replaceTab } = useWorkspaceStore.getState();
  const tab = tabs.find((t) => t.key === tabKey);
  if (!tab) return;
  const href = withRecordId(tab.href, String(recordId));
  const key = resolveTabKey(href.split("?")[0], href);
  if (key === tabKey || tabs.some((t) => t.key === key)) return;
  replaceTab(tabKey, { key, href });
}
