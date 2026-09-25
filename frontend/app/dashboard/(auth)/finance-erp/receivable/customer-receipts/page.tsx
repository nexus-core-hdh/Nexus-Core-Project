"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { FieldLabel } from "@/components/forms/form-field";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { FormActionsBar } from "@/components/finance-erp/form-actions-bar";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { formatAmount } from "@/lib/finance-erp/utils/format";
import { CUSTOMERS, BANK_ACCOUNTS, PAYMENT_METHODS } from "@/lib/finance-erp/mock/master-data";
import { listSalesInvoicesSync, invoiceOutstanding, computeTotals } from "@/lib/finance-erp/receivable/sales-invoices";
import {
  getCustomerReceipt, createCustomerReceipt, updateCustomerReceipt, newCustomerReceiptDraft,
  receiptUnallocated, type CustomerReceipt, type ReceiptAllocation,
} from "@/lib/finance-erp/receivable/customer-receipts";

const LIST_HREF = "/dashboard/finance-erp/receivable/customer-receipts-list";

export default function CustomerReceiptFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState<Omit<CustomerReceipt, "id" | "receiptNumber"> & { id?: string; receiptNumber?: string }>(newCustomerReceiptDraft());

  useEffect(() => {
    if (!id) return;
    getCustomerReceipt(id).then((rec) => { if (rec) setDoc(rec); }).finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof typeof doc>(key: K, value: (typeof doc)[K]) => setDoc((d) => ({ ...d, [key]: value }));

  const customerInvoices = useMemo(
    () => listSalesInvoicesSync().filter((i) => i.customerId === doc.customerId && invoiceOutstanding(i) > 0),
    [doc.customerId],
  );

  const unallocated = doc.amount - doc.allocations.reduce((s, a) => s + a.amount, 0);

  const setAllocation = (invoiceId: string, amount: number) => {
    // Clamp to the invoice's own outstanding balance — the total-vs-receipt-amount check
    // below catches over-allocation across all invoices, but nothing previously stopped a
    // single row from being allocated more than that specific invoice still owes.
    const invoice = customerInvoices.find((i) => i.id === invoiceId);
    const capped = invoice ? Math.min(Math.max(0, amount), invoiceOutstanding(invoice)) : Math.max(0, amount);
    if (amount > capped + 0.01) toast.error("Allocation cannot exceed this invoice's outstanding balance.");
    setDoc((d) => {
      const existing = d.allocations.find((a) => a.invoiceId === invoiceId);
      const nextAllocations = existing
        ? d.allocations.map((a) => (a.invoiceId === invoiceId ? { ...a, amount: capped } : a))
        : [...d.allocations, { invoiceId, amount: capped }];
      return { ...d, allocations: capped > 0 ? nextAllocations : nextAllocations.filter((a) => a.invoiceId !== invoiceId) };
    });
  };

  const save = async (status: CustomerReceipt["status"]) => {
    if (unallocated < -0.01) { toast.error("Allocated amount exceeds the receipt amount."); return; }
    setSaving(true);
    try {
      const payload = { ...doc, status };
      if (isEdit && id) { await updateCustomerReceipt(id, payload); toast.success("Receipt updated"); }
      else { const created = await createCustomerReceipt(payload); toast.success(`${created.receiptNumber} created`); }
      navigateOrOpenTab(router, LIST_HREF);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save receipt");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="mx-auto max-w-[1000px] space-y-4 p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-56 w-full" /></div>;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Customer Payments / Receipts", href: LIST_HREF }, { label: isEdit ? doc.receiptNumber ?? "Edit" : "New Receipt" }]} />
      <ModuleHeader icon={Landmark} title={isEdit ? `Receipt ${doc.receiptNumber ?? ""}` : "New Customer Receipt"} subtitle="Record and allocate an incoming customer payment" />

      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2"><FieldLabel>Customer *</FieldLabel>
          <Select value={doc.customerId} onValueChange={(v) => set("customerId", v)}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>{CUSTOMERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><FieldLabel>Date *</FieldLabel><Input type="date" value={doc.date} onChange={(e) => set("date", e.target.value)} className="h-9 text-sm" /></div>
        <div className="space-y-2"><FieldLabel>Amount *</FieldLabel><Input type="number" value={doc.amount} onChange={(e) => set("amount", Number(e.target.value) || 0)} className="h-9 text-sm" /></div>
        <div className="space-y-2"><FieldLabel>Payment Method</FieldLabel>
          <Select value={doc.paymentMethod} onValueChange={(v) => set("paymentMethod", v as any)}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><FieldLabel>Bank / Cash Account</FieldLabel>
          <Select value={doc.bankAccountId} onValueChange={(v) => set("bankAccountId", v)}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>{BANK_ACCOUNTS.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><FieldLabel>Reference</FieldLabel><Input value={doc.reference} onChange={(e) => set("reference", e.target.value)} className="h-9 text-sm" /></div>
        <div className="space-y-2 sm:col-span-2 lg:col-span-4"><FieldLabel>Notes</FieldLabel><Textarea value={doc.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="border-b bg-muted/10 px-4 py-2 text-sm font-semibold">Invoice Allocation</div>
        <Table>
          <TableHeader><TableRow><TableHead>Invoice #</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right w-40">Allocate</TableHead></TableRow></TableHeader>
          <TableBody>
            {!doc.customerId ? (
              <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">Select a customer to see their outstanding invoices.</TableCell></TableRow>
            ) : customerInvoices.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">No outstanding invoices for this customer.</TableCell></TableRow>
            ) : customerInvoices.map((inv) => {
              const alloc = doc.allocations.find((a) => a.invoiceId === inv.id)?.amount ?? 0;
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.invoiceNumber}</TableCell>
                  <TableCell className="text-right">{formatAmount(invoiceOutstanding(inv))}</TableCell>
                  <TableCell className="text-right"><EditableGridInput type="number" align="right" value={alloc} onChange={(v) => setAllocation(inv.id, Number(v) || 0)} className="h-8" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className={`flex items-center justify-end gap-2 border-t px-4 py-2 text-sm font-medium ${unallocated < -0.01 ? "text-destructive" : ""}`}>
          Remaining Unallocated: {formatAmount(unallocated)}
        </div>
      </div>

      <FormActionsBar
        saving={saving}
        onCancel={() => navigateOrOpenTab(router, LIST_HREF)}
        onSaveDraft={() => save("Draft")}
        onSubmit={() => save("Posted")}
        submitLabel="Post Receipt"
        submitDisabled={!doc.customerId || doc.amount <= 0}
      />
    </div>
  );
}
