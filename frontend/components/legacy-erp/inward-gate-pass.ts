// Print → Inward Gate Pass for one inventory receipt — shared by the Inventory Receipt screen and
// the receipt lists (right-click / ⋮). Opens the company's Inward Gate Pass report (Legacy ERP →
// Manage Reports, data source "Inventory Receipt — Inward Gate Pass") for the receipt (see
// open-document-report.ts). Offered for inward receipt types only; the report itself refuses others.
import { FileText, Printer } from "lucide-react";
import type { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { GATE_PASS_REPORT } from "@/lib/nexuscore-api";
import { isInwardReceiptType } from "@/lib/legacy-erp/receipt-types";
import { openDocumentReport } from "@/components/reports/open-document-report";
import type { RowAction } from "@/components/legacy-erp/row-actions";

export function openInwardGatePass(router: Parameters<typeof navigateOrOpenTab>[0], receipt: { id: number; receiptNo?: string | null }) {
  return openDocumentReport(
    router,
    { dataSource: GATE_PASS_REPORT.dataSource, field: GATE_PASS_REPORT.receiptField, reportName: "Inward Gate Pass", sourceLabel: "Inventory Receipt — Inward Gate Pass" },
    { id: receipt.id, label: receipt.receiptNo },
  );
}

/** The menu entry Print → Inward Gate Pass — hidden for receipt types that are not inward. */
export function inwardGatePassAction(
  router: Parameters<typeof navigateOrOpenTab>[0],
  receipt: { id: number | null | undefined; receiptNo?: string | null; receiptType: number },
): RowAction {
  return {
    key: "print", label: "Print", icon: Printer, onSelect: () => {}, separatorBefore: true,
    hidden: !isInwardReceiptType(receipt.receiptType), disabled: !receipt.id,
    title: receipt.id ? undefined : "Save the receipt first",
    subActions: [{
      key: "print-inward-gate-pass", label: "Inward Gate Pass", icon: FileText, disabled: !receipt.id,
      onSelect: () => { if (receipt.id) void openInwardGatePass(router, { id: receipt.id, receiptNo: receipt.receiptNo }); },
    }],
  };
}
