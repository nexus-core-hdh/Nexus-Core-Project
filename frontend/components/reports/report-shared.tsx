"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FieldLabel } from "@/components/forms/form-field";
import type { ReportFieldType, ReportFilterDef, ReportParams, ReportResult, ReportSourceField } from "@/lib/nexuscore-api";

export const OPERATOR_LABELS: Record<string, string> = {
  equals: "is", notEquals: "is not", contains: "contains", notContains: "does not contain", startsWith: "starts with",
  endsWith: "ends with", isEmpty: "is empty", isNotEmpty: "is not empty", eq: "=", neq: "≠", gt: ">", gte: "≥", lt: "<",
  lte: "≤", between: "between", on: "on", before: "before", after: "after", isTrue: "is Yes", isFalse: "is No",
};

/** Operators that take no value (mirrors the backend's VALUELESS_OPERATORS). */
export const VALUELESS_OPERATORS = new Set(["isEmpty", "isNotEmpty", "isTrue", "isFalse"]);

export function formatCell(value: unknown, type: ReportFieldType): string {
  if (value === null || value === undefined || value === "") return "";
  if (type === "date") {
    try {
      return format(parseISO(String(value)), "dd MMM yyyy");
    } catch {
      return String(value);
    }
  }
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "number" && typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(value);
}

const PAGE_SIZE = 100;

/** Report results: sticky header, totals row, client-side paging (runs return up to the row cap). */
export function ReportResultTable({ result, className }: { result: ReportResult; className?: string }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [result]);
  const pageCount = Math.max(1, Math.ceil(result.rows.length / PAGE_SIZE));
  const rows = useMemo(() => result.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [result.rows, page]);
  const hasTotals = result.columns.some((c) => c.total);

  if (result.rows.length === 0) {
    return (
      <Empty className="rounded-md border py-10">
        <EmptyHeader>
          <EmptyTitle>No records</EmptyTitle>
          <EmptyDescription>Nothing matches this report&apos;s filters.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {result.truncated && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          Only the first {result.rowCount.toLocaleString()} rows are shown. Add filters to narrow the report.
        </div>
      )}
      <div className="max-h-[calc(100vh-22rem)] min-h-40 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead className="w-12 text-right text-xs text-muted-foreground">#</TableHead>
              {result.columns.map((c) => (
                <TableHead key={c.key} className={cn("whitespace-nowrap text-xs", c.type === "number" && "text-right")}>{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={page * PAGE_SIZE + i}>
                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{page * PAGE_SIZE + i + 1}</TableCell>
                {result.columns.map((c) => (
                  <TableCell key={c.key} className={cn("whitespace-nowrap text-sm", c.type === "number" && "text-right tabular-nums")}>
                    {formatCell(row[c.key], c.type)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          {hasTotals && (
            <TableFooter className="sticky bottom-0 bg-muted">
              <TableRow>
                <TableCell className="text-xs font-semibold">Total</TableCell>
                {result.columns.map((c) => (
                  <TableCell key={c.key} className={cn("whitespace-nowrap text-sm font-semibold", c.type === "number" && "text-right tabular-nums")}>
                    {c.total ? formatCell(result.totals[c.key] ?? 0, "number") : ""}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, result.rows.length).toLocaleString()} of {result.rows.length.toLocaleString()}
          </span>
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** A value input matching a field's type ("yyyy-MM-dd" for dates, as the backend expects). */
export function FilterValueInput({ type, value, onChange, placeholder, className }: {
  type: ReportFieldType; value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  if (type === "date") return <DatePicker value={value} onValueChange={onChange} className={className} />;
  return (
    <Input
      type={type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "Value"}
      className={cn("h-9", className)}
    />
  );
}

/** Inputs for a report's "ask when running" filters. Blank answers mean "no restriction". */
export function PromptFiltersForm({ filters, fields, params, onChange }: {
  filters: ReportFilterDef[];
  fields: Map<string, ReportSourceField>;
  params: ReportParams;
  onChange: (next: ReportParams) => void;
}) {
  const prompts = filters.filter((f) => f.prompt && fields.has(f.field));
  if (!prompts.length) return null;
  const set = (id: string, patch: { value?: string; value2?: string }) => onChange({ ...params, [id]: { ...params[id], ...patch } });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {prompts.map((f) => {
        const field = fields.get(f.field)!;
        const label = `${field.label} ${OPERATOR_LABELS[f.operator] ?? f.operator}`;
        return (
          <div key={f.id} className="space-y-2">
            <FieldLabel>{label}</FieldLabel>
            {f.operator === "between" ? (
              <div className="flex items-center gap-2">
                <FilterValueInput type={field.type} value={params[f.id]?.value ?? ""} onChange={(v) => set(f.id, { value: v })} placeholder="From" />
                <span className="text-xs text-muted-foreground">and</span>
                <FilterValueInput type={field.type} value={params[f.id]?.value2 ?? ""} onChange={(v) => set(f.id, { value2: v })} placeholder="To" />
              </div>
            ) : (
              <FilterValueInput type={field.type} value={params[f.id]?.value ?? ""} onChange={(v) => set(f.id, { value: v })} placeholder="Any" />
            )}
          </div>
        );
      })}
    </div>
  );
}
