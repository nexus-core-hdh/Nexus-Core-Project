"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileMinus } from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { FieldLabel, FormSelectField, FormTextField } from "@/components/forms/form-field";
import { FormActionsBar } from "@/components/finance-erp/form-actions-bar";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { todayIso } from "@/lib/finance-erp/utils/format";
import { FinanceValidationError, assertRequired } from "@/lib/finance-erp/utils/validation";
import { VENDORS } from "@/lib/finance-erp/mock/master-data";
import { getDebitNote, createDebitNote, updateDebitNote, type DebitNote } from "@/lib/finance-erp/payable/debit-notes";

const LIST_PATH = "/dashboard/finance-erp/payable/debit-notes-list";

export default function DebitNoteFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isEdit = !!id;

  const [existing, setExisting] = useState<DebitNote | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [referenceInvoice, setReferenceInvoice] = useState("");
  const [reason, setReason] = useState("");
  const [taxAmount, setTaxAmount] = useState(0);
  const [amount, setAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDebitNote(id).then((d) => {
      if (!d) { toast.error("Debit note not found"); return; }
      setExisting(d); setVendorId(d.vendorId); setDate(d.date); setReferenceInvoice(d.referenceInvoice);
      setReason(d.reason); setTaxAmount(d.taxAmount); setAmount(d.amount);
    });
  }, [id]);

  const cancel = () => navigateOrOpenTab(router, LIST_PATH);

  const save = async (status: "Draft" | "Pending Approval") => {
    try {
      assertRequired(vendorId, "Vendor");
      assertRequired(reason, "Reason");
      setSaving(true);
      const payload = { vendorId, date, referenceInvoice, reason, taxAmount, amount, status: existing?.status && status === "Draft" ? existing.status : status };
      if (isEdit && existing) {
        await updateDebitNote(existing.id, payload);
        toast.success(`${existing.debitNoteNumber} updated`);
      } else {
        const created = await createDebitNote(payload);
        toast.success(`${created.debitNoteNumber} created`);
      }
      navigateOrOpenTab(router, LIST_PATH);
    } catch (e) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save debit note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[900px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Payable" }, { label: "Debit Note", href: LIST_PATH }, { label: isEdit ? existing?.debitNoteNumber ?? "Edit" : "New" }]} />
      <ModuleHeader icon={FileMinus} size="lg" title={isEdit ? `Debit Note ${existing?.debitNoteNumber ?? ""}` : "New Debit Note"} subtitle="Raise a debit note against a vendor invoice" />

      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2">
        <FormSelectField label="Vendor" value={vendorId} onChange={setVendorId} options={VENDORS.map((v) => ({ value: v.id, label: v.name }))} />
        <FormTextField label="Reference Invoice" value={referenceInvoice} onChange={setReferenceInvoice} />
        <div className="space-y-2"><FieldLabel>Date</FieldLabel><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50" /></div>
        <FormTextField label="Tax Amount" type="number" value={taxAmount} onChange={(v) => setTaxAmount(Number(v) || 0)} />
        <FormTextField label="Amount" type="number" value={amount} onChange={(v) => setAmount(Number(v) || 0)} />
        <div className="space-y-2 md:col-span-2"><FieldLabel>Reason</FieldLabel><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason for this debit note..." /></div>
      </div>

      <FormActionsBar saving={saving} onCancel={cancel} onSaveDraft={() => save("Draft")} submitLabel="Submit for Approval" onSubmit={() => save("Pending Approval")} />
    </div>
  );
}
