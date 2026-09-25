"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpFromLine } from "lucide-react";
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
import { todayIso } from "@/lib/finance-erp/utils/format";
import { FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { WAREHOUSES, DEPARTMENTS, EMPLOYEES, INVENTORY_ITEMS } from "@/lib/finance-erp/mock/master-data";
import {
  getIssuance, createIssuance, updateIssuance, newIssuanceLine,
  type IssuanceLine, type IssuanceStatus, type IssuanceInput,
} from "@/lib/finance-erp/inventory/issuance";

const LIST_HREF = "/dashboard/finance-erp/inventory/issuance-list";

export default function IssuanceFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [issuanceNumber, setIssuanceNumber] = useState<string | null>(null);
  const [status, setStatus] = useState<IssuanceStatus>("Draft");

  const [issuanceDate, setIssuanceDate] = useState(todayIso());
  const [warehouseId, setWarehouseId] = useState(WAREHOUSES[0].id);
  const [departmentId, setDepartmentId] = useState(DEPARTMENTS[0].id);
  const [requestedBy, setRequestedBy] = useState(EMPLOYEES[0].id);
  const [items, setItems] = useState<IssuanceLine[]>([newIssuanceLine()]);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!id) return;
    getIssuance(id).then((doc) => {
      if (!doc) { toast.error("Issuance not found"); navigateOrOpenTab(router, LIST_HREF); return; }
      setIssuanceNumber(doc.issuanceNumber); setStatus(doc.status); setIssuanceDate(doc.issuanceDate);
      setWarehouseId(doc.warehouseId); setDepartmentId(doc.departmentId); setRequestedBy(doc.requestedBy);
      setItems(doc.items); setRemarks(doc.remarks);
    }).finally(() => setLoading(false));
  }, [id]);

  const setLine = (idx: number, patch: Partial<IssuanceLine>) => setItems((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const pickItem = (idx: number, code: string) => {
    const found = INVENTORY_ITEMS.find((i) => i.code === code);
    if (!found) return;
    setLine(idx, { itemCode: found.code, itemName: found.name, unit: found.unit });
  };

  const columns: LineColumn<IssuanceLine>[] = [
    {
      key: "itemCode", label: "Item", width: "220px",
      render: (row, i) => (
        <Select value={row.itemCode} onValueChange={(v) => pickItem(i, v)}>
          <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Select item..." /></SelectTrigger>
          <SelectContent>{INVENTORY_ITEMS.map((it) => <SelectItem key={it.code} value={it.code}>{it.code} — {it.name}</SelectItem>)}</SelectContent>
        </Select>
      ),
    },
    { key: "unit", label: "Unit", width: "80px", align: "center", render: (row) => <span className="text-sm text-muted-foreground">{row.unit || "—"}</span> },
    { key: "quantity", label: "Quantity", width: "110px", align: "right", render: (row, i) => <EditableGridInput type="number" align="right" value={row.quantity} onChange={(v) => setLine(i, { quantity: Number(v) || 0 })} /> },
    { key: "purpose", label: "Purpose", width: "260px", render: (row, i) => <EditableGridInput value={row.purpose} onChange={(v) => setLine(i, { purpose: v })} placeholder="e.g. Production consumption" /> },
  ];

  const buildInput = (nextStatus: IssuanceStatus): IssuanceInput => ({ issuanceDate, warehouseId, departmentId, requestedBy, items, remarks, status: nextStatus });

  const save = async (nextStatus: IssuanceStatus) => {
    setSaving(true);
    try {
      if (isEdit && id) {
        await updateIssuance(id, buildInput(nextStatus));
        toast.success(nextStatus === "Draft" ? "Issuance saved as draft" : "Issuance submitted for approval");
      } else {
        const created = await createIssuance(buildInput(nextStatus));
        toast.success(`Issuance ${created.issuanceNumber} created`);
      }
      navigateOrOpenTab(router, LIST_HREF);
    } catch (e: any) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save issuance");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-[1300px] space-y-4 p-6 lg:p-8">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <div className="mx-auto max-w-[1300px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[
        { label: "Finance", href: "/dashboard/finance-erp" }, { label: "Inventory Management" },
        { label: "Issuance", href: LIST_HREF }, { label: isEdit ? (issuanceNumber ?? "Edit") : "New Issuance" },
      ]} />

      <ModuleHeader icon={ArrowUpFromLine} size="lg" title={isEdit ? `Issuance ${issuanceNumber ?? ""}` : "New Issuance"} subtitle="Issue stock from a warehouse to a requesting department"
        badges={isEdit ? <span className="text-xs text-muted-foreground">Status: {status}</span> : undefined} />

      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormTextField label="Issuance Date" type="date" value={issuanceDate} onChange={setIssuanceDate} />
        <FormSelectField label="Warehouse" value={warehouseId} onChange={setWarehouseId} options={WAREHOUSES.map((w) => ({ value: w.id, label: w.name }))} />
        <FormSelectField label="Department" value={departmentId} onChange={setDepartmentId} options={DEPARTMENTS.map((d) => ({ value: d.id, label: d.name }))} />
        <FormSelectField label="Requested By" value={requestedBy} onChange={setRequestedBy} options={EMPLOYEES.map((e) => ({ value: e.id, label: e.name }))} />
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Items</div>
        <LineItemsTable columns={columns} rows={items} onAddRow={() => setItems((p) => [...p, newIssuanceLine()])} onRemoveRow={(i) => setItems((p) => p.filter((_, idx) => idx !== i))} />
      </div>

      <div className="space-y-2">
        <FieldLabel>Remarks</FieldLabel>
        <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder="Additional notes..." />
      </div>

      <FormActionsBar onSaveDraft={() => save("Draft")} onSubmit={() => save("Pending Approval")} onCancel={() => navigateOrOpenTab(router, LIST_HREF)} submitLabel="Submit for Approval" saving={saving} />
    </div>
  );
}
