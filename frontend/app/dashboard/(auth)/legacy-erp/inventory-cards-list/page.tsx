"use client";

import { useRouter } from "next/navigation";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useWorkspaceLookupStore } from "@/lib/store/workspace-lookup-store";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { InventoryCardsListView } from "@/components/legacy-erp/inventory-cards-list-view";

// The Inventory Card List Workspace screen — the shared InventoryCardsListView (grid, search,
// paging, worklists, keyboard, selection) hosted as a Workspace tab.
//
// Also doubles as the Inventory lookup for Purchase Order's Code/Name grid cell (F2/search
// icon) — this same screen gains a lookup mode (mode=lookup&requestId=&returnTab=), mirroring
// yarn-cards-list's own established manage-vs-lookup split, instead of building a second
// Inventory picker. (The Receipt Detail Lines item lookup hosts the same view in a modal —
// InventoryCardsLookupDialog.)

const INVENTORY_CARDS_LIST_PATH = "/dashboard/legacy-erp/inventory-cards-list";

export default function InventoryCardListPage() {
  const router = useRouter();

  const params = useWorkspaceSearchParams();
  const mode = params.get("mode") === "lookup" ? "lookup" : "manage";
  const requestId = params.get("requestId") || undefined;
  const returnTab = params.get("returnTab") ? decodeURIComponent(params.get("returnTab")!) : undefined;
  // Optional narrowing filter — e.g. Purchase Order's Fixed Asset Code column opens this same
  // screen with sourceType=fixedasset so only Fixed Asset rows are offered, without a second
  // dedicated picker screen. Sent to the API so it applies to the whole list, before paging.
  const sourceTypeFilter = params.get("sourceType") || undefined;
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const activateTab = useWorkspaceStore((s) => s.activateTab);
  const resolveLookup = useWorkspaceLookupStore((s) => s.resolve);

  // --- Lookup mode: return the selected inventory row to whichever grid cell opened this
  // tab (e.g. Purchase Order's Code column) — mirrors yarn-cards-list's own returnAndClose.
  // sourceType travels in `meta` so the caller knows which per-type endpoint (fabricCards/
  // yarnCards/trimInventoryCards) to call next for VAT/Unit defaults.
  const returnAndClose = (row: any) => {
    if (mode !== "lookup" || !requestId) return;
    resolveLookup(requestId, {
      id: row.id, code: row.inventoryCode, name: row.inventoryName,
      meta: { sourceType: row.sourceType, unit: row.unit, stockOnHand: row.stockOnHand },
    });
    closeSelf();
  };

  const closeSelf = () => {
    closeTab(tabCtx?.tabKey ?? INVENTORY_CARDS_LIST_PATH);
    if (returnTab) {
      const [returnPath] = returnTab.split("?");
      activateTab(returnPath);
      router.replace(returnTab, { scroll: false });
    } else {
      router.back();
    }
  };

  return (
    <InventoryCardsListView
      mode={mode}
      sourceTypeFilter={sourceTypeFilter}
      onSelect={returnAndClose}
      onClose={closeSelf}
    />
  );
}
