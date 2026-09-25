"use client";

import { useMemo, useState } from "react";
import { Users2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportHeader } from "@/components/finance-erp/report-header";
import { SummaryCards, type SummaryCardItem } from "@/components/finance-erp/summary-cards";
import { FilterBar, FilterField } from "@/components/finance-erp/list-toolbar";
import { formatAmount, formatDate, amountColorClass } from "@/lib/finance-erp/utils/format";
import { CUSTOMERS, BRANCHES, branchName } from "@/lib/finance-erp/mock/master-data";
import { buildCustomerLedger } from "@/lib/finance-erp/receivable/customer-ledger";

const ALL = "__all__";

export default function CustomerLedgerPage() {
  const [customerId, setCustomerId] = useState(CUSTOMERS[0].id);
  const [branchId, setBranchId] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const ledger = useMemo(() => buildCustomerLedger(customerId, dateFrom || undefined, dateTo || undefined), [customerId, dateFrom, dateTo]);
  const customer = CUSTOMERS.find((c) => c.id === customerId);

  const summary: SummaryCardItem[] = [
    { label: "Opening Balance", value: ledger.openingBalance },
    { label: "Total Debit", value: ledger.totalDebit, tone: "warning" },
    { label: "Total Credit", value: ledger.totalCredit, tone: "success" },
    { label: "Closing Balance", value: ledger.closingBalance, tone: ledger.closingBalance > 0 ? "danger" : "default" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Receivable" }, { label: "Customer Ledger" }]} />
      <ModuleHeader icon={Users2} size="lg" title="Customer Ledger" subtitle="Statement of account per customer" />

      <FilterBar>
        <FilterField label="Customer">
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{CUSTOMERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Branch">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Branches</SelectItem>{BRANCHES.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Date Range">
          <div className="flex items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
          </div>
        </FilterField>
      </FilterBar>

      <ReportHeader title={`Customer Ledger — ${customer?.name ?? ""}`} branch={branchId === ALL ? "All Branches" : branchName(branchId)} period={dateFrom || dateTo ? `${dateFrom || "Inception"} to ${dateTo || "Today"}` : "All Time"} />

      <SummaryCards items={summary} />

      {ledger.entries.length === 0 ? (
        <Empty><EmptyHeader><EmptyMedia variant="icon"><Users2 /></EmptyMedia><EmptyTitle>No transactions found</EmptyTitle><EmptyDescription>Try widening the date range or choosing a different customer.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
            <TableBody>
              {ledger.entries.map((e, i) => (
                <TableRow key={i}>
                  <TableCell>{formatDate(e.date)}</TableCell>
                  <TableCell className="font-mono text-xs">{e.reference}</TableCell>
                  <TableCell>{e.description}</TableCell>
                  <TableCell className="text-right">{e.debit ? formatAmount(e.debit) : "—"}</TableCell>
                  <TableCell className="text-right">{e.credit ? formatAmount(e.credit) : "—"}</TableCell>
                  <TableCell className={`text-right font-medium ${amountColorClass(e.balance)}`}>{formatAmount(e.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
