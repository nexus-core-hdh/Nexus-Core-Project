"use client";

import { useMemo, useState } from "react";
import { BookUser } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportHeader } from "@/components/finance-erp/report-header";
import { SummaryCards, type SummaryCardItem } from "@/components/finance-erp/summary-cards";
import { FilterField, FilterBar } from "@/components/finance-erp/list-toolbar";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { VENDORS, BRANCHES } from "@/lib/finance-erp/mock/master-data";
import { getVendorLedger } from "@/lib/finance-erp/payable/vendor-ledger";
import { Wallet, TrendingUp, TrendingDown, Scale } from "lucide-react";

export default function VendorLedgerPage() {
  const [vendorId, setVendorId] = useState(VENDORS[0].id);
  const [branchId, setBranchId] = useState("__all__");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const ledger = useMemo(() => getVendorLedger(vendorId, dateFrom || undefined, dateTo || undefined), [vendorId, dateFrom, dateTo]);
  const vendor = VENDORS.find((v) => v.id === vendorId);

  const cards: SummaryCardItem[] = [
    { label: "Opening Balance", value: ledger.openingBalance, icon: Wallet, tone: "default" },
    { label: "Total Debit", value: ledger.totalDebit, icon: TrendingDown, tone: "warning" },
    { label: "Total Credit", value: ledger.totalCredit, icon: TrendingUp, tone: "success" },
    { label: "Closing Balance", value: ledger.closingBalance, icon: Scale, tone: ledger.closingBalance > 0 ? "danger" : "success" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Payable" }, { label: "Vendor Ledger" }]} />
      <ReportHeader title="Vendor Ledger" branch={branchId === "__all__" ? "All Branches" : BRANCHES.find((b) => b.id === branchId)?.name} period={vendor?.name} />

      <FilterBar>
        <FilterField label="Vendor">
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{VENDORS.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Branch">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">All Branches</SelectItem>{BRANCHES.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Date Range">
          <div className="flex items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
          </div>
        </FilterField>
      </FilterBar>

      <SummaryCards items={cards} />

      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Description</TableHead>
                <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.entries.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="p-0"><Empty><EmptyHeader><EmptyMedia variant="icon"><BookUser /></EmptyMedia><EmptyTitle>No transactions</EmptyTitle><EmptyDescription>No ledger activity for this vendor in the selected period.</EmptyDescription></EmptyHeader></Empty></TableCell></TableRow>
              ) : (
                ledger.entries.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{formatDate(e.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{e.reference}</TableCell>
                    <TableCell>{e.description}</TableCell>
                    <TableCell className="text-right">{e.debit ? formatAmount(e.debit) : "—"}</TableCell>
                    <TableCell className="text-right">{e.credit ? formatAmount(e.credit) : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatAmount(e.balance)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
