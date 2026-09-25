"use client";

import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportHeader } from "@/components/finance-erp/report-header";
import { SummaryCards, type SummaryCardItem } from "@/components/finance-erp/summary-cards";
import { Badge } from "@/components/ui/badge";
import { FilterBar, FilterField } from "@/components/finance-erp/list-toolbar";
import { formatAmount, formatDate, todayIso } from "@/lib/finance-erp/utils/format";
import { CUSTOMERS } from "@/lib/finance-erp/mock/master-data";
import { buildAgingReport, bucketTotals, AGING_BUCKETS } from "@/lib/finance-erp/receivable/aging-report";

const ALL = "__all__";
const BUCKET_COLORS: Record<string, string> = {
  "Current": "var(--chart-1)", "1-30 Days": "var(--chart-2)", "31-60 Days": "var(--chart-3)",
  "61-90 Days": "var(--chart-4)", "90+ Days": "var(--chart-5)",
};

function bucketVariant(bucket: string): "success" | "warning" | "destructive" {
  if (bucket === "Current") return "success";
  if (bucket === "1-30 Days") return "warning";
  return "destructive";
}

export default function AgingReportPage() {
  const [asOf, setAsOf] = useState(todayIso());
  const [customerId, setCustomerId] = useState<string>(ALL);

  const rows = useMemo(() => buildAgingReport(asOf, customerId === ALL ? undefined : customerId), [asOf, customerId]);
  const totals = useMemo(() => bucketTotals(rows), [rows]);
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);

  const summary: SummaryCardItem[] = AGING_BUCKETS.map((b) => ({ label: b, value: totals[b], tone: b === "Current" ? "success" : b === "1-30 Days" ? "warning" : "danger" }));
  const chartData = AGING_BUCKETS.map((b) => ({ bucket: b, value: totals[b] }));

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Receivable" }, { label: "Aging Report" }]} />
      <ModuleHeader icon={CalendarClock} size="lg" title="Accounts Receivable Aging Report" subtitle="Outstanding customer invoices grouped by age" />

      <FilterBar>
        <FilterField label="As Of Date"><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-9 text-sm" /></FilterField>
        <FilterField label="Customer">
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Customers</SelectItem>{CUSTOMERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      <ReportHeader title="Accounts Receivable Aging" period={`As of ${formatDate(asOf)}`} extra={<span className="text-sm font-semibold">Total Outstanding: {formatAmount(grandTotal)}</span>} />

      <SummaryCards items={summary} />

      <Card>
        <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold">Aging Distribution</CardTitle></CardHeader>
        <CardContent className="pt-4"><div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((d) => <Cell key={d.bucket} fill={BUCKET_COLORS[d.bucket]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div></CardContent>
      </Card>

      {rows.length === 0 ? (
        <Empty><EmptyHeader><EmptyMedia variant="icon"><CalendarClock /></EmptyMedia><EmptyTitle>Nothing outstanding</EmptyTitle><EmptyDescription>All invoices for this selection are settled.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Invoice</TableHead><TableHead>Invoice Date</TableHead><TableHead>Due Date</TableHead><TableHead className="text-right">Invoice Amount</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead>Bucket</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.customer}</TableCell>
                  <TableCell className="font-mono text-xs">{r.invoiceNumber}</TableCell>
                  <TableCell>{formatDate(r.invoiceDate)}</TableCell>
                  <TableCell>{formatDate(r.dueDate)}</TableCell>
                  <TableCell className="text-right">{formatAmount(r.invoiceAmount)}</TableCell>
                  <TableCell className="text-right">{formatAmount(r.paid)}</TableCell>
                  <TableCell className="text-right font-medium">{formatAmount(r.outstanding)}</TableCell>
                  <TableCell><Badge variant={bucketVariant(r.bucket)} className="whitespace-nowrap font-normal">{r.bucket}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
