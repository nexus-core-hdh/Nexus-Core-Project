"use client";

import { ReportDesignerScreen } from "@/components/reports/report-designer-screen";

/** Create (no id) or edit (?id=) a Docket Management report. */
export default function Page() {
  return <ReportDesignerScreen module="docket" />;
}
