"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { FieldLabel } from "@/components/forms/form-field";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { LineItemsTable, type LineColumn } from "@/components/finance-erp/line-items-table";
import { FormActionsBar } from "@/components/finance-erp/form-actions-bar";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { CUSTOMERS } from "@/lib/finance-erp/mock/master-data";
import { FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { DocLineItem, emptyLine } from "@/lib/finance-erp/receivable/shared";
import {
  getSalesInvoice, createSalesInvoice, updateSalesInvoice, newSalesInvoiceDraft, computeTotals,
  type SalesInvoice,
} from "@/lib/finance-erp/receivable/sales-invoices";

const LIST_HREF = "/dashboard/finance-erp/receivable/sales-invoices-list";

export default function SalesInvoiceFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState<Omit<SalesInvoice, "id" | "invoiceNumber"> & { id?: string; invoiceNumber?: string }>(newSalesInvoiceDraft());

  useEffect(() => {
    if (!id) return;
    getSalesInvoice(id).then((rec) => { if (rec) setDoc(rec); }).finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof typeof doc>(key: K, value: (typeof doc)[K]) => setDoc((d) => ({ ...d, [key]: value }));

  const selectCustomer = (customerId: string) => {
    const c = CUSTOMERS.find((x) => x.id === customerId);
    setDoc((d) => ({ ...d, customerId, billingAddress: c?.billingAddress ?? d.billingAddress, shippingAddress: c?.shippingAddress ?? d.shippingAddress }));
  };

  const updateLine = (idx: number, patch: Partial<DocLineItem>) => setDoc((d) => ({ ...d, items: d.items.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));
  const totals = computeTotals(doc.items);
  const customer = CUSTOMERS.find((c) => c.id === doc.customerId);

  const save = async () => {
    setSaving(true);
    try {
      if (isEdit && id) { await updateSalesInvoice(id, doc); toast.success("Sales invoice updated"); }
      else { const created = await createSalesInvoice(doc); toast.success(`${created.invoiceNumber} created`); }
      navigateOrOpenTab(router, LIST_HREF);
    } catch (e) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save invoice");
    } finally { setSaving(false); }
  };

  const columns: LineColumn<DocLineItem>[] = [
    { key: "itemCode", label: "Item Code", render: (l, i) => <EditableGridInput value={l.itemCode} onChange={(v) => updateLine(i, { itemCode: v })} className="h-8" /> },
    { key: "itemName", label: "Item Name", render: (l, i) => <EditableGridInput value={l.itemName} onChange={(v) => updateLine(i, { itemName: v })} className="h-8" /> },
    { key: "quantity", label: "Qty", align: "right", width: "90px", render: (l, i) => <EditableGridInput type="number" align="right" value={l.quantity} onChange={(v) => updateLine(i, { quantity: Number(v) || 0 })} className="h-8" /> },
    { key: "rate", label: "Rate", align: "right", width: "120px", render: (l, i) => <EditableGridInput type="number" align="right" value={l.rate} onChange={(v) => updateLine(i, { rate: Number(v) || 0 })} className="h-8" /> },
    { key: "discountPct", label: "Discount %", align: "right", width: "100px", render: (l, i) => <EditableGridInput type="number" align="right" value={l.discountPct} onChange={(v) => updateLine(i, { discountPct: Number(v) || 0 })} className="h-8" /> },
    { key: "taxPct", label: "Tax %", align: "right", width: "90px", render: (l, i) => <EditableGridInput type="number" align="right" value={l.taxPct} onChange={(v) => updateLine(i, { taxPct: Number(v) || 0 })} className="h-8" /> },
    { key: "amount", label: "Amount", align: "right", width: "130px", render: (l) => <span className="pr-2 text-sm font-medium">{formatAmount((l.quantity * l.rate) * (1 - l.discountPct / 100) * (1 + l.taxPct / 100))}</span> },
  ];

  if (loading) return <div className="mx-auto max-w-[1200px] space-y-4 p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="mx-auto max-w-[1300px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Sales Invoice", href: LIST_HREF }, { label: isEdit ? doc.invoiceNumber ?? "Edit" : "New Invoice" }]} />
      <ModuleHeader icon={FileSpreadsheet} title={isEdit ? `Sales Invoice ${doc.invoiceNumber ?? ""}` : "New Sales Invoice"} subtitle="Bill the customer for delivered goods" />

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Invoice Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="space-y-5">
          <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2"><FieldLabel>Customer *</FieldLabel>
              <Select value={doc.customerId} onValueChange={selectCustomer}>
                <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{CUSTOMERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><FieldLabel>Invoice Date *</FieldLabel><Input type="date" value={doc.date} onChange={(e) => set("date", e.target.value)} className="h-9 text-sm" /></div>
            <div className="space-y-2"><FieldLabel>Due Date</FieldLabel><Input type="date" value={doc.dueDate} onChange={(e) => set("dueDate", e.target.value)} className="h-9 text-sm" /></div>
            <div className="space-y-2"><FieldLabel>Sales Order Ref</FieldLabel><Input value={doc.salesOrderRef} onChange={(e) => set("salesOrderRef", e.target.value)} placeholder="SO-2026-0001" className="h-9 text-sm" /></div>
            <div className="space-y-2 sm:col-span-2"><FieldLabel>Billing Address</FieldLabel><Textarea value={doc.billingAddress} onChange={(e) => set("billingAddress", e.target.value)} rows={2} /></div>
            <div className="space-y-2 sm:col-span-2"><FieldLabel>Shipping Address</FieldLabel><Textarea value={doc.shippingAddress} onChange={(e) => set("shippingAddress", e.target.value)} rows={2} /></div>
          </div>

          <LineItemsTable
            columns={columns}
            rows={doc.items}
            onAddRow={() => set("items", [...doc.items, emptyLine()])}
            onRemoveRow={(idx) => set("items", doc.items.filter((_, i) => i !== idx))}
            footer={
              <div className="flex flex-col items-end gap-0.5 text-sm">
                <span>Subtotal: <span className="font-medium">{formatAmount(totals.subtotal)}</span></span>
                <span>Discount: <span className="font-medium">-{formatAmount(totals.discount)}</span></span>
                <span>Tax: <span className="font-medium">{formatAmount(totals.tax)}</span></span>
                <span className="text-base font-bold text-primary">Grand Total: {formatAmount(totals.grandTotal)}</span>
              </div>
            }
          />
        </TabsContent>

        <TabsContent value="preview">
          <div className="mx-auto max-w-3xl rounded-xl border bg-card p-8 shadow-sm print:border-0 print:shadow-none">
            <div className="flex items-start justify-between border-b pb-6">
              <div>
                <div className="text-lg font-bold tracking-tight">NexusCore Enterprises (Pvt) Ltd</div>
                <div className="text-xs text-muted-foreground">Shahrah-e-Faisal, Karachi, Pakistan</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">INVOICE</div>
                <div className="text-xs text-muted-foreground">{doc.invoiceNumber ?? "Draft"}</div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Bill To</div>
                <div className="mt-1 font-medium">{customer?.name ?? "—"}</div>
                <div className="whitespace-pre-line text-muted-foreground">{doc.billingAddress || "—"}</div>
              </div>
              <div className="text-right">
                <div><span className="text-muted-foreground">Invoice Date: </span>{formatDate(doc.date)}</div>
                <div><span className="text-muted-foreground">Due Date: </span>{formatDate(doc.dueDate)}</div>
                {doc.salesOrderRef && <div><span className="text-muted-foreground">Sales Order: </span>{doc.salesOrderRef}</div>}
              </div>
            </div>

            <Table className="mt-6">
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {doc.items.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.itemName || l.itemCode || "—"}</TableCell>
                    <TableCell className="text-right">{l.quantity}</TableCell>
                    <TableCell className="text-right">{formatAmount(l.rate)}</TableCell>
                    <TableCell className="text-right">{formatAmount((l.quantity * l.rate) * (1 - l.discountPct / 100) * (1 + l.taxPct / 100))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatAmount(totals.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{formatAmount(totals.discount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatAmount(totals.tax)}</span></div>
                <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Grand Total</span><span className="text-primary">{formatAmount(totals.grandTotal)}</span></div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <FormActionsBar
        saving={saving}
        onCancel={() => navigateOrOpenTab(router, LIST_HREF)}
        onSaveDraft={() => save()}
        onSubmit={save}
        submitLabel="Save & Send"
        submitDisabled={!doc.customerId || doc.items.length === 0}
      />
    </div>
  );
}
