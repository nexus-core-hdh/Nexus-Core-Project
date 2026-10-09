"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, amountColorClass } from "@/lib/finance-erp/utils/format";
import { cn } from "@/lib/utils";
import type { StatementLine } from "@/lib/finance-erp/general-ledger/financial-statements";

export function StatementTable({ rows, showComparative, currentLabel = "Current Period", priorLabel = "Prior Period" }: {
  rows: StatementLine[];
  showComparative: boolean;
  currentLabel?: string;
  priorLabel?: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Line Item</TableHead>
          <TableHead className="text-right">{currentLabel}</TableHead>
          {showComparative && <TableHead className="text-right">{priorLabel}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i} className={cn(r.isTotal && "border-t-2 bg-muted/20")}>
            <TableCell className={cn(r.bold && "font-semibold")} style={r.indent ? { paddingLeft: `${r.indent * 24 + 16}px` } : undefined}>
              {r.label}
            </TableCell>
            <TableCell className={cn("text-right", r.bold && "font-semibold", amountColorClass(r.current))}>{formatAmount(r.current)}</TableCell>
            {showComparative && <TableCell className={cn("text-right", r.bold && "font-semibold", amountColorClass(r.prior))}>{formatAmount(r.prior)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
