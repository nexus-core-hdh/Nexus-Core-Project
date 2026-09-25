"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import { toast } from "sonner";

import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { FieldLabel, FormSelectField, FormTextField } from "@/components/forms/form-field";
import { FormActionsBar } from "@/components/finance-erp/form-actions-bar";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { formatAmount, todayIso } from "@/lib/finance-erp/utils/format";
import { FinanceValidationError, assertRequired } from "@/lib/finance-erp/utils/validation";
import { VENDORS } from "@/lib/finance-erp/mock/master-data";
import {
  getPurchaseInvoice, createPurchaseInvoice, updatePurchaseInvoice, matchStatusOf, poAmountOf,
  type PurchaseInvoice,
} from "@/lib/finance-erp/payable/purchase-invoices";
import { getPurchaseOrders, type PurchaseOrder } from "@/lib/finance-erp/payable/purchase-orders";

const LIST_PATH = "/dashboard/finance-erp/payable/purchase-invoices-list";

const MATCH_ICON: Record<string, any> = { Matched: CheckCircle2, "Partially Matched": AlertTriangle, Mismatch: XCircle, Pending: HelpCircle };
const MATCH_COLOR: Record<string, string> = { Matched: "text-emerald-600", "Partially Matched": "text-orange-500", Mismatch: "text-rose-600", Pending: "text-muted-foreground" };

function CompareCard({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded-lg border p-4 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{label}</div>
      <div className="mt-1.5 text-xl font-bold">{formatAmount(amount)}</div>
    </div>
  );
}

export default function PurchaseInvoiceFormPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const id = params.get("id");
  const isEdit = !!id;

  const [existing, setExisting] = useState<PurchaseInvoice | null>(null);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [poId, setPoId] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [grnNumber, setGrnNumber] = useState("");
  const [grnAmount, setGrnAmount] = useState(0);
  const [invoiceAmount, setInvoiceAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getPurchaseOrders().then(setPos); }, []);

  useEffect(() => {
    if (!id) return;
    getPurchaseInvoice(id).then((inv) => {
      if (!inv) { toast.error("Purchase invoice not found"); return; }
      setExisting(inv);
      setVendorId(inv.vendorId); setPoId(inv.poId ?? ""); setInvoiceDate(inv.invoiceDate);
      setGrnNumber(inv.grnNumber); setGrnAmount(inv.grnAmount); setInvoiceAmount(inv.invoiceAmount);
    });
  }, [id]);

  const selectedPo = pos.find((p) => p.id === poId);
  const poAmount = selectedPo ? poAmountOf(selectedPo) : null;

  const onPickPo = (value: string) => {
    setPoId(value);
    const po = pos.find((p) => p.id === value);
    if (po) {
      const amt = poAmountOf(po);
      setVendorId(po.vendorId);
      setGrnNumber(`GRN-${po.poNumber.replace("PO-", "")}`);
      setGrnAmount(amt);
      setInvoiceAmount(amt);
    }
  };

  const matchStatus = useMemo(() => matchStatusOf(poId ? poAmount : null, grnAmount, invoiceAmount), [poId, poAmount, grnAmount, invoiceAmount]);
  const taxAmount = useMemo(() => Math.round(invoiceAmount - invoiceAmount / 1.18), [invoiceAmount]);
  const MatchIcon = MATCH_ICON[matchStatus];

  const cancel = () => navigateOrOpenTab(router, LIST_PATH);

  const save = async (status: "Draft" | "Pending Approval") => {
    try {
      assertRequired(vendorId, "Vendor");
      assertRequired(invoiceDate, "Invoice Date");
      setSaving(true);
      const payload = {
        vendorId, poId: poId || null, invoiceDate, grnNumber, poAmount: poAmount ?? 0, grnAmount, invoiceAmount, taxAmount,
        paymentStatus: existing?.paymentStatus ?? "Pending" as const, status,
      };
      if (isEdit && existing) {
        await updatePurchaseInvoice(existing.id, payload);
        toast.success(`${existing.invoiceNumber} updated`);
      } else {
        const created = await createPurchaseInvoice(payload);
        toast.success(`${created.invoiceNumber} created`);
      }
      navigateOrOpenTab(router, LIST_PATH);
    } catch (e) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save purchase invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-6 pb-24 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Payable" }, { label: "Purchase Invoice / GRN Matching", href: LIST_PATH }, { label: isEdit ? existing?.invoiceNumber ?? "Edit" : "New" }]} />
      <ModuleHeader icon={FileText} size="lg" title={isEdit ? `Purchase Invoice ${existing?.invoiceNumber ?? ""}` : "New Purchase Invoice"} subtitle="Match against Purchase Order and GRN" />

      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormSelectField label="Purchase Order" value={poId} onChange={onPickPo} options={pos.map((p) => ({ value: p.id, label: p.poNumber }))} />
        <FormSelectField label="Vendor" value={vendorId} onChange={setVendorId} options={VENDORS.map((v) => ({ value: v.id, label: v.name }))} />
        <div className="space-y-2"><FieldLabel>Invoice Date</FieldLabel><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50" /></div>
        <FormTextField label="GRN Number" value={grnNumber} onChange={setGrnNumber} />
        <FormTextField label="GRN Amount" type="number" value={grnAmount} onChange={(v) => setGrnAmount(Number(v) || 0)} />
        <FormTextField label="Invoice Amount" type="number" value={invoiceAmount} onChange={(v) => setInvoiceAmount(Number(v) || 0)} />
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">3-Way Match Comparison</div>
          <div className={`flex items-center gap-1.5 text-sm font-medium ${MATCH_COLOR[matchStatus]}`}>
            <MatchIcon className="h-4 w-4" /><StatusBadge status={matchStatus} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CompareCard label="Purchase Order" amount={poAmount ?? 0} />
          <CompareCard label="GRN (Goods Received)" amount={grnAmount} />
          <CompareCard label="Invoice" amount={invoiceAmount} />
        </div>
        <div className="mt-3 flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
          <span>Tax (18% incl.): <span className="font-medium text-foreground">{formatAmount(taxAmount)}</span></span>
          <span>Net Subtotal: <span className="font-medium text-foreground">{formatAmount(invoiceAmount - taxAmount)}</span></span>
          {matchStatus === "Mismatch" && <span className="text-rose-600">⚠ Amounts differ by more than 5% — review before approving.</span>}
        </div>
      </div>

      <FormActionsBar saving={saving} onCancel={cancel} onSaveDraft={() => save("Draft")} submitLabel="Submit for Approval" onSubmit={() => save("Pending Approval")} />
    </div>
  );
}
