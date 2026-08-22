import type { useRouter } from "next/navigation";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { legacyErpApi } from "@/lib/nexuscore-api";

// Centralized dropdown-table -> action mapping — same architecture as
// receipt-master-data/_lib/table-config.ts, scoped to this screen's own single source
// (FI_Receipt, a genuinely separate table from that screen's IM_Receipt-backed options — see
// fi-receipt.service.ts's own header comment). Every handler below calls straight into the
// already-existing financial-receipts route/service (fi-receipt.controller.ts) — this file
// invents no new backend workflow.
export type TableKey = "financial-receipt";

export const TABLE_OPTIONS: { value: TableKey; label: string }[] = [
  { value: "financial-receipt", label: "Financial Receipt" },
];

type Router = ReturnType<typeof useRouter>;

export interface ActionCtx {
  row: Record<string, any>;
  router: Router;
  reload: () => void;
  openDetails: (row: Record<string, any>) => void;
}

export interface TableActions {
  label: string;
  onNew?: (ctx: Omit<ActionCtx, "row">) => void;
  onView: (ctx: ActionCtx) => void;
  onUpdate?: (ctx: ActionCtx) => void;
  onDelete: (ctx: ActionCtx) => Promise<void>;
  onApprove?: (ctx: ActionCtx) => Promise<void>;
  isApproved?: (row: Record<string, any>) => boolean;
}

export const TABLE_ACTIONS: Record<TableKey, TableActions> = {
  "financial-receipt": {
    label: "Financial Receipt",
    onNew: ({ router }) => navigateOrOpenTab(router, `/dashboard/legacy-erp/financial-receipts?mode=create`),
    onView: ({ row, router }) => navigateOrOpenTab(router, `/dashboard/legacy-erp/financial-receipts?id=${row.RecId}&mode=view`),
    onUpdate: ({ row, router }) => navigateOrOpenTab(router, `/dashboard/legacy-erp/financial-receipts?id=${row.RecId}&mode=edit`),
    onDelete: async ({ row, reload }) => { await legacyErpApi.financialReceipts.delete(Number(row.RecId)); reload(); },
    onApprove: async ({ row, reload }) => { await legacyErpApi.financialReceipts.update(Number(row.RecId), { isApproved: true }); reload(); },
    isApproved: (row) => !!row.IsApproved,
  },
};
