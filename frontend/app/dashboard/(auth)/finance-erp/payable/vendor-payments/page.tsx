"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { FieldLabel, FormSelectField, FormTextField } from "@/components/forms/form-field";
import { LineItemsTable, type LineColumn } from "@/components/finance-erp/line-items-table";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { FormActionsBar } from "@/components/finance-erp/form-actions-bar";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { formatAmount, todayIso } from "@/lib/finance-erp/utils/format";
import { FinanceValidationError, assertRequired } from "@/lib/finance-erp/utils/validation";
import { VENDORS, BANK_ACCOUNTS, PAYMENT_METHODS } from "@/lib/finance-erp/mock/master-data";
import { getVendorBills, updateVendorBill, type VendorBill } from "@/lib/finance-erp/payable/vendor-bills";
import { getVendorPayment, createVendorPayment, updateVendorPayment, type PaymentAllocation, type VendorPayment } from "@/lib/finance-erp/payable/vendor-payments";
import type { FinanceStatus } from "@/lib/finance-erp/utils/status";

const LIST_PATH = "/dashboard/finance-erp/payable/vendor-payments-list";

export default function VendorPaymentFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isEdit = !!id;

  const [existing, setExisting] = useState<VendorPayment | null>(null);
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [accountId, setAccountId] = useState(BANK_ACCOUNTS[0]?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getVendorBills().then(setBills); }, []);

  useEffect(() => {
    if (!id) return;
    getVendorPayment(id).then((p) => {
      if (!p) { toast.error("Vendor payment not found"); return; }
      setExisting(p); setVendorId(p.vendorId); setDate(p.date); setAccountId(p.accountId);
      setAmount(p.amount); setPaymentMethod(p.paymentMethod); setReference(p.reference); setNotes(p.notes); setAllocations(p.allocations);
    });
  }, [id]);

  const vendorBills = useMemo(() => bills.filter((b) => b.vendorId === vendorId && b.paymentStatus !== "Paid"), [bills, vendorId]);

  useEffect(() => {
    setAllocations(vendorBills.map((b) => ({ billId: b.id, billNumber: b.billNumber, outstanding: b.amount - b.paidAmount, allocated: 0 })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const totalAllocated = allocations.reduce((s, a) => s + a.allocated, 0);
  const remainingToAllocate = amount - totalAllocated;

  const updateAllocation = (idx: number, allocated: number) => {
    setAllocations((prev) => prev.map((a, i) => (i === idx ? { ...a, allocated } : a)));
  };

  const columns: LineColumn<PaymentAllocation>[] = [
    { key: "billNumber", label: "Vendor Bill", render: (row) => <span className="font-mono text-xs">{row.billNumber}</span> },
    { key: "outstanding", label: "Outstanding", align: "right", render: (row) => formatAmount(row.outstanding) },
    { key: "allocated", label: "Allocate Amount", align: "right", width: "160px", render: (row, i) => (
      <EditableGridInput type="number" align="right" value={row.allocated} onChange={(v) => updateAllocation(i, Math.min(Number(v) || 0, row.outstanding))} className="h-8" />
    ) },
  ];

  const cancel = () => navigateOrOpenTab(router, LIST_PATH);

  const save = async () => {
    try {
      assertRequired(vendorId, "Vendor");
      assertRequired(accountId, "Account");
      if (amount <= 0) throw new FinanceValidationError("Amount must be greater than zero.");
      if (totalAllocated > amount) throw new FinanceValidationError("Allocated amount cannot exceed the payment amount.");
      setSaving(true);
      const finalAllocations = allocations.filter((a) => a.allocated > 0);
      const payload = { date, vendorId, accountId, amount, paymentMethod, reference, notes, allocations: finalAllocations };

      // Applying a payment must actually reduce the outstanding balance on the bills it's
      // allocated against — otherwise the same "outstanding" amount could be paid again on a
      // later payment (the allocation cap above only guards against over-allocating within THIS
      // form, not across separate payments). Net each bill's delta first (old allocation
      // reversed, new one applied) so editing a payment doesn't double-count.
      const deltaByBill = new Map<string, number>();
      if (isEdit && existing) {
        for (const a of existing.allocations) deltaByBill.set(a.billId, (deltaByBill.get(a.billId) ?? 0) - a.allocated);
      }
      for (const a of finalAllocations) deltaByBill.set(a.billId, (deltaByBill.get(a.billId) ?? 0) + a.allocated);

      if (isEdit && existing) {
        await updateVendorPayment(existing.id, payload);
        toast.success(`${existing.paymentNumber} updated`);
      } else {
        const created = await createVendorPayment(payload);
        toast.success(`${created.paymentNumber} created`);
      }

      for (const [billId, delta] of deltaByBill) {
        if (delta === 0) continue;
        const b = bills.find((x) => x.id === billId);
        if (!b) continue;
        const paidAmount = Math.min(b.amount, Math.max(0, b.paidAmount + delta));
        const paymentStatus: FinanceStatus = paidAmount <= 0 ? "Pending" : paidAmount >= b.amount ? "Paid" : "Partially Paid";
        await updateVendorBill(billId, { paidAmount, paymentStatus });
      }

      navigateOrOpenTab(router, LIST_PATH);
    } catch (e) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Payable" }, { label: "Vendor Payments", href: LIST_PATH }, { label: isEdit ? existing?.paymentNumber ?? "Edit" : "New" }]} />
      <ModuleHeader icon={Wallet} size="lg" title={isEdit ? `Vendor Payment ${existing?.paymentNumber ?? ""}` : "New Vendor Payment"} subtitle="Record a payment and allocate it against outstanding bills" />

      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormSelectField label="Vendor" value={vendorId} onChange={setVendorId} options={VENDORS.map((v) => ({ value: v.id, label: v.name }))} />
        <div className="space-y-2"><FieldLabel>Date</FieldLabel><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50" /></div>
        <FormSelectField label="Account" value={accountId} onChange={setAccountId} options={BANK_ACCOUNTS.map((a) => ({ value: a.id, label: a.name }))} />
        <FormTextField label="Amount" type="number" value={amount} onChange={(v) => setAmount(Number(v) || 0)} />
        <FormSelectField label="Payment Method" value={paymentMethod} onChange={setPaymentMethod} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />
        <FormTextField label="Reference" value={reference} onChange={setReference} />
        <div className="space-y-2 md:col-span-3"><FieldLabel>Notes</FieldLabel><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
      </div>

      <div>
        <div className="mb-2 text-sm font-semibold">Invoice Allocation</div>
        {vendorId ? (
          <LineItemsTable
            columns={columns}
            rows={allocations}
            footer={
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Allocated: <span className="font-medium text-foreground">{formatAmount(totalAllocated)}</span></span>
                <span className={remainingToAllocate < 0 ? "text-rose-600 font-medium" : "text-muted-foreground"}>Remaining to Allocate: <span className="font-medium">{formatAmount(remainingToAllocate)}</span></span>
              </div>
            }
          />
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Select a vendor to see outstanding bills for allocation.</p>
        )}
      </div>

      <FormActionsBar saving={saving} onCancel={cancel} submitLabel={isEdit ? "Save Changes" : "Record Payment"} onSubmit={save} />
    </div>
  );
}
