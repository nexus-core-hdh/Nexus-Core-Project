"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ShoppingCart, Eye, Pencil, Ban, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { DataTable } from "@/components/shared/data-table/data-table";
import { FilterField, FilterBar, ExportPrintBar } from "@/components/finance-erp/list-toolbar";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { ConfirmDialog } from "@/components/finance-erp/confirm-dialog";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import {
  getPurchaseOrders, updatePurchaseOrder, deletePurchaseOrder, computeTotals, PO_STATUSES,
  VENDORS, BRANCHES, type PurchaseOrder,
} from "@/lib/finance-erp/payable/purchase-orders";

const ALL = "__all__";

export default function PurchaseOrdersListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(ALL);
  const [vendorId, setVendorId] = useState(ALL);
  const [branchId, setBranchId] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null);

  const load = () => {
    setLoading(true);
    getPurchaseOrders().then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => rows.filter((r) =>
    (status === ALL || r.status === status) &&
    (vendorId === ALL || r.vendorId === vendorId) &&
    (branchId === ALL || r.branchId === branchId) &&
    (!dateFrom || r.date >= dateFrom) &&
    (!dateTo || r.date <= dateTo)
  ), [rows, status, vendorId, branchId, dateFrom, dateTo]);

  const approve = async (po: PurchaseOrder) => {
    await updatePurchaseOrder(po.id, { status: "Approved" });
    toast.success(`${po.poNumber} approved`);
    load();
  };

  const cancel = async (po: PurchaseOrder) => {
    await updatePurchaseOrder(po.id, { status: "Cancelled" });
    toast.success(`${po.poNumber} cancelled`);
    load();
  };

  const columns: ColumnDef<PurchaseOrder>[] = [
    { accessorKey: "poNumber", header: "PO Number", cell: ({ row }) => <span className="font-mono text-xs">{row.original.poNumber}</span> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => formatDate(row.original.date) },
    { id: "vendor", header: "Vendor", cell: ({ row }) => VENDORS.find((v) => v.id === row.original.vendorId)?.name ?? "—" },
    { id: "branch", header: "Branch", cell: ({ row }) => BRANCHES.find((b) => b.id === row.original.branchId)?.name ?? "—" },
    { id: "total", header: "Grand Total", cell: ({ row }) => formatAmount(computeTotals(row.original.items).grandTotal) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", header: "Actions", enableHiding: false,
      cell: ({ row }) => {
        const po = row.original;
        return (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" title="View / Edit" onClick={() => navigateOrOpenTab(router, `/dashboard/finance-erp/payable/purchase-orders?id=${po.id}`)}>
              {po.status === "Draft" ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            {po.status === "Pending Approval" && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="Approve" onClick={() => approve(po)}>
                <CheckCircle2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {po.status !== "Cancelled" && po.status !== "Closed" && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Cancel" onClick={() => setCancelTarget(po)}>
                <Ban className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Payable" }, { label: "Purchase Order" }]} />
      <ModuleHeader
        icon={ShoppingCart}
        size="lg"
        title="Purchase Order"
        subtitle="Create and track purchase orders issued to vendors"
        actions={<ExportPrintBar />}
      />

      <FilterBar onReset={() => { setStatus(ALL); setVendorId(ALL); setBranchId(ALL); setDateFrom(""); setDateTo(""); }}>
        <FilterField label="Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Statuses</SelectItem>
              {PO_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Vendor">
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Vendors</SelectItem>
              {VENDORS.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Branch">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Branches</SelectItem>
              {BRANCHES.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Date Range">
          <div className="flex items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
          </div>
        </FilterField>
      </FilterBar>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ShoppingCart /></EmptyMedia>
            <EmptyTitle>No purchase orders yet</EmptyTitle>
            <EmptyDescription>Create your first purchase order to get started.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          storageKey="financePurchaseOrdersGrid"
          searchColumn="poNumber"
          searchPlaceholder="Search PO number..."
          addLabel="New Purchase Order"
          onAddClick={() => navigateOrOpenTab(router, "/dashboard/finance-erp/payable/purchase-orders")}
        />
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title="Cancel purchase order?"
        description={`This will mark ${cancelTarget?.poNumber} as Cancelled. This action can be reversed by editing the record later.`}
        confirmLabel="Cancel PO"
        onConfirm={() => cancelTarget && cancel(cancelTarget)}
      />
    </div>
  );
}
