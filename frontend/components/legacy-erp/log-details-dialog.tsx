"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { auditApi, type AuditLogRow } from "@/lib/nexuscore-api";
import { formatFieldLabel } from "@/lib/format-field-label";
import { toast } from "sonner";
import { History } from "lucide-react";

// Generic F4 "Log Details" popup — the reusable Log Details Engine (Section 6/8 of the Audit
// framework spec): resolves ONE audit event into (A) Audit Summary, (B) Changed Fields (UPDATE
// only), and (C) Document Snapshot (root + related child/variant sections, rendered generically
// from whatever top-level keys the writing service composed into oldValues/newValues — see
// audit.service.ts's own model comment). NOT entity-specific — this same component renders Work
// Order, Purchase Order, Inventory Receipt, Requirements, or any future screen's audit event
// identically, with zero per-entity branching.
//
// FK DISPLAY REFS: a service that used audit.service.ts's own enrichDisplayRefs() replaces a raw
// foreign-key id with `{ id, code, name }` before writing the snapshot (see that file's own
// comment) — isDisplayRef()/DisplayRefValue below is the one generic place that shape is
// recognized and rendered as Code/Name instead of a raw id or a dumped object literal.

interface DisplayRefShape { id: number | string; code: string | null; name: string | null }

function isDisplayRef(v: unknown): v is DisplayRefShape {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const keys = Object.keys(v as object);
  return keys.length <= 3 && "id" in (v as object) && ("code" in (v as object) || "name" in (v as object));
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (isDisplayRef(v)) return v.name || v.code || `#${v.id}`;
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  // ISO-date-looking strings render as local date/time, same convention as every list screen.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  }
  return s;
}

// Compact "Code / Name" cell — used inline wherever a resolved FK ref appears, in both the
// field/value grid and the data grid, so a reader sees the business identity (Section 3's own
// requirement) instead of a bare database id, without a separate lookup or hardcoded mapping.
function DisplayRefValue({ ref }: { ref: DisplayRefShape }) {
  if (!ref.code && !ref.name) return <span className="text-muted-foreground">{`#${ref.id}`}</span>;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {ref.code && <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-medium">{ref.code}</span>}
      {ref.name && <span className="font-medium">{ref.name}</span>}
    </span>
  );
}

