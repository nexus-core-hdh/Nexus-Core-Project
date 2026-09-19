"use client";

// Yarn Planning — a read-only, cross-Work-Order planning/reporting screen, built on the EXACT
// same architecture as Fabric Planning (frontend/app/dashboard/(auth)/legacy-erp/fabric-planning/
// page.tsx) — same ReportGrid, same filter bar, same Transaction Details drill-down pattern. NOT a
// second calculation engine: Required quantity is the exact same FabricYarnRequirementsService.
// getYarnRequirements(...) output the Fabric/Yarn Requirements screen's own Yarn tab already uses
// (Fabric BOM line -> color-wise Applicable Quantity -> Will-Be-Cut -> Common/Color-Specific Yarn
// Recipe resolution -> Yarn Recipe % -> Requirement Calculation Unit conversion — all untouched),
// and Transaction Details below reuses that same screen's own getTransactions endpoint verbatim
// (see nexuscore-backend/src/modules/legacy-erp/yarn-planning.service.ts's own top comment for the
// full DB-first source mapping per column).
//
// Genuinely unsupported fields, disclosed rather than fabricated (see the final report):
// - Consumption / Applicable Quantity — Fabric Planning shows these because a Fabric row's
//   Requirement IS Consumption x Applicable Quantity, a real per-line rate. A Yarn row has no
//   single "Consumption" of its own: getYarnRequirements already collapses Consumption x
//   Applicable Quantity x Wastage x Recipe % into one Requirement figure (see that method's own
//   comment) — inventing a standalone Consumption column here would misrepresent a number that
//   doesn't exist at this granularity, so it is intentionally omitted rather than shown as "—".
// - Process Code / Process Name — this schema has exactly ONE free-text Process field per BOM line
//   (MA_RecipeItem's own UD_Remarks — see fabric-yarn-requirements.service.ts's own comment), never
//   split into a separate Code/Name pair anywhere. Shown as "—" (never fabricated), same convention
//   Fabric Planning already established for its own Variant-1 Explanation column (always null in
//   the underlying engine, shown honestly rather than hidden).
// - Purchase / Manufacturing Send — same real-but-currently-empty data-availability gap already
//   documented on Fabric Planning (IM_OrderReceiptItem.ManufacturingOrderId / ReceiptType=140 are
//   real, correct queries against real columns that no existing screen has ever populated).

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ReportGrid, type ReportColumn } from "../fabric-yarn-requirements/_components/report-grid";

interface PlanningRow {
  id: string | number;
  workOrderId: number;
  workOrderNo: string | null;
  workOrderDate: string | null;
  styleCode: string | null;
  styleName: string | null;
  customerOrderNo: string | null;
  deliveryDate: string | null;
  orderQuantity: number | null;
  customerCode: string | null;
  customerName: string | null;
  inventoryId: number | null;
  inventoryCode: string | null;
  inventoryName: string | null;
  process: string | null;
  variant1: string | null;
  variant1Explanation: string | null;
  variant2: string | null;
  colorCardId: string | null;
  colorCode: string | null;
  colorName: string | null;
  requirementUnit: { id: number; code: string; name: string } | null;
  required: number;
  purchase: number;
  received: number;
  processSent: number;
  processReceived: number;
  manufacturingSend: number;
  balance: number;
}

interface TransactionRow {
  id: string | number;
  receiptDate: string | null;
  receiptType: number | null;
  subcontractor: string | null;
  receiptNo: string | null;
  documentNo: string | null;
  warehouse: string | null;
  partyNo: string | null;
  specialCode: string | null;
  explanation: string | null;
  currentAccountCode: string | null;
  currentAccountName: string | null;
  grossQuantity: number | null;
  quantity: number | null;
  receiptQuantity: number | null;
}

const emptyFilters = { orderNo: "", style: "", customer: "", inventory: "", process: "", variant: "", color: "" };

const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString() : "—");

