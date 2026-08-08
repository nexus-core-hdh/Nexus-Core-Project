"use client";

import { createContext, useContext } from "react";

export interface WorkspaceTabContextValue {
  tabKey: string;
  params: URLSearchParams;
}

// Provided by WorkspaceContentStack around each hosted screen instance so it can
// discover its own tab identity and a frozen snapshot of the query params it was
// opened with (see hooks/use-workspace-search-params.ts) — absent when a screen is
// rendered standalone via its real Next.js route (direct link/bookmark/refresh).
export const WorkspaceTabContext = createContext<WorkspaceTabContextValue | null>(null);

export function useWorkspaceTabContext() {
  return useContext(WorkspaceTabContext);
}
