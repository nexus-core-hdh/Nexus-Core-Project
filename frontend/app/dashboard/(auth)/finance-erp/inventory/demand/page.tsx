"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EditableGridInput } from "@/components/ui/editable-grid-input";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { FormTextField, FormSelectField, FieldLabel } from "@/components/forms/form-field";
import { LineItemsTable, type LineColumn } from "@/components/finance-erp/line-items-table";
import { AttachmentsField, type MockAttachment } from "@/components/finance-erp/attachments-field";
import { FormActionsBar } from "@/components/finance-erp/form-actions-bar";
import { formatAmount, todayIso, addDaysIso } from "@/lib/finance-erp/utils/format";
import { FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { BRANCHES, DEPARTMENTS, EMPLOYEES, INVENTORY_ITEMS } from "@/lib/finance-erp/mock/master-data";
import {
  getDemand, createDemand, updateDemand, newDemandLine,
  type DemandLine, type DemandStatus, type DemandInput,
} from "@/lib/finance-erp/inventory/demand";

const LIST_HREF = "/dashboard/finance-erp/inventory/demand-list";

export default function DemandFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [demandNumber, setDemandNumber] = useState<string | null>(null);
  const [status, setStatus] = useState<DemandStatus>("Draft");

  const [demandDate, setDemandDate] = useState(todayIso());
  const [branchId, setBranchId] = useState(BRANCHES[0].id);
  const [departmentId, setDepartmentId] = useState(DEPARTMENTS[0].id);
  const [requestedBy, setRequestedBy] = useState(EMPLOYEES[0].id);
  const [requiredDate, setRequiredDate] = useState(addDaysIso(todayIso(), 10));
  const [items, setItems] = useState<DemandLine[]>([newDemandLine()]);
  const [remarks, setRemarks] = useState("");
  const [attachments, setAttachments] = useState<MockAttachment[]>([]);

  useEffect(() => {
    if (!id) return;
    getDemand(id).then((doc) => {
      if (!doc) { toast.error("Demand not found"); navigateOrOpenTab(router, LIST_HREF); return; }
      setDemandNumber(doc.demandNumber);
      setStatus(doc.status);
      setDemandDate(doc.demandDate);
      setBranchId(doc.branchId);
      setDepartmentId(doc.departmentId);
      setRequestedBy(doc.requestedBy);
      setRequiredDate(doc.requiredDate);
      setItems(doc.items);
      setRemarks(doc.remarks);
      setAttachments(doc.attachments);
    }).finally(() => setLoading(false));
  }, [id]);

  const setLine = (idx: number, patch: Partial<DemandLine>) => {
    setItems((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, ...patch };
      next.estimatedAmount = Number(next.quantity || 0) * Number(next.estimatedRate || 0);
      return next;
    }));
  };

  const pickItem = (idx: number, code: string) => {
    const found = INVENTORY_ITEMS.find((i) => i.code === code);
    if (!found) return;
    setLine(idx, { itemCode: found.code, itemName: found.name, unit: found.unit, estimatedRate: found.standardRate });
  };

  const totalAmount = useMemo(() => items.reduce((s, i) => s + (Number(i.estimatedAmount) || 0), 0), [items]);

  const columns: LineColumn<DemandLine>[] = [
    {
      key: "itemCode", label: "Item", width: "220px",
      render: (row, i) => (
        <Select value={row.itemCode} onValueChange={(v) => pickItem(i, v)}>
          <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Select item..." /></SelectTrigger>
          <SelectContent>
            {INVENTORY_ITEMS.map((it) => <SelectItem key={it.code} value={it.code}>{it.code} — {it.name}</SelectItem>)}
          </SelectContent>
        </Select>
      ),
    },
    { key: "unit", label: "Unit", width: "80px", align: "center", render: (row) => <span className="text-sm text-muted-foreground">{row.unit || "—"}</span> },
    {
      key: "quantity", label: "Quantity", width: "110px", align: "right",
      render: (row, i) => <EditableGridInput type="number" align="right" value={row.quantity} onChange={(v) => setLine(i, { quantity: Number(v) || 0 })} />,
    },
    {
      key: "estimatedRate", label: "Estimated Rate", width: "130px", align: "right",
      render: (row, i) => <EditableGridInput type="number" align="right" value={row.estimatedRate} onChange={(v) => setLine(i, { estimatedRate: Number(v) || 0 })} />,
    },
    {
      key: "estimatedAmount", label: "Estimated Amount", width: "140px", align: "right",
      render: (row) => <span className="pr-2 font-medium">{formatAmount(row.estimatedAmount)}</span>,
    },
  ];

  const buildInput = (nextStatus: DemandStatus): DemandInput => ({
    demandDate, branchId, departmentId, requestedBy, requiredDate, items, remarks, attachments, status: nextStatus,
  });

  const save = async (nextStatus: DemandStatus) => {
    setSaving(true);
    try {
      if (isEdit && id) {
        await updateDemand(id, buildInput(nextStatus));
        toast.success(nextStatus === "Draft" ? "Demand saved as draft" : "Demand submitted for approval");
      } else {
        const created = await createDemand(buildInput(nextStatus));
        toast.success(`Demand ${created.demandNumber} created`);
      }
      navigateOrOpenTab(router, LIST_HREF);
    } catch (e: any) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save demand");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-[1300px] space-y-4 p-6 lg:p-8">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <div className="mx-auto max-w-[1300px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[
        { label: "Finance", href: "/dashboard/finance-erp" },
        { label: "Inventory Management" },
        { label: "Demand", href: LIST_HREF },
        { label: isEdit ? (demandNumber ?? "Edit") : "New Demand" },
      ]} />

      <ModuleHeader
        icon={ClipboardList}
        size="lg"
        title={isEdit ? `Demand ${demandNumber ?? ""}` : "New Demand"}
        subtitle="Raise a material/stock demand request for approval"
        badges={isEdit ? <span className="text-xs text-muted-foreground">Status: {status}</span> : undefined}
      />

      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormTextField label="Demand Date" type="date" value={demandDate} onChange={setDemandDate} />
        <FormSelectField label="Branch" value={branchId} onChange={setBranchId} options={BRANCHES.map((b) => ({ value: b.id, label: b.name }))} />
        <FormSelectField label="Department" value={departmentId} onChange={setDepartmentId} options={DEPARTMENTS.map((d) => ({ value: d.id, label: d.name }))} />
        <FormSelectField label="Requested By" value={requestedBy} onChange={setRequestedBy} options={EMPLOYEES.map((e) => ({ value: e.id, label: e.name }))} />
        <FormTextField label="Required Date" type="date" value={requiredDate} onChange={setRequiredDate} />
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Items</div>
        <LineItemsTable
          columns={columns}
          rows={items}
          onAddRow={() => setItems((p) => [...p, newDemandLine()])}
          onRemoveRow={(i) => setItems((p) => p.filter((_, idx) => idx !== i))}
          footer={<span className="text-sm font-semibold">Total Estimated: {formatAmount(totalAmount)}</span>}
        />
      </div>

      <div className="space-y-2">
        <FieldLabel>Remarks</FieldLabel>
        <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Additional notes for this demand..." rows={3} />
      </div>

      <div className="space-y-2">
        <FieldLabel>Attachments</FieldLabel>
        <AttachmentsField value={attachments} onChange={setAttachments} />
      </div>

      <FormActionsBar
        onSaveDraft={() => save("Draft")}
        onSubmit={() => save("Pending Approval")}
        onCancel={() => navigateOrOpenTab(router, LIST_HREF)}
        submitLabel="Submit for Approval"
        saving={saving}
      />
    </div>
  );
}
