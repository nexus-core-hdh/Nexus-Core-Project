"use client";

import { useState } from "react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportHeader } from "@/components/finance-erp/report-header";
import { SummaryCards, type SummaryCardItem } from "@/components/finance-erp/summary-cards";
import { FilterField } from "@/components/finance-erp/list-toolbar";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatAmount, formatNumber } from "@/lib/finance-erp/utils/format";
import { SALES_TAX_SUMMARY, TAX_RATES } from "@/lib/finance-erp/general-ledger/tax-reports";

export default function SalesTaxReportPage() {
  const [month, setMonth] = useState("2026-09");
  const netTax = SALES_TAX_SUMMARY.outputTax - SALES_TAX_SUMMARY.inputTax;
  const salesRates = TAX_RATES.filter((t) => t.type === "Sales Tax");

  const summary: SummaryCardItem[] = [
    { label: "Total Sales", value: SALES_TAX_SUMMARY.totalSales },
    { label: "Taxable Sales", value: SALES_TAX_SUMMARY.taxableSales },
    { label: "Output Tax", value: SALES_TAX_SUMMARY.outputTax, tone: "warning" },
    { label: "Input Tax", value: SALES_TAX_SUMMARY.inputTax },
    { label: "Net Tax Payable", value: netTax, tone: netTax >= 0 ? "danger" : "success" },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "General Ledger" }, { label: "Tax Reports" }, { label: "Sales Tax" }]} />
      <ReportHeader title="Sales Tax Report" period={month} />

      <FilterField label="Period" className="max-w-xs"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 text-sm" /></FilterField>

      <SummaryCards items={summary} className="lg:grid-cols-5" />

      <div className="rounded-lg border">
        <div className="border-b bg-muted/30 px-4 py-2 text-sm font-semibold">Tax Rate Breakdown</div>
        <Table>
          <TableHeader><TableRow><TableHead>Tax Name</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>Account</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {salesRates.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right">{formatNumber(r.rate, r.rate % 1 ? 1 : 0)}%</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.account}</TableCell>
                <TableCell><Badge variant={r.status === "Active" ? "success" : "secondary"} className="font-normal">{r.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-muted-foreground">
        Net Tax = Output Tax − Input Tax = {formatAmount(SALES_TAX_SUMMARY.outputTax)} − {formatAmount(SALES_TAX_SUMMARY.inputTax)} = {formatAmount(netTax)}
      </div>
    </div>
  );
}
