"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { FieldLabel, FormTextField, FormSelectField } from "@/components/forms/form-field";
import { LineItemsTable, type LineColumn } from "@/components/finance-erp/line-items-table";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { AttachmentsField, type MockAttachment } from "@/components/finance-erp/attachments-field";
import { FormActionsBar } from "@/components/finance-erp/form-actions-bar";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { formatAmount, todayIso } from "@/lib/finance-erp/utils/format";
import { FinanceValidationError, assertRequired } from "@/lib/finance-erp/utils/validation";
import { INVENTORY_ITEMS } from "@/lib/finance-erp/mock/master-data";
import { makeId } from "@/lib/finance-erp/mock/create-store";
import {
  getPurchaseOrder, createPurchaseOrder, updatePurchaseOrder, computeTotals,
  VENDORS, BRANCHES, WAREHOUSES, CURRENCIES, type POLineItem, type PurchaseOrder,
} from "@/lib/finance-erp/payable/purchase-orders";

const LIST_PATH = "/dashboard/finance-erp/payable/purchase-orders-list";

function emptyLine(): POLineItem {
  return { id: makeId("pol"), itemCode: "", itemName: "", quantity: 1, rate: 0, discountPct: 0, taxPct: 18 };
}

export default function PurchaseOrderFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isEdit = !!id;

  const [existing, setExisting] = useState<PurchaseOrder | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [branchId, setBranchId] = useState(BRANCHES[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(WAREHOUSES[0]?.id ?? "");
  const [currency, setCurrency] = useState("PKR");
  const [date, setDate] = useState(todayIso());
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [deliveryDate, setDeliveryDate] = useState(todayIso());
  const [items, setItems] = useState<POLineItem[]>([emptyLine()]);
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<MockAttachment[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getPurchaseOrder(id).then((po) => {
      if (!po) { toast.error("Purchase order not found"); return; }
      setExisting(po);
      setVendorId(po.vendorId); setBranchId(po.branchId); setWarehouseId(po.warehouseId);
      setCurrency(po.currency); setDate(po.date); setPaymentTerms(po.paymentTerms);
      setDeliveryDate(po.deliveryDate); setItems(po.items); setNotes(po.notes); setAttachments(po.attachments);
    });
  }, [id]);

  const totals = useMemo(() => computeTotals(items), [items]);

  const updateLine = (idx: number, patch: Partial<POLineItem>) => {
    setItems((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const columns: LineColumn<POLineItem>[] = [
    { key: "itemCode", label: "Item Code", width: "140px", render: (row, i) => <EditableGridInput value={row.itemCode} onChange={(v) => updateLine(i, { itemCode: v })} className="h-8" /> },
    { key: "itemName", label: "Item Name", render: (row, i) => <EditableGridInput value={row.itemName} onChange={(v) => updateLine(i, { itemName: v })} className="h-8" /> },
    { key: "quantity", label: "Qty", align: "right", width: "100px", render: (row, i) => <EditableGridInput type="number" align="right" value={row.quantity} onChange={(v) => updateLine(i, { quantity: Number(v) || 0 })} className="h-8" /> },
    { key: "rate", label: "Rate", align: "right", width: "110px", render: (row, i) => <EditableGridInput type="number" align="right" value={row.rate} onChange={(v) => updateLine(i, { rate: Number(v) || 0 })} className="h-8" /> },
    { key: "discountPct", label: "Discount %", align: "right", width: "100px", render: (row, i) => <EditableGridInput type="number" align="right" value={row.discountPct} onChange={(v) => updateLine(i, { discountPct: Number(v) || 0 })} className="h-8" /> },
    { key: "taxPct", label: "Tax %", align: "right", width: "90px", render: (row, i) => <EditableGridInput type="number" align="right" value={row.taxPct} onChange={(v) => updateLine(i, { taxPct: Number(v) || 0 })} className="h-8" /> },
    { key: "amount", label: "Line Total", align: "right", width: "120px", render: (row) => <span className="font-medium">{formatAmount((row.quantity * row.rate * (1 - row.discountPct / 100)) * (1 + row.taxPct / 100))}</span> },
  ];

  const cancel = () => navigateOrOpenTab(router, LIST_PATH);

  const save = async (status: "Draft" | "Pending Approval") => {
    try {
      assertRequired(vendorId, "Vendor");
      assertRequired(date, "Date");
      if (items.length === 0 || items.every((l) => !l.itemName.trim())) throw new FinanceValidationError("Add at least one line item.");
      setSaving(true);
      const payload = { date, vendorId, branchId, warehouseId, currency, paymentTerms, deliveryDate, items, notes, attachments, status: existing?.status && status === "Draft" ? existing.status : status };
      if (isEdit && existing) {
        await updatePurchaseOrder(existing.id, payload);
        toast.success(`${existing.poNumber} updated`);
      } else {
        const created = await createPurchaseOrder(payload);
        toast.success(`${created.poNumber} created`);
      }
      navigateOrOpenTab(router, LIST_PATH);
    } catch (e) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save purchase order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Payable" }, { label: "Purchase Order", href: LIST_PATH }, { label: isEdit ? existing?.poNumber ?? "Edit" : "New" }]} />
      <ModuleHeader icon={ShoppingCart} size="lg" title={isEdit ? `Purchase Order ${existing?.poNumber ?? ""}` : "New Purchase Order"} subtitle="Vendor, delivery terms and line items" />

      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormSelectField label="Vendor" value={vendorId} onChange={setVendorId} options={VENDORS.map((v) => ({ value: v.id, label: v.name }))} />
        <div className="space-y-2"><FieldLabel>Date</FieldLabel><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50" /></div>
        <FormSelectField label="Branch" value={branchId} onChange={setBranchId} options={BRANCHES.map((b) => ({ value: b.id, label: b.name }))} />
        <FormSelectField label="Warehouse" value={warehouseId} onChange={setWarehouseId} options={WAREHOUSES.map((w) => ({ value: w.id, label: w.name }))} />
        <FormSelectField label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))} />
        <FormTextField label="Payment Terms" value={paymentTerms} onChange={setPaymentTerms} />
        <div className="space-y-2"><FieldLabel>Delivery Date</FieldLabel><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50" /></div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Line Items</div>
        <LineItemsTable
          columns={columns}
          rows={items}
          onAddRow={() => setItems((prev) => [...prev, emptyLine()])}
          onRemoveRow={(i) => setItems((prev) => prev.filter((_, idx) => idx !== i))}
          footer={
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Subtotal: <span className="font-medium text-foreground">{formatAmount(totals.subtotal)}</span></span>
              <span className="text-muted-foreground">Discount: <span className="font-medium text-foreground">{formatAmount(totals.discount)}</span></span>
              <span className="text-muted-foreground">Tax: <span className="font-medium text-foreground">{formatAmount(totals.tax)}</span></span>
              <span className="font-semibold">Grand Total: <span className="text-primary">{formatAmount(totals.grandTotal)}</span></span>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2"><FieldLabel>Notes</FieldLabel><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any special instructions for the vendor..." /></div>
        <div className="space-y-2"><FieldLabel>Attachments</FieldLabel><AttachmentsField value={attachments} onChange={setAttachments} /></div>
      </div>

      <FormActionsBar
        saving={saving}
        onCancel={cancel}
        onSaveDraft={() => save("Draft")}
        submitLabel="Submit for Approval"
        onSubmit={() => save("Pending Approval")}
      />
    </div>
  );
}
