"use client";

import { useEffect, useState } from "react";
import { PiggyBank, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { FieldLabel } from "@/components/forms/form-field";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { ExportPrintBar } from "@/components/finance-erp/list-toolbar";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { CUSTOMERS, PAYMENT_METHODS, customerName } from "@/lib/finance-erp/mock/master-data";
import {
  getAdvances, createAdvance, updateAdvance, newAdvanceDraft, advanceRemaining, type CustomerAdvance,
} from "@/lib/finance-erp/receivable/advances";

export default function AdvancesFromCustomersPage() {
  const [rows, setRows] = useState<CustomerAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerAdvance | null>(null);
  const [draft, setDraft] = useState(newAdvanceDraft());

  const load = () => { setLoading(true); getAdvances().then(setRows).finally(() => setLoading(false)); };
  useEffect(load, []);

  const openNew = () => { setEditing(null); setDraft(newAdvanceDraft()); setModalOpen(true); };
  const openEdit = (a: CustomerAdvance) => { setEditing(a); setDraft(a); setModalOpen(true); };

  const save = async () => {
    try {
      if (editing) { await updateAdvance(editing.id, draft); toast.success("Advance updated"); }
      else { const created = await createAdvance(draft); toast.success(`${created.advanceNumber} recorded`); }
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save advance");
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Receivable" }, { label: "Advance from Customers" }]} />
      <ModuleHeader icon={PiggyBank} size="lg" title="Advance from Customers" subtitle="Track customer advances and their adjustment against future invoices"
        actions={<><ExportPrintBar /><Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1.5" />New Advance</Button></>} />

      {loading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        : rows.length === 0 ? <Empty><EmptyHeader><EmptyMedia variant="icon"><PiggyBank /></EmptyMedia><EmptyTitle>No advances recorded</EmptyTitle><EmptyDescription>Record an advance received from a customer.</EmptyDescription></EmptyHeader></Empty>
        : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>Advance #</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Adjusted</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead>Status</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.advanceNumber}</TableCell>
                  <TableCell>{formatDate(a.date)}</TableCell>
                  <TableCell>{customerName(a.customerId)}</TableCell>
                  <TableCell className="text-right">{formatAmount(a.amount)}</TableCell>
                  <TableCell className="text-right">{formatAmount(a.adjustedAmount)}</TableCell>
                  <TableCell className="text-right font-medium">{formatAmount(advanceRemaining(a))}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Advance" : "New Advance"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2"><FieldLabel>Customer *</FieldLabel>
              <Select value={draft.customerId} onValueChange={(v) => setDraft((d) => ({ ...d, customerId: v }))}>
                <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{CUSTOMERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><FieldLabel>Date *</FieldLabel><Input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} className="h-9 text-sm" /></div>
            <div className="space-y-2"><FieldLabel>Amount *</FieldLabel><Input type="number" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: Number(e.target.value) || 0 }))} className="h-9 text-sm" /></div>
            <div className="space-y-2"><FieldLabel>Payment Method</FieldLabel>
              <Select value={draft.paymentMethod} onValueChange={(v) => setDraft((d) => ({ ...d, paymentMethod: v as any }))}>
                <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><FieldLabel>Reference</FieldLabel><Input value={draft.reference} onChange={(e) => setDraft((d) => ({ ...d, reference: e.target.value }))} className="h-9 text-sm" /></div>
            {editing && <div className="space-y-2 col-span-2"><FieldLabel>Adjusted Amount</FieldLabel><Input type="number" value={draft.adjustedAmount} onChange={(e) => setDraft((d) => ({ ...d, adjustedAmount: Number(e.target.value) || 0 }))} className="h-9 text-sm" /></div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!draft.customerId || draft.amount <= 0 || draft.adjustedAmount > draft.amount}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
