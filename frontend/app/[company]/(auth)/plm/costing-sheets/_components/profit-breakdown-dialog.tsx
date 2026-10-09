"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const fmt4 = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export type ProfitBreakdownRow = {
  rate: number;
  profit: number;
  salesPrice: number;
  pkrProfit: number;
  pkrSalesPrice: number;
  usdProfit: number;
  usdSalesPrice: number;
};

export function buildProfitBreakdown(netPrice: number, usdRate: number): ProfitBreakdownRow[] {
  const rate = usdRate || 1;
  return Array.from({ length: 20 }, (_, i) => {
    const r = (i + 1) * 5;
    const profit = netPrice * (r / 100);
    const salesPrice = netPrice + profit;
    return { rate: r, profit, salesPrice, pkrProfit: profit, pkrSalesPrice: salesPrice, usdProfit: profit / rate, usdSalesPrice: salesPrice / rate };
  });
}

export function ProfitBreakdownBody({
  netPrice,
  usdRate,
  selectedRate,
  onSelectRate,
}: {
  netPrice: number;
  usdRate: number;
  selectedRate: number;
  onSelectRate: (rate: number) => void;
}) {
  const rows = useMemo(() => buildProfitBreakdown(netPrice, usdRate), [netPrice, usdRate]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rate</TableHead>
          <TableHead className="text-right">Profit</TableHead>
          <TableHead className="text-right">Sales Price</TableHead>
          <TableHead className="text-right">PKR Profit</TableHead>
          <TableHead className="text-right">PKR Sales Price</TableHead>
          <TableHead className="text-right">Usdollar Profit</TableHead>
          <TableHead className="text-right">Usdollar Sales Price</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow
            key={r.rate}
            className={cn("cursor-pointer", r.rate === selectedRate && "bg-accent")}
            onClick={() => onSelectRate(r.rate)}
          >
            <TableCell className="font-medium">{r.rate}</TableCell>
            <TableCell className="text-right font-mono">{fmt4(r.profit)}</TableCell>
            <TableCell className="text-right font-mono">{fmt4(r.salesPrice)}</TableCell>
            <TableCell className="text-right font-mono">{fmt4(r.pkrProfit)}</TableCell>
            <TableCell className="text-right font-mono">{fmt4(r.pkrSalesPrice)}</TableCell>
            <TableCell className="text-right font-mono">{fmt4(r.usdProfit)}</TableCell>
            <TableCell className="text-right font-mono">{fmt4(r.usdSalesPrice)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ProfitBreakdownDialog({
  open,
  onOpenChange,
  netPrice,
  usdRate,
  onTransfer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  netPrice: number;
  usdRate: number;
  onTransfer: (profitPct: number) => void;
}) {
  const [pct, setPct] = useState(0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl sm:max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-2 border-b">
          <DialogTitle className="text-sm">Costing Profit Breakdowns</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto">
          <ProfitBreakdownBody netPrice={netPrice} usdRate={usdRate} selectedRate={pct} onSelectRate={setPct} />
        </div>

        <DialogFooter className="flex-row items-center justify-between px-4 py-2 border-t sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Profit%</span>
            <Input type="number" value={pct} onChange={(e) => setPct(parseFloat(e.target.value) || 0)} className="h-8 w-24 text-xs" />
          </div>
          <Button size="sm" onClick={() => { onTransfer(pct); onOpenChange(false); }}>Transfer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
