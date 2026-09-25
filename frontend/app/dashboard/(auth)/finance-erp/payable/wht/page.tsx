"use client";

import { useMemo, useState } from "react";
import { Percent } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportHeader } from "@/components/finance-erp/report-header";
import { SummaryCards, type SummaryCardItem } from "@/components/finance-erp/summary-cards";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { FilterField, FilterBar } from "@/components/finance-erp/list-toolbar";
import { formatAmount } from "@/lib/finance-erp/utils/format";
import { VENDORS } from "@/lib/finance-erp/mock/master-data";
import { getWhtOnPurchases } from "@/lib/finance-erp/payable/wht";
import { Landmark, Percent as PercentIcon, Banknote } from "lucide-react";

const ALL = "__all__";

export default function WhtOnPurchasesPage() {
  const [vendorId, setVendorId] = useState(ALL);
  const rows = useMemo(() => getWhtOnPurchases(), []);
  const filtered = useMemo(() => rows.filter((r) => vendorId === ALL || r.vendorId === vendorId), [rows, vendorId]);

  const totalGross = filtered.reduce((s, r) => s + r.grossAmount, 0);
  const totalWht = filtered.reduce((s, r) => s + r.whtAmount, 0);
  const totalNet = filtered.reduce((s, r) => s + r.netPayable, 0);

  const cards: SummaryCardItem[] = [
    { label: "Gross Amount", value: totalGross, icon: Landmark, tone: "default" },
    { label: "WHT Deducted", value: totalWht, icon: PercentIcon, tone: "warning" },
    { label: "Net Payable", value: totalNet, icon: Banknote, tone: "success" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Payable" }, { label: "WHT on Purchases" }]} />
      <ReportHeader title="WHT on Purchases" period="September 2026" />

      <FilterBar>
        <FilterField label="Vendor">
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Vendors</SelectItem>{VENDORS.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      <SummaryCards items={cards} className="lg:grid-cols-3" />

      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead>Vendor</TableHead><TableHead>Invoice</TableHead><TableHead>Tax Type</TableHead>
                <TableHead className="text-right">Rate %</TableHead><TableHead className="text-right">Gross Amount</TableHead>
                <TableHead className="text-right">WHT Amount</TableHead><TableHead className="text-right">Net Payable</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{VENDORS.find((v) => v.id === r.vendorId)?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.invoiceNumber}</TableCell>
                  <TableCell>{r.taxType}</TableCell>
                  <TableCell className="text-right">{r.taxRate}%</TableCell>
                  <TableCell className="text-right">{formatAmount(r.grossAmount)}</TableCell>
                  <TableCell className="text-right text-orange-600">{formatAmount(r.whtAmount)}</TableCell>
                  <TableCell className="text-right font-medium">{formatAmount(r.netPayable)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
