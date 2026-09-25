"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { FieldLabel, FormSelectField, FormTextField } from "@/components/forms/form-field";
import { FormActionsBar } from "@/components/finance-erp/form-actions-bar";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { todayIso, addDaysIso } from "@/lib/finance-erp/utils/format";
import { FinanceValidationError, assertRequired } from "@/lib/finance-erp/utils/validation";
import { VENDORS } from "@/lib/finance-erp/mock/master-data";
import { getVendorBill, createVendorBill, updateVendorBill, type VendorBill } from "@/lib/finance-erp/payable/vendor-bills";

const LIST_PATH = "/dashboard/finance-erp/payable/vendor-bills-list";

export default function VendorBillFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isEdit = !!id;

  const [existing, setExisting] = useState<VendorBill | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [billDate, setBillDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(addDaysIso(todayIso(), 30));
  const [referenceInvoice, setReferenceInvoice] = useState("");
  const [amount, setAmount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getVendorBill(id).then((b) => {
      if (!b) { toast.error("Vendor bill not found"); return; }
      setExisting(b); setVendorId(b.vendorId); setBillDate(b.billDate); setDueDate(b.dueDate);
      setReferenceInvoice(b.referenceInvoice); setAmount(b.amount); setPaidAmount(b.paidAmount);
    });
  }, [id]);

  const cancel = () => navigateOrOpenTab(router, LIST_PATH);

  const save = async (approvalStatus: "Draft" | "Pending Approval") => {
    try {
      assertRequired(vendorId, "Vendor");
      assertRequired(billDate, "Bill Date");
      setSaving(true);
      const payload = { vendorId, billDate, dueDate, referenceInvoice, amount, paidAmount, approvalStatus: existing?.approvalStatus && approvalStatus === "Draft" ? existing.approvalStatus : approvalStatus };
      if (isEdit && existing) {
        await updateVendorBill(existing.id, { ...payload, paymentStatus: paidAmount <= 0 ? "Pending" : paidAmount >= amount ? "Paid" : "Partially Paid" });
        toast.success(`${existing.billNumber} updated`);
      } else {
        const created = await createVendorBill(payload);
        toast.success(`${created.billNumber} created`);
      }
      navigateOrOpenTab(router, LIST_PATH);
    } catch (e) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save vendor bill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[900px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Payable" }, { label: "Vendor Bills", href: LIST_PATH }, { label: isEdit ? existing?.billNumber ?? "Edit" : "New" }]} />
      <ModuleHeader icon={Receipt} size="lg" title={isEdit ? `Vendor Bill ${existing?.billNumber ?? ""}` : "New Vendor Bill"} subtitle="Record a vendor bill and its payment status" />

      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <FormSelectField label="Vendor" value={vendorId} onChange={setVendorId} options={VENDORS.map((v) => ({ value: v.id, label: v.name }))} />
        <FormTextField label="Reference Invoice" value={referenceInvoice} onChange={setReferenceInvoice} />
        <div className="space-y-2"><FieldLabel>Bill Date</FieldLabel><input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50" /></div>
        <div className="space-y-2"><FieldLabel>Due Date</FieldLabel><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50" /></div>
        <FormTextField label="Amount" type="number" value={amount} onChange={(v) => setAmount(Number(v) || 0)} />
        <FormTextField label="Paid Amount" type="number" value={paidAmount} onChange={(v) => setPaidAmount(Number(v) || 0)} />
      </div>

      <FormActionsBar saving={saving} onCancel={cancel} onSaveDraft={() => save("Draft")} submitLabel="Submit for Approval" onSubmit={() => save("Pending Approval")} />
    </div>
  );
}
