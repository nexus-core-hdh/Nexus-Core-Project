"use client";

import { ReportDesignerScreen } from "@/components/reports/report-designer-screen";

/** Create (no id) or edit (?id=) a Legacy ERP report. */
export default function Page() {
  return <ReportDesignerScreen module="legacy-erp" />;
}
