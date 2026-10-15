"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MasterAutocompleteField, type MasterOption } from "@/components/legacy-erp/master-autocomplete-field";
import { navigateOrOpenTab } from "@/lib/workspace/navigate";
import { legacyErpApi, type SerialCardFieldValues } from "@/lib/nexuscore-api";
import { printSerialCardLabels } from "@/components/legacy-erp/serial-card-labels";
import { toast } from "sonner";
import { Layers, RefreshCw, Save, List as ListIcon, Printer } from "lucide-react";

// Generate Serial Cards — the full ERP-density entry screen matching the legacy reference
// ("Options" header row, dense General section, an immediate editable roll grid after Produce,
// a fixed bottom action bar). Reuses the exact existing persistence layer end to end:
// serial-card.service.ts's produce()/update() (only widened to accept/persist the General
// section's own real IM_SerialCard columns as batch defaults — no new transaction/locking/audit
// logic), serial-card.controller.ts's existing routes, and legacyErpApi.serialCards' existing
// context/list/produce/update methods. The dedicated, permanent list screen
// (/dashboard/legacy-erp/serial-cards) is unchanged and reachable here via the real "List" button.
//
// Bottom action bar — only what's genuinely implemented is a real button; every other reference
// action (Assign to Qty, Batch Labeling, Form, Transfer) is rendered disabled with an
// honest "not yet implemented" tooltip rather than a fake no-op. Label prints one QR label
// (the card's full information in the QR) per generated roll, via the Serial Cards screen's printer.

interface Context {
  receiptItemId: number;
  receiptId: number;
  inventoryId: number;
  inventoryCode: string | null;
  inventoryName: string | null;
  accessCode: string | null;
  isFabric: boolean;
  quantity: number | null;
  grossQuantity: number | null;
  unitCode: string | null;
  unitName: string | null;
  workOrderId: number | null;
  workOrderNo: string | null;
  receiptNo: string | null;
  inventoryVariantId: number | null;
  variantCode: string | null;
  variantName: string | null;
  existingSerialCount: number;
  existingSerialQuantitySum: number;
}

interface RollRow extends SerialCardFieldValues {
  RecId: number;
  SerialCode: string;
  qualityTypeName?: string | null;
  resourceCode?: string | null;
  employeeName?: string | null;
  currentAccountCode?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptId: number | null;
  itemId: number | null;
  /** Fired right after a real, successful Produce — additive to this dialog staying open with
   *  the freshly-produced rows shown inline (see this file's own top comment); the caller can
   *  use this to refresh anything else it shows (e.g. a "has serial cards" indicator). */
  onProduced?: (receiptItemId: number) => void;
}

const num = (v: any) => (v === "" || v == null ? null : Number(v));
const fmtDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");

