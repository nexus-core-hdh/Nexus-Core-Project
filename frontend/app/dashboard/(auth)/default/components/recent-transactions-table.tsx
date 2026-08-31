"use client";

import * as React from "react";
import Link from "next/link";
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
import { recentTransactions, type Transaction } from "./dashboard-data";
import type { VariantProps } from "class-variance-authority";

const TYPE_STYLES: Record<Transaction["type"], string> = {
  Sale: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  Purchase: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  Payment: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Receipt: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
};

const STATUS_VARIANT: Record<Transaction["status"], VariantProps<typeof badgeVariants>["variant"]> = {
  Completed: "success",
  Pending: "warning",
  Failed: "destructive"
};

const TABS = ["All", "Sales", "Purchases", "Payments", "Receipts"] as const;

export function RecentTransactionsTable() {
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("All");

  const rows = React.useMemo(() => {
    if (tab === "All") return recentTransactions;
    const typeMap: Record<string, Transaction["type"]> = {
      Sales: "Sale",
      Purchases: "Purchase",
      Payments: "Payment",
      Receipts: "Receipt"
    };
    return recentTransactions.filter((t) => t.type === typeMap[tab]);
  }, [tab]);

  return (
    <Card className="py-4">
      <CardHeader className="flex-col items-start gap-3 px-4 @lg/card-header:flex-row @lg/card-header:items-center">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="bg-primary block h-4 w-1 rounded-full" />
          Recent Transactions
        </CardTitle>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <CardAction className="flex items-center gap-1.5">
          <Link href="#" className="text-primary text-sm font-medium hover:underline">
            View all
          </Link>
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
              {rows.length ? (
                rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                          TYPE_STYLES[t.type]
                        )}>
                        {t.type}
                      </span>
                    </TableCell>
                    <TableCell className="text-primary font-medium">{t.reference}</TableCell>
                    <TableCell>{t.party}</TableCell>
                    <TableCell className="text-muted-foreground">{t.date}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {t.amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[t.status]}>{t.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>View details</DropdownMenuItem>
                          <DropdownMenuItem>Print</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                    No transactions.
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
