"use client";

import { Save, Printer, BadgeCheck, XCircle, Lock, Unlock, ClipboardList, Undo2, Trash2 } from "lucide-react";
import type { RowAction } from "@/components/legacy-erp/row-actions";

// Universal Action Menu — one config-driven builder for the right-click/keyboard action set
// shared across legacy-ERP transaction screens (Save, Print, Approve, Disapprove, Close Order,
// Open Order, Pending Orders, Return/Purchase Receipt, Delete). Every action here calls the
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

  relatedReceipts?: RelatedReceiptRef[];
  onOpenRelatedReceipt?: (r: RelatedReceiptRef) => void;

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
      key: "return-purchase-receipt", label: "Return / Purchase Receipt", icon: Undo2,
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
