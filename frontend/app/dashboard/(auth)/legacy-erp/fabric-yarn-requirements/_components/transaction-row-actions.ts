"use client";

// Transaction Details row interaction — shared by Fabric/Yarn/Trim Planning AND the Fabric/Trim/
// Yarn Requirements screen's own Transaction Details table (all four render the exact same
// TransactionRow shape from fabric-yarn-requirements.service.ts's own getTransactionDetails).
// Opens the EXACT existing, persisted receipt a row came from — the same generic
// inventory-receipts screen and `?id=<receiptId>&mode=view|edit&receiptType=<receiptType>`
// convention receipt-menu.ts's own openReceipt/openSubcontractReceipt already navigate to for
// EVERY existing receipt type (Purchase Receipt, Outside Process Send/Receive/Return,
// Manufacture Send/Return, ...) — never a second per-type route, never a lookup by ReceiptNo/
// DocumentNo/date (none of which are guaranteed unique; `receiptId` is the real IM_Receipt.RecId
// primary key, see getTransactionDetails' own comment on why it was added).
import type { RowAction } from "@/components/legacy-erp/row-actions";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { Eye, Pencil } from "lucide-react";

type Router = Parameters<typeof navigateOrOpenTab>[0];

export interface TransactionReceiptRef {
  receiptId: number | null;
  receiptType: number | null;
}

// A row predating this feature (created before getTransactionDetails returned receiptId — none
// exist today since this is additive and backfills nothing, but defensively handled anyway) has
// no real receipt to open; both actions below disable themselves with an honest reason rather
// than silently no-op or guess a route.
export function openTransactionReceipt(router: Router, row: TransactionReceiptRef, mode: "view" | "edit") {
  if (row.receiptId == null || row.receiptType == null) return;
  navigateOrOpenTab(router, `/dashboard/legacy-erp/inventory-receipts?id=${row.receiptId}&mode=${mode}&receiptType=${row.receiptType}`);
}

export function buildTransactionRowActions(router: Router, row: TransactionReceiptRef): RowAction[] {
  const disabled = row.receiptId == null || row.receiptType == null;
  const title = disabled ? "This transaction has no resolvable receipt." : undefined;
  return [
    { key: "open", label: "Open", icon: Eye, onSelect: () => openTransactionReceipt(router, row, "view"), disabled, title },
    // Edit opens the SAME existing receipt screen in its own existing editable form — that
    // screen's own existing lock/approval/permission rules (backend-enforced, never re-checked
    // here) decide whether the user can actually change anything once it's open.
    { key: "edit", label: "Edit", icon: Pencil, onSelect: () => openTransactionReceipt(router, row, "edit"), disabled, title },
  ];
}
