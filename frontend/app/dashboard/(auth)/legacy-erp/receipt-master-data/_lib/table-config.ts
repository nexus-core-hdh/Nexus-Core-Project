import type { useRouter } from "next/navigation";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { RECEIPT_TYPES } from "@/lib/legacy-erp/receipt-types";

// Centralized dropdown-table -> action mapping (task's own "resolveTargetModule /
// resolveAction" architecture). The SELECTED DROPDOWN TABLE has absolute priority over the
// clicked row — every handler below is looked up by `selectedTable` first; the clicked row
// only ever supplies record identity (row.RecId, etc.), never the target module. Every
// handler calls straight into an already-existing route/service — this file invents no new
// backend workflow, it only decides which existing one a given (table, action) pair reuses.
//
// Dropdown trimmed to 3 retained master options (Purchase Receipt/Inventory Receipt/Current
// Account — unified-grid-backed, unchanged) + the 17 "other" Receipt Screen Replication types
// from receipt-types.ts (the shared config also used by inventory-receipts/page.tsx and
// receipt-type.controller.ts — reused here, not duplicated). Purchase Receipt's own
// receiptType=2 entry in that config is deliberately excluded: it's the same physical data as
// the "Purchase Receipt" option above, and the generic /legacy-erp/receipts/:receiptType route
// rejects receiptType=2 by design, so listing it a second time would be either a true
// duplicate or a broken option. Address/Warehouse/City/State/Country remain fully functional
// via their own existing screens/routes — only their entries in THIS dropdown were removed.
type ReceiptTypeKey = Exclude<(typeof RECEIPT_TYPES)[number]["key"], "purchase-receipt">;
export type TableKey = "purchase-receipt" | "inventory-receipt" | "current-account" | ReceiptTypeKey;

const RECEIPT_TYPE_ENTRIES = RECEIPT_TYPES.filter((t) => t.key !== "purchase-receipt");

// Lets page.tsx's load() decide, for the selected dropdown value, whether to fetch via the
// existing unified-grid endpoint (the 3 retained options) or the existing generic receipt-type
// endpoint (the 16 others) — reused as-is, no new data-fetch mechanism.
export const RECEIPT_TYPE_BY_KEY: Partial<Record<TableKey, number>> = Object.fromEntries(
  RECEIPT_TYPE_ENTRIES.map((t) => [t.key, t.receiptType]),
);

export const TABLE_OPTIONS: { value: TableKey; label: string }[] = [
  { value: "purchase-receipt", label: "Purchase Receipt" },
  { value: "inventory-receipt", label: "Inventory Receipt" },
  { value: "current-account", label: "Current Account" },
  ...RECEIPT_TYPE_ENTRIES.map((t) => ({ value: t.key as TableKey, label: t.label })),
];

type Router = ReturnType<typeof useRouter>;

export interface ActionCtx {
  row: Record<string, any>;
  router: Router;
  reload: () => void;
  openDetails: (row: Record<string, any>) => void;
}

export interface TableActions {
  /** Singular label used in confirm dialogs ("Delete Purchase Receipt"). */
  label: string;
  /** undefined => "New" is disabled for this table (no existing create-without-context workflow). */
  onNew?: (ctx: Omit<ActionCtx, "row">) => void;
  /** Always available — falls back to the generic read-only row-details dialog when the
   *  table has no dedicated detail route. */
  onView: (ctx: ActionCtx) => void;
  /** undefined => "Update" is disabled for this table. */
  onUpdate?: (ctx: ActionCtx) => void;
  /** Always reuses the owning module's existing (soft-)delete endpoint. */
  onDelete: (ctx: ActionCtx) => Promise<void>;
  /** undefined => "Approval" is disabled for this table (no existing approval concept). */
  onApprove?: (ctx: ActionCtx) => Promise<void>;
  /** undefined => "Reject" is disabled for this table. Always prompts for a remarks string. */
  onReject?: (ctx: ActionCtx, remarks: string) => Promise<void>;
  isApproved?: (row: Record<string, any>) => boolean;
}

