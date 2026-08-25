"use client";

import { Save, Printer, BadgeCheck, XCircle, Lock, Unlock, ClipboardList, PackagePlus, Undo2, Trash2 } from "lucide-react";
import type { RowAction } from "@/components/legacy-erp/row-actions";

// Universal Action Menu — one config-driven builder for the right-click/keyboard action set
// shared across legacy-ERP transaction screens (Save, Print, Approve, Disapprove, Close Order,
// Open Order, Pending Orders, Return/related-receipt submenu, Delete). Every action here calls the
// exact handler the caller already uses for its own toolbar button — this hook only decides
// ordering/visibility/enablement, it never re-implements Save/Approve/Delete/etc itself.
//
// Print and Close/Open Order have no existing backend implementation anywhere in this codebase
// (confirmed via full-repo search — no print route, no order open/close endpoint or field
// write-path). Per the task's own rule, they stay visible-but-permanently-disabled rather than
// getting invented business logic.

export interface RelatedReceiptRef {
  id: number;
  receiptType: number;
  receiptNo: string;
  label: string;
}

export interface UniversalActionsContext {
  recordExists: boolean;
  isDirty: boolean;
  saving: boolean;
  onSave: () => void;

  approvalRequired: boolean;
  approvalStatus?: { status: string } | null;
  approving: boolean;
  onApprove: () => void;
  onReject: () => void;

  pendingOrders?: { onOpen: () => void; disabled: boolean };

  // Current-Account-aware Related Receipt import (Purchase Return only). Deliberately always
  // enabled (not gated by a `disabled` flag like pendingOrders above) — a disabled Radix menu
  // item never fires onSelect at all, which would leave no way to show the required
  // "Select a Current Account first..." message. onOpen itself checks and toasts instead.
  relatedReceiptImport?: { onOpen: () => void };

  relatedReceipts?: RelatedReceiptRef[];
  onOpenRelatedReceipt?: (r: RelatedReceiptRef) => void;
  /** Label for the related-receipts submenu — defaults to "Return / Purchase Receipt" (Purchase
   *  Order's own, unchanged for every existing caller that doesn't pass this). A caller whose own
   *  related-receipt family is never a Purchase Receipt (e.g. Subcontract Order, whose family is
   *  Outside Process Receive/Return receipts — see receipt-traceability.service.ts) should pass
   *  its own accurate label instead of inheriting this one. */
  relatedReceiptsLabel?: string;

  onDelete?: () => void;
}

export function useUniversalActions(ctx: UniversalActionsContext): RowAction[] {
  const pendingApproval = ctx.approvalRequired && ctx.approvalStatus?.status === "pending_approval";
  const relatedReceipts = ctx.relatedReceipts ?? [];

  return [
    { key: "save", label: "Save", icon: Save, onSelect: ctx.onSave, disabled: !ctx.isDirty || ctx.saving },
    { key: "print", label: "Print", icon: Printer, onSelect: () => {}, disabled: true },

    { key: "approve", label: "Approve", icon: BadgeCheck, onSelect: ctx.onApprove, disabled: ctx.approving, hidden: !pendingApproval, separatorBefore: true },
    { key: "disapprove", label: "Disapprove", icon: XCircle, onSelect: ctx.onReject, disabled: ctx.approving, hidden: !pendingApproval },

    { key: "close-order", label: "Close Order", icon: Lock, onSelect: () => {}, disabled: true, separatorBefore: true },
    { key: "open-order", label: "Open Order", icon: Unlock, onSelect: () => {}, disabled: true },

    {
      key: "pending-orders", label: "Pending Orders", icon: ClipboardList,
      onSelect: ctx.pendingOrders?.onOpen ?? (() => {}),
      disabled: !!ctx.pendingOrders?.disabled,
      hidden: !ctx.pendingOrders,
      separatorBefore: true,
    },

    {
      key: "import-related-receipt", label: "Import Related Receipt", icon: PackagePlus,
      onSelect: ctx.relatedReceiptImport?.onOpen ?? (() => {}),
      hidden: !ctx.relatedReceiptImport,
    },

    {
      key: "return-purchase-receipt", label: ctx.relatedReceiptsLabel ?? "Return / Purchase Receipt", icon: Undo2,
      onSelect: () => {},
      hidden: relatedReceipts.length === 0,
      separatorBefore: true,
      subActions: relatedReceipts.map((r) => ({
        key: `related-receipt-${r.id}`,
        label: `${r.label} — ${r.receiptNo}`,
        icon: Undo2,
        onSelect: () => ctx.onOpenRelatedReceipt?.(r),
      })),
    },

    {
      key: "delete", label: "Delete", icon: Trash2, destructive: true, separatorBefore: true,
      onSelect: ctx.onDelete ?? (() => {}),
      disabled: !ctx.recordExists || !ctx.onDelete,
    },
  ];
}
