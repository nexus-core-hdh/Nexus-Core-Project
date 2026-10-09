"use client";

import { ReportViewScreen } from "@/components/reports/report-view-screen";

/** One Legacy ERP report (?id=), opened from its own menu entry. */
export default function Page() {
  return <ReportViewScreen module="legacy-erp" />;
}
