"use client";

import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { BarChart3 } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (n: any) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  accountId: number;
  mode: "monthly" | "forex-balance";
}

export function TotalsTab({ accountId, mode }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r: any = await legacyErpApi.accounts.totals(accountId);
        if (!cancelled) setRows(Array.isArray(r) ? r : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId]);

  if (loading) return <Skeleton className="h-40 w-full rounded-xl" />;

  if (rows.length === 0) {
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon"><BarChart3 /></EmptyMedia>
          <EmptyTitle>No balance data yet</EmptyTitle>
          <EmptyDescription>Balances are calculated automatically once transactions exist for this account.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (mode === "forex-balance") {
    return (
      <div className="rounded-xl border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
              <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Fiscal Year</TableHead>
              <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Forex</TableHead>
              <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Total Debit</TableHead>
              <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Total Credit</TableHead>
              <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const debit = MONTHS.reduce((s, _, i) => s + Number(r[`debit${String(i + 1).padStart(2, "0")}`] ?? 0), 0);
              const credit = MONTHS.reduce((s, _, i) => s + Number(r[`credit${String(i + 1).padStart(2, "0")}`] ?? 0), 0);
              return (
                <TableRow key={r.id}>
                  <TableCell className="py-3 font-medium">{r.fiscalYear}</TableCell>
                  <TableCell className="py-3"><Badge variant="outline">{r.forexId ?? "Local"}</Badge></TableCell>
                  <TableCell className="text-right font-mono py-3">{fmt(debit)}</TableCell>
                  <TableCell className="text-right font-mono py-3">{fmt(credit)}</TableCell>
                  <TableCell className="text-right font-mono py-3 font-medium">{fmt(debit - credit)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.id} className="rounded-xl border overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
            Fiscal Year {r.fiscalYear}
            <Badge variant="outline" className="font-normal normal-case tracking-normal">{r.forexId ?? "Local"}</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
                  <TableHead className="h-10"></TableHead>
                  {MONTHS.map((m) => <TableHead key={m} className="h-10 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{m}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium py-3">Debit</TableCell>
                  {MONTHS.map((_, i) => (
                    <TableCell key={i} className="text-right font-mono py-3">{fmt(r[`debit${String(i + 1).padStart(2, "0")}`])}</TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium py-3">Credit</TableCell>
                  {MONTHS.map((_, i) => (
                    <TableCell key={i} className="text-right font-mono py-3">{fmt(r[`credit${String(i + 1).padStart(2, "0")}`])}</TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}
