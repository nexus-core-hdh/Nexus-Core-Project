"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Filter, MoreVertical } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { dashboardApi, type RecentTransaction, type RecentTransactionType } from "@/lib/nexuscore-api";
import { getReceiptTypeLabel } from "@/lib/legacy-erp/receipt-types";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import type { VariantProps } from "class-variance-authority";

// Real transactions only — GET /dashboard/recent-transactions (dashboard.service.ts), filtered by
// the selected tab server-side and limited to the latest few rows:
//   Sales → Finance Orders · Purchases → Purchase Orders · Payments → Customer/Supplier Payments
//   · Receipts → Financial Receipts + inventory receipts (Purchase, Subcontract, ...; the badge
//   names the receipt type, its tooltip the full type). Missing values render "—"; nothing is filled in.

const TYPE_LABEL: Record<RecentTransactionType, string> = {
  sale: "Sale",
  purchase: "Purchase",
  payment: "Payment",
  receipt: "Receipt"
};

// Inventory receipts name their own receipt type with the ERP's shared resolver — "Purchase
// Receipt", "Purchase Return", and for Subcontract rows "<Process> Send" / "<Process> Receive"
// (e.g. "Dyeing Send"), so an outbound Outside Process Sent never reads as goods received.
const typeLabel = (t: RecentTransaction) =>
  t.type === "receipt" && t.receiptType != null
    ? getReceiptTypeLabel(t.receiptType, t.subcontractType)
    : TYPE_LABEL[t.type];

const TYPE_STYLES: Record<RecentTransactionType, string> = {
  sale: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  purchase: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  payment: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  receipt: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400"
};

// The source records' own status values (Order/Payment status enums, Purchase Order approval
// status, Financial Receipt approval flag) onto the existing badge colours.
const STATUS_VARIANT: Record<string, VariantProps<typeof badgeVariants>["variant"]> = {
  Completed: "success",
  Delivered: "success",
  Paid: "success",
  Approved: "success",
  Pending: "warning",
  Processing: "warning",
  Unapproved: "warning",
  Shipped: "info",
  Failed: "destructive",
  Cancelled: "destructive",
  Rejected: "destructive"
};

const TABS = [
  { key: "All", type: "all", empty: "No recent transactions", viewAll: null },
  { key: "Sales", type: "sale", empty: "No recent sales", viewAll: "/dashboard/pages/orders" },
  { key: "Purchases", type: "purchase", empty: "No recent purchases", viewAll: "/dashboard/legacy-erp/purchase-orders-list" },
  { key: "Payments", type: "payment", empty: "No recent payments", viewAll: "/dashboard/payment" },
  { key: "Receipts", type: "receipt", empty: "No recent receipts", viewAll: "/dashboard/legacy-erp/financial-receipts" }
] as const satisfies readonly { key: string; type: RecentTransactionType | "all"; empty: string; viewAll: string | null }[];

type TabKey = (typeof TABS)[number]["key"];

// Existing record screens that open one document by id (same URLs their own list pages use).
// Sales Orders and Payments have no per-record view screen, so their rows have no action.
const viewHref = (t: RecentTransaction): string | null => {
  if (t.type === "purchase") return `/dashboard/legacy-erp/purchase-orders?id=${t.recordId}&mode=view`;
  // Inventory receipts (Purchase, Subcontract, ...) open the same screen their own lists open.
  if (t.type === "receipt" && t.receiptType != null) {
    return `/dashboard/legacy-erp/inventory-receipts?id=${t.recordId}&mode=view&receiptType=${t.receiptType}`;
  }
  if (t.type === "receipt") return `/dashboard/legacy-erp/financial-receipts?id=${t.recordId}&mode=view`;
  return null;
};

const formatAmount = (t: RecentTransaction) => {
  if (t.amount == null) return "—";
  const n = t.amount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Column is PKR; a record carrying another currency shows its own code rather than being relabelled.
  return t.currency && t.currency.toUpperCase() !== "PKR" ? `${t.currency} ${n}` : n;
};

export function RecentTransactionsTable() {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>("All");
  const [rows, setRows] = React.useState<RecentTransaction[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const current = TABS.find((t) => t.key === tab)!;

  React.useEffect(() => {
    let active = true;
    setRows(null);
    setFailed(false);
    dashboardApi
      .recentTransactions(current.type, 8)
      .then((data) => { if (active) setRows(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) { setFailed(true); setRows([]); } });
    return () => { active = false; };
  }, [current.type]);

  return (
    <Card className="py-4">
      <CardHeader className="flex-col items-start gap-3 px-4 @lg/card-header:flex-row @lg/card-header:items-center">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="bg-primary block h-4 w-1 rounded-full" />
          Recent Transactions
        </CardTitle>
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.key}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <CardAction className="flex items-center gap-1.5">
          {current.viewAll && (
            <Link href={current.viewAll} className="text-primary text-sm font-medium hover:underline">
              View all
            </Link>
          )}
          <Button variant="ghost" size="icon" className="size-8">
            <Filter className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Export</DropdownMenuItem>
              <DropdownMenuItem>Print</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="px-4">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount (PKR)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows === null ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length ? (
                rows.map((t) => {
                  const href = viewHref(t);
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <span
                          title={t.subtype ?? undefined}
                          className={cn(
                            "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                            TYPE_STYLES[t.type]
                          )}>
                          {typeLabel(t)}
                        </span>
                      </TableCell>
                      <TableCell className="text-primary font-medium">{t.reference || "—"}</TableCell>
                      <TableCell>{t.party || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.date ? format(new Date(t.date), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatAmount(t)}</TableCell>
                      <TableCell>
                        {t.status ? <Badge variant={STATUS_VARIANT[t.status] ?? "outline"}>{t.status}</Badge> : "—"}
                      </TableCell>
                      <TableCell>
                        {href ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-7">
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => navigateOrOpenTab(router, href)}>View</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <Button variant="ghost" size="icon" className="size-7" disabled title="No view screen for this record type">
                            <MoreVertical className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                    {failed ? "Transactions could not be loaded" : current.empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
