"use client";

import { useState } from "react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportHeader } from "@/components/finance-erp/report-header";
import { SummaryCards, type SummaryCardItem } from "@/components/finance-erp/summary-cards";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatAmount } from "@/lib/finance-erp/utils/format";
import {
  CASH_FLOW_OPERATING, CASH_FLOW_INVESTING, CASH_FLOW_FINANCING, CASH_FLOW_SUMMARY,
} from "@/lib/finance-erp/general-ledger/financial-statements";
import { StatementTable } from "../statement-table";

export default function CashFlowPage() {
  const [comparative, setComparative] = useState(true);

  const closingCheck = CASH_FLOW_SUMMARY.openingCash.current + CASH_FLOW_SUMMARY.netCashFlow.current;
  const balanced = Math.abs(closingCheck - CASH_FLOW_SUMMARY.closingCash.current) < 1;

  const summary: SummaryCardItem[] = [
    { label: "Opening Cash", value: CASH_FLOW_SUMMARY.openingCash.current },
    { label: "Net Cash Flow", value: CASH_FLOW_SUMMARY.netCashFlow.current, tone: CASH_FLOW_SUMMARY.netCashFlow.current >= 0 ? "success" : "danger" },
    { label: "Closing Cash", value: CASH_FLOW_SUMMARY.closingCash.current, tone: "success" },
  ];

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "General Ledger" }, { label: "Financial Statements" }, { label: "Cash Flow" }]} />
      <ReportHeader title="Cash Flow Statement" period="September 2026" />

      <label className="flex h-9 items-center gap-2 text-sm"><Switch checked={comparative} onCheckedChange={setComparative} /><Label>Comparative Period</Label></label>

      <SummaryCards items={summary} className="lg:grid-cols-3" />

      <div className="space-y-4">
        <div className="rounded-lg border">
          <div className="border-b bg-muted/30 px-4 py-2 text-sm font-semibold">Operating Activities</div>
          <StatementTable rows={CASH_FLOW_OPERATING} showComparative={comparative} priorLabel="Prior Month" />
        </div>
        <div className="rounded-lg border">
          <div className="border-b bg-muted/30 px-4 py-2 text-sm font-semibold">Investing Activities</div>
          <StatementTable rows={CASH_FLOW_INVESTING} showComparative={comparative} priorLabel="Prior Month" />
        </div>
        <div className="rounded-lg border">
          <div className="border-b bg-muted/30 px-4 py-2 text-sm font-semibold">Financing Activities</div>
          <StatementTable rows={CASH_FLOW_FINANCING} showComparative={comparative} priorLabel="Prior Month" />
        </div>
      </div>

      <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${balanced ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
        Opening Cash ({formatAmount(CASH_FLOW_SUMMARY.openingCash.current)}) + Net Cash Flow ({formatAmount(CASH_FLOW_SUMMARY.netCashFlow.current)}) = Closing Cash ({formatAmount(closingCheck)}){balanced ? " — reconciled." : " — mismatch."}
      </div>
    </div>
  );
}
