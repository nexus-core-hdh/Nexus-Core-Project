"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { RECEIPT_TYPES } from "@/lib/legacy-erp/receipt-types";
import {
  FileClock, RefreshCw, Search, XCircle, ArrowDownToLine, ArrowUpFromLine,
  Package, SearchX,
} from "lucide-react";

// Item Statement / Transaction History — reachable from Trim/Fabric/Yarn/Inventory Card List's
// "View Statement" row action (see item-statement.controller.ts / item-statement.service.ts).
// Read-only: reuses the exact same IM_Item / IM_Receipt / IM_ReceiptItem rows and the exact same
// Stock on Hand formula (InventoryCardService.getStockOnHand) every card screen already shows —
// no new stock engine, no invented transaction quantities/directions.

const ALL_TYPES = "all";

function StatTile({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        <Icon className="h-3 w-3" />{label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

export default function ItemStatementPage() {
  const params = useWorkspaceSearchParams();
  const itemId = Number(params.get("id")) || null;
  const sourcePath = params.get("source") ? decodeURIComponent(params.get("source")!) : undefined;
  const sourceLabel = params.get("sourceLabel") ? decodeURIComponent(params.get("sourceLabel")!) : undefined;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [receiptType, setReceiptType] = useState<string>(ALL_TYPES);
  const [receiptNo, setReceiptNo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<{ dateFrom?: string; dateTo?: string; receiptType?: number; receiptNo?: string }>({});

  const load = async (filters: { dateFrom?: string; dateTo?: string; receiptType?: number; receiptNo?: string }) => {
    if (!itemId) { setError("No inventory item was specified."); setLoading(false); return; }
    setLoading(true);
    try {
      const r = await legacyErpApi.itemStatement.get(itemId, filters);
      setData(r);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load item statement");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load({}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [itemId]);

  const applyFilters = () => {
    const filters = {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      receiptType: receiptType !== ALL_TYPES ? Number(receiptType) : undefined,
      receiptNo: receiptNo.trim() || undefined,
    };
    setAppliedFilters(filters);
    load(filters);
  };

  const resetFilters = () => {
    setDateFrom(""); setDateTo(""); setReceiptType(ALL_TYPES); setReceiptNo("");
    setAppliedFilters({});
    load({});
  };

  const hasActiveFilters = Object.values(appliedFilters).some((v) => v !== undefined);

  const breadcrumbTrail = useMemo(() => {
    const trail: { label: string; href?: string }[] = [{ label: "Legacy ERP" }];
    if (sourcePath && sourceLabel) trail.push({ label: sourceLabel, href: sourcePath });
    trail.push({ label: "Item Statement" });
    return trail;
  }, [sourcePath, sourceLabel]);

  const transactions = data?.transactions ?? [];

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <LegacyErpBreadcrumb trail={breadcrumbTrail} />

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <FileClock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Item Statement</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data ? `${data.item.inventoryCode} — ${data.item.inventoryName}` : "Complete transaction history for a single inventory item"}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(appliedFilters)} title="Refresh">
          <RefreshCw className="h-3.5 w-3.5 mr-2" />Refresh
        </Button>
      </div>

      {error ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
            <EmptyTitle>Unable to load statement</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile icon={Package} label="Code" value={loading ? <Skeleton className="h-4 w-20" /> : (
              <span className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-xs">{data?.item.inventoryCode}</span>
            )} />
            <StatTile icon={Package} label="Name" value={loading ? <Skeleton className="h-4 w-32" /> : data?.item.inventoryName} />
            <StatTile icon={Package} label="Unit" value={loading ? <Skeleton className="h-4 w-12" /> : (data?.item.unit || "—")} />
            <StatTile icon={Package} label="Current Stock" value={loading ? <Skeleton className="h-4 w-16" /> : (
              <span className="font-semibold">{data?.currentStockOnHand} {data?.item.unit}</span>
            )} />
          </div>

          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/10 p-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">From Date</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">To Date</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Transaction Type</label>
              <Select value={receiptType} onValueChange={setReceiptType}>
                <SelectTrigger className="h-9 w-64 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TYPES}>All Types</SelectItem>
                  {RECEIPT_TYPES.map((t) => <SelectItem key={t.receiptType} value={String(t.receiptType)}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Receipt No.</label>
              <Input
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                placeholder="Search receipt no..."
                className="h-9 w-44 text-sm"
              />
            </div>
            <Button size="sm" onClick={applyFilters} className="h-9"><Search className="h-3.5 w-3.5 mr-2" />Apply</Button>
            {hasActiveFilters && (
              <Button size="sm" variant="outline" onClick={resetFilters} className="h-9"><XCircle className="h-3.5 w-3.5 mr-2" />Reset</Button>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Date</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Receipt No.</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Transaction Type</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Unit</TableHead>
                    <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Quantity In</TableHead>
                    <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Quantity Out</TableHead>
                    <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j} className="py-3"><Skeleton className="h-4 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : transactions.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="py-12">
                        <Empty>
                          <EmptyHeader>
                            <EmptyMedia variant="icon"><FileClock /></EmptyMedia>
                            <EmptyTitle>No transactions found</EmptyTitle>
                            <EmptyDescription>
                              {hasActiveFilters ? "Try widening the date range or clearing filters." : "This item has no recorded receipts yet."}
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  ) : transactions.map((row: any, i: number) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="py-3 text-sm">{row.date ? format(new Date(row.date), "dd MMM yyyy") : "—"}</TableCell>
                      <TableCell className="py-3">
                        <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-xs">{row.receiptNo}</span>
                      </TableCell>
                      <TableCell className="py-3 text-sm">
                        <div className="flex items-center gap-1.5">
                          {row.transactionType}
                          {row.movementCategory === "TRANSFER" && (
                            <Badge variant="outline" className="h-5 gap-1 text-[10px] font-normal text-muted-foreground">
                              <span title="This legacy schema has no populated source/destination warehouse data for this receipt, so it cannot be resolved to a stock movement. Shown for reference only.">Transfer — Unresolved</span>
                            </Badge>
                          )}
                          {row.movementCategory === "UNKNOWN" && (
                            <Badge variant="outline" className="h-5 gap-1 text-[10px] font-normal text-muted-foreground">
                              <span title="No stock direction is confirmed by the schema or code for this receipt type.">Direction Unknown</span>
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-sm">{row.unit || "—"}</TableCell>
                      {row.includedInStockCalculation ? (
                        <>
                          <TableCell className="py-3 text-right text-sm">
                            {row.quantityIn ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><ArrowDownToLine className="h-3 w-3" />{row.quantityIn}</span> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="py-3 text-right text-sm">
                            {row.quantityOut ? <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400"><ArrowUpFromLine className="h-3 w-3" />{row.quantityOut}</span> : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </>
                      ) : (
                        <TableCell colSpan={2} className="py-3 text-right text-sm text-muted-foreground" title="Not Included in Stock Calculation">
                          {row.quantity} <span className="text-[11px]">(Not Included in Stock Calculation)</span>
                        </TableCell>
                      )}
                      <TableCell className="py-3 text-right text-sm font-medium">{row.runningBalance}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {!loading && transactions.length > 0 && data?.totals && (
              <div className="flex flex-wrap items-center justify-end gap-6 border-t bg-muted/20 px-4 py-3 text-sm">
                <span className="text-muted-foreground">Total In: <span className="font-semibold text-foreground">{data.totals.totalIn} {data.item.unit}</span></span>
                <span className="text-muted-foreground">Total Out: <span className="font-semibold text-foreground">{data.totals.totalOut} {data.item.unit}</span></span>
                <span className="text-muted-foreground">Closing Balance: <span className="font-semibold text-foreground">{data.totals.closingBalanceFromTransactions} {data.item.unit}</span></span>
                {!hasActiveFilters && (
                  <>
                    <span className="text-muted-foreground">Difference from Stock on Hand: <span className="font-semibold text-foreground">{data.stockDifference} {data.item.unit}</span></span>
                    <Badge variant={data.stockReconciled ? "default" : "destructive"} className="text-[11px] font-normal">
                      {data.stockReconciled ? "Reconciled with Stock on Hand" : "Differs from Stock on Hand"}
                    </Badge>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
