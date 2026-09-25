"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { BookText, Eye, Undo2, CheckCircle2, Send, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { DataTable } from "@/components/shared/data-table/data-table";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { FilterBar, FilterField, ExportPrintBar } from "@/components/finance-erp/list-toolbar";
import { ConfirmDialog } from "@/components/finance-erp/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { BRANCHES } from "@/lib/finance-erp/mock/master-data";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import {
  getJournalEntries, journalTotals, postJournalEntry, submitJournalEntry, approveJournalEntry,
  reverseJournalEntry, cancelJournalEntry, type JournalEntry,
} from "@/lib/finance-erp/general-ledger/journal-entries";
import { FinanceValidationError } from "@/lib/finance-erp/utils/validation";

const ALL = "__all__";

export default function JournalEntriesListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(ALL);
  const [branch, setBranch] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; action: "post" | "reverse" | "cancel" } | null>(null);

  const load = async () => {
    setLoading(true);
    setRows(await getJournalEntries());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) =>
    (status === ALL || r.status === status) &&
    (branch === ALL || r.branchId === branch) &&
    (!dateFrom || r.date >= dateFrom) &&
    (!dateTo || r.date <= dateTo)
  ), [rows, status, branch, dateFrom, dateTo]);

  const openForm = (id?: string) => navigateOrOpenTab(router, id ? `/dashboard/finance-erp/general-ledger/journal-entries?id=${id}` : "/dashboard/finance-erp/general-ledger/journal-entries");

  const runAction = async () => {
    if (!confirmTarget) return;
    try {
      if (confirmTarget.action === "post") { await postJournalEntry(confirmTarget.id); toast.success("Journal entry posted"); }
      if (confirmTarget.action === "reverse") { await reverseJournalEntry(confirmTarget.id); toast.success("Reversal entry created"); }
      if (confirmTarget.action === "cancel") { await cancelJournalEntry(confirmTarget.id); toast.success("Journal entry cancelled"); }
      await load();
    } catch (e) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Action failed");
    }
  };

  const columns: ColumnDef<JournalEntry>[] = [
    { accessorKey: "journalNumber", header: "Journal No.", cell: ({ row }) => <span className="font-mono text-xs">{row.original.journalNumber}</span> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { accessorKey: "description", header: "Description", size: 260 },
    { accessorKey: "reference", header: "Reference" },
    { id: "branch", header: "Branch", cell: ({ row }) => BRANCHES.find((b) => b.id === row.original.branchId)?.code ?? "—" },
    { id: "debit", header: "Debit", cell: ({ row }) => formatAmount(journalTotals(row.original.lines).debit) },
    { id: "credit", header: "Credit", cell: ({ row }) => formatAmount(journalTotals(row.original.lines).credit) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", header: "Actions", enableHiding: false,
      cell: ({ row }) => {
        const je = row.original;
        const t = journalTotals(je.lines);
        const balanced = Math.abs(t.debit - t.credit) < 0.01;
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openForm(je.id)} title="View / Edit"><Eye className="h-3.5 w-3.5" /></Button>
            {je.status === "Draft" && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async () => { await submitJournalEntry(je.id); toast.success("Submitted for approval"); load(); }} title="Submit">
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
            {je.status === "Pending Approval" && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async () => { await approveJournalEntry(je.id); toast.success("Approved"); load(); }} title="Approve">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {je.status === "Approved" && (
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!balanced} title={balanced ? "Post" : "Debit/Credit must balance to post"} onClick={() => setConfirmTarget({ id: je.id, action: "post" })}>
                <CheckCircle2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {je.status === "Posted" && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmTarget({ id: je.id, action: "reverse" })} title="Reverse">
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {(je.status === "Draft" || je.status === "Pending Approval") && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setConfirmTarget({ id: je.id, action: "cancel" })} title="Cancel">
                <Ban className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "General Ledger" }, { label: "Journal Entries" }]} />
      <ModuleHeader icon={BookText} size="lg" title="Journal Entries" subtitle="Manual accounting entries — debit must equal credit before posting" actions={<ExportPrintBar />} />

      <FilterBar onReset={() => { setStatus(ALL); setBranch(ALL); setDateFrom(""); setDateTo(""); }}>
        <FilterField label="Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Statuses</SelectItem>
              {["Draft", "Pending Approval", "Approved", "Posted", "Cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Branch">
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Branches</SelectItem>
              {BRANCHES.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="From Date"><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" /></FilterField>
        <FilterField label="To Date"><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" /></FilterField>
      </FilterBar>

      <DataTable
        columns={columns}
        data={filtered}
        storageKey="financeJournalEntriesGrid"
        searchColumn="description"
        searchPlaceholder="Search description..."
        onAddClick={() => openForm()}
        addLabel="New Journal Entry"
      />

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
        title={confirmTarget?.action === "post" ? "Post journal entry?" : confirmTarget?.action === "reverse" ? "Reverse journal entry?" : "Cancel journal entry?"}
        description={
          confirmTarget?.action === "post" ? "Posting locks this entry into the ledger and trial balance."
          : confirmTarget?.action === "reverse" ? "This creates a new mirrored entry with debit/credit swapped and cancels this one."
          : "This journal entry will be marked as cancelled and excluded from the ledger."
        }
        confirmLabel={confirmTarget?.action === "post" ? "Post" : confirmTarget?.action === "reverse" ? "Reverse" : "Cancel Entry"}
        destructive={confirmTarget?.action !== "post"}
        onConfirm={runAction}
      />
    </div>
  );
}