// Purchase Receipt / Inventory Receipt both resolve to the one existing IM_Receipt module
// (inventory-receipt.service.ts / inventory-receipt.controller.ts, route "inventory-receipts")
// — see unified-grid.service.ts's own comment for why there is deliberately no second table.
const receiptActions = (label: string): TableActions => ({
  label,
  onNew: ({ router }) => navigateOrOpenTab(router, `/dashboard/legacy-erp/inventory-receipts?mode=create`),
  onView: ({ row, router }) => navigateOrOpenTab(router, `/dashboard/legacy-erp/inventory-receipts?id=${row.RecId}&mode=view`),
  onUpdate: ({ row, router }) => navigateOrOpenTab(router, `/dashboard/legacy-erp/inventory-receipts?id=${row.RecId}&mode=edit`),
  onDelete: async ({ row, reload }) => { await legacyErpApi.inventoryReceipts.delete(Number(row.RecId)); reload(); },
  // Routed through the centralized General Settings -> Approval Configuration framework
  // (nexuscore-backend/src/modules/approval/) instead of a raw `update({isApproved:true})` —
  // when this screen has approvalRequired configured, the backend enforces permission/pending-
  // state/self-approval; when it doesn't, the service still performs the exact same IsApproved
  // write this action always made, just now behind the approval:approve/reject permission
  // (closing the previously-unrestricted-approve gap for every screen, not only configured ones).
  onApprove: async ({ row, reload }) => { await legacyErpApi.inventoryReceipts.approve(Number(row.RecId)); reload(); },
  onReject: async ({ row, reload }, remarks) => { await legacyErpApi.inventoryReceipts.reject(Number(row.RecId), remarks); reload(); },
  isApproved: (row) => !!row.IsApproved,
});

// The 16 "other" receipt types — same IM_Receipt module, routed through the existing generic
// receipt-type.controller.ts / legacyErpApi.receipts(receiptType) client instead of the
// dedicated inventory-receipts one. Mirrors receiptActions() exactly, just parameterized.
const receiptTypeActions = (receiptType: number, label: string): TableActions => ({
  label,
  onNew: ({ router }) => navigateOrOpenTab(router, `/dashboard/legacy-erp/inventory-receipts?mode=create&receiptType=${receiptType}`),
  onView: ({ row, router }) => navigateOrOpenTab(router, `/dashboard/legacy-erp/inventory-receipts?id=${row.RecId}&mode=view&receiptType=${receiptType}`),
  onUpdate: ({ row, router }) => navigateOrOpenTab(router, `/dashboard/legacy-erp/inventory-receipts?id=${row.RecId}&mode=edit&receiptType=${receiptType}`),
  onDelete: async ({ row, reload }) => { await legacyErpApi.receipts(receiptType).delete(Number(row.RecId)); reload(); },
  onApprove: async ({ row, reload }) => { await legacyErpApi.receipts(receiptType).update(Number(row.RecId), { isApproved: true }); reload(); },
  isApproved: (row) => !!row.IsApproved,
});

export const TABLE_ACTIONS: Record<TableKey, TableActions> = {
  "purchase-receipt": receiptActions("Purchase Receipt"),
  "inventory-receipt": receiptActions("Inventory Receipt"),

  "current-account": {
    label: "Current Account",
    onNew: ({ router }) => navigateOrOpenTab(router, `/dashboard/legacy-erp/current-accounts?mode=create`),
    onView: ({ row, router }) => navigateOrOpenTab(router, `/dashboard/legacy-erp/current-accounts?id=${row.RecId}&mode=view`),
    onUpdate: ({ row, router }) => navigateOrOpenTab(router, `/dashboard/legacy-erp/current-accounts?id=${row.RecId}&mode=edit`),
    onDelete: async ({ row, reload }) => { await legacyErpApi.accounts.delete(Number(row.RecId)); reload(); },
    // No approval concept exists anywhere on FI_Account/account.service.ts — left disabled
    // rather than inventing one, per the spec's own graceful-degradation rule.
  },

  ...(Object.fromEntries(
    RECEIPT_TYPE_ENTRIES.map((t) => [t.key, receiptTypeActions(t.receiptType, t.label)]),
  ) as Record<ReceiptTypeKey, TableActions>),
};
