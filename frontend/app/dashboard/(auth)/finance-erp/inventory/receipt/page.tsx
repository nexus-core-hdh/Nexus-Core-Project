"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EditableGridInput } from "@/components/ui/editable-grid-input";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { FormTextField, FormSelectField, FieldLabel } from "@/components/forms/form-field";
import { LineItemsTable, type LineColumn } from "@/components/finance-erp/line-items-table";
import { FormActionsBar } from "@/components/finance-erp/form-actions-bar";
import { formatAmount, todayIso } from "@/lib/finance-erp/utils/format";
import { FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { VENDORS, WAREHOUSES, INVENTORY_ITEMS } from "@/lib/finance-erp/mock/master-data";
import {
  getReceipt, createReceipt, updateReceipt, newReceiptLine,
  type ReceiptLine, type ReceiptStatus, type ReceiptInput,
} from "@/lib/finance-erp/inventory/receipt";

const LIST_HREF = "/dashboard/finance-erp/inventory/receipt-list";

export default function ReceiptFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
  const [status, setStatus] = useState<ReceiptStatus>("Draft");

  const [receiptDate, setReceiptDate] = useState(todayIso());
  const [vendorId, setVendorId] = useState(VENDORS[0].id);
  const [purchaseOrderRef, setPurchaseOrderRef] = useState("");
  const [grnNumber, setGrnNumber] = useState("");
  const [warehouseId, setWarehouseId] = useState(WAREHOUSES[0].id);
  const [items, setItems] = useState<ReceiptLine[]>([newReceiptLine()]);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!id) return;
    getReceipt(id).then((doc) => {
      if (!doc) { toast.error("Receipt not found"); navigateOrOpenTab(router, LIST_HREF); return; }
      setReceiptNumber(doc.receiptNumber); setStatus(doc.status); setReceiptDate(doc.receiptDate);
      setVendorId(doc.vendorId); setPurchaseOrderRef(doc.purchaseOrderRef); setGrnNumber(doc.grnNumber);
      setWarehouseId(doc.warehouseId); setItems(doc.items); setRemarks(doc.remarks);
    }).finally(() => setLoading(false));
  }, [id]);

  const setLine = (idx: number, patch: Partial<ReceiptLine>) => {
    setItems((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      // Rejected quantity can never exceed the received quantity — clamp rather than let
      // acceptedQuantity silently floor at 0 while rejectedQuantity displays an impossible value.
      const quantity = Math.max(0, Number(next.quantity || 0));
      const rejectedQuantity = Math.min(Math.max(0, Number(next.rejectedQuantity || 0)), quantity);
      next.quantity = quantity;
      next.rejectedQuantity = rejectedQuantity;
      next.acceptedQuantity = quantity - rejectedQuantity;
      next.amount = next.acceptedQuantity * Number(next.rate || 0);
      return next;
    }));
  };

  const pickItem = (idx: number, code: string) => {
    const found = INVENTORY_ITEMS.find((i) => i.code === code);
    if (!found) return;
    setLine(idx, { itemCode: found.code, itemName: found.name, rate: found.standardRate });
  };

  const totalAmount = useMemo(() => items.reduce((s, i) => s + (Number(i.amount) || 0), 0), [items]);

  const columns: LineColumn<ReceiptLine>[] = [
    {
      key: "itemCode", label: "Item", width: "200px",
      render: (row, i) => (
        <Select value={row.itemCode} onValueChange={(v) => pickItem(i, v)}>
          <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Select item..." /></SelectTrigger>
          <SelectContent>{INVENTORY_ITEMS.map((it) => <SelectItem key={it.code} value={it.code}>{it.code} — {it.name}</SelectItem>)}</SelectContent>
        </Select>
      ),
    },
    { key: "quantity", label: "Quantity", width: "100px", align: "right", render: (row, i) => <EditableGridInput type="number" align="right" value={row.quantity} onChange={(v) => setLine(i, { quantity: Number(v) || 0 })} /> },
    { key: "rejectedQuantity", label: "Rejected Qty", width: "110px", align: "right", render: (row, i) => <EditableGridInput type="number" align="right" value={row.rejectedQuantity} onChange={(v) => setLine(i, { rejectedQuantity: Number(v) || 0 })} /> },
    { key: "acceptedQuantity", label: "Accepted Qty", width: "110px", align: "right", render: (row) => <span className="pr-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">{row.acceptedQuantity}</span> },
    { key: "rate", label: "Rate", width: "110px", align: "right", render: (row, i) => <EditableGridInput type="number" align="right" value={row.rate} onChange={(v) => setLine(i, { rate: Number(v) || 0 })} /> },
    { key: "amount", label: "Amount", width: "130px", align: "right", render: (row) => <span className="pr-2 font-medium">{formatAmount(row.amount)}</span> },
    { key: "batch", label: "Batch", width: "110px", render: (row, i) => <EditableGridInput value={row.batch} onChange={(v) => setLine(i, { batch: v })} /> },
    { key: "expiry", label: "Expiry", width: "140px", render: (row, i) => <EditableGridInput type="date" value={row.expiry} onChange={(v) => setLine(i, { expiry: v })} /> },
  ];

  const buildInput = (nextStatus: ReceiptStatus): ReceiptInput => ({ receiptDate, vendorId, purchaseOrderRef, grnNumber, warehouseId, items, remarks, status: nextStatus });

  const save = async (nextStatus: ReceiptStatus) => {
    setSaving(true);
    try {
      if (isEdit && id) {
        await updateReceipt(id, buildInput(nextStatus));
        toast.success(nextStatus === "Draft" ? "Receipt saved as draft" : "Receipt submitted for approval");
      } else {
        const created = await createReceipt(buildInput(nextStatus));
        toast.success(`Receipt ${created.receiptNumber} created`);
      }
      navigateOrOpenTab(router, LIST_HREF);
    } catch (e: any) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save receipt");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-[1400px] space-y-4 p-6 lg:p-8">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[
        { label: "Finance", href: "/dashboard/finance-erp" }, { label: "Inventory Management" },
        { label: "Receipt", href: LIST_HREF }, { label: isEdit ? (receiptNumber ?? "Edit") : "New Receipt" },
      ]} />

      <ModuleHeader icon={ArrowDownToLine} size="lg" title={isEdit ? `Receipt ${receiptNumber ?? ""}` : "New Receipt"} subtitle="Record goods received against a purchase order (GRN)"
        badges={isEdit ? <span className="text-xs text-muted-foreground">Status: {status}</span> : undefined} />

      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormTextField label="Receipt Date" type="date" value={receiptDate} onChange={setReceiptDate} />
        <FormSelectField label="Supplier" value={vendorId} onChange={setVendorId} options={VENDORS.map((v) => ({ value: v.id, label: v.name }))} />
        <FormTextField label="Purchase Order Ref" value={purchaseOrderRef} onChange={setPurchaseOrderRef} />
        <FormTextField label="GRN Number" value={grnNumber} onChange={setGrnNumber} />
        <FormSelectField label="Warehouse" value={warehouseId} onChange={setWarehouseId} options={WAREHOUSES.map((w) => ({ value: w.id, label: w.name }))} />
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Items</div>
        <LineItemsTable columns={columns} rows={items} onAddRow={() => setItems((p) => [...p, newReceiptLine()])} onRemoveRow={(i) => setItems((p) => p.filter((_, idx) => idx !== i))}
          footer={<span className="text-sm font-semibold">Total: {formatAmount(totalAmount)}</span>} />
      </div>

      <div className="space-y-2">
        <FieldLabel>Remarks</FieldLabel>
        <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Additional notes..." />
      </div>

      <FormActionsBar onSaveDraft={() => save("Draft")} onSubmit={() => save("Pending Approval")} onCancel={() => navigateOrOpenTab(router, LIST_HREF)} submitLabel="Submit for Approval" saving={saving} />
    </div>
  );
}
