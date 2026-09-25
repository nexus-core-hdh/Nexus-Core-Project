"use client";

import { useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { HandCoins, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { DataTable } from "@/components/shared/data-table/data-table";
import { ExportPrintBar } from "@/components/finance-erp/list-toolbar";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { FieldLabel, FormSelectField, FormTextField } from "@/components/forms/form-field";
import { formatAmount, formatDate, todayIso } from "@/lib/finance-erp/utils/format";
import { FinanceValidationError, assertRequired } from "@/lib/finance-erp/utils/validation";
import { VENDORS, PAYMENT_METHODS } from "@/lib/finance-erp/mock/master-data";
import {
  getSupplierAdvances, createSupplierAdvance, updateSupplierAdvance, remainingAdvance, type SupplierAdvance,
} from "@/lib/finance-erp/payable/advances";

function emptyForm(): { vendorId: string; date: string; amount: number; paymentMethod: string; reference: string; adjustedAmount: number } {
  return { vendorId: VENDORS[0].id, date: todayIso(), amount: 0, paymentMethod: PAYMENT_METHODS[0], reference: "", adjustedAmount: 0 };
}

export default function AdvancesToSuppliersPage() {
  const [rows, setRows] = useState<SupplierAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierAdvance | null>(null);
  const [form, setForm] = useState(emptyForm());

  const load = () => { setLoading(true); getSupplierAdvances().then(setRows).finally(() => setLoading(false)); };
  useEffect(load, []);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (a: SupplierAdvance) => { setEditing(a); setForm({ vendorId: a.vendorId, date: a.date, amount: a.amount, paymentMethod: a.paymentMethod, reference: a.reference, adjustedAmount: a.adjustedAmount }); setOpen(true); };

  const save = async () => {
    try {
      assertRequired(form.vendorId, "Supplier");
      if (form.amount <= 0) throw new FinanceValidationError("Amount must be greater than zero.");
      const status = form.adjustedAmount <= 0 ? "Open" : form.adjustedAmount >= form.amount ? "Closed" : "Adjusted";
      if (editing) {
        await updateSupplierAdvance(editing.id, { ...form, status });
        toast.success(`${editing.advanceNumber} updated`);
      } else {
        const created = await createSupplierAdvance({ ...form, status });
        toast.success(`${created.advanceNumber} created`);
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to save advance");
    }
  };

  const columns: ColumnDef<SupplierAdvance>[] = [
    { accessorKey: "advanceNumber", header: "Advance #", cell: ({ row }) => <span className="font-mono text-xs">{row.original.advanceNumber}</span> },
    { id: "vendor", header: "Supplier", cell: ({ row }) => VENDORS.find((v) => v.id === row.original.vendorId)?.name ?? "—" },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => formatAmount(row.original.amount) },
    { accessorKey: "paymentMethod", header: "Method" },
    { accessorKey: "adjustedAmount", header: "Adjusted", cell: ({ row }) => formatAmount(row.original.adjustedAmount) },
    { id: "remaining", header: "Remaining", cell: ({ row }) => formatAmount(remainingAdvance(row.original)) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "actions", header: "Actions", enableHiding: false, cell: ({ row }) => <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(row.original)}><Pencil className="h-3.5 w-3.5" /></Button> },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Payable" }, { label: "Advance to Suppliers" }]} />
      <ModuleHeader icon={HandCoins} size="lg" title="Advance to Suppliers" subtitle="Advances paid to vendors pending adjustment against future bills" actions={<ExportPrintBar />} />

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Empty><EmptyHeader><EmptyMedia variant="icon"><HandCoins /></EmptyMedia><EmptyTitle>No advances recorded</EmptyTitle><EmptyDescription>Advances paid to suppliers will appear here.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <DataTable columns={columns} data={rows} storageKey="financeSupplierAdvancesGrid" searchColumn="advanceNumber" searchPlaceholder="Search advance number..." addLabel="New Advance" onAddClick={openNew} />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit Advance ${editing.advanceNumber}` : "New Advance to Supplier"}</DialogTitle>
            <DialogDescription>Record an advance payment made to a supplier.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormSelectField label="Supplier" value={form.vendorId} onChange={(v) => setForm((f) => ({ ...f, vendorId: v }))} options={VENDORS.map((v) => ({ value: v.id, label: v.name }))} />
            <div className="space-y-2"><FieldLabel>Date</FieldLabel><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50" /></div>
            <FormTextField label="Amount" type="number" value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: Number(v) || 0 }))} />
            <FormSelectField label="Payment Method" value={form.paymentMethod} onChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))} options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />
            <FormTextField label="Reference" value={form.reference} onChange={(v) => setForm((f) => ({ ...f, reference: v }))} />
            <FormTextField label="Adjusted Amount" type="number" value={form.adjustedAmount} onChange={(v) => setForm((f) => ({ ...f, adjustedAmount: Number(v) || 0 }))} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save Changes" : "Create Advance"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
