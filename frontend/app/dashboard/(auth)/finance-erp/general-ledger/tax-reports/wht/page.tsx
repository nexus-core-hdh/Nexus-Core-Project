"use client";

import { useMemo, useState } from "react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportHeader } from "@/components/finance-erp/report-header";
import { SummaryCards, type SummaryCardItem } from "@/components/finance-erp/summary-cards";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { FilterField } from "@/components/finance-erp/list-toolbar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount } from "@/lib/finance-erp/utils/format";
import { WHT_ROWS } from "@/lib/finance-erp/general-ledger/tax-reports";

const ALL = "__all__";

export default function WhtReportPage() {
  const [period, setPeriod] = useState(ALL);
  const periods = Array.from(new Set(WHT_ROWS.map((r) => r.period)));
  const rows = useMemo(() => WHT_ROWS.filter((r) => period === ALL || r.period === period), [period]);

  const totalGross = rows.reduce((s, r) => s + r.grossAmount, 0);
  const totalTax = rows.reduce((s, r) => s + r.taxAmount, 0);
  const summary: SummaryCardItem[] = [
    { label: "Gross Amount", value: totalGross },
    { label: "Total WHT Deducted", value: totalTax, tone: "warning" },
    { label: "Net Amount Paid", value: totalGross - totalTax, tone: "success" },
  ];

  return (
    <div className="mx-auto max-w-[1300px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "General Ledger" }, { label: "Tax Reports" }, { label: "WHT" }]} />
      <ReportHeader title="Withholding Tax (WHT) Report" period={period === ALL ? "All Periods" : period} />

      <FilterField label="Period" className="max-w-xs">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>All Periods</SelectItem>{periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
      </FilterField>

      <SummaryCards items={summary} className="lg:grid-cols-3" />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Party</TableHead><TableHead>Type</TableHead><TableHead>Tax Type</TableHead>
              <TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Tax Amount</TableHead><TableHead className="text-right">Net Amount</TableHead>
              <TableHead>Period</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.party}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.partyType}</TableCell>
                <TableCell className="text-xs">{r.taxType}</TableCell>
                <TableCell className="text-right">{r.rate}%</TableCell>
                <TableCell className="text-right">{formatAmount(r.grossAmount)}</TableCell>
                <TableCell className="text-right">{formatAmount(r.taxAmount)}</TableCell>
                <TableCell className="text-right font-medium">{formatAmount(r.netAmount)}</TableCell>
                <TableCell>{r.period}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
