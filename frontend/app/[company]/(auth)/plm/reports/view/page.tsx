"use client";

import { ReportViewScreen } from "@/components/reports/report-view-screen";

/** One PLM report (?id=), opened from its own menu entry. */
export default function Page() {
  return <ReportViewScreen module="plm" />;
}