function ObjectFields({ obj }: { obj: Record<string, any> }) {
  const keys = Object.keys(obj).filter((k) => k !== "variants");
  if (!keys.length) return <p className="text-xs text-muted-foreground">No fields.</p>;
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {keys.map((k) => {
        const v = obj[k];
        const ref = isDisplayRef(v) ? v : null;
        return (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dashed py-1 text-xs">
            <span className="shrink-0 text-muted-foreground">{formatFieldLabel(k, !!ref)}</span>
            {ref ? <DisplayRefValue ref={ref} /> : (
              <span className="truncate text-right font-medium" title={formatValue(v)}>{formatValue(v)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ArrayTable({ rows }: { rows: Record<string, any>[] }) {
  if (!rows.length) return <p className="text-xs text-muted-foreground">No rows.</p>;
  const colSet = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (k !== "variants") colSet.add(k);
  const cols = Array.from(colSet);
  // A column is a display-ref column if ANY row resolved it to {id,code,name} — decided once per
  // column so the header label can drop its "...Id" suffix consistently down the whole column.
  const refCols = new Set(cols.filter((c) => rows.some((r) => isDisplayRef(r[c]))));
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>{cols.map((c) => (
            <th key={c} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground">{formatFieldLabel(c, refCols.has(c))}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t hover:bg-muted/30">
              {cols.map((c) => {
                const v = r[c];
                const ref = isDisplayRef(v) ? v : null;
                return (
                  <td key={c} className="whitespace-nowrap px-3 py-2">
                    {ref ? <DisplayRefValue ref={ref} /> : formatValue(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, value }: { title: string; value: any }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {value == null ? (
        <p className="text-xs text-muted-foreground">No data.</p>
      ) : Array.isArray(value) ? (
        <ArrayTable rows={value} />
      ) : typeof value === "object" ? (
        <div className="rounded-lg border p-3">
          <ObjectFields obj={value} />
        </div>
      ) : (
        <p className="text-xs">{formatValue(value)}</p>
      )}
    </div>
  );
}

function ChangedFields({ before, after }: { before: Record<string, any>; after: Record<string, any> }) {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter((k) => k !== "variants");
  const changed = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (!changed.length) return <p className="text-xs text-muted-foreground">No field-level changes recorded.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground">Field</th>
            <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground">Previous Value</th>
            <th className="whitespace-nowrap px-3 py-2 text-left font-semibold text-muted-foreground">New Value</th>
          </tr>
        </thead>
        <tbody>
          {changed.map((k) => {
            const isRef = isDisplayRef(before[k]) || isDisplayRef(after[k]);
            return (
              <tr key={k} className="border-t">
                <td className="whitespace-nowrap px-3 py-2 font-medium">{formatFieldLabel(k, isRef)}</td>
                <td className="px-3 py-2 text-red-600 dark:text-red-400">{formatValue(before[k])}</td>
                <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">{formatValue(after[k])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DocumentSnapshot({ before, after }: { before: any; after: any }) {
  const beforeObj = before && typeof before === "object" ? before : {};
  const afterObj = after && typeof after === "object" ? after : {};
  const sectionKeys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]));
  if (!sectionKeys.length) return <p className="text-xs text-muted-foreground">No snapshot data was captured for this event.</p>;

  // Changed Fields — only meaningful when a section exists as a plain (non-array) object on BOTH
  // sides, i.e. an UPDATE's root/header section. Array sections (detail lines/variants) are shown
  // in full under Before/After instead of a per-row diff, matching Section 8(C)'s "old/new +
  // changed fields" requirement without over-engineering a line-level diff.
  const diffableKey = sectionKeys.find(
    (k) => beforeObj[k] && afterObj[k] && typeof beforeObj[k] === "object" && !Array.isArray(beforeObj[k]) && typeof afterObj[k] === "object" && !Array.isArray(afterObj[k]),
  );

  return (
    <div className="space-y-5">
      {diffableKey && (
        <div className="space-y-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Changed Fields — {diffableKey}</h4>
          <ChangedFields before={beforeObj[diffableKey]} after={afterObj[diffableKey]} />
        </div>
      )}
      {Object.keys(afterObj).length > 0 && (
        <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
          <Badge variant="secondary" className="text-[10px] font-normal">Current / New State</Badge>
          {sectionKeys.filter((k) => afterObj[k] !== undefined).map((k) => <Section key={`after-${k}`} title={k} value={afterObj[k]} />)}
        </div>
      )}
      {Object.keys(beforeObj).length > 0 && (
        <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
          <Badge variant="outline" className="text-[10px] font-normal">Previous State</Badge>
          {sectionKeys.filter((k) => beforeObj[k] !== undefined).map((k) => <Section key={`before-${k}`} title={k} value={beforeObj[k]} />)}
        </div>
      )}
    </div>
  );
}

const ACTION_BADGE: Record<string, string> = {
  create: "bg-emerald-600 hover:bg-emerald-600/90 dark:bg-emerald-500",
  update: "bg-blue-600 hover:bg-blue-600/90 dark:bg-blue-500",
  delete: "bg-destructive hover:bg-destructive/90",
  restore: "bg-amber-600 hover:bg-amber-600/90 dark:bg-amber-500",
  approve: "bg-emerald-600 hover:bg-emerald-600/90 dark:bg-emerald-500",
  reject: "bg-destructive hover:bg-destructive/90",
};

export function LogDetailsDialog({ id, open, onOpenChange }: { id: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [row, setRow] = useState<AuditLogRow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !id) return;
    let cancelled = false;
    setLoading(true);
    auditApi.getById(id)
      .then((r) => { if (!cancelled) setRow(r); })
      .catch((e: any) => { if (!cancelled) toast.error(e.message || "Failed to load log details"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl" dismissOnEscape dismissOnOutside>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            Log Details
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading || !row ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* (A) Audit Summary */}
              <div>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Audit Summary</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border bg-muted/10 p-4 sm:grid-cols-3 lg:grid-cols-4">
                  <Field label="Action">
                    <Badge className={`text-[11px] font-normal ${ACTION_BADGE[row.action] ?? "bg-secondary text-secondary-foreground hover:bg-secondary/90"}`}>
                      {row.action}
                    </Badge>
                  </Field>
                  <Field label="Date / Time">{new Date(row.createdAt).toLocaleString()}</Field>
                  <Field label="User">{row.user?.name || row.user?.email || row.changedBy}</Field>
                  <Field label="Module">{row.moduleName || "—"}</Field>
                  <Field label="Menu / Screen">{row.menuTitle || "—"}</Field>
                  <Field label="Entity">{row.entityType}</Field>
                  <Field label="Record ID">{row.entityId}</Field>
                  <Field label="Document No">{row.documentNo || "—"}</Field>
                  <Field label="Parent Entity">{row.parentEntityType || "—"}</Field>
                  <Field label="Parent Document">{row.parentDocumentNo || "—"}</Field>
                  <Field label="Correlation ID">{row.correlationId || "—"}</Field>
                </div>
              </div>

              <Separator />

              {/* (B) Document Snapshot + (C) Change Information */}
              <div>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Document Snapshot</h4>
                <DocumentSnapshot before={row.oldValues} after={row.newValues} />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs font-medium">{children}</div>
    </div>
  );
}
