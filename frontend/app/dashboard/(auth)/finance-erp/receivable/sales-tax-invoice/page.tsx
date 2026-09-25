"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ReceiptText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { CUSTOMERS, TAX_RATES } from "@/lib/finance-erp/mock/master-data";
import { makeId } from "@/lib/finance-erp/mock/create-store";
import {
  getSalesTaxInvoice, createSalesTaxInvoice, updateSalesTaxInvoice, newSalesTaxInvoiceDraft,
  taxableTotal, taxAmount, invoiceTotal, type SalesTaxInvoice,
} from "@/lib/finance-erp/receivable/sales-tax-invoice";

const LIST_HREF = "/dashboard/finance-erp/receivable/sales-tax-invoice-list";

export default function SalesTaxInvoiceFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState<Omit<SalesTaxInvoice, "id" | "invoiceNumber"> & { id?: string; invoiceNumber?: string }>(newSalesTaxInvoiceDraft());

  useEffect(() => {
    if (!id) return;
    getSalesTaxInvoice(id).then((rec) => { if (rec) setDoc(rec); }).finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof typeof doc>(key: K, value: (typeof doc)[K]) => setDoc((d) => ({ ...d, [key]: value }));

  const selectCustomer = (customerId: string) => {
    const c = CUSTOMERS.find((x) => x.id === customerId);
    setDoc((d) => ({ ...d, customerId, taxRegistrationNo: c?.taxRegNo ?? d.taxRegistrationNo }));
  };

  const taxable = taxableTotal(doc as SalesTaxInvoice);
  const tax = taxAmount(doc as SalesTaxInvoice);
  const total = invoiceTotal(doc as SalesTaxInvoice);

  const save = async (status: SalesTaxInvoice["status"]) => {
    setSaving(true);
    try {
      const payload = { ...doc, status };
      if (isEdit && id) { await updateSalesTaxInvoice(id, payload); toast.success("Tax invoice updated"); }
      else { const created = await createSalesTaxInvoice(payload); toast.success(`${created.invoiceNumber} created`); }
      navigateOrOpenTab(router, LIST_HREF);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save tax invoice");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="mx-auto max-w-[1000px] space-y-4 p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-56 w-full" /></div>;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Sales Tax Invoice", href: LIST_HREF }, { label: isEdit ? doc.invoiceNumber ?? "Edit" : "New Tax Invoice" }]} />
      <ModuleHeader icon={ReceiptText} title={isEdit ? `Sales Tax Invoice ${doc.invoiceNumber ?? ""}` : "New Sales Tax Invoice"} subtitle="Statutory tax invoice for a registered customer" />

      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2"><FieldLabel>Customer *</FieldLabel>
          <Select value={doc.customerId} onValueChange={selectCustomer}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>{CUSTOMERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><FieldLabel>Tax Registration No.</FieldLabel><Input value={doc.taxRegistrationNo} onChange={(e) => set("taxRegistrationNo", e.target.value)} className="h-9 text-sm" /></div>
        <div className="space-y-2"><FieldLabel>Invoice Date *</FieldLabel><Input type="date" value={doc.date} onChange={(e) => set("date", e.target.value)} className="h-9 text-sm" /></div>
        <div className="space-y-2"><FieldLabel>Tax Rate</FieldLabel>
          <Select value={doc.taxRateId} onValueChange={(v) => set("taxRateId", v)}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{TAX_RATES.filter((t) => t.type === "Sales Tax").map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.rate}%)</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead>Item Code</TableHead><TableHead>Item Name</TableHead><TableHead className="text-right">Taxable Amount</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
          <TableBody>
            {doc.items.map((it, i) => (
              <TableRow key={it.id}>
                <TableCell className="p-1.5"><EditableGridInput value={it.itemCode} onChange={(v) => set("items", doc.items.map((x, xi) => xi === i ? { ...x, itemCode: v } : x))} className="h-8" /></TableCell>
                <TableCell className="p-1.5"><EditableGridInput value={it.itemName} onChange={(v) => set("items", doc.items.map((x, xi) => xi === i ? { ...x, itemName: v } : x))} className="h-8" /></TableCell>
                <TableCell className="p-1.5 text-right"><EditableGridInput type="number" align="right" value={it.taxableAmount} onChange={(v) => set("items", doc.items.map((x, xi) => xi === i ? { ...x, taxableAmount: Number(v) || 0 } : x))} className="h-8" /></TableCell>
                <TableCell className="text-center">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Remove line" disabled={doc.items.length <= 1} onClick={() => set("items", doc.items.filter((_, xi) => xi !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t bg-muted/10 px-3 py-2">
          <Button type="button" variant="outline" size="sm" onClick={() => set("items", [...doc.items, { id: makeId("sti-ln"), itemCode: "", itemName: "", taxableAmount: 0 }])}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Line
          </Button>
          <div className="space-y-0.5 text-right text-sm">
            <div>Taxable Amount: <span className="font-medium">{formatAmount(taxable)}</span></div>
            <div>Tax Amount: <span className="font-medium">{formatAmount(tax)}</span></div>
            <div className="text-base font-bold text-primary">Total: {formatAmount(total)}</div>
          </div>
        </div>
      </div>

      <FormActionsBar
        saving={saving}
        onCancel={() => navigateOrOpenTab(router, LIST_HREF)}
        onSaveDraft={() => save("Draft")}
        onSubmit={() => save("Posted")}
        submitLabel="Post Invoice"
        submitDisabled={!doc.customerId}
      />
    </div>
  );
}
