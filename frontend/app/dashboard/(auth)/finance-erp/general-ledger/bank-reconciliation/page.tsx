"use client";

import { useEffect, useMemo, useState } from "react";
import { Waves, Link2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportHeader } from "@/components/finance-erp/report-header";
import { FilterField } from "@/components/finance-erp/list-toolbar";
import { SummaryCards, type SummaryCardItem } from "@/components/finance-erp/summary-cards";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { BANK_ACCOUNTS } from "@/lib/finance-erp/mock/master-data";
import { getBankReconciliationData, type ReconTransaction } from "@/lib/finance-erp/general-ledger/bank-reconciliation";

export default function BankReconciliationPage() {
  const [bankAccountId, setBankAccountId] = useState(BANK_ACCOUNTS[0].id);
  const [statementRows, setStatementRows] = useState<ReconTransaction[]>([]);
  const [bookRows, setBookRows] = useState<ReconTransaction[]>([]);
  const [matched, setMatched] = useState<{ statement: ReconTransaction; book: ReconTransaction }[]>([]);
  const [bankBalance, setBankBalance] = useState(0);
  const [bookBalance, setBookBalance] = useState(0);
  const [selectedStatement, setSelectedStatement] = useState<string | null>(null);
  const [selectedBook, setSelectedBook] = useState<string | null>(null);

  useEffect(() => {
    const data = getBankReconciliationData(bankAccountId);
    setStatementRows(data.statementTransactions);
    setBookRows(data.bookTransactions);
    setBankBalance(data.bankBalance);
    setBookBalance(data.bookBalance);
    setMatched([]);
    setSelectedStatement(null);
    setSelectedBook(null);
  }, [bankAccountId]);

  const doMatch = () => {
    const s = statementRows.find((r) => r.id === selectedStatement);
    const b = bookRows.find((r) => r.id === selectedBook);
    if (!s || !b) return;
    if (Math.abs(s.amount - b.amount) > 0.01) {
      toast.error("Selected amounts don't match — pick a statement and book entry with the same amount.");
      return;
    }
    setMatched((m) => [...m, { statement: s, book: b }]);
    setStatementRows((rows) => rows.filter((r) => r.id !== s.id));
    setBookRows((rows) => rows.filter((r) => r.id !== b.id));
    setSelectedStatement(null); setSelectedBook(null);
    toast.success("Transactions matched");
  };

  const unmatch = (index: number) => {
    const pair = matched[index];
    setStatementRows((rows) => [...rows, pair.statement].sort((a, b) => a.date.localeCompare(b.date)));
    setBookRows((rows) => [...rows, pair.book].sort((a, b) => a.date.localeCompare(b.date)));
    setMatched((m) => m.filter((_, i) => i !== index));
  };

  const difference = bankBalance - bookBalance;

  const summary: SummaryCardItem[] = [
    { label: "Bank Balance", value: bankBalance, tone: "default" },
    { label: "Book Balance", value: bookBalance, tone: "default" },
    { label: "Difference", value: difference, tone: Math.abs(difference) < 0.01 ? "success" : "danger" },
    { label: "Matched / Unmatched", value: `${matched.length} / ${statementRows.length + bookRows.length}`, isCurrency: false, tone: "default" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "General Ledger" }, { label: "Bank Reconciliation" }]} />
      <ReportHeader title="Bank Reconciliation" branch={BANK_ACCOUNTS.find((b) => b.id === bankAccountId)?.name} period="Current Period" />

      <FilterField label="Bank / Cash Account" className="max-w-sm">
        <Select value={bankAccountId} onValueChange={setBankAccountId}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{BANK_ACCOUNTS.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
      </FilterField>

      <SummaryCards items={summary} />

      <div className="flex items-center justify-center">
        <Button size="sm" disabled={!selectedStatement || !selectedBook} onClick={doMatch}>
          <Link2 className="h-3.5 w-3.5 mr-1.5" />Match Selected
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border">
          <div className="border-b bg-muted/30 px-4 py-2 text-sm font-semibold">Statement Transactions ({statementRows.length})</div>
          <Table>
            <TableHeader><TableRow><TableHead className="w-8"></TableHead><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {statementRows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelectedStatement(r.id)}>
                  <TableCell><Checkbox checked={selectedStatement === r.id} onCheckedChange={() => setSelectedStatement(r.id)} /></TableCell>
                  <TableCell className="text-xs">{formatDate(r.date)}</TableCell>
                  <TableCell className="text-sm">{r.description}<div className="text-xs text-muted-foreground">{r.reference}</div></TableCell>
                  <TableCell className={`text-right text-sm ${r.amount < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>{formatAmount(r.amount)}</TableCell>
                </TableRow>
              ))}
              {statementRows.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">All statement transactions matched.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-lg border">
          <div className="border-b bg-muted/30 px-4 py-2 text-sm font-semibold">Book Transactions ({bookRows.length})</div>
          <Table>
            <TableHeader><TableRow><TableHead className="w-8"></TableHead><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {bookRows.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelectedBook(r.id)}>
                  <TableCell><Checkbox checked={selectedBook === r.id} onCheckedChange={() => setSelectedBook(r.id)} /></TableCell>
                  <TableCell className="text-xs">{formatDate(r.date)}</TableCell>
                  <TableCell className="text-sm">{r.description}<div className="text-xs text-muted-foreground">{r.reference}</div></TableCell>
                  <TableCell className={`text-right text-sm ${r.amount < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>{formatAmount(r.amount)}</TableCell>
                </TableRow>
              ))}
              {bookRows.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">All book transactions matched.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="border-b bg-muted/30 px-4 py-2 text-sm font-semibold">Matched Transactions ({matched.length})</div>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-10"></TableHead></TableRow></TableHeader>
          <TableBody>
            {matched.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No transactions matched yet — select one from each side and click Match Selected.</TableCell></TableRow>
            ) : matched.map((pair, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs">{formatDate(pair.statement.date)}</TableCell>
                <TableCell className="text-sm">{pair.statement.description}</TableCell>
                <TableCell className="text-right text-sm">{formatAmount(pair.statement.amount)}</TableCell>
                <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => unmatch(i)} title="Unmatch"><Undo2 className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
