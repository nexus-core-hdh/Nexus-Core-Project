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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MasterAutocompleteField, type MasterOption } from "@/components/legacy-erp/master-autocomplete-field";
import { storedFileUrl } from "@/lib/stored-file";
import { legacyErpApi } from "@/lib/nexuscore-api";
import type { ReportFieldType, ReportFilterDef, ReportParams, ReportResult, ReportSection, ReportSourceField } from "@/lib/nexuscore-api";

export const OPERATOR_LABELS: Record<string, string> = {
  equals: "is", notEquals: "is not", contains: "contains", notContains: "does not contain", startsWith: "starts with",
  endsWith: "ends with", isEmpty: "is empty", isNotEmpty: "is not empty", eq: "=", neq: "≠", gt: ">", gte: "≥", lt: "<",
  lte: "≤", between: "between", in: "is one of", on: "on", before: "before", after: "after", isTrue: "is Yes", isFalse: "is No",
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

/** A filter value picked with a Legacy ERP master lookup (e.g. a Work Order): the value is the
 *  record's id, the box shows its code / name. `label` is the known display text for `value`. */
function LookupValueInput({ lookup, value, label, onChange, className }: {
  lookup: NonNullable<ReportSourceField["lookup"]>; value: string; label?: string; onChange: (v: string) => void; className?: string;
}) {
  const [display, setDisplay] = useState(label ?? "");
  useEffect(() => { if (label !== undefined) setDisplay(label); }, [label]);
  return (
    <div className={className}>
      <MasterAutocompleteField
        label="" compact masterKey={lookup.masterKey} lookupPath={lookup.lookupPath}
        displayValue={value ? display || `#${value}` : ""}
        fetchOptions={(t) => legacyErpApi.lookupTable(lookup.masterKey as Parameters<typeof legacyErpApi.lookupTable>[0], t) as Promise<MasterOption[]>}
        onSelect={(o) => { setDisplay(String(o.code || o.name)); onChange(String(o.id)); }}
        onClear={() => { setDisplay(""); onChange(""); }}
      />
    </div>
  );
}

/** Several records picked with a master lookup ("is one of"): the value is their ids, comma-separated;
 *  `label` the matching display texts, comma-separated. Each pick adds a chip; × removes it. */
function MultiLookupValueInput({ lookup, value, label, onChange, className }: {
  lookup: NonNullable<ReportSourceField["lookup"]>; value: string; label?: string; onChange: (v: string) => void; className?: string;
}) {
  const ids = value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [];
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    // Display texts that arrive with the value (e.g. from Print → … on a selection) — same order as the ids.
    if (!label) return;
    const parts = label.split(",").map((v) => v.trim());
    setNames((cur) => ({ ...Object.fromEntries(ids.map((id, i) => [id, parts[i] ?? ""]).filter(([, n]) => n)), ...cur }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);
  const [pickerKey, setPickerKey] = useState(0);
  return (
    <div className={cn("space-y-1.5", className)}>
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ids.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-xs">
              {names[id] || `#${id}`}
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${names[id] || id}`} onClick={() => onChange(ids.filter((x) => x !== id).join(","))}>×</button>
            </span>
          ))}
        </div>
      )}
      <MasterAutocompleteField
        key={pickerKey}
        label="" compact masterKey={lookup.masterKey} lookupPath={lookup.lookupPath}
        displayValue=""
        fetchOptions={(t) => legacyErpApi.lookupTable(lookup.masterKey as Parameters<typeof legacyErpApi.lookupTable>[0], t) as Promise<MasterOption[]>}
        onSelect={(o) => {
          const id = String(o.id);
          setNames((cur) => ({ ...cur, [id]: String(o.code || o.name) }));
          if (!ids.includes(id)) onChange([...ids, id].join(","));
          setPickerKey((k) => k + 1); // clear the box for the next pick
        }}
      />
    </div>
  );
}

/** A value input matching a field's type ("yyyy-MM-dd" for dates, as the backend expects). */
export function FilterValueInput({ type, value, onChange, placeholder, className, lookup, label, options }: {
  type: ReportFieldType; value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
  lookup?: ReportSourceField["lookup"]; label?: string; options?: ReportSourceField["options"];
}) {
  // A fixed set of choices (e.g. "Calculate Missing Requirements from BOM"): blank means the first one.
  if (options?.length) {
    return (
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className={cn("h-9 w-full", className)}><SelectValue placeholder={`${options[0].label} (default)`} /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (lookup?.multiple) return <MultiLookupValueInput lookup={lookup} value={value} label={label} onChange={onChange} className={className} />;
  if (lookup) return <LookupValueInput lookup={lookup} value={value} label={label} onChange={onChange} className={className} />;
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
export function PromptFiltersForm({ filters, fields, params, onChange, labels }: {
  filters: ReportFilterDef[];
  fields: Map<string, ReportSourceField>;
  params: ReportParams;
  onChange: (next: ReportParams) => void;
  /** Display text of values already filled in (lookup filters), keyed by filter id. */
  labels?: Record<string, string>;
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
              <FilterValueInput type={field.type} value={params[f.id]?.value ?? ""} onChange={(v) => set(f.id, { value: v })} placeholder="Any" lookup={field.lookup} label={labels?.[f.id]} options={field.options} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A document report's sections (e.g. the Work Order Order Form): label / value fields with the
 *  record's picture and stamps, then one bordered table per section with its total rows. */
export function ReportSections({ sections, className }: { sections: ReportSection[]; className?: string }) {
  type Col = ReportSection["columns"][number];
  // A cell's type / decimals / alignment — a header ("fields") row carries its own settings.
  const spec = (s: ReportSection, row: Record<string, unknown>, col: Col) => {
    const isField = (s.layout === "fields" || s.layout === "inline") && col.key === "value";
    const type = (isField ? (row.type as ReportFieldType) ?? "string" : col.type);
    const decimals = (isField ? row.decimals : col.decimals) as number | null | undefined;
    // Header field values read left like the rest of the header; table numbers default to the right.
    const align = ((isField ? row.align : col.align) as string | null | undefined) ?? (type === "number" && !isField ? "right" : "left");
    return { type, decimals, align };
  };
  const cell = (s: ReportSection, row: Record<string, unknown>, col: Col) => {
    const { type, decimals } = spec(s, row, col);
    const v = row[col.key];
    if (type === "number" && typeof v === "number" && decimals != null) return v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (type === "image") return ""; // drawn as a thumbnail by the table cell
    return formatCell(v, type);
  };
  const alignClass = (a: string) => (a === "right" ? "text-right tabular-nums" : a === "center" ? "text-center" : "text-left");
  // Configured width in characters; blank = automatic.
  const widthStyle = (c: Col) => (c.width ? { width: `${c.width}ch`, minWidth: `${c.width}ch` } : undefined);
  return (
    <div className={cn("space-y-5", className)}>
      {sections.map((s) => (
        <section key={s.key} className="space-y-1.5">
          {s.title && <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">{s.title}</h3>}
          {s.note && <p className="text-xs italic text-amber-700 dark:text-amber-400">{s.note}</p>}
          {s.layout === "inline" ? (
            // One line of label: value pairs (e.g. a Work Order's header above its table).
            <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-semibold">
              {s.rows.map((r) => (
                <span key={String(r.key ?? r.label)}>{String(r.label)}: <span className="font-normal">{cell(s, r, s.columns[1]) || "—"}</span></span>
              ))}
            </p>
          ) : s.layout === "signatures" ? (
            // Blank signing lines side by side, each with its caption.
            <div className="grid grid-cols-1 gap-8 pt-8 sm:grid-cols-3">
              {s.rows.map((r) => (
                <div key={String(r.key ?? r.label)} className="text-center">
                  <div className="border-t border-foreground/60" />
                  <p className="mt-1 text-xs text-muted-foreground">{String(r.label)}</p>
                </div>
              ))}
            </div>
          ) : s.layout === "fields" && !s.picture ? (
            // A header without a picture: two label / value pairs per row, across the width.
            <div className="grid grid-cols-1 overflow-hidden rounded-md border md:grid-cols-2">
              {s.rows.map((r) => (
                <div key={String(r.key ?? r.label)} className="flex border-b md:[&:nth-last-child(-n+2)]:border-b-0">
                  <span className="w-36 shrink-0 bg-muted/40 px-3 py-1.5 text-xs font-medium">{String(r.label)}</span>
                  <span className={cn("min-w-0 flex-1 px-3 py-1.5 text-sm", alignClass(spec(s, r, s.columns[1]).align))}>{cell(s, r, s.columns[1]) || <span className="text-muted-foreground">—</span>}</span>
                </div>
              ))}
            </div>
          ) : s.layout === "fields" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableBody>
                    {s.rows.map((r) => (
                      <TableRow key={String(r.label)}>
                        <TableCell className="w-48 py-1.5 text-xs font-medium text-primary">{String(r.label)}</TableCell>
                        <TableCell className={cn("py-1.5 text-sm", alignClass(spec(s, r, s.columns[1]).align))} style={widthStyle(s.columns[1])}>{cell(s, r, s.columns[1]) || <span className="text-muted-foreground">—</span>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border p-3">
                {s.imageUrl
                  ? <img src={storedFileUrl(s.imageUrl) ?? undefined} alt="Style picture" className="max-h-72 object-contain" />
                  : <p className="text-xs text-muted-foreground">No style picture</p>}
                {(s.badges ?? []).map((b) => (
                  <span key={b} className={cn("rotate-[-3deg] border-[3px] px-3 py-0.5 text-xl font-bold", b === "APPROVED" ? "border-red-600 text-red-600" : "border-muted-foreground text-muted-foreground")}>{b}</span>
                ))}
              </div>
            </div>
          ) : s.rows.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">{s.emptyText}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    {s.columns.map((c) => <TableHead key={c.key} style={widthStyle(c)} className={cn("text-xs", !c.width && "whitespace-nowrap", alignClass(c.align ?? (c.type === "number" ? "right" : "left")))}>{c.label}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.rows.map((r, i) => (
                    <TableRow key={i}>
                      {s.columns.map((c) => (
                        <TableCell key={c.key} style={widthStyle(c)} className={cn("py-1.5 text-sm", c.width && "whitespace-normal break-words", alignClass(spec(s, r, c).align))}>
                          {c.type === "image"
                            // A stored picture column (e.g. Style Picture): a thumbnail, blank without one.
                            ? (typeof r[c.key] === "string" && r[c.key]
                              ? <img src={storedFileUrl(r[c.key] as string) ?? undefined} alt={c.label} loading="lazy" className="mx-auto h-12 max-w-[5rem] object-contain" />
                              : null)
                            : cell(s, r, c)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
                {s.footerRows.length > 0 && (
                  <TableFooter className="bg-muted">
                    {s.footerRows.map((r, i) => (
                      <TableRow key={i}>
                        {s.columns.map((c) => (
                          <TableCell key={c.key} style={widthStyle(c)} className={cn("py-1.5 text-sm font-semibold", alignClass(spec(s, r, c).align))}>{cell(s, r, c)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableFooter>
                )}
              </Table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
