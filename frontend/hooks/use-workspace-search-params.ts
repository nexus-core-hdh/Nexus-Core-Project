"use client";

import { useSearchParams } from "next/navigation";

import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";

/**
 * Drop-in replacement for `useSearchParams()` in screens hosted by the Workspace
 * Tab Bar. Multiple tabs can be mounted simultaneously while only one is visible,
 * but they all share the one live browser URL — so instead of reading that shared
 * URL, a hosted screen reads a frozen snapshot of the params captured at the
 * moment its tab was opened (or last redirected to a different record). Falls
 * back to the real `useSearchParams()` when rendered standalone (deep link,
 * bookmark, or before the workspace tab bar existed at all).
 */
export function useWorkspaceSearchParams() {
  const ctx = useWorkspaceTabContext();
  const real = useSearchParams();
  return ctx ? ctx.params : real;
}
