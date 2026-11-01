"use client";

// Create New's Source Receipt picker (invoice screen, new invoice only). The receipt type(s) come from
// the server's invoice-type -> receipt-type rule (invoice.service.ts sourceReceiptTypes): one type
// (every invoice type today) is selected automatically and shown as text; a Receipt Type dropdown
// appears only when an invoice type has more than one.
//
// Receipts: a checklist of that type's saved receipts with lines (company-scoped on the server),
// filtered by Current Account id — the invoice's, else the first ticked receipt's — so only one
// account's receipts can be combined. One receipt makes a single-receipt invoice; several make one
// consolidated invoice (the server re-checks type, account, company and one-invoice-per-receipt).
// A receipt already on an invoice can't be ticked; it offers to open that invoice instead.

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, ListChecks, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SourceReceiptRow = {
  id: number; receiptType?: number; receiptNo: string; receiptDate?: string | null; documentNo?: string | null;
  currentAccountId?: number | string | null; currentAccountCode?: string | null; currentAccountName?: string | null; isApproved?: number;
  lines?: number; grandTotal?: number; invoiceId?: number | null; invoiceNo?: string | null;
};
type SourceType = { receiptType: number; label: string };
type Api = {
  sourceReceiptTypes: () => Promise<any>;
  sourceReceipts: (sourceType: number, search?: string, paging?: { page: number; pageSize: number }, currentAccountId?: number | null) => Promise<any>;
};

