"use client";

import { useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { DataTable } from "@/components/shared/data-table/data-table";
import { FormSection } from "@/components/forms/form-section";
import { FormTextField, FormSelectField, FieldLabel } from "@/components/forms/form-field";
import { ExportPrintBar } from "@/components/finance-erp/list-toolbar";
import { formatAmount, formatDate, todayIso, amountColorClass } from "@/lib/finance-erp/utils/format";
import { FinanceValidationError } from "@/lib/finance-erp/utils/validation";
import {
  assetTransfersApi, assetDisposalsApi, currentBookValue, BRANCHES, EMPLOYEES,
  type AssetTransfer, type AssetDisposal,
} from "@/lib/finance-erp/fixed-assets/transfer-disposal";
import { fixedAssetsApi, type FixedAsset } from "@/lib/finance-erp/fixed-assets/register";

export default function AssetTransferDisposalPage() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [transfers, setTransfers] = useState<AssetTransfer[]>([]);
  const [disposals, setDisposals] = useState<AssetDisposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);
  const [disposalOpen, setDisposalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [transferForm, setTransferForm] = useState({ assetId: "", fromBranchId: "", toBranchId: "", custodianEmployeeId: "", date: todayIso(), reason: "" });
  const [disposalForm, setDisposalForm] = useState({ assetId: "", disposalDate: todayIso(), disposalReason: "", saleProceeds: "" });

  const load = async () => {
    setLoading(true);
    setAssets(fixedAssetsApi.snapshot());
    setTransfers(await assetTransfersApi.list());
    setDisposals(await assetDisposalsApi.list());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const assetLabel = (assetId: string) => { const a = assets.find((x) => x.id === assetId); return a ? `${a.assetId} - ${a.name}` : "—"; };

  const openTransfer = () => {
    const first = assets[0];
    setTransferForm({ assetId: first?.id ?? "", fromBranchId: first?.locationBranchId ?? "", toBranchId: "", custodianEmployeeId: "", date: todayIso(), reason: "" });
    setTransferOpen(true);
  };

  const openDisposal = () => {
    const first = assets[0];
    setDisposalForm({ assetId: first?.id ?? "", disposalDate: todayIso(), disposalReason: "", saleProceeds: "" });
    setDisposalOpen(true);
  };

  const saveTransfer = async () => {
    setSaving(true);
    try {
      if (!transferForm.assetId) throw new FinanceValidationError("Asset is required.");
      if (!transferForm.toBranchId) throw new FinanceValidationError("To Branch/Location is required.");
      await assetTransfersApi.create(transferForm);
      toast.success("Asset transferred");
      setTransferOpen(false);
      load();
    } catch (e: any) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to transfer asset");
    } finally { setSaving(false); }
  };

  const saveDisposal = async () => {
    setSaving(true);
    try {
      if (!disposalForm.assetId) throw new FinanceValidationError("Asset is required.");
      if (!disposalForm.disposalDate) throw new FinanceValidationError("Disposal Date is required.");
      if (Number(disposalForm.saleProceeds) < 0) throw new FinanceValidationError("Sale Proceeds cannot be negative.");
      const bookValue = currentBookValue(disposalForm.assetId);
      await assetDisposalsApi.create({ ...disposalForm, bookValue, saleProceeds: Number(disposalForm.saleProceeds) || 0 });
      toast.success("Asset disposed");
      setDisposalOpen(false);
      load();
    } catch (e: any) {
      toast.error(e instanceof FinanceValidationError ? e.message : "Failed to record disposal");
    } finally { setSaving(false); }
  };

  const transferColumns: ColumnDef<AssetTransfer>[] = [
    { id: "asset", header: "Asset", cell: ({ row }) => assetLabel(row.original.assetId) },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { id: "from", header: "From", cell: ({ row }) => BRANCHES.find((b) => b.id === row.original.fromBranchId)?.name ?? "—" },
    { id: "to", header: "To", cell: ({ row }) => BRANCHES.find((b) => b.id === row.original.toBranchId)?.name ?? "—" },
    { id: "custodian", header: "Custodian", cell: ({ row }) => EMPLOYEES.find((e) => e.id === row.original.custodianEmployeeId)?.name ?? "—" },
    { accessorKey: "reason", header: "Reason" },
  ];

  const disposalColumns: ColumnDef<AssetDisposal>[] = [
    { id: "asset", header: "Asset", cell: ({ row }) => assetLabel(row.original.assetId) },
    { accessorKey: "disposalDate", header: "Disposal Date", cell: ({ row }) => formatDate(row.original.disposalDate) },
    { accessorKey: "disposalReason", header: "Reason" },
    { accessorKey: "bookValue", header: "Book Value", cell: ({ row }) => formatAmount(row.original.bookValue) },
    { accessorKey: "saleProceeds", header: "Sale Proceeds", cell: ({ row }) => formatAmount(row.original.saleProceeds) },
    { accessorKey: "gainLoss", header: "Gain / (Loss)", cell: ({ row }) => <span className={amountColorClass(row.original.gainLoss) || "text-emerald-600 dark:text-emerald-400"}>{formatAmount(row.original.gainLoss)}</span> },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Asset Transfer / Disposal" }]} />
      <ModuleHeader icon={ArrowRightLeft} size="lg" title="Asset Transfer / Disposal" subtitle="Move assets between locations, or record their disposal" actions={<ExportPrintBar />} />

      <Tabs defaultValue="transfer">
        <TabsList>
          <TabsTrigger value="transfer">Transfers</TabsTrigger>
          <TabsTrigger value="disposal">Disposals</TabsTrigger>
        </TabsList>
        <TabsContent value="transfer" className="mt-4">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <DataTable columns={transferColumns} data={transfers} storageKey="financeAssetTransfersGrid" onAddClick={openTransfer} addLabel="New Transfer" />
          )}
        </TabsContent>
        <TabsContent value="disposal" className="mt-4">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <DataTable columns={disposalColumns} data={disposals} storageKey="financeAssetDisposalsGrid" onAddClick={openDisposal} addLabel="New Disposal" />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent dismissOnEscape dismissOnOutside className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Transfer Asset</DialogTitle><DialogDescription>Move an asset to a new branch/location and custodian.</DialogDescription></DialogHeader>
          <FormSection title="Transfer Details">
            <FormSelectField label="Asset *" value={transferForm.assetId} onChange={(v) => setTransferForm((f) => ({ ...f, assetId: v, fromBranchId: assets.find((a) => a.id === v)?.locationBranchId ?? f.fromBranchId }))} options={assets.map((a) => ({ value: a.id, label: `${a.assetId} - ${a.name}` }))} span="wide" />
            <div className="space-y-2">
              <FieldLabel>From Branch</FieldLabel>
              {/* Read-only — derived from the selected asset's current location, not independently editable. */}
              <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                {BRANCHES.find((b) => b.id === transferForm.fromBranchId)?.name ?? "—"}
              </div>
            </div>
            <FormSelectField label="To Branch *" value={transferForm.toBranchId} onChange={(v) => setTransferForm((f) => ({ ...f, toBranchId: v }))} options={BRANCHES.map((b) => ({ value: b.id, label: b.name }))} />
            <FormSelectField label="Custodian" value={transferForm.custodianEmployeeId} onChange={(v) => setTransferForm((f) => ({ ...f, custodianEmployeeId: v }))} options={EMPLOYEES.map((e) => ({ value: e.id, label: e.name }))} />
            <FormTextField label="Date" type="date" value={transferForm.date} onChange={(v) => setTransferForm((f) => ({ ...f, date: v }))} />
            <div className="space-y-2 md:col-span-3">
              <FieldLabel>Reason</FieldLabel>
              <Textarea value={transferForm.reason} onChange={(e) => setTransferForm((f) => ({ ...f, reason: e.target.value }))} rows={2} />
            </div>
          </FormSection>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={saveTransfer} disabled={saving}>Transfer Asset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={disposalOpen} onOpenChange={setDisposalOpen}>
        <DialogContent dismissOnEscape dismissOnOutside className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Dispose Asset</DialogTitle><DialogDescription>Records the sale/write-off of an asset and its gain or loss.</DialogDescription></DialogHeader>
          <FormSection title="Disposal Details">
            <FormSelectField label="Asset *" value={disposalForm.assetId} onChange={(v) => setDisposalForm((f) => ({ ...f, assetId: v }))} options={assets.map((a) => ({ value: a.id, label: `${a.assetId} - ${a.name}` }))} span="wide" />
            <FormTextField label="Disposal Date" type="date" value={disposalForm.disposalDate} onChange={(v) => setDisposalForm((f) => ({ ...f, disposalDate: v }))} />
            <FormTextField label="Sale Proceeds" type="number" value={disposalForm.saleProceeds} onChange={(v) => setDisposalForm((f) => ({ ...f, saleProceeds: v }))} />
            <div className="space-y-2">
              <FieldLabel>Current Book Value</FieldLabel>
              <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm">{disposalForm.assetId ? formatAmount(currentBookValue(disposalForm.assetId)) : "—"}</div>
            </div>
            <div className="space-y-2 md:col-span-3">
              <FieldLabel>Disposal Reason</FieldLabel>
              <Textarea value={disposalForm.disposalReason} onChange={(e) => setDisposalForm((f) => ({ ...f, disposalReason: e.target.value }))} rows={2} />
            </div>
          </FormSection>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={saveDisposal} disabled={saving}>Record Disposal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
