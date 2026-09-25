"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookText, CheckCircle2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { FormActionsBar } from "@/components/finance-erp/form-actions-bar";
import { LineItemsTable, type LineColumn } from "@/components/finance-erp/line-items-table";
import { FormTextField, FormSelectField, FieldLabel } from "@/components/forms/form-field";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { formatAmount, todayIso } from "@/lib/finance-erp/utils/format";
import { BRANCHES, COST_CENTERS } from "@/lib/finance-erp/mock/master-data";
import { getAccounts, type AccountNode } from "@/lib/finance-erp/general-ledger/chart-of-accounts";
import {
  getJournalEntry, createJournalEntry, updateJournalEntry, submitJournalEntry, postJournalEntry,
  reverseJournalEntry, journalTotals, type JournalEntry, type JournalLine,
} from "@/lib/finance-erp/general-ledger/journal-entries";
import { FinanceValidationError, assertBalanced } from "@/lib/finance-erp/utils/validation";
import { makeId } from "@/lib/finance-erp/mock/create-store";

const emptyLine = (): JournalLine => ({ id: makeId("jl"), accountId: "", description: "", debit: 0, credit: 0 });

export default function JournalEntryFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isNew = !id;

  const [accounts, setAccounts] = useState<AccountNode[]>([]);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [date, setDate] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [branchId, setBranchId] = useState(BRANCHES[0].id);
  const [costCenterId, setCostCenterId] = useState(COST_CENTERS[0].id);
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getAccounts().then(setAccounts); }, []);

  useEffect(() => {
    if (!id) return;
    getJournalEntry(id).then((je) => {
      if (!je) return;
      setEntry(je);
      setDate(je.date); setReference(je.reference); setDescription(je.description);
      setBranchId(je.branchId); setCostCenterId(je.costCenterId); setLines(je.lines);
    });
  }, [id]);

  const totals = journalTotals(lines);
  const balanced = Math.abs(totals.debit - totals.credit) < 0.01 && totals.debit > 0;
  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }));
  const locked = entry?.status === "Posted" || entry?.status === "Cancelled";

  const buildInput = () => ({ date, reference, description, branchId, costCenterId, lines });

  const goToList = () => navigateOrOpenTab(router, "/dashboard/finance-erp/general-ledger/journal-entries-list");

  const saveDraft = async () => {
    setSaving(true);
    try {
      if (entry) await updateJournalEntry(entry.id, buildInput());
      else { const created = await createJournalEntry(buildInput(), "Draft"); setEntry(created); }
      toast.success("Draft saved");
    } catch (e) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (entry) { await updateJournalEntry(entry.id, buildInput()); await submitJournalEntry(entry.id); }
      else { const created = await createJournalEntry(buildInput(), "Pending Approval"); setEntry(created); }
      toast.success("Submitted for approval");
      goToList();
    } catch (e) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to submit");
    } finally { setSaving(false); }
  };

  const doPost = async () => {
    if (!entry) return;
    try {
      assertBalanced(totals.debit, totals.credit);
      // Persist whatever is currently on screen before posting — otherwise an edit made after
      // approval (lines aren't locked until Posted) would be silently discarded, and the entry
      // actually posted could differ from the one the "Balanced" indicator above was computed for.
      await updateJournalEntry(entry.id, buildInput());
      const posted = await postJournalEntry(entry.id);
      setEntry(posted);
      toast.success("Journal entry posted");
      goToList();
    } catch (e) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to post");
    }
  };

  const doReverse = async () => {
    if (!entry) return;
    await reverseJournalEntry(entry.id);
    toast.success("Reversal entry created");
    goToList();
  };

  const columns: LineColumn<JournalLine>[] = [
    {
      key: "account", label: "Account", width: "260px",
      render: (row) => (
        <Select
          value={row.accountId || undefined}
          onValueChange={(v) => setLines((ls) => ls.map((l) => l.id === row.id ? { ...l, accountId: v } : l))}
          disabled={locked}
        >
          <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Select account..." /></SelectTrigger>
          <SelectContent>
            {accountOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "description", label: "Description", width: "220px",
      render: (row) => <EditableGridInput value={row.description} onChange={(v) => setLines((ls) => ls.map((l) => l.id === row.id ? { ...l, description: v } : l))} disabled={locked} />,
    },
    {
      key: "debit", label: "Debit", align: "right", width: "140px",
      render: (row) => <EditableGridInput type="number" align="right" value={row.debit || ""} onChange={(v) => setLines((ls) => ls.map((l) => l.id === row.id ? { ...l, debit: Number(v) || 0, credit: 0 } : l))} disabled={locked} />,
    },
    {
      key: "credit", label: "Credit", align: "right", width: "140px",
      render: (row) => <EditableGridInput type="number" align="right" value={row.credit || ""} onChange={(v) => setLines((ls) => ls.map((l) => l.id === row.id ? { ...l, credit: Number(v) || 0, debit: 0 } : l))} disabled={locked} />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "General Ledger" }, { label: "Journal Entries", href: "/dashboard/finance-erp/general-ledger/journal-entries-list" }, { label: isNew ? "New Entry" : entry?.journalNumber ?? "…" }]} />
      <ModuleHeader
        icon={BookText}
        size="lg"
        title={isNew ? "New Journal Entry" : entry?.journalNumber ?? "Journal Entry"}
        subtitle="Debit and Credit totals must be equal before this entry can be posted"
        badges={entry && <StatusBadge status={entry.status} />}
        actions={
          entry?.status === "Approved" ? (
            <Button size="sm" disabled={!balanced} onClick={doPost}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Post</Button>
          ) : entry?.status === "Posted" ? (
            <Button size="sm" variant="outline" onClick={doReverse}><Undo2 className="h-3.5 w-3.5 mr-1.5" />Reverse</Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormTextField label="Date" type="date" value={date} onChange={setDate} disabled={locked} />
        <FormTextField label="Reference" value={reference} onChange={setReference} disabled={locked} />
        <FormSelectField label="Branch" value={branchId} onChange={setBranchId} options={BRANCHES.map((b) => ({ value: b.id, label: b.name }))} />
        <FormSelectField label="Cost Center" value={costCenterId} onChange={setCostCenterId} options={COST_CENTERS.map((c) => ({ value: c.id, label: c.name }))} />
      </div>
      <div>
        <FieldLabel>Description</FieldLabel>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={locked} className="mt-2 text-sm" rows={2} />
      </div>

      <LineItemsTable
        columns={columns}
        rows={lines}
        onAddRow={locked ? undefined : () => setLines((ls) => [...ls, emptyLine()])}
        onRemoveRow={locked ? undefined : (i) => setLines((ls) => ls.filter((_, idx) => idx !== i))}
        addLabel="Add Line"
        minRows={2}
        footer={
          <div className="flex items-center gap-4 text-sm">
            <span>Total Debit: <span className="font-semibold">{formatAmount(totals.debit)}</span></span>
            <span>Total Credit: <span className="font-semibold">{formatAmount(totals.credit)}</span></span>
            <span className={balanced ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-rose-600 dark:text-rose-400"}>
              {balanced ? "Balanced" : `Out of balance by ${formatAmount(Math.abs(totals.debit - totals.credit))}`}
            </span>
          </div>
        }
      />

      {!locked && (
        <FormActionsBar
          onSaveDraft={saveDraft}
          onSubmit={submit}
          onCancel={goToList}
          submitLabel="Submit for Approval"
          saving={saving}
        />
      )}
    </div>
  );
}