function Field({ label, value, span = 1 }: { label: string; value: string | number | null | undefined; span?: number }) {
  return (
    <div className={span === 2 ? "col-span-2" : span === 3 ? "col-span-3" : undefined}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium" title={value != null ? String(value) : undefined}>
        {value != null && value !== "" ? value : <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  );
}

// Small labeled autocomplete wrapper — keeps every header lookup field's label/spacing identical.
function LookupField({
  label, masterKey, displayValue, onSelect, onClear,
}: {
  label: string; masterKey: string; displayValue: string;
  onSelect: (o: MasterOption) => void; onClear: () => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <MasterAutocompleteField label="" masterKey={masterKey} displayValue={displayValue} onSelect={onSelect} onClear={onClear} compact />
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <Input type="number" className="h-7 text-xs" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// Paired number inputs under one label — matches the reference screen's own "Miktar II /
// 3.Miktar", "Raw Width / Raw Grams", "Width / Grams", "M2 / Mtul", "Pus / Fein" groupings.
function PairField({
  label, valueA, valueB, onA, onB,
}: {
  label: string; valueA: any; valueB: any; onA: (v: string) => void; onB: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <div className="flex gap-1">
        <Input type="number" className="h-7 text-xs" value={valueA ?? ""} onChange={(e) => onA(e.target.value)} />
        <Input type="number" className="h-7 text-xs" value={valueB ?? ""} onChange={(e) => onB(e.target.value)} />
      </div>
    </div>
  );
}

const emptyDefaults: SerialCardFieldValues & { qualityTypeName?: string; resourceCode?: string; employeeName?: string; currentAccountCode?: string } = {
  explanation: "", partyNo: "", qualityTypeId: null, resourceId: null, employeeId: null, currentAccountId: null,
  producerSerialCode: "", manufacturingDate: "", expirationDate: "", shelfLife: null,
  quantity: null, quantityMT: null, quantity3: null,
  width: null, weight: null, rawWidth: null, rawWeight: null, rawLength: null, productLength: null,
  weightM2: null, weightMt: null, pus: null, fine: null, pieceCount: null,
};

export function GenerateSerialCardsDialog({ open, onOpenChange, receiptId, itemId, onProduced }: Props) {
  const router = useRouter();
  const [context, setContext] = useState<Context | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [serialNo, setSerialNo] = useState("");
  const [serialCount, setSerialCount] = useState("");
  const [defaults, setDefaults] = useState(emptyDefaults);
  const [producing, setProducing] = useState(false);

  // The editable grid holds ONLY the cards produced while this dialog is open (`sessionIds`, from
  // each Produce response) — opening it is a fresh generation form. Cards produced earlier for the
  // line are shown only on request ("Show Earlier Cards"), read-only, in their own section; they
  // are edited on the Serial Cards screen (List), so nothing here can re-save them by accident.
  const [sessionIds, setSessionIds] = useState<number[]>([]);
  const [rows, setRows] = useState<RollRow[]>([]);
  const [showEarlier, setShowEarlier] = useState(false);
  const [earlierRows, setEarlierRows] = useState<RollRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [edits, setEdits] = useState<Record<number, Partial<RollRow>>>({});
  const [updating, setUpdating] = useState(false);

  const loadContext = async () => {
    if (!receiptId || !itemId) return;
    setLoadingContext(true);
    try {
      const ctx: any = await legacyErpApi.serialCards.context(receiptId, itemId);
      setContext(ctx);
    } catch (e: any) {
      toast.error(e.message || "Failed to load Generate Serial Cards");
    } finally {
      setLoadingContext(false);
    }
  };

  // Re-reads the line's cards (with their display joins) and splits them into this session's
  // editable rows and — only when asked for — the earlier, read-only ones. Unsaved edits on
  // session rows are kept unless `resetEdits` (after a successful Update).
  const loadRows = async (ids: number[] = sessionIds, earlier: boolean = showEarlier, resetEdits = false) => {
    if (!receiptId || !itemId) return;
    if (!ids.length && !earlier) {
      setRows([]);
      setEarlierRows([]);
      return;
    }
    setLoadingRows(true);
    try {
      const list: any = await legacyErpApi.serialCards.list(receiptId, itemId);
      const all: RollRow[] = Array.isArray(list) ? list : [];
      const mine = new Set(ids);
      setRows(all.filter((r) => mine.has(Number(r.RecId))));
      setEarlierRows(earlier ? all.filter((r) => !mine.has(Number(r.RecId))) : []);
      if (resetEdits) setEdits({});
    } catch (e: any) {
      toast.error(e.message || "Failed to load Serial Cards");
    } finally {
      setLoadingRows(false);
    }
  };

  // Every open starts a fresh generation session — no earlier cards are loaded into the grid.
  useEffect(() => {
    if (!open) return;
    setSerialNo("");
    setSerialCount("");
    setDefaults(emptyDefaults);
    setSessionIds([]);
    setRows([]);
    setShowEarlier(false);
    setEarlierRows([]);
    setEdits({});
    void loadContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, receiptId, itemId]);

  const toggleEarlier = () => {
    const next = !showEarlier;
    setShowEarlier(next);
    void loadRows(sessionIds, next);
  };

  const setDefault = (patch: Partial<typeof defaults>) => setDefaults((prev) => ({ ...prev, ...patch }));

  const produce = async () => {
    if (!receiptId || !itemId) return;
    const count = Number(serialCount);
    if (!Number.isInteger(count) || count <= 0) {
      toast.error("Serials Count must be a positive integer.");
      return;
    }
    setProducing(true);
    try {
      const created: any = await legacyErpApi.serialCards.produce(receiptId, itemId, {
        count, serialNo: serialNo.trim() || null,
        explanation: defaults.explanation || null, partyNo: defaults.partyNo || null,
        qualityTypeId: defaults.qualityTypeId, resourceId: defaults.resourceId, employeeId: defaults.employeeId,
        currentAccountId: defaults.currentAccountId,
        producerSerialCode: defaults.producerSerialCode || null,
        manufacturingDate: defaults.manufacturingDate || null, expirationDate: defaults.expirationDate || null,
        shelfLife: num(defaults.shelfLife),
        quantity: num(defaults.quantity), quantityMT: num(defaults.quantityMT), quantity3: num(defaults.quantity3),
        width: num(defaults.width), weight: num(defaults.weight),
        rawWidth: num(defaults.rawWidth), rawWeight: num(defaults.rawWeight),
        rawLength: num(defaults.rawLength), productLength: num(defaults.productLength),
        weightM2: num(defaults.weightM2), weightMt: num(defaults.weightMt),
        pus: num(defaults.pus), fine: num(defaults.fine), pieceCount: num(defaults.pieceCount),
      });
      toast.success(`${count} serial card${count === 1 ? "" : "s"} generated.`);
      setSerialCount("");
      setSerialNo("");
      // This batch joins the session's editable rows; earlier cards stay out of the grid.
      const newIds = (Array.isArray(created) ? created : []).map((c: any) => Number(c.RecId)).filter(Number.isFinite);
      const nextIds = [...sessionIds, ...newIds.filter((id: number) => !sessionIds.includes(id))];
      setSessionIds(nextIds);
      await Promise.all([loadContext(), loadRows(nextIds, showEarlier)]);
      onProduced?.(itemId);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate serial cards");
    } finally {
      setProducing(false);
    }
  };

  // Edits are keyed by SerialCardFieldValues' lowercase names (e.g. "width"), but the base rows
  // come straight from the list() API using the real DB column's PascalCase alias (e.g. "Width")
  // — see the table cells below, which already read `(row as any).Width`. An edit always wins;
  // absent one, this falls back to the row's PascalCase field (capitalize-first-letter maps every
  // field 1:1 — quantityMT -> QuantityMT, weightM2 -> WeightM2, ...), never the never-populated
  // lowercase property on the raw API row, which would otherwise look like "no value" and null
  // the field out on the next Update.
  const pascalKey = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);
  const rowValue = (row: RollRow, key: keyof RollRow) => {
    const edited = edits[row.RecId]?.[key];
    if (edited !== undefined) return edited;
    const own = row[key];
    if (own !== undefined) return own;
    return (row as any)[pascalKey(key as string)];
  };
  const setRowValue = (id: number, patch: Partial<RollRow>) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const dirtyIds = useMemo(() => Object.keys(edits).map(Number), [edits]);

  const totalQuantity = useMemo(
    () => rows.reduce((s, r) => s + Number(rowValue(r, "quantity") ?? (r as any).Quantity ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, edits],
  );

  const update = async () => {
    if (!receiptId || !itemId || !dirtyIds.length) return;
    setUpdating(true);
    try {
      // Edits are keyed by the SAME lowercase field names as the base API row's own aliases
      // (rowValue/setRowValue below), so an edited value must win over the row's un-edited
      // field — never the reverse, or every field the user didn't touch this click would look
      // "edited" and every field they DID touch would silently revert to its pre-edit value.
      const items = dirtyIds.map((id) => {
        const row = rows.find((r) => r.RecId === id)!;
        const v = (key: keyof RollRow) => rowValue(row, key);
        return {
          id,
          explanation: (v("explanation" as any) as any) ?? null,
          partyNo: (v("partyNo" as any) as any) ?? null,
          qualityTypeId: (v("qualityTypeId" as any) as any) ?? null,
          resourceId: (v("resourceId" as any) as any) ?? null,
          employeeId: (v("employeeId" as any) as any) ?? null,
          currentAccountId: (v("currentAccountId" as any) as any) ?? null,
          producerSerialCode: (v("producerSerialCode" as any) as any) ?? null,
          manufacturingDate: (v("manufacturingDate" as any) as any) ?? null,
          // Not editable in this grid, but update() writes every field — sent so it isn't blanked.
          expirationDate: (v("expirationDate" as any) as any) ?? null,
          shelfLife: num(v("shelfLife" as any)),
          quantity: num(v("quantity" as any)),
          quantityMT: num(v("quantityMT" as any)),
          quantity3: num(v("quantity3" as any)),
          width: num(v("width" as any)),
          weight: num(v("weight" as any)),
          rawWidth: num(v("rawWidth" as any)),
          rawWeight: num(v("rawWeight" as any)),
          rawLength: num(v("rawLength" as any)),
          productLength: num(v("productLength" as any)),
          weightM2: num(v("weightM2" as any)),
          weightMt: num(v("weightMt" as any)),
          pus: num(v("pus" as any)),
          fine: num(v("fine" as any)),
          pieceCount: num(v("pieceCount" as any)),
        };
      });
      await legacyErpApi.serialCards.update(receiptId, itemId, items);
      toast.success("Serial cards updated.");
      await Promise.all([loadContext(), loadRows(sessionIds, showEarlier, true)]);
    } catch (e: any) {
      toast.error(e.message || "Failed to update serial cards");
    } finally {
      setUpdating(false);
    }
  };

  const openList = () => {
    if (!receiptId || !itemId) return;
    navigateOrOpenTab(router, `/dashboard/legacy-erp/serial-cards?receiptItemId=${itemId}&receiptId=${receiptId}`);
  };

  const numInputCls = "h-7 w-20 text-right text-xs";
  const textInputCls = "h-7 w-28 text-xs";
  const disabledActionProps = { disabled: true, title: "Not yet implemented — this reference action has no backend workflow in this app yet." };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(94vh,940px)] w-[min(98vw,1760px)] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-2">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Layers className="h-4 w-4 text-primary" />
            Generate Serial Cards
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* General — Serial No/Count/Explanation, real read-only source context, and every
              real IM_SerialCard field as a batch DEFAULT for the cards about to be produced. */}
          <div className="border-b border-border p-3">
            {loadingContext ? (
              <div className="grid grid-cols-6 gap-3">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : context ? (
              <div className="grid grid-cols-3 gap-x-4 gap-y-2.5 sm:grid-cols-4 lg:grid-cols-8">
                <div className="space-y-1 lg:col-span-2">
                  <label className="text-[11px] text-muted-foreground">Serial No</label>
                  <Input
                    className="h-7 text-xs" placeholder="Empty for auto-generated · or a template like AF####"
                    value={serialNo} onChange={(e) => setSerialNo(e.target.value)}
                  />
                </div>
                <NumField label="Serials Count" value={serialCount} onChange={setSerialCount} />
                <div className="space-y-1 lg:col-span-3">
                  <label className="text-[11px] text-muted-foreground">Serial Explanation</label>
                  <Input className="h-7 text-xs" value={defaults.explanation ?? ""} onChange={(e) => setDefault({ explanation: e.target.value })} />
                </div>
                <div className="flex items-end lg:col-span-2">
                  <Button size="sm" onClick={produce} disabled={producing || !context.isFabric} className="h-7">
                    {producing ? "Producing..." : "Produce"}
                  </Button>
                </div>

                <Field label="Inventory Code" value={context.inventoryCode} />
                <Field label="Inventory Name" value={context.inventoryName} span={3} />
                <Field label="Variant Code" value={context.variantCode} />
                <Field label="Variant Name" value={context.variantName} span={2} />
                <Field label="Order No" value={context.workOrderNo} />

                <LookupField
                  label="Quality Type" masterKey="quality-type" displayValue={defaults.qualityTypeName ?? ""}
                  onSelect={(o) => setDefault({ qualityTypeId: Number(o.id), qualityTypeName: o.name } as any)}
                  onClear={() => setDefault({ qualityTypeId: null, qualityTypeName: "" } as any)}
                />
                <LookupField
                  label="Resource" masterKey="resource" displayValue={(defaults as any).resourceCode ?? ""}
                  onSelect={(o) => setDefault({ resourceId: Number(o.id), resourceCode: o.code ?? o.name } as any)}
                  onClear={() => setDefault({ resourceId: null, resourceCode: "" } as any)}
                />
                <LookupField
                  label="Employee" masterKey="employee" displayValue={(defaults as any).employeeName ?? ""}
                  onSelect={(o) => setDefault({ employeeId: Number(o.id), employeeName: o.name } as any)}
                  onClear={() => setDefault({ employeeId: null, employeeName: "" } as any)}
                />
                <LookupField
                  label="Man. C/A Code" masterKey="current-account" displayValue={(defaults as any).currentAccountCode ?? ""}
                  onSelect={(o) => setDefault({ currentAccountId: Number(o.id), currentAccountCode: o.code ?? o.name } as any)}
                  onClear={() => setDefault({ currentAccountId: null, currentAccountCode: "" } as any)}
                />
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Manufacturer Serial</label>
                  <Input className="h-7 text-xs" value={defaults.producerSerialCode ?? ""} onChange={(e) => setDefault({ producerSerialCode: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Party No</label>
                  <Input className="h-7 text-xs" value={defaults.partyNo ?? ""} onChange={(e) => setDefault({ partyNo: e.target.value })} />
                </div>
                <NumField label="Shelf Life" value={defaults.shelfLife} onChange={(v) => setDefault({ shelfLife: v as any })} />

                <NumField label="Quantity" value={defaults.quantity} onChange={(v) => setDefault({ quantity: v as any })} />
                <PairField
                  label="Miktar II / 3.Miktar" valueA={defaults.quantityMT} valueB={defaults.quantity3}
                  onA={(v) => setDefault({ quantityMT: v as any })} onB={(v) => setDefault({ quantity3: v as any })}
                />
                <PairField
                  label="Raw Width / Raw Grams" valueA={defaults.rawWidth} valueB={defaults.rawWeight}
                  onA={(v) => setDefault({ rawWidth: v as any })} onB={(v) => setDefault({ rawWeight: v as any })}
                />
                <PairField
                  label="Raw Length / Product Len" valueA={defaults.rawLength} valueB={defaults.productLength}
                  onA={(v) => setDefault({ rawLength: v as any })} onB={(v) => setDefault({ productLength: v as any })}
                />
                <PairField
                  label="Width / Grams" valueA={defaults.width} valueB={defaults.weight}
                  onA={(v) => setDefault({ width: v as any })} onB={(v) => setDefault({ weight: v as any })}
                />
                <PairField
                  label="M2 / Mtul" valueA={defaults.weightM2} valueB={defaults.weightMt}
                  onA={(v) => setDefault({ weightM2: v as any })} onB={(v) => setDefault({ weightMt: v as any })}
                />
                <PairField
                  label="Pus / Fein" valueA={defaults.pus} valueB={defaults.fine}
                  onA={(v) => setDefault({ pus: v as any })} onB={(v) => setDefault({ fine: v as any })}
                />
                <NumField label="Piece Count" value={defaults.pieceCount} onChange={(v) => setDefault({ pieceCount: v as any })} />

                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Product Date</label>
                  <Input type="date" className="h-7 text-xs" value={fmtDate(defaults.manufacturingDate)} onChange={(e) => setDefault({ manufacturingDate: e.target.value || "" })} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Expiration Date</label>
                  <Input type="date" className="h-7 text-xs" value={fmtDate(defaults.expirationDate)} onChange={(e) => setDefault({ expirationDate: e.target.value || "" })} />
                </div>

                <Field label="Receipt No" value={context.receiptNo} />
                <Field label="Receipt Quantity" value={context.quantity != null ? context.quantity.toLocaleString() : null} />
                <Field label="Already Generated" value={`${context.existingSerialCount} card${context.existingSerialCount === 1 ? "" : "s"} · ${context.existingSerialQuantitySum.toLocaleString()} ${context.unitCode || ""}`} />
                {!context.isFabric && (
                  <div className="col-span-3 flex items-end text-xs text-destructive">This line is not a Fabric item — Generate Serial Cards is unavailable.</div>
                )}
              </div>
            ) : null}
          </div>

          {/* Generated in this session — real, persisted IM_SerialCard rows produced while this
              dialog is open, editable in place (Update saves the edited ones). */}
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              Generated in this session — Total Quantity: {totalQuantity.toLocaleString()}
              {dirtyIds.length > 0 && <span className="ml-2 normal-case font-normal text-amber-700 dark:text-amber-400">{dirtyIds.length} unsaved edit{dirtyIds.length === 1 ? "" : "s"} — click Update to save</span>}
            </p>
            <div className="flex items-center gap-2">
              {rows.length > 0 && <Badge variant="secondary" className="h-5 text-[11px] font-normal">{rows.length}</Badge>}
              <Button
                variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={toggleEarlier} disabled={loadingRows}
                title="Show the cards produced for this receipt line before this session (read-only here — edit them in Serial Cards via List)"
              >
                {showEarlier ? "Hide Earlier Cards" : `Show Earlier Cards${(context?.existingSerialCount ?? 0) - rows.length > 0 ? ` (${(context?.existingSerialCount ?? 0) - rows.length})` : ""}`}
              </Button>
              <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => loadRows()} title="Refresh" disabled={loadingRows}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loadingRows && !rows.length ? (
              <div className="space-y-1.5 p-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
                <p className="text-[13px] font-medium">No serial cards generated in this session.</p>
                <p className="text-[11px] text-muted-foreground">
                  Enter a Serials Count above and click Produce — you can produce as many batches as needed.
                  {(context?.existingSerialCount ?? 0) > 0 && ` ${context?.existingSerialCount} card${context?.existingSerialCount === 1 ? " was" : "s were"} generated earlier (Show Earlier Cards or List).`}
                </p>
              </div>
            ) : (
              <Table className="min-w-[1900px]">
                <TableHeader>
                  <TableRow className="bg-slate-700 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800 [&>th]:text-white [&>th]:border-r [&>th:last-child]:border-r-0">
                    {[
                      "Serial No", "Explanation", "Party No", "Quality Type", "Resource", "Employee", "Man. C/A", "Manufacturer Serial",
                      "Product Date", "Quantity", "Miktar II", "3.Miktar", "Width", "GSM", "Raw Width", "Raw Weight", "Raw Length", "Product Length",
                      "M2", "Mtul", "Pus", "Fine", "Piece Count",
                    ].map((h) => (
                      <TableHead key={h} className="h-7 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-white">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="[&>tr>td]:border-r [&>tr>td:last-child]:border-r-0">
                  {rows.map((row) => {
                    const dirty = !!edits[row.RecId];
                    return (
                      <TableRow key={row.RecId} className={dirty ? "bg-selected/40" : undefined}>
                        <TableCell className="whitespace-nowrap py-1 text-xs">
                          <span className="font-mono">{row.SerialCode}</span>
                          <Badge variant="outline" className="ml-1.5 h-4 border-emerald-600/40 px-1 text-[9px] font-medium uppercase text-emerald-700 dark:text-emerald-400">New</Badge>
                          {dirty && <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400" title="Edited — not saved until Update">● edited</span>}
                        </TableCell>
                        <TableCell className="py-1"><Input className={textInputCls} value={String((rowValue(row, "explanation" as any) as any) ?? (row as any).Explanation ?? "")} onChange={(e) => setRowValue(row.RecId, { explanation: e.target.value } as any)} /></TableCell>
                        <TableCell className="py-1"><Input className={textInputCls} value={String((rowValue(row, "partyNo" as any) as any) ?? (row as any).PartyNo ?? "")} onChange={(e) => setRowValue(row.RecId, { partyNo: e.target.value } as any)} /></TableCell>
                        <TableCell className="py-1">
                          <MasterAutocompleteField
                            compact label="" masterKey="quality-type"
                            displayValue={(row as any).qualityTypeName ?? ""}
                            onSelect={(o) => setRowValue(row.RecId, { qualityTypeId: Number(o.id), qualityTypeName: o.name } as any)}
                            onClear={() => setRowValue(row.RecId, { qualityTypeId: null, qualityTypeName: null } as any)}
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <MasterAutocompleteField
                            compact label="" masterKey="resource"
                            displayValue={(row as any).resourceCode ?? ""}
                            onSelect={(o) => setRowValue(row.RecId, { resourceId: Number(o.id), resourceCode: o.code ?? o.name } as any)}
                            onClear={() => setRowValue(row.RecId, { resourceId: null, resourceCode: null } as any)}
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <MasterAutocompleteField
                            compact label="" masterKey="employee"
                            displayValue={(row as any).employeeName ?? ""}
                            onSelect={(o) => setRowValue(row.RecId, { employeeId: Number(o.id), employeeName: o.name } as any)}
                            onClear={() => setRowValue(row.RecId, { employeeId: null, employeeName: null } as any)}
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <MasterAutocompleteField
                            compact label="" masterKey="current-account"
                            displayValue={(row as any).currentAccountCode ?? ""}
                            onSelect={(o) => setRowValue(row.RecId, { currentAccountId: Number(o.id), currentAccountCode: o.code ?? o.name } as any)}
                            onClear={() => setRowValue(row.RecId, { currentAccountId: null, currentAccountCode: null } as any)}
                          />
                        </TableCell>
                        <TableCell className="py-1"><Input className={textInputCls} value={String((rowValue(row, "producerSerialCode" as any) as any) ?? (row as any).ProducerSerialCode ?? "")} onChange={(e) => setRowValue(row.RecId, { producerSerialCode: e.target.value } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="date" className="h-7 w-32 text-xs" value={fmtDate((rowValue(row, "manufacturingDate" as any) as any) ?? (row as any).ManufacturingDate)} onChange={(e) => setRowValue(row.RecId, { manufacturingDate: e.target.value || null } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "quantity" as any) as any) ?? (row as any).Quantity ?? ""} onChange={(e) => setRowValue(row.RecId, { quantity: e.target.value as any } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "quantityMT" as any) as any) ?? (row as any).QuantityMT ?? ""} onChange={(e) => setRowValue(row.RecId, { quantityMT: e.target.value as any } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "quantity3" as any) as any) ?? (row as any).Quantity3 ?? ""} onChange={(e) => setRowValue(row.RecId, { quantity3: e.target.value as any } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "width" as any) as any) ?? (row as any).Width ?? ""} onChange={(e) => setRowValue(row.RecId, { width: e.target.value as any } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "weight" as any) as any) ?? (row as any).Weight ?? ""} onChange={(e) => setRowValue(row.RecId, { weight: e.target.value as any } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "rawWidth" as any) as any) ?? (row as any).RawWidth ?? ""} onChange={(e) => setRowValue(row.RecId, { rawWidth: e.target.value as any } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "rawWeight" as any) as any) ?? (row as any).RawWeight ?? ""} onChange={(e) => setRowValue(row.RecId, { rawWeight: e.target.value as any } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "rawLength" as any) as any) ?? (row as any).RawLength ?? ""} onChange={(e) => setRowValue(row.RecId, { rawLength: e.target.value as any } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "productLength" as any) as any) ?? (row as any).ProductLength ?? ""} onChange={(e) => setRowValue(row.RecId, { productLength: e.target.value as any } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "weightM2" as any) as any) ?? (row as any).WeightM2 ?? ""} onChange={(e) => setRowValue(row.RecId, { weightM2: e.target.value as any } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "weightMt" as any) as any) ?? (row as any).WeightMt ?? ""} onChange={(e) => setRowValue(row.RecId, { weightMt: e.target.value as any } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "pus" as any) as any) ?? (row as any).Pus ?? ""} onChange={(e) => setRowValue(row.RecId, { pus: e.target.value as any } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "fine" as any) as any) ?? (row as any).Fine ?? ""} onChange={(e) => setRowValue(row.RecId, { fine: e.target.value as any } as any)} /></TableCell>
                        <TableCell className="py-1"><Input type="number" className={numInputCls} value={(rowValue(row, "pieceCount" as any) as any) ?? (row as any).PieceCount ?? ""} onChange={(e) => setRowValue(row.RecId, { pieceCount: e.target.value as any } as any)} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Earlier cards — only on request, read-only, visually separate from this session's rows. */}
          {showEarlier && (
            <div className="border-t border-border bg-muted/30">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                Generated earlier — {earlierRows.length} card{earlierRows.length === 1 ? "" : "s"}
                <span className="ml-1.5 font-normal normal-case">(read-only here — open List to view, edit or print them)</span>
              </p>
              {earlierRows.length === 0 ? (
                <p className="px-3 pb-3 text-[11px] text-muted-foreground">{loadingRows ? "Loading…" : "No cards were generated for this line before this session."}</p>
              ) : (
                <div className="overflow-x-auto px-3 pb-3">
                  <table className="w-full text-xs text-muted-foreground">
                    <thead>
                      <tr className="border-b border-border text-left">
                        {["Serial No", "Party No", "Quality Type", "Man. C/A", "Product Date", "Quantity", "Width", "GSM", "Piece Count"].map((h) => (
                          <th key={h} className="whitespace-nowrap py-1 pr-4 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {earlierRows.map((r: any) => (
                        <tr key={r.RecId} className="border-b border-border/50 last:border-0">
                          <td className="py-1 pr-4 font-mono">{r.SerialCode}</td>
                          <td className="py-1 pr-4">{r.PartyNo || "—"}</td>
                          <td className="py-1 pr-4">{r.qualityTypeName || "—"}</td>
                          <td className="py-1 pr-4">{r.currentAccountCode || "—"}</td>
                          <td className="py-1 pr-4">{fmtDate(r.ManufacturingDate) || "—"}</td>
                          <td className="py-1 pr-4 tabular-nums">{r.Quantity != null ? Number(r.Quantity).toLocaleString() : "—"}</td>
                          <td className="py-1 pr-4 tabular-nums">{r.Width != null ? Number(r.Width).toLocaleString() : "—"}</td>
                          <td className="py-1 pr-4 tabular-nums">{r.Weight != null ? Number(r.Weight).toLocaleString() : "—"}</td>
                          <td className="py-1 pr-4 tabular-nums">{r.PieceCount != null ? Number(r.PieceCount).toLocaleString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fixed bottom ERP action bar — same category set as the reference screen; only Produce/
            Update/List/Close are real, everything else is honestly disabled. */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
          <Button size="sm" onClick={produce} disabled={producing || !context?.isFabric}>{producing ? "Producing..." : "Produce"}</Button>
          <Button size="sm" variant="outline" {...disabledActionProps}>Assign to Qty</Button>
          <Button size="sm" variant="outline" onClick={update} disabled={updating || !dirtyIds.length}>
            <Save className="h-3.5 w-3.5 mr-1.5" />{updating ? "Updating..." : "Update"}
          </Button>
          <Button
            size="sm" variant="outline" disabled={!rows.length || dirtyIds.length > 0}
            title={dirtyIds.length ? "Update the edited rows first, so the labels show the saved values" : "Print a QR label for every roll generated in this session (earlier cards: List)"}
            onClick={async () => {
              try {
                // QR payloads are built by the server from the saved cards and their linked data.
                const ids = rows.map((r) => r.RecId);
                if (!(await printSerialCardLabels(() => legacyErpApi.serialCards.labels(ids) as Promise<any>))) {
                  toast.error("The label window was blocked — allow pop-ups for this site and try again.");
                }
              } catch (e: any) {
                toast.error(e.message || "Failed to generate labels");
              }
            }}
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />Label
          </Button>
          <Button size="sm" variant="outline" {...disabledActionProps}>Batch Labeling</Button>
          <Button size="sm" variant="outline" {...disabledActionProps}>Form</Button>
          <Button size="sm" variant="outline" onClick={openList} disabled={!receiptId || !itemId} title="Open the dedicated, permanent Serial Cards screen for this receipt line">
            <ListIcon className="h-3.5 w-3.5 mr-1.5" />List
          </Button>
          <Button size="sm" variant="outline" {...disabledActionProps}>Transfer</Button>
          <span className="mx-2 flex-1 text-right text-[11px] text-muted-foreground">
            {dirtyIds.length > 0 ? `${dirtyIds.length} row${dirtyIds.length === 1 ? "" : "s"} edited` : "Serial generation is metadata only — it never changes Stock On Hand or receipt quantity."}
          </span>
          <Button size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
