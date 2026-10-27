// Print → Yarn / Fabric / Trim Requirement for one or more Work Orders — shared by the Work Orders list
// (the selected rows, or the right-clicked one) and the Work Order screen. Opens the company's
// cumulative requirement report for that material (Legacy ERP → Manage Reports, data source "Work
// Orders — Yarn / Fabric / Trim Requirement") with exactly those Work Orders in its "Work Orders"
// filter (see open-document-report.ts) — never any others.
import { FileText } from "lucide-react";
import type { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { MATERIAL_REPORTS, YARN_REPORT, type MaterialReportKey } from "@/lib/nexuscore-api";
import { openDocumentReport } from "@/components/reports/open-document-report";
import type { RowAction } from "@/components/legacy-erp/row-actions";

type Router = Parameters<typeof navigateOrOpenTab>[0];
type WorkOrderRef = { id: number; workOrderNo?: string | null };

export function openMaterialRequirementReport(router: Router, material: MaterialReportKey, workOrders: WorkOrderRef[]) {
  const r = MATERIAL_REPORTS[material];
  return openDocumentReport(
    router,
    { dataSource: r.dataSource, field: YARN_REPORT.workOrdersField, reportName: r.reportName, sourceLabel: `Work Orders — ${r.label}` },
    { id: workOrders.map((w) => w.id), label: workOrders.map((w) => w.workOrderNo ?? "").join(", ") },
  );
}

export const openYarnRequirementReport = (router: Router, workOrders: WorkOrderRef[]) => openMaterialRequirementReport(router, "yarn", workOrders);

/** Print submenu entries Yarn / Fabric / Trim Requirement for these Work Orders. */
export function materialRequirementActions(router: Router, workOrders: WorkOrderRef[], disabled = false): RowAction[] {
  const suffix = workOrders.length > 1 ? ` (${workOrders.length} Work Orders)` : "";
  return (Object.keys(MATERIAL_REPORTS) as MaterialReportKey[]).map((material, i) => ({
    key: `print-${material}-requirement`, label: `${MATERIAL_REPORTS[material].label}${suffix}`, icon: FileText, disabled,
    separatorBefore: i === 0,
    onSelect: () => { if (!disabled) void openMaterialRequirementReport(router, material, workOrders); },
  }));
}