const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.rows ?? []);
const dateOnly = (v: unknown) => (v ? String(v).slice(0, 10) : "");
const money = (v: number) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const accountOf = (r?: SourceReceiptRow | null) => Number(r?.currentAccountId) || null;
const box = "h-6 rounded-sm border border-input bg-background px-1.5 text-[12px] outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function SourceReceiptPicker({ api, accountId, accountName, selected, disabled, onAdd, onRemove, onOpenInvoice }: {
  api: Api;
  /** The invoice's Current Account (FI_Account id) — the list shows only its receipts. */
  accountId: number | null;
  accountName?: string;
  /** The receipts already on this new invoice (first = header source). */
  selected: SourceReceiptRow[];
  disabled?: boolean;
  onAdd: (rows: SourceReceiptRow[]) => void;
  onRemove: (id: number) => void;
  onOpenInvoice: (row: SourceReceiptRow) => void;
}) {
  const [types, setTypes] = useState<SourceType[] | null>(null);
  const [sourceType, setSourceType] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<SourceReceiptRow[]>([]);
  const [checked, setChecked] = useState<SourceReceiptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const reqRef = useRef(0);

  // The account the list is limited to: the invoice's, else the receipts already chosen / ticked.
  const filterAccount = accountId || accountOf(selected[0]) || accountOf(checked[0]);

  useEffect(() => {
    api.sourceReceiptTypes().then((t: SourceType[]) => {
      setTypes(t);
      if (t.length === 1) setSourceType(t[0].receiptType);
    }).catch((e: any) => setError(e.message || "Could not load the receipt types"));
  }, [api]);

  // Another Current Account: ticks of the previous one no longer apply.
  useEffect(() => {
    setChecked((c) => (accountId ? c.filter((r) => accountOf(r) === accountId) : c));
  }, [accountId]);

  useEffect(() => {
    if (!sourceType) return;
    const req = ++reqRef.current;
    setLoading(true);
    setError("");
    const t = setTimeout(() => {
      api.sourceReceipts(sourceType, term.trim() || undefined, { page: 1, pageSize: 200 }, filterAccount).then((r: any) => {
        if (req === reqRef.current) setRows(rowsOf(r) as SourceReceiptRow[]);
      }).catch((e: any) => req === reqRef.current && setError(e.message || "Could not load the receipts"))
        .finally(() => req === reqRef.current && setLoading(false));
    }, term ? 250 : 0);
    return () => clearTimeout(t);
  }, [api, sourceType, term, filterAccount]);

  const isSelected = (r: SourceReceiptRow) => selected.some((s) => s.id === r.id);
  const isChecked = (r: SourceReceiptRow) => checked.some((s) => s.id === r.id);
  const eligible = (r: SourceReceiptRow) => !r.invoiceId && !isSelected(r) && (!filterAccount || accountOf(r) === filterAccount);
  const shown = useMemo(() => rows.filter((r) => !isSelected(r)), [rows, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownEligible = shown.filter(eligible);
  const allChecked = shownEligible.length > 0 && shownEligible.every(isChecked);
  const anyEligible = shownEligible.length > 0;
  const toggle = (r: SourceReceiptRow) => setChecked((c) => (c.some((x) => x.id === r.id) ? c.filter((x) => x.id !== r.id) : [...c, r]));
  const toggleAll = () => setChecked((c) => (allChecked ? c.filter((x) => !shownEligible.some((s) => s.id === x.id)) : [...c, ...shownEligible.filter((s) => !c.some((x) => x.id === s.id))]));
  const checkedTotal = checked.reduce((a, r) => a + Number(r.grandTotal || 0), 0);
  const selectedTotal = selected.reduce((a, r) => a + Number(r.grandTotal || 0), 0);
  const add = () => { if (!checked.length) return; onAdd(checked); setChecked([]); setOpen(false); setTerm(""); };

  const typeLabel = (t: SourceType) => `${t.receiptType} - ${t.label}`;
  const current = types?.find((t) => t.receiptType === sourceType);
  const accountText = accountName || selected[0]?.currentAccountName || checked[0]?.currentAccountName || "";

  return (
    <fieldset data-testid="source-receipt" className="min-w-0 rounded-sm border border-primary/40 bg-primary/[0.03] px-3 pb-2 pt-0.5">
      <legend className="px-1 text-[11.5px] font-medium text-primary">Source Receipt</legend>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <label htmlFor="src-type" className="w-[90px] shrink-0 text-right text-[11.5px] text-foreground/80">Receipt Type</label>
          {types && types.length > 1 ? (
            <select id="src-type" data-testid="source-receipt-type-select" className={cn(box, "w-64")} value={sourceType ?? ""} disabled={disabled || selected.length > 0}
              onChange={(e) => { setSourceType(Number(e.target.value) || null); setTerm(""); setRows([]); setChecked([]); }}>
              <option value="">Select a receipt type...</option>
              {types.map((t) => <option key={t.receiptType} value={t.receiptType}>{typeLabel(t)}</option>)}
            </select>
          ) : (
            <span id="src-type" data-testid="source-receipt-type" className="text-[12px] font-medium">{current ? typeLabel(current) : "…"}</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="w-[60px] shrink-0 text-right text-[11.5px] text-foreground/80">Receipts</span>
          {selected.map((r) => (
            <span key={r.id} data-testid="source-receipt-chip" data-receipt-no={r.receiptNo} className="inline-flex h-6 items-center gap-1 rounded-sm border bg-background pl-1.5 font-mono text-[12px]">
              {r.receiptNo}
              {!disabled && (
                <button type="button" aria-label={`Remove ${r.receiptNo}`} className="flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-destructive" onClick={() => onRemove(r.id)}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {selected.length > 0 && (
            <span data-testid="source-receipt-summary" className="text-[11.5px] text-muted-foreground">
              {selected.length} receipt{selected.length === 1 ? "" : "s"}{selected.length > 1 ? " · one consolidated invoice" : ""} · {money(selectedTotal)}
            </span>
          )}
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11.5px]" data-testid="source-receipt-open" disabled={disabled || !sourceType}
            onClick={() => setOpen((o) => !o)}>
            <ListChecks className="mr-1 h-3.5 w-3.5" />{selected.length ? "Add Receipts" : "Select Receipts"}
          </Button>
        </div>
      </div>

      {open && sourceType && (
        <div data-testid="source-receipt-panel" className="mt-2 rounded-sm border bg-background">
          <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input data-testid="source-receipt-search" aria-label="Search receipts" autoComplete="off" className={cn(box, "w-72 pl-6")}
                placeholder="Search receipt no, document, account..." value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
            <span data-testid="source-receipt-account" className="text-[11.5px] text-muted-foreground">
              {filterAccount ? <>Current Account: <span className="font-medium text-foreground">{accountText || `#${filterAccount}`}</span></> : "All Current Accounts — ticking a receipt limits the list to its account"}
            </span>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-muted/60 text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="w-8 px-2 py-1"><input type="checkbox" data-testid="source-receipt-all" aria-label="Select all" checked={allChecked} disabled={!anyEligible} onChange={toggleAll} /></th>
                  <th className="px-2 py-1">Receipt No</th><th className="px-2 py-1">Date</th><th className="px-2 py-1">Current Account</th>
                  <th className="px-2 py-1">Document</th><th className="px-2 py-1 text-right">Lines</th><th className="px-2 py-1 text-right">Amount</th><th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} data-testid="source-receipt-row" data-receipt-no={r.receiptNo} className={cn("border-t", !eligible(r) && "text-muted-foreground")}>
                    <td className="px-2 py-1"><input type="checkbox" aria-label={`Select ${r.receiptNo}`} checked={isChecked(r)} disabled={!eligible(r)} onChange={() => toggle(r)} /></td>
                    <td className="px-2 py-1 font-mono">{r.receiptNo}</td>
                    <td className="px-2 py-1 tabular-nums">{dateOnly(r.receiptDate)}</td>
                    <td className="px-2 py-1">{r.currentAccountName || "—"}</td>
                    <td className="px-2 py-1">{r.documentNo || "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.lines ?? ""}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{money(Number(r.grandTotal || 0))}</td>
                    <td className="px-2 py-1 text-right">
                      {r.invoiceId ? (
                        <button type="button" data-testid="source-receipt-open-invoice" className="rounded-sm bg-amber-100 px-1.5 text-[11px] text-amber-900 hover:underline dark:bg-amber-900/40 dark:text-amber-100"
                          onClick={() => onOpenInvoice(r)}>Invoiced · {r.invoiceNo} (open)</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !shown.length && (
              <p data-testid="source-receipt-empty" className="flex items-center gap-1.5 px-2 py-3 text-[11.5px] text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                {term
                  ? <>No receipt matches &quot;{term}&quot;.</>
                  : <>No eligible {current?.label ?? "receipt"}s{filterAccount ? <> for {accountText || "this Current Account"}</> : null}. A receipt can be invoiced once it is saved with at least one line and is not on another invoice.</>}
              </p>
            )}
            {loading && !shown.length && <p className="px-2 py-3 text-[11.5px] text-muted-foreground">Loading...</p>}
          </div>
          <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
            <span data-testid="source-receipt-count" className="text-[11.5px]">{checked.length} selected{checked.length ? ` · ${money(checkedTotal)}` : ""}</span>
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11.5px]" data-testid="source-receipt-cancel" onClick={() => { setOpen(false); setChecked([]); setTerm(""); }}>Cancel</Button>
              <Button type="button" size="sm" className="h-6 px-2 text-[11.5px]" data-testid="source-receipt-add" disabled={!checked.length} onClick={add}>Add Selected</Button>
            </div>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-[11.5px] text-destructive">{error}</p>}
    </fieldset>
  );
}
