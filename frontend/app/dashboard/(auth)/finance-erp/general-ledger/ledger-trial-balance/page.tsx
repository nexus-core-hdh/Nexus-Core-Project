"use client";

import { useEffect, useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportHeader } from "@/components/finance-erp/report-header";
import { FilterField } from "@/components/finance-erp/list-toolbar";
import { SummaryCards, type SummaryCardItem } from "@/components/finance-erp/summary-cards";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { BRANCHES, COST_CENTERS } from "@/lib/finance-erp/mock/master-data";
import { getAccounts, type AccountNode } from "@/lib/finance-erp/general-ledger/chart-of-accounts";
import { getGeneralLedgerForAccount, getTrialBalance } from "@/lib/finance-erp/general-ledger/ledger-trial-balance";

const ALL = "__all__";

export default function LedgerTrialBalancePage() {
  const [accounts, setAccounts] = useState<AccountNode[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [branch, setBranch] = useState(ALL);
  const [costCenter, setCostCenter] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { getAccounts().then((rows) => { setAccounts(rows); setAccountId(rows[0]?.id ?? ""); }); }, []);

  const branchFilter = branch === ALL ? undefined : branch;
  const costCenterFilter = costCenter === ALL ? undefined : costCenter;
  const ledgerRows = useMemo(
    () => accountId ? getGeneralLedgerForAccount(accountId, dateFrom || undefined, dateTo || undefined, branchFilter, costCenterFilter) : [],
    [accountId, dateFrom, dateTo, branchFilter, costCenterFilter],
  );
  const trialBalance = useMemo(
    () => getTrialBalance(dateFrom || undefined, dateTo || undefined, branchFilter, costCenterFilter),
    [dateFrom, dateTo, branchFilter, costCenterFilter],
  );

  const totalDebit = trialBalance.reduce((s, r) => s + r.debit, 0);
  const totalCredit = trialBalance.reduce((s, r) => s + r.credit, 0);
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const closingBalance = ledgerRows.at(-1)?.runningBalance ?? 0;

  const summary: SummaryCardItem[] = [
    { label: "Opening Balance", value: 0, tone: "default" },
    { label: "Total Debit", value: ledgerRows.reduce((s, r) => s + r.debit, 0), tone: "default" },
    { label: "Total Credit", value: ledgerRows.reduce((s, r) => s + r.credit, 0), tone: "default" },
    { label: "Closing Balance", value: closingBalance, tone: closingBalance >= 0 ? "success" : "danger" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "General Ledger" }, { label: "Ledger / Trial Balance" }]} />
      <ReportHeader title="Ledger / Trial Balance" branch={branch === ALL ? "All Branches" : BRANCHES.find((b) => b.id === branch)?.name} period={dateFrom && dateTo ? `${formatDate(dateFrom)} – ${formatDate(dateTo)}` : "All Time"} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FilterField label="Branch">
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Branches</SelectItem>{BRANCHES.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Cost Center">
          <Select value={costCenter} onValueChange={setCostCenter}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All Cost Centers</SelectItem>{COST_CENTERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </FilterField>
        <FilterField label="From Date"><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" /></FilterField>
        <FilterField label="To Date"><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" /></FilterField>
      </div>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">General Ledger</TabsTrigger>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="space-y-4 pt-4">
          <FilterField label="Account" className="max-w-sm">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </FilterField>
          <SummaryCards items={summary} />
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Journal No.</TableHead><TableHead>Reference</TableHead><TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerRows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No posted transactions for {selectedAccount?.name ?? "this account"}.</TableCell></TableRow>
                ) : ledgerRows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{formatDate(r.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.journalNumber}</TableCell>
                    <TableCell>{r.reference}</TableCell>
                    <TableCell>{r.description}</TableCell>
                    <TableCell className="text-right">{r.debit ? formatAmount(r.debit) : "—"}</TableCell>
                    <TableCell className="text-right">{r.credit ? formatAmount(r.credit) : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatAmount(r.runningBalance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="trial-balance" className="space-y-4 pt-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Account Code</TableHead><TableHead>Account Name</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {trialBalance.map((r) => (
                  <TableRow key={r.accountId}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] font-normal">{r.type}</Badge></TableCell>
                    <TableCell className="text-right">{r.debit ? formatAmount(r.debit) : "—"}</TableCell>
                    <TableCell className="text-right">{r.credit ? formatAmount(r.credit) : "—"}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">{formatAmount(totalDebit)}</TableCell>
                  <TableCell className="text-right">{formatAmount(totalCredit)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div className={`text-sm font-medium ${Math.abs(totalDebit - totalCredit) < 0.01 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {Math.abs(totalDebit - totalCredit) < 0.01 ? "Trial Balance is in balance." : `Out of balance by ${formatAmount(Math.abs(totalDebit - totalCredit))}.`}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
