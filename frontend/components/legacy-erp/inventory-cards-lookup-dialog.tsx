"use client";

import { ListLookupDialogShell } from "@/components/legacy-erp/entity-list-lookup-dialog";
import { InventoryCardsListView } from "@/components/legacy-erp/inventory-cards-list-view";

interface InventoryCardsLookupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The picked Inventory Card List row (id, inventoryCode, inventoryName, inventoryType, unit,
   *  stockOnHand, lastPurchasePrice, sourceType, ...). The dialog closes itself afterwards. */
  onSelect: (row: any) => void;
  /** Optional narrowing (fabric | yarn | trim | fixedasset), as on the Workspace screen. */
  sourceTypeFilter?: string;
}

// The Inventory Cards List as a modal lookup — the very same InventoryCardsListView the Workspace
// screen renders (same API, search, server paging, columns, worklists, keyboard: ↑/↓ highlight,
// Enter / double-click / Select picks), inside the shared ListLookupDialogShell every "[Entity]
// List" lookup popup uses (same size, header and body as e.g. the Work Orders List), floating
// above the calling screen so a grid cell's lookup is never clipped by its grid.
export function InventoryCardsLookupDialog({ open, onOpenChange, onSelect, sourceTypeFilter }: InventoryCardsLookupDialogProps) {
  return (
    <ListLookupDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Inventory Cards List"
      description="Search by code or name, then double-click, press Enter or click Select."
    >
      <InventoryCardsListView
        variant="dialog"
        mode="lookup"
        sourceTypeFilter={sourceTypeFilter}
        onSelect={(row) => { onSelect(row); onOpenChange(false); }}
        onClose={() => onOpenChange(false)}
      />
    </ListLookupDialogShell>
  );
}
