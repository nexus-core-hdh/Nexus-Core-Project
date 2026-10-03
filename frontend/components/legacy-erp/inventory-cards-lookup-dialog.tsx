"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

// The Inventory Card List as a modal lookup — the very same InventoryCardsListView the Workspace
// screen renders (same API, search, server paging, columns, worklists, keyboard: ↑/↓ highlight,
// Enter / double-click / Select picks), floating above the calling screen so a grid cell's lookup
// is never clipped by its grid. Mounted only while open, so every opening starts from a fresh
// list with an empty search (no stale results from a previous row).
export function InventoryCardsLookupDialog({ open, onOpenChange, onSelect, sourceTypeFilter }: InventoryCardsLookupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(1100px,calc(100vw-2rem))] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3">
          <DialogTitle>Inventory Cards List</DialogTitle>
          <DialogDescription>Search by code or name, then double-click, press Enter or click Select.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {open && (
            <InventoryCardsListView
              variant="dialog"
              mode="lookup"
              sourceTypeFilter={sourceTypeFilter}
              onSelect={(row) => { onSelect(row); onOpenChange(false); }}
              onClose={() => onOpenChange(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
