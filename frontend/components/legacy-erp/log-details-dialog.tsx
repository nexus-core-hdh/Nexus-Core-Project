"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { auditApi, type AuditLogRow } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { History } from "lucide-react";

// Generic F4 "Log Details" popup — the reusable Log Details Engine (Section 6/8 of the Audit
// framework spec): resolves ONE audit event into (A) Audit Information, (B) Document Snapshot
// (root + related child/variant sections, rendered generically from whatever top-level keys the
// writing service composed into oldValues/newValues — see audit.service.ts's own model comment),
// and (C) Change Information (old/new + changed fields for UPDATE, created values for INSERT,
// last known state for DELETE). NOT entity-specific — this same component renders Work Order,
// Purchase Order, Inventory Receipt (IMReceipt/IMReceiptItem/IMReceiptItemVariant), Requirements,
// or any future screen's audit event identically, with zero per-entity branching.

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  // ISO-date-looking strings render as local date/time, same convention as every list screen.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  }
  return s;
}

function ObjectFields({ obj }: { obj: Record<string, any> }) {
  const keys = Object.keys(obj).filter((k) => k !== "variants");
  if (!keys.length) return <p className="text-xs text-muted-foreground">No fields.</p>;
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {keys.map((k) => (
        <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dashed py-1 text-xs">
          <span className="shrink-0 text-muted-foreground">{k}</span>
          <span className="truncate text-right font-medium" title={formatValue(obj[k])}>{formatValue(obj[k])}</span>
        </div>
      ))}
    </div>
  );
}

function ArrayTable({ rows }: { rows: Record<string, any>[] }) {
  if (!rows.length) return <p className="text-xs text-muted-foreground">No rows.</p>;
  const colSet = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (k !== "variants") colSet.add(k);
  const cols = Array.from(colSet);
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr>{cols.map((c) => <th key={c} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {cols.map((c) => <td key={c} className="whitespace-nowrap px-2 py-1.5">{formatValue(r[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, value }: { title: string; value: any }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {value == null ? (
        <p className="text-xs text-muted-foreground">No data.</p>
      ) : Array.isArray(value) ? (
        <ArrayTable rows={value} />
      ) : typeof value === "object" ? (
        <ObjectFields obj={value} />
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
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">Field</th>
            <th className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">Old Value</th>
            <th className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">New Value</th>
          </tr>
        </thead>
        <tbody>
          {changed.map((k) => (
            <tr key={k} className="border-t">
              <td className="whitespace-nowrap px-2 py-1.5 font-medium">{k}</td>
              <td className="px-2 py-1.5 text-red-600 dark:text-red-400">{formatValue(before[k])}</td>
              <td className="px-2 py-1.5 text-emerald-600 dark:text-emerald-400">{formatValue(after[k])}</td>
            </tr>
          ))}
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
              {/* (A) Audit Information */}
              <div>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Audit Information</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border p-3 sm:grid-cols-3 lg:grid-cols-4">
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
