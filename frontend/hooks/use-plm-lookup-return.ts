"use client";

import { useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useWorkspaceLookupStore, type WorkspaceLookupSelection } from "@/lib/store/workspace-lookup-store";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";

/**
 * The "resolve a lookup selection into the store, then close this tab and reactivate the
 * caller" behavior every F2 lookup target needs — extracted from
 * components/legacy-erp/master-lookup-screen.tsx's own returnAndClose()/closeSelf() so the new
 * plain PLM "General Definitions" CRUD pages (Brand/Season/Gender/Size Cards) can serve as F2
 * lookup targets too without duplicating this logic. See hooks/use-master-lookup-field.ts for
 * the field-side half of this same "open + wait for a selection to come back" contract.
 */
export function usePlmLookupReturn() {
  const router = useRouter();
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const activateTab = useWorkspaceStore((s) => s.activateTab);
  const resolveLookup = useWorkspaceLookupStore((s) => s.resolve);

  return function returnAndClose(requestId: string, returnTab: string | undefined, selection: WorkspaceLookupSelection) {
    resolveLookup(requestId, selection);
    closeTab(tabCtx?.tabKey ?? window.location.pathname);
    if (returnTab) {
      const [returnPath] = returnTab.split("?");
      activateTab(returnPath);
      router.replace(returnTab, { scroll: false });
    } else {
      router.back();
    }
  };
}