export default function YarnPlanningPage() {
  const { round, ensureLoaded } = useDecimalParameters();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);

  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [rows, setRows] = useState<PlanningRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [selectedRow, setSelectedRow] = useState<PlanningRow | null>(null);
  const [transactionRows, setTransactionRows] = useState<TransactionRow[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);

  const load = async (f: typeof emptyFilters) => {
    setLoading(true);
    try {
      const data: any = await legacyErpApi.yarnPlanning.list({
        orderNo: f.orderNo || undefined,
        style: f.style || undefined,
        customer: f.customer || undefined,
        inventory: f.inventory || undefined,
        process: f.process || undefined,
        variant: f.variant || undefined,
        color: f.color || undefined,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load Yarn Planning");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(emptyFilters); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const find = () => { setAppliedFilters(filters); load(filters); };
  const clear = () => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); load(emptyFilters); setSelectedRow(null); setTransactionRows([]); };

  const selectRow = async (row: PlanningRow) => {
    setSelectedRow(row);
    setShowTransactions(true);
    setLoadingTransactions(true);
    try {
      const data: any = await legacyErpApi.workOrders.requirements.getTransactions(row.workOrderId, {
        inventoryId: row.inventoryId,
        colorCardId: row.colorCardId,
      });
      setTransactionRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load Transaction Details");
      setTransactionRows([]);
    } finally {
      setLoadingTransactions(false);
    }
  };

  const columns: ReportColumn<PlanningRow>[] = [
    { key: "workOrderNo", label: "Order No", defaultWidth: 120, render: (r) => r.workOrderNo || "—" },
    { key: "styleCode", label: "Style Code", defaultWidth: 110, render: (r) => r.styleCode || "—" },
    { key: "styleName", label: "Style Name", defaultWidth: 220, render: (r) => r.styleName || "—" },
    { key: "workOrderDate", label: "Order Date", defaultWidth: 100, render: (r) => fmtDate(r.workOrderDate) },
    { key: "customerOrderNo", label: "Customer Order", defaultWidth: 130, render: (r) => r.customerOrderNo || "—" },
    { key: "deliveryDate", label: "Delivery Date", defaultWidth: 100, render: (r) => fmtDate(r.deliveryDate) },
    { key: "orderQuantity", label: "Quantity", defaultWidth: 100, align: "right", render: (r) => (r.orderQuantity != null ? round(r.orderQuantity, "quantity").toLocaleString() : "—") },
    {
      key: "customer", label: "Customer", defaultWidth: 180,
      render: (r) => (r.customerCode || r.customerName ? <span>{r.customerCode}{r.customerCode && r.customerName ? " — " : ""}{r.customerName}</span> : <span className="text-muted-foreground">—</span>),
    },
    { key: "inventoryCode", label: "Inventory Code", defaultWidth: 140, render: (r) => r.inventoryCode || "—" },
    { key: "inventoryName", label: "Inventory Name", defaultWidth: 260, render: (r) => r.inventoryName || "—" },
    { key: "process", label: "Process", defaultWidth: 120, render: (r) => r.process || "—" },
    // Not separately backed anywhere in this schema (one free-text Process field only) — see this
    // file's own top comment. Always "—", never fabricated.
    { key: "processCode", label: "Process Code", defaultWidth: 100, render: () => <span className="text-muted-foreground">—</span> },
    { key: "processName", label: "Process Name", defaultWidth: 140, render: () => <span className="text-muted-foreground">—</span> },
    { key: "variant1", label: "Variant-1", defaultWidth: 110, render: (r) => r.variant1 || "—" },
    // Never populated anywhere in the Yarn Requirements engine today (always null there too) —
    // shown honestly as "—" rather than fabricated, same as Fabric Planning's own column.
    { key: "variant1Explanation", label: "Variant-1 Explanation", defaultWidth: 150, render: (r) => r.variant1Explanation || "—" },
    { key: "variant2", label: "Variant-2 (Production Color)", defaultWidth: 170, render: (r) => r.variant2 || <span className="text-muted-foreground">—</span> },
    {
      key: "materialColor", label: "Material Color", defaultWidth: 140,
      render: (r) => (r.colorCode || r.colorName ? <span>{r.colorCode || r.colorName}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "unit", label: "Unit", defaultWidth: 70,
      render: (r) => r.requirementUnit ? <span title={r.requirementUnit.name}>{r.requirementUnit.code}</span> : <span className="text-muted-foreground">—</span>,
    },
    { key: "required", label: "Requirement", defaultWidth: 120, align: "right", render: (r) => <span className="font-medium">{round(r.required, "quantity").toLocaleString()}</span> },
    { key: "purchase", label: "Purchase", defaultWidth: 100, align: "right", render: (r) => round(r.purchase, "quantity").toLocaleString() },
    { key: "received", label: "Received", defaultWidth: 100, align: "right", render: (r) => round(r.received, "quantity").toLocaleString() },
    { key: "processSent", label: "Process Sent", defaultWidth: 110, align: "right", render: (r) => round(r.processSent, "quantity").toLocaleString() },
    { key: "processReceived", label: "Process Received", defaultWidth: 130, align: "right", render: (r) => round(r.processReceived, "quantity").toLocaleString() },
    { key: "manufacturingSend", label: "Manufacturing Send", defaultWidth: 140, align: "right", render: (r) => round(r.manufacturingSend, "quantity").toLocaleString() },
    {
      key: "balance", label: "Balance", defaultWidth: 100, align: "right",
      render: (r) => <span className={r.balance > 0 ? "text-amber-700 dark:text-amber-400" : r.balance < 0 ? "text-emerald-700 dark:text-emerald-400" : undefined}>{round(r.balance, "quantity").toLocaleString()}</span>,
    },
  ];

  const transactionColumns: ReportColumn<TransactionRow>[] = [
    { key: "receiptDate", label: "Receipt Date", defaultWidth: 110, render: (r) => fmtDate(r.receiptDate) },
    { key: "receiptType", label: "Receipt Type", defaultWidth: 150, render: (r) => (r.receiptType != null ? String(r.receiptType) : "—") },
    { key: "subcontractor", label: "Subcontractor", defaultWidth: 160, render: (r) => r.subcontractor || "—" },
    { key: "receiptNo", label: "Receipt No", defaultWidth: 110, render: (r) => r.receiptNo || "—" },
    { key: "documentNo", label: "Document No", defaultWidth: 110, render: (r) => r.documentNo || "—" },
    { key: "warehouse", label: "Warehouse", defaultWidth: 130, render: (r) => r.warehouse || "—" },
    { key: "partyNo", label: "Party No", defaultWidth: 100, render: (r) => r.partyNo || "—" },
    { key: "specialCode", label: "Special Code", defaultWidth: 110, render: (r) => r.specialCode || "—" },
    { key: "explanation", label: "Explanation", defaultWidth: 200, render: (r) => r.explanation || "—" },
    { key: "currentAccount", label: "Current Account", defaultWidth: 200, render: (r) => (r.currentAccountName ? `${r.currentAccountCode ? r.currentAccountCode + " — " : ""}${r.currentAccountName}` : "—") },
    { key: "grossQuantity", label: "Gross Quantity", defaultWidth: 120, align: "right", render: (r) => round(r.grossQuantity ?? 0, "quantity").toLocaleString() },
    { key: "quantity", label: "Quantity", defaultWidth: 100, align: "right", render: (r) => round(r.quantity ?? 0, "quantity").toLocaleString() },
    { key: "receiptQuantity", label: "Receipt Quantity", defaultWidth: 130, align: "right", render: (r) => round(r.receiptQuantity ?? 0, "quantity").toLocaleString() },
  ];

  return (
    <div className="space-y-4 p-4">
      <LegacyErpBreadcrumb trail={[{ label: "Legacy ERP" }, { label: "Yarn Planning" }]} />

      <div className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-4 lg:grid-cols-7">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Order No</label>
          <Input className="h-8 text-sm" value={filters.orderNo} onChange={(e) => setFilters((p) => ({ ...p, orderNo: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && find()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Style</label>
          <Input className="h-8 text-sm" value={filters.style} onChange={(e) => setFilters((p) => ({ ...p, style: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && find()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Customer</label>
          <Input className="h-8 text-sm" value={filters.customer} onChange={(e) => setFilters((p) => ({ ...p, customer: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && find()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Inventory / Yarn</label>
          <Input className="h-8 text-sm" value={filters.inventory} onChange={(e) => setFilters((p) => ({ ...p, inventory: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && find()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Process</label>
          <Input className="h-8 text-sm" value={filters.process} onChange={(e) => setFilters((p) => ({ ...p, process: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && find()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Variant</label>
          <Input className="h-8 text-sm" value={filters.variant} onChange={(e) => setFilters((p) => ({ ...p, variant: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && find()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Color</label>
          <Input className="h-8 text-sm" value={filters.color} onChange={(e) => setFilters((p) => ({ ...p, color: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && find()} />
        </div>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-4 lg:col-span-7">
          <Button size="sm" onClick={find} disabled={loading}><Search className="h-3.5 w-3.5 mr-1.5" />{loading ? "Loading..." : "Find"}</Button>
          <Button size="sm" variant="outline" onClick={clear} disabled={loading}><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Clear</Button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          Requirement Planning
          <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">— click a row to see its Transaction Details below</span>
        </p>
        {loading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <ReportGrid
            storageKey="yarnPlanningGrid"
            columns={columns}
            rows={rows}
            loading={loading}
            emptyLabel="No planning rows found — try different filters."
            selectedId={selectedRow?.id ?? null}
            onRowClick={selectRow}
            fixedColumns={["workOrderNo", "styleCode", "inventoryCode"]}
          />
        )}
      </div>

      {showTransactions && (
        <div>
          <div className="mb-1 flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Transaction Details</p>
            {selectedRow ? (
              <span className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px]">
                Showing receipts for <span className="font-medium">{selectedRow.workOrderNo} — {selectedRow.inventoryCode || selectedRow.inventoryName || "this item"}</span>
                <button type="button" className="text-muted-foreground hover:text-foreground underline" onClick={() => { setSelectedRow(null); setTransactionRows([]); setShowTransactions(false); }}>Clear</button>
              </span>
            ) : null}
          </div>
          <ReportGrid
            storageKey="yarnPlanningTransactionsGrid"
            columns={transactionColumns}
            rows={transactionRows}
            loading={loadingTransactions}
            emptyLabel={selectedRow ? "No receipts found for this item on this Work Order." : "Select a planning row above to see its Transaction Details."}
          />
        </div>
      )}
    </div>
  );
}
