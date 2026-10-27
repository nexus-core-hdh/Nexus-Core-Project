// Opens a Legacy ERP "document" report (Manage Reports → a report on a document data source, e.g.
// "Work Order — Order Form", "Inventory Receipt — Inward Gate Pass") for one record: finds the
// company's report on that data source (preferring the standard report's name), and opens its report
// view with the record's id in the report's "ask when running" filter, so it runs straight away.
// The view prints and exports it. Shared by every screen's Print → ... menu entry.
import { toast } from "sonner";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { REPORT_MODULE_UI, reportBuilderApiFor } from "@/lib/nexuscore-api";

export interface DocumentReportTarget {
  /** The report's data source key, e.g. "work-order-order-form". */
  dataSource: string;
  /** The filter field that takes the record's id, e.g. "workOrderId". */
  field: string;
  /** The standard report's name, preferred when the company has several reports on the source. */
  reportName: string;
  /** Data source label, for the "not set up yet" message. */
  sourceLabel: string;
}

export async function openDocumentReport(
  router: Parameters<typeof navigateOrOpenTab>[0],
  target: DocumentReportTarget,
  /** One record, or several (an "is one of" filter, e.g. the selected Work Orders). */
  record: { id: number | number[]; label?: string | null },
) {
  try {
    const reports = await reportBuilderApiFor("legacy-erp").list();
    const matches = reports.filter((r) => r.dataSource === target.dataSource);
    const report = matches.find((r) => r.name.trim().toLowerCase() === target.reportName.toLowerCase()) ?? matches[0];
    if (!report) {
      toast.error(`No ${target.reportName} report is set up yet — create one in Legacy ERP → Manage Reports with the data source “${target.sourceLabel}”.`);
      return;
    }
    // p.<field> fills a report's "ask when running" filter; pl.<field> is the value's display text.
    const qs = new URLSearchParams({
      id: report.id,
      [`p.${target.field}`]: Array.isArray(record.id) ? record.id.join(",") : String(record.id),
      [`pl.${target.field}`]: String(record.label ?? ""),
    });
    navigateOrOpenTab(router, `${REPORT_MODULE_UI["legacy-erp"].basePath}/view?${qs.toString()}`);
  } catch (e: any) {
    toast.error(e.status === 403 ? `You need permission to view Legacy ERP reports to print the ${target.reportName}.` : e.message || `Could not open the ${target.reportName}`);
  }
}
