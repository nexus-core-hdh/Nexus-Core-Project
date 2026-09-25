"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Eye, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { DataTable } from "@/components/shared/data-table/data-table";
import { FilterField, FilterBar, ExportPrintBar } from "@/components/finance-erp/list-toolbar";
import { StatusBadge } from "@/components/finance-erp/status-badge";
import { ConfirmDialog } from "@/components/finance-erp/confirm-dialog";
import { formatAmount, formatDate } from "@/lib/finance-erp/utils/format";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { fixedAssetsApi, calculateDepreciation, type FixedAsset, type AssetStatus } from "@/lib/finance-erp/fixed-assets/register";
import { assetCategoriesApi, type AssetCategory } from "@/lib/finance-erp/fixed-assets/categories";
import { BRANCHES, EMPLOYEES } from "@/lib/finance-erp/mock/master-data";
import { toast } from "sonner";

const ALL = "__all__";
const STATUSES: AssetStatus[] = ["Active", "Under Maintenance", "Disposed", "Transferred"];

export default function AssetRegisterListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<FixedAsset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [locationFilter, setLocationFilter] = useState(ALL);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [assets, cats] = await Promise.all([fixedAssetsApi.list(), assetCategoriesApi.list()]);
    setRows(assets);
    setCategories(cats);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";

  const filtered = useMemo(() => rows.filter((r) =>
    (statusFilter === ALL || r.status === statusFilter) &&
    (categoryFilter === ALL || r.categoryId === categoryFilter) &&
    (locationFilter === ALL || r.locationBranchId === locationFilter)
  ), [rows, statusFilter, categoryFilter, locationFilter]);

  const goToForm = (id?: string) => navigateOrOpenTab(router, id ? `/dashboard/finance-erp/fixed-assets/register?id=${id}` : "/dashboard/finance-erp/fixed-assets/register");

  const columns: ColumnDef<FixedAsset>[] = [
    { accessorKey: "assetId", header: "Asset ID", cell: ({ row }) => <span className="font-mono text-xs">{row.original.assetId}</span> },
    { accessorKey: "name", header: "Asset Name" },
    { id: "category", header: "Category", cell: ({ row }) => categoryName(row.original.categoryId) },
    { accessorKey: "purchaseDate", header: "Purchase Date", cell: ({ row }) => formatDate(row.original.purchaseDate) },
    { accessorKey: "purchaseCost", header: "Purchase Cost", cell: ({ row }) => formatAmount(row.original.purchaseCost) },
    {
      id: "accumulatedDepreciation", header: "Accum. Depreciation",
      cell: ({ row }) => formatAmount(calculateDepreciation(row.original).accumulatedDepreciation),
    },
    {
      id: "nbv", header: "Net Book Value",
      cell: ({ row }) => <span className="font-medium">{formatAmount(calculateDepreciation(row.original).netBookValue)}</span>,
    },
    { id: "location", header: "Location", cell: ({ row }) => BRANCHES.find((b) => b.id === row.original.locationBranchId)?.name ?? "—" },
    { id: "custodian", header: "Custodian", cell: ({ row }) => EMPLOYEES.find((e) => e.id === row.original.custodianEmployeeId)?.name ?? "—" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: "actions", header: "Actions", enableHiding: false, size: 110,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => goToForm(row.original.id)} title="View / Edit asset" aria-label="View / Edit asset"><Eye className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(row.original.id)} title="Delete asset" aria-label="Delete asset"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ];

  const confirmDelete = async () => {
    if (!deleteId) return;
    await fixedAssetsApi.remove(deleteId);
    toast.success("Asset removed from register");
    load();
  };

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={[{ label: "Finance", href: "/dashboard/finance-erp" }, { label: "Asset Register" }]} />
      <ModuleHeader
        icon={Building2}
        size="lg"
        title="Asset Register"
        subtitle="Company fixed assets — cost, depreciation and current book value"
        actions={<ExportPrintBar />}
      />

      <FilterBar onReset={() => { setStatusFilter(ALL); setCategoryFilter(ALL); setLocationFilter(ALL); }}>
        <FilterField label="Status">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Category">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Location">
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="h-9 w-full text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Locations</SelectItem>
              {BRANCHES.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Building2 /></EmptyMedia>
            <EmptyTitle>No assets registered</EmptyTitle>
            <EmptyDescription>Add your first fixed asset to start tracking depreciation.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataTable columns={columns} data={filtered} storageKey="financeAssetRegisterGrid" searchColumn="name" searchPlaceholder="Search asset name..." onAddClick={() => goToForm()} addLabel="Add Asset" />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Remove Asset"
        description="This will permanently remove the asset from the register. This action cannot be undone."
        confirmLabel="Remove"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
