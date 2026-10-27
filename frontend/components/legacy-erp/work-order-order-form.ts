// Print → Order Form for one Work Order — shared by the Work Orders list (right-click / ⋮) and the
// Work Order screen (right-click / ⋮). Opens the company's Order Form report (Legacy ERP → Manage
// Reports, data source "Work Order — Order Form") for the Work Order (see open-document-report.ts).
import type { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { ORDER_FORM_REPORT } from "@/lib/nexuscore-api";
import { openDocumentReport } from "@/components/reports/open-document-report";

export function openWorkOrderOrderForm(router: Parameters<typeof navigateOrOpenTab>[0], workOrder: { id: number; workOrderNo?: string | null }) {
  return openDocumentReport(
    router,
    { dataSource: ORDER_FORM_REPORT.dataSource, field: ORDER_FORM_REPORT.workOrderField, reportName: "Order Form", sourceLabel: "Work Order — Order Form" },
    { id: workOrder.id, label: workOrder.workOrderNo },
  );
}
