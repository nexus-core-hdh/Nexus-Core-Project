"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { FieldLabel } from "@/components/forms/form-field";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { LineItemsTable, type LineColumn } from "@/components/finance-erp/line-items-table";
import { FormActionsBar } from "@/components/finance-erp/form-actions-bar";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { formatAmount } from "@/lib/finance-erp/utils/format";
import { CUSTOMERS, BRANCHES, WAREHOUSES, EMPLOYEES } from "@/lib/finance-erp/mock/master-data";
import { FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { DocLineItem, emptyLine } from "@/lib/finance-erp/receivable/shared";
import {
  getSalesOrder, createSalesOrder, updateSalesOrder, newSalesOrderDraft, computeTotals,
  type SalesOrder,
} from "@/lib/finance-erp/receivable/sales-orders";

const LIST_HREF = "/dashboard/finance-erp/receivable/sales-orders-list";

export default function SalesOrderFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [doc, setDoc] = useState<Omit<SalesOrder, "id" | "soNumber"> & { id?: string; soNumber?: string }>(newSalesOrderDraft());

  useEffect(() => {
    if (!id) return;
    getSalesOrder(id).then((rec) => { if (rec) setDoc(rec); }).finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof typeof doc>(key: K, value: (typeof doc)[K]) => setDoc((d) => ({ ...d, [key]: value }));

  const updateLine = (idx: number, patch: Partial<DocLineItem>) => {
    setDoc((d) => ({ ...d, items: d.items.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));
  };

  const totals = computeTotals(doc.items);

  const save = async (nextStatus: SalesOrder["status"]) => {
    setSaving(true);
    try {
      const payload = { ...doc, status: nextStatus };
      if (isEdit && id) {
        await updateSalesOrder(id, payload);
        toast.success(`Sales order updated`);
      } else {
        const created = await createSalesOrder(payload);
        toast.success(`${created.soNumber} created`);
      }
      navigateOrOpenTab(router, LIST_HREF);
    } catch (e) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save sales order");
    } finally {
      setSaving(false);
    }
  };

  const columns: LineColumn<DocLineItem>[] = [
    { key: "itemCode", label: "Item Code", render: (l, i) => <EditableGridInput value={l.itemCode} onChange={(v) => updateLine(i, { itemCode: v })} className="h-8" /> },
    { key: "itemName", label: "Item Name", render: (l, i) => <EditableGridInput value={l.itemName} onChange={(v) => updateLine(i, { itemName: v })} className="h-8" /> },
    { key: "quantity", label: "Qty", align: "right", width: "100px", render: (l, i) => <EditableGridInput type="number" align="right" value={l.quantity} onChange={(v) => updateLine(i, { quantity: Number(v) || 0 })} className="h-8" /> },
    { key: "rate", label: "Rate", align: "right", width: "120px", render: (l, i) => <EditableGridInput type="number" align="right" value={l.rate} onChange={(v) => updateLine(i, { rate: Number(v) || 0 })} className="h-8" /> },
    { key: "discountPct", label: "Discount %", align: "right", width: "100px", render: (l, i) => <EditableGridInput type="number" align="right" value={l.discountPct} onChange={(v) => updateLine(i, { discountPct: Number(v) || 0 })} className="h-8" /> },
    { key: "taxPct", label: "Tax %", align: "right", width: "90px", render: (l, i) => <EditableGridInput type="number" align="right" value={l.taxPct} onChange={(v) => updateLine(i, { taxPct: Number(v) || 0 })} className="h-8" /> },
    { key: "amount", label: "Amount", align: "right", width: "130px", render: (l) => <span className="pr-2 text-sm font-medium">{formatAmount((l.quantity * l.rate) * (1 - l.discountPct / 100) * (1 + l.taxPct / 100))}</span> },
  ];

  if (loading) return <div className="mx-auto max-w-[1200px] space-y-4 p-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="mx-auto max-w-[1300px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[
        { label: "Finance", href: "/dashboard/finance-erp" },
        { label: "Sales Order", href: LIST_HREF },
        { label: isEdit ? doc.soNumber ?? "Edit" : "New Sales Order" },
      ]} />
      <ModuleHeader icon={ClipboardCheck} title={isEdit ? `Sales Order ${doc.soNumber ?? ""}` : "New Sales Order"} subtitle="Capture customer demand before invoicing" />

      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2"><FieldLabel>Customer *</FieldLabel>
          <Select value={doc.customerId} onValueChange={(v) => set("customerId", v)}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>{CUSTOMERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><FieldLabel>Date *</FieldLabel><Input type="date" value={doc.date} onChange={(e) => set("date", e.target.value)} className="h-9 text-sm" /></div>
        <div className="space-y-2"><FieldLabel>Delivery Date</FieldLabel><Input type="date" value={doc.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} className="h-9 text-sm" /></div>
        <div className="space-y-2"><FieldLabel>Payment Terms</FieldLabel><Input value={doc.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} className="h-9 text-sm" /></div>
        <div className="space-y-2"><FieldLabel>Branch</FieldLabel>
          <Select value={doc.branchId} onValueChange={(v) => set("branchId", v)}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{BRANCHES.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><FieldLabel>Warehouse</FieldLabel>
          <Select value={doc.warehouseId} onValueChange={(v) => set("warehouseId", v)}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{WAREHOUSES.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><FieldLabel>Salesperson</FieldLabel>
          <Select value={doc.salespersonId} onValueChange={(v) => set("salespersonId", v)}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{EMPLOYEES.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2 lg:col-span-4"><FieldLabel>Notes</FieldLabel><Textarea value={doc.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
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

      <FormActionsBar
        saving={saving}
        onCancel={() => navigateOrOpenTab(router, LIST_HREF)}
        onSaveDraft={() => save("Draft")}
        onSubmit={() => save("Pending Approval")}
        submitLabel="Submit for Approval"
        submitDisabled={!doc.customerId || doc.items.length === 0}
      />
    </div>
  );
}
