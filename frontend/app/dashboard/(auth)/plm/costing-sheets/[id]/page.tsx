"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import type { DecimalFieldKey } from "@/lib/legacy-erp/decimal-parameters";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Save, Search, ImageOff, Plus, Trash2, Upload, Calculator, Table2 } from "lucide-react";
import { CostDetailDialog, CostDetailValue, emptyCostDetail } from "../_components/cost-detail-dialog";
import { ProfitBreakdownDialog } from "../_components/profit-breakdown-dialog";
import { plmApi } from "@/lib/nexuscore-api";
import { FormRow as FieldRow } from "@/components/forms/form-row";

// ---------- formatting helpers ----------
const fmt2 = (n: number) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = (n: number) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const uid = () => Math.random().toString(36).slice(2, 10);

// ---------- row types ----------
type RawRow = { id: string; groupCode: string; groupName: string; inventoryCode: string; inventoryName: string; quantity: number; wastePct: number; unitPrice: number; forex: string; unit: string; explanation: string };
type LaborRow = { id: string; groupCode: string; groupName: string; explanation: string; quantity: number; wastePct: number; forex: string; unitPrice: number };
type OtherRow = { id: string; groupCode: string; groupName: string; explanation: string; quantity: number; forex: string; unitPrice: number };

const blankHeader = () => ({
  costingNo: "", costingDate: "", styleCode: "", styleName: "", accountCode: "", accountName: "",
  category: "", brand: "", pkrRate: 1, foreignCurrency: "Usdollar", foreignRate: 0,
  quotedPriceForex: "Usdollar", quotedPrice: 0, orderQuantity: 0, shippingTerms: "FOB", paymentTerms: "",
});

const blankPct = () => ({ overhead: 0, waste: 0, gSupplies: 0, excessProduction: 0, profit: 0, financialCost: 0, commission: 0, commission3: 0 });

const num = (v: any) => (v === null || v === undefined ? 0 : Number(v));

const CATEGORIES = ["Boy", "Girl", "Men", "Women", "Kids", "Infant"];
const CURRENCIES = ["PKR", "Usdollar", "Euro", "GBP"];
const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "DDP", "FCA"];

// ---------- small presentational helpers ----------
// FieldRow renders through the shared FormRow (components/forms/form-row.tsx) —
// same label-left layout this file already used, now centralized so every
// dense data-entry screen shares one implementation instead of its own copy.

// Renders through the shared EditableGridInput (components/ui/editable-grid-input.tsx)
// so this grid's cells look identical to every other input in the app instead of using
// their own bespoke CSS.
function GridInput({
  value, onChange, align = "left", type = "text", decimalKey,
}: {
  value: string | number; onChange: (v: string) => void; align?: "left" | "right"; type?: string;
  /** Opt-in Decimal Parameters rounding — forwarded straight through to EditableGridInput.
   *  Omitted by every existing caller today, so behavior is unchanged unless a cell explicitly
   *  adopts it. */
  decimalKey?: DecimalFieldKey;
}) {
  return <EditableGridInput value={value} onChange={onChange} align={align} type={type} decimalKey={decimalKey} />;
}

function SectionHeaderBar({ title, total, sharePct }: { title: string; total: number; sharePct: number }) {
  return (
    <div className="flex items-center justify-between bg-slate-700 dark:bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded-t-md">
      <span>{title}</span>
      <span className="font-mono">{fmt2(total)} - {fmt2(sharePct)}%</span>
    </div>
  );
}

function SummaryRow({ label, pct, onPctChange, pkr, usd, bold = false, extra }: { label: string; pct?: number; onPctChange?: (v: number) => void; pkr: number; usd: number; bold?: boolean; extra?: React.ReactNode }) {
  return (
    <tr className={cn("border-b text-xs", bold && "font-semibold bg-muted/40")}>
      <td className="py-1 px-2 whitespace-nowrap">
        <span className="inline-flex items-center gap-1">{label}{extra}</span>
      </td>
      <td className="py-1 px-1 w-16">
        {pct !== undefined ? (
          <input
            type="number"
            value={pct}
            onChange={(e) => onPctChange?.(parseFloat(e.target.value) || 0)}
            className="h-6 w-full bg-transparent text-xs text-right font-mono px-1 outline-none rounded focus:bg-accent/50"
          />
        ) : null}
      </td>
      <td className="py-1 px-2 text-right font-mono">{fmt4(pkr)}</td>
      <td className="py-1 px-2 text-right font-mono">{fmt4(pkr)}</td>
      <td className="py-1 px-2 text-right font-mono">{fmt4(usd)}</td>
    </tr>
  );
}

export default function CostingSheetDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const isNew = id === "new";

  const [sheetId, setSheetId] = useState<string | null>(isNew ? null : id);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [header, setHeader] = useState(blankHeader());
  const [pct, setPct] = useState(blankPct());
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [laborRows, setLaborRows] = useState<LaborRow[]>([]);
  const [otherRows, setOtherRows] = useState<OtherRow[]>([]);
  // Decimal Parameters (Settings -> Screen Parameters -> Decimal) — round-on-blur for
  // Quantity/Unit Price cells below, via the shared decimalKey mechanism.
  const { round, ensureLoaded: ensureDecimalParamsLoaded } = useDecimalParameters();
  useEffect(() => { ensureDecimalParamsLoaded(); }, [ensureDecimalParamsLoaded]);
  const [costDetails, setCostDetails] = useState<Record<string, CostDetailValue>>({});
  const [costDetailRowId, setCostDetailRowId] = useState<string | null>(null);
  const [profitBreakdownOpen, setProfitBreakdownOpen] = useState(false);

  const applySheet = (s: any) => {
    setSheetId(s.id);
    setHeader({
      costingNo: s.costingNo || "",
      costingDate: s.costingDate ? String(s.costingDate).slice(0, 10) : "",
      styleCode: s.styleCode || "",
      styleName: s.styleName || "",
      accountCode: s.accountCode || "",
      accountName: s.accountName || "",
      category: s.category || "",
      brand: s.brand || "",
      pkrRate: num(s.pkrRate) || 1,
      foreignCurrency: s.foreignCurrency || "Usdollar",
      foreignRate: num(s.foreignRate),
      quotedPriceForex: s.quotedPriceForex || "Usdollar",
      quotedPrice: num(s.quotedPrice),
      orderQuantity: num(s.orderQuantity),
      shippingTerms: s.shippingTerms || "FOB",
      paymentTerms: s.paymentTerms || "",
    });
    setPct({
      overhead: num(s.overheadPct), waste: num(s.wastePct), gSupplies: num(s.gSuppliesPct),
      excessProduction: num(s.excessProductionPct), profit: num(s.profitPct),
      financialCost: num(s.financialCostPct), commission: num(s.commissionPct), commission3: num(s.commission3Pct),
    });
    const raw = (s.rawMaterialLines || []).map((l: any) => ({
      id: l.id, groupCode: l.groupCode || "", groupName: l.groupName || "", inventoryCode: l.inventoryCode || "",
      inventoryName: l.inventoryName || "", quantity: num(l.quantity), wastePct: num(l.wastePct),
      unitPrice: num(l.unitPrice), forex: l.forex || "", unit: l.unit || "", explanation: l.explanation || "",
    }));
    setRawRows(raw);
    setLaborRows((s.laborLines || []).map((l: any) => ({
      id: l.id, groupCode: l.groupCode || "", groupName: l.groupName || "", explanation: l.explanation || "",
      quantity: num(l.quantity), wastePct: num(l.wastePct), forex: l.forex || "", unitPrice: num(l.unitPrice),
    })));
    setOtherRows((s.otherLines || []).map((l: any) => ({
      id: l.id, groupCode: l.groupCode || "", groupName: l.groupName || "", explanation: l.explanation || "",
      quantity: num(l.quantity), forex: l.forex || "", unitPrice: num(l.unitPrice),
    })));
    const details: Record<string, CostDetailValue> = {};
    (s.rawMaterialLines || []).forEach((l: any) => { if (l.costDetail) details[l.id] = l.costDetail; });
    setCostDetails(details);
  };

  const load = async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const s = await plmApi.costingSheets.get(id);
      applySheet(s);
    } catch (e: any) {
      toast.error(e.message || "Failed to load costing sheet");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const usdRate = header.foreignRate || 1;

  const rawTotal = useMemo(() => rawRows.reduce((s, r) => s + r.quantity * r.unitPrice * (1 + r.wastePct / 100), 0), [rawRows]);
  const laborTotal = useMemo(() => laborRows.reduce((s, r) => s + r.quantity * r.unitPrice * (1 + r.wastePct / 100), 0), [laborRows]);
  const otherTotal = useMemo(() => otherRows.reduce((s, r) => s + r.quantity * r.unitPrice, 0), [otherRows]);
  const grandLineTotal = rawTotal + laborTotal + otherTotal || 1;

  // ---------- summary panel calculation cascade ----------
  const materialLabor = rawTotal + laborTotal;
  const overheadAmt = materialLabor * (pct.overhead / 100);
  const costingSubtotal = materialLabor + overheadAmt + otherTotal;
  const wasteAmt = costingSubtotal * (pct.waste / 100);
  const gSuppliesAmt = costingSubtotal * (pct.gSupplies / 100);
  const excessProdAmt = costingSubtotal * (pct.excessProduction / 100);
  const wasteTotal = wasteAmt + gSuppliesAmt + excessProdAmt;
  const profitAmt = (costingSubtotal + wasteTotal) * (pct.profit / 100);
  const financialCostAmt = (costingSubtotal + wasteTotal + profitAmt) * (pct.financialCost / 100);
  const commissionAmt = (costingSubtotal + wasteTotal + profitAmt) * (pct.commission / 100);
  const commission3Amt = (costingSubtotal + wasteTotal + profitAmt) * (pct.commission3 / 100);
  const commissionTotal = commissionAmt + commission3Amt;
  const calculatedPrice = costingSubtotal + wasteTotal + profitAmt + financialCostAmt + commissionTotal;
  const netPrice = calculatedPrice;
  const marginPct = header.quotedPrice > 0 ? ((header.quotedPrice - netPrice) / header.quotedPrice) * 100 : 0;

  const updateRaw = (rid: string, patch: Partial<RawRow>) => setRawRows((rows) => rows.map((r) => (r.id === rid ? { ...r, ...patch } : r)));
  const updateLabor = (rid: string, patch: Partial<LaborRow>) => setLaborRows((rows) => rows.map((r) => (r.id === rid ? { ...r, ...patch } : r)));
  const updateOther = (rid: string, patch: Partial<OtherRow>) => setOtherRows((rows) => rows.map((r) => (r.id === rid ? { ...r, ...patch } : r)));

  const addRaw = () => setRawRows((r) => [...r, { id: uid(), groupCode: "", groupName: "", inventoryCode: "", inventoryName: "", quantity: 1, wastePct: 0, unitPrice: 0, forex: "", unit: "", explanation: "" }]);
  const addLabor = () => setLaborRows((r) => [...r, { id: uid(), groupCode: "", groupName: "", explanation: "", quantity: 1, wastePct: 0, forex: "", unitPrice: 0 }]);
  const addOther = () => setOtherRows((r) => [...r, { id: uid(), groupCode: "", groupName: "", explanation: "", quantity: 1, forex: "", unitPrice: 0 }]);

  const save = async () => {
    if (!header.costingNo) return toast.error("Costing No is required");
    setSaving(true);
    try {
      const headerPayload = {
        costingNo: header.costingNo,
        costingDate: header.costingDate || undefined,
        styleCode: header.styleCode, styleName: header.styleName,
        accountCode: header.accountCode, accountName: header.accountName,
        category: header.category, brand: header.brand,
        pkrRate: header.pkrRate, foreignCurrency: header.foreignCurrency, foreignRate: header.foreignRate,
        quotedPriceForex: header.quotedPriceForex, quotedPrice: header.quotedPrice, orderQuantity: header.orderQuantity,
        shippingTerms: header.shippingTerms, paymentTerms: header.paymentTerms,
        overheadPct: pct.overhead, wastePct: pct.waste, gSuppliesPct: pct.gSupplies,
        excessProductionPct: pct.excessProduction, profitPct: pct.profit, financialCostPct: pct.financialCost,
        commissionPct: pct.commission, commission3Pct: pct.commission3,
      };

      let targetId = sheetId;
      if (!targetId) {
        const created: any = await plmApi.costingSheets.create(headerPayload);
        targetId = created.id;
      } else {
        await plmApi.costingSheets.update(targetId, headerPayload);
      }

      // Decimal Parameters rounding happens HERE (not just via each cell's own GridInput
      // decimalKey, which is visual round-on-blur only) — this is the one place these rows are
      // actually sent to the API. Same rationale as bom-tab.tsx's own save().
      await Promise.all([
        plmApi.costingSheets.upsertRawMaterialLines(
          targetId!,
          rawRows.map((r) => ({ ...r, quantity: round(r.quantity, "quantity"), unitPrice: round(r.unitPrice, "unit-price"), costDetail: costDetails[r.id] })),
        ),
        plmApi.costingSheets.upsertLaborLines(
          targetId!,
          laborRows.map((r) => ({ ...r, quantity: round(r.quantity, "quantity"), unitPrice: round(r.unitPrice, "unit-price") })),
        ),
        plmApi.costingSheets.upsertOtherLines(
          targetId!,
          otherRows.map((r) => ({ ...r, quantity: round(r.quantity, "quantity"), unitPrice: round(r.unitPrice, "unit-price") })),
        ),
      ]);

      toast.success(sheetId ? "Costing sheet saved" : "Costing sheet created");
      if (!sheetId) {
        router.replace(`/dashboard/plm/costing-sheets/${targetId}`);
      } else {
        const refreshed = await plmApi.costingSheets.get(targetId);
        applySheet(refreshed);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save costing sheet");
    } finally {
      setSaving(false);
    }
  };

  // ---------- group based totals ----------
  const groupTotals = useMemo(() => {
    const map = new Map<string, { code: string; name: string; amount: number }>();
    const bump = (code: string, name: string, amount: number) => {
      const key = code || "—";
      const existing = map.get(key);
      if (existing) existing.amount += amount;
      else map.set(key, { code: key, name: name || "—", amount });
    };
    rawRows.forEach((r) => bump(r.groupCode, r.groupName, r.quantity * r.unitPrice * (1 + r.wastePct / 100)));
    laborRows.forEach((r) => bump(r.groupCode, r.groupName, r.quantity * r.unitPrice * (1 + r.wastePct / 100)));
    otherRows.forEach((r) => bump(r.groupCode, r.groupName, r.quantity * r.unitPrice));
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [rawRows, laborRows, otherRows]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Costing</h1>
          <p className="text-xs text-muted-foreground font-mono">{header.costingNo || "New costing sheet"}</p>
        </div>
        <Button size="sm" onClick={save} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : "Save"}</Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="customFields">Customized Fields</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-3 pt-3">
          {/* header form + summary panel */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-8 rounded-md border p-3">
              <FieldRow label="Costing No">
                <Input value={header.costingNo} onChange={(e) => setHeader((h) => ({ ...h, costingNo: e.target.value }))} className="h-7 w-48 text-xs" />
              </FieldRow>
              <FieldRow label="Costing Date">
                <Input type="date" value={header.costingDate} onChange={(e) => setHeader((h) => ({ ...h, costingDate: e.target.value }))} className="h-7 w-48 text-xs" />
              </FieldRow>
              <FieldRow label="Style">
                <Input value={header.styleCode} onChange={(e) => setHeader((h) => ({ ...h, styleCode: e.target.value }))} className="h-7 w-40 text-xs" placeholder="Style code" />
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><Search className="h-3.5 w-3.5" /></Button>
                <span className="text-xs text-muted-foreground truncate">{header.styleName}</span>
              </FieldRow>
              <FieldRow label="Current Account">
                <Input value={header.accountCode} onChange={(e) => setHeader((h) => ({ ...h, accountCode: e.target.value }))} className="h-7 w-40 text-xs" placeholder="Account code" />
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><Search className="h-3.5 w-3.5" /></Button>
                <span className="text-xs text-muted-foreground truncate">{header.accountName}</span>
              </FieldRow>
              <FieldRow label="Category">
                <Select value={header.category} onValueChange={(v) => setHeader((h) => ({ ...h, category: v }))}>
                  <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Brand">
                <Input value={header.brand} onChange={(e) => setHeader((h) => ({ ...h, brand: e.target.value }))} className="h-7 w-48 text-xs" />
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"><Search className="h-3.5 w-3.5" /></Button>
              </FieldRow>
              <FieldRow label="Forex Type - Rate">
                <Select value="PKR" disabled>
                  <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="PKR">PKR</SelectItem></SelectContent>
                </Select>
                <Input type="number" value={header.pkrRate} disabled className="h-7 w-28 text-xs text-right font-mono" />
              </FieldRow>
              <FieldRow label="Forex Type - Rate">
                <Select value={header.foreignCurrency} onValueChange={(v) => setHeader((h) => ({ ...h, foreignCurrency: v }))}>
                  <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.filter((c) => c !== "PKR").map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" value={header.foreignRate} onChange={(e) => setHeader((h) => ({ ...h, foreignRate: parseFloat(e.target.value) || 0 }))} className="h-7 w-28 text-xs text-right font-mono" />
              </FieldRow>
              <FieldRow label="Quoted Price Forex">
                <Select value={header.quotedPriceForex} onValueChange={(v) => setHeader((h) => ({ ...h, quotedPriceForex: v }))}>
                  <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Quoted Price">
                <Input type="number" value={header.quotedPrice} onChange={(e) => setHeader((h) => ({ ...h, quotedPrice: parseFloat(e.target.value) || 0 }))} className="h-7 w-32 text-xs text-right font-mono" />
              </FieldRow>
              <FieldRow label="Order Quantity">
                <Input type="number" value={header.orderQuantity} onChange={(e) => setHeader((h) => ({ ...h, orderQuantity: parseFloat(e.target.value) || 0 }))} className="h-7 w-32 text-xs text-right font-mono" />
              </FieldRow>
              <FieldRow label="Shipping Terms">
                <Select value={header.shippingTerms} onValueChange={(v) => setHeader((h) => ({ ...h, shippingTerms: v }))}>
                  <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{INCOTERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Payment Terms">
                <Input value={header.paymentTerms} onChange={(e) => setHeader((h) => ({ ...h, paymentTerms: e.target.value }))} className="h-7 w-32 text-xs" placeholder="e.g. LC_90" />
              </FieldRow>
            </div>

            <div className="col-span-12 lg:col-span-4 space-y-2">
              <div className="flex justify-end">
                <div className="h-32 w-28 rounded-md border flex flex-col items-center justify-center text-muted-foreground gap-1 bg-muted/20">
                  <ImageOff className="h-6 w-6" />
                  <span className="text-[10px]">No Image</span>
                </div>
              </div>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/60 text-[11px] font-medium">
                      <td className="py-1 px-2"></td>
                      <td className="py-1 px-1 w-16"></td>
                      <td className="py-1 px-2 text-right">PKR</td>
                      <td className="py-1 px-2 text-right">PKR</td>
                      <td className="py-1 px-2 text-right">USDollar</td>
                    </tr>
                  </thead>
                  <tbody>
                    <SummaryRow label="Material + Labor" pkr={materialLabor} usd={materialLabor / usdRate} />
                    <SummaryRow label="Overhead %" pct={pct.overhead} onPctChange={(v) => setPct((p) => ({ ...p, overhead: v }))} pkr={overheadAmt} usd={overheadAmt / usdRate} />
                    <SummaryRow label="Others" pkr={otherTotal} usd={otherTotal / usdRate} />
                    <SummaryRow label="Costing Subtotal" pkr={costingSubtotal} usd={costingSubtotal / usdRate} bold />
                    <SummaryRow label="Waste %" pct={pct.waste} onPctChange={(v) => setPct((p) => ({ ...p, waste: v }))} pkr={wasteAmt} usd={wasteAmt / usdRate} />
                    <SummaryRow label="G.Supplies %" pct={pct.gSupplies} onPctChange={(v) => setPct((p) => ({ ...p, gSupplies: v }))} pkr={gSuppliesAmt} usd={gSuppliesAmt / usdRate} />
                    <SummaryRow label="Excess Production %" pct={pct.excessProduction} onPctChange={(v) => setPct((p) => ({ ...p, excessProduction: v }))} pkr={excessProdAmt} usd={excessProdAmt / usdRate} />
                    <SummaryRow label="Waste Total" pkr={wasteTotal} usd={wasteTotal / usdRate} />
                    <SummaryRow
                      label="Profit %"
                      pct={pct.profit}
                      onPctChange={(v) => setPct((p) => ({ ...p, profit: v }))}
                      pkr={profitAmt}
                      usd={profitAmt / usdRate}
                      extra={
                        <button type="button" title="Costing Profit Breakdowns" onClick={() => setProfitBreakdownOpen(true)} className="text-muted-foreground hover:text-foreground">
                          <Table2 className="h-3 w-3" />
                        </button>
                      }
                    />
                    <SummaryRow label="Financial Cost" pct={pct.financialCost} onPctChange={(v) => setPct((p) => ({ ...p, financialCost: v }))} pkr={financialCostAmt} usd={financialCostAmt / usdRate} />
                    <SummaryRow label="Commission %" pct={pct.commission} onPctChange={(v) => setPct((p) => ({ ...p, commission: v }))} pkr={commissionAmt} usd={commissionAmt / usdRate} />
                    <SummaryRow label="Commission-3 %" pct={pct.commission3} onPctChange={(v) => setPct((p) => ({ ...p, commission3: v }))} pkr={commission3Amt} usd={commission3Amt / usdRate} />
                    <SummaryRow label="Commission Total" pkr={commissionTotal} usd={commissionTotal / usdRate} />
                    <SummaryRow label="Calculated Price" pkr={calculatedPrice} usd={calculatedPrice / usdRate} bold />
                    <SummaryRow label="Net Price" pkr={netPrice} usd={netPrice / usdRate} bold />
                    <SummaryRow label="Quoted Price" pkr={header.quotedPrice} usd={header.quotedPrice / usdRate} />
                    <SummaryRow label="Margin %" pct={Number(marginPct.toFixed(2))} pkr={0} usd={0} />
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* lower tabs: grids */}
          <Tabs defaultValue="lines">
            <TabsList>
              <TabsTrigger value="lines">General</TabsTrigger>
              <TabsTrigger value="groupTotals">Group Based Totals</TabsTrigger>
              <TabsTrigger value="attachments">Attachments</TabsTrigger>
              <TabsTrigger value="gallery">Picture Gallery</TabsTrigger>
            </TabsList>

            <TabsContent value="lines" className="space-y-4 pt-3">
              {/* Raw Material Costs */}
              <div>
                <SectionHeaderBar title="Raw Material Costs" total={rawTotal} sharePct={(rawTotal / grandLineTotal) * 100} />
                <div className="rounded-b-md border border-t-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="[&>th]:border-r [&>th]:text-[11px] [&>th]:h-8">
                        <TableHead>Group Code</TableHead>
                        <TableHead>Group Name</TableHead>
                        <TableHead>Inventory Code</TableHead>
                        <TableHead className="min-w-[240px]">Inventory Name</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Waste %</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead>Forex</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Explanation</TableHead>
                        <TableHead className="text-right">Forex Price</TableHead>
                        <TableHead className="text-right">Item Amount</TableHead>
                        <TableHead className="text-right">Forex Item Amount</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rawRows.map((r) => {
                        const itemAmount = r.quantity * r.unitPrice * (1 + r.wastePct / 100);
                        return (
                          <TableRow key={r.id} className="[&>td]:border-r [&>td]:p-0">
                            <TableCell><GridInput value={r.groupCode} onChange={(v) => updateRaw(r.id, { groupCode: v })} /></TableCell>
                            <TableCell><GridInput value={r.groupName} onChange={(v) => updateRaw(r.id, { groupName: v })} /></TableCell>
                            <TableCell><GridInput value={r.inventoryCode} onChange={(v) => updateRaw(r.id, { inventoryCode: v })} /></TableCell>
                            <TableCell><GridInput value={r.inventoryName} onChange={(v) => updateRaw(r.id, { inventoryName: v })} /></TableCell>
                            <TableCell><GridInput type="number" align="right" value={r.quantity} decimalKey="quantity" onChange={(v) => updateRaw(r.id, { quantity: parseFloat(v) || 0 })} /></TableCell>
                            <TableCell><GridInput type="number" align="right" value={r.wastePct} onChange={(v) => updateRaw(r.id, { wastePct: parseFloat(v) || 0 })} /></TableCell>
                            <TableCell><GridInput type="number" align="right" value={r.unitPrice} decimalKey="unit-price" onChange={(v) => updateRaw(r.id, { unitPrice: parseFloat(v) || 0 })} /></TableCell>
                            <TableCell><GridInput value={r.forex} onChange={(v) => updateRaw(r.id, { forex: v })} /></TableCell>
                            <TableCell><GridInput value={r.unit} onChange={(v) => updateRaw(r.id, { unit: v })} /></TableCell>
                            <TableCell><GridInput value={r.explanation} onChange={(v) => updateRaw(r.id, { explanation: v })} /></TableCell>
                            <TableCell className="text-right font-mono text-xs px-2">{fmt4(itemAmount / usdRate)}</TableCell>
                            <TableCell className="text-right font-mono text-xs px-2">{fmt4(itemAmount)}</TableCell>
                            <TableCell className="text-right font-mono text-xs px-2">{fmt4(itemAmount / usdRate)}</TableCell>
                            <TableCell className="p-0 text-center whitespace-nowrap">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Cost Detail Entry" onClick={() => setCostDetailRowId(r.id)}><Calculator className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRawRows((rows) => rows.filter((x) => x.id !== r.id))}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/40 font-semibold [&>td]:border-r">
                        <TableCell colSpan={10} className="text-right text-xs pr-2">Total</TableCell>
                        <TableCell className="text-right font-mono text-xs px-2">{fmt4(rawTotal / usdRate)}</TableCell>
                        <TableCell className="text-right font-mono text-xs px-2">{fmt4(rawTotal)}</TableCell>
                        <TableCell className="text-right font-mono text-xs px-2">{fmt4(rawTotal / usdRate)}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <Button variant="outline" size="sm" className="mt-1.5 h-7 text-xs" onClick={addRaw}><Plus className="h-3.5 w-3.5 mr-1" />Add Row</Button>
              </div>

              {/* Labor Costs */}
              <div>
                <SectionHeaderBar title="Labor Costs" total={laborTotal} sharePct={(laborTotal / grandLineTotal) * 100} />
                <div className="rounded-b-md border border-t-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="[&>th]:border-r [&>th]:text-[11px] [&>th]:h-8">
                        <TableHead>Group Code</TableHead>
                        <TableHead>Group Name</TableHead>
                        <TableHead className="min-w-[200px]">Explanation</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Waste %</TableHead>
                        <TableHead>Forex</TableHead>
                        <TableHead className="text-right">Forex Price</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Item Amount</TableHead>
                        <TableHead className="text-right">Forex Item Amount</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {laborRows.map((r) => {
                        const itemAmount = r.quantity * r.unitPrice * (1 + r.wastePct / 100);
                        return (
                          <TableRow key={r.id} className="[&>td]:border-r [&>td]:p-0">
                            <TableCell><GridInput value={r.groupCode} onChange={(v) => updateLabor(r.id, { groupCode: v })} /></TableCell>
                            <TableCell><GridInput value={r.groupName} onChange={(v) => updateLabor(r.id, { groupName: v })} /></TableCell>
                            <TableCell><GridInput value={r.explanation} onChange={(v) => updateLabor(r.id, { explanation: v })} /></TableCell>
                            <TableCell><GridInput type="number" align="right" value={r.quantity} decimalKey="quantity" onChange={(v) => updateLabor(r.id, { quantity: parseFloat(v) || 0 })} /></TableCell>
                            <TableCell><GridInput type="number" align="right" value={r.wastePct} onChange={(v) => updateLabor(r.id, { wastePct: parseFloat(v) || 0 })} /></TableCell>
                            <TableCell><GridInput value={r.forex} onChange={(v) => updateLabor(r.id, { forex: v })} /></TableCell>
                            <TableCell className="text-right font-mono text-xs px-2">{fmt4(itemAmount / usdRate)}</TableCell>
                            <TableCell><GridInput type="number" align="right" value={r.unitPrice} decimalKey="unit-price" onChange={(v) => updateLabor(r.id, { unitPrice: parseFloat(v) || 0 })} /></TableCell>
                            <TableCell className="text-right font-mono text-xs px-2">{fmt4(itemAmount)}</TableCell>
                            <TableCell className="text-right font-mono text-xs px-2">{fmt4(itemAmount / usdRate)}</TableCell>
                            <TableCell className="p-0 text-center"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLaborRows((rows) => rows.filter((x) => x.id !== r.id))}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/40 font-semibold [&>td]:border-r">
                        <TableCell colSpan={8} className="text-right text-xs pr-2">Total</TableCell>
                        <TableCell className="text-right font-mono text-xs px-2">{fmt4(laborTotal)}</TableCell>
                        <TableCell className="text-right font-mono text-xs px-2">{fmt4(laborTotal / usdRate)}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <Button variant="outline" size="sm" className="mt-1.5 h-7 text-xs" onClick={addLabor}><Plus className="h-3.5 w-3.5 mr-1" />Add Row</Button>
              </div>

              {/* Others */}
              <div>
                <SectionHeaderBar title="Others" total={otherTotal} sharePct={(otherTotal / grandLineTotal) * 100} />
                <div className="rounded-b-md border border-t-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="[&>th]:border-r [&>th]:text-[11px] [&>th]:h-8">
                        <TableHead>Group Code</TableHead>
                        <TableHead>Group Name</TableHead>
                        <TableHead className="min-w-[200px]">Explanation</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead>Forex</TableHead>
                        <TableHead className="text-right">Forex Rates</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Forex Item Amount</TableHead>
                        <TableHead className="text-right">Item Amount</TableHead>
                        <TableHead className="w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {otherRows.map((r) => {
                        const itemAmount = r.quantity * r.unitPrice;
                        return (
                          <TableRow key={r.id} className="[&>td]:border-r [&>td]:p-0">
                            <TableCell><GridInput value={r.groupCode} onChange={(v) => updateOther(r.id, { groupCode: v })} /></TableCell>
                            <TableCell><GridInput value={r.groupName} onChange={(v) => updateOther(r.id, { groupName: v })} /></TableCell>
                            <TableCell><GridInput value={r.explanation} onChange={(v) => updateOther(r.id, { explanation: v })} /></TableCell>
                            <TableCell><GridInput type="number" align="right" value={r.quantity} decimalKey="quantity" onChange={(v) => updateOther(r.id, { quantity: parseFloat(v) || 0 })} /></TableCell>
                            <TableCell><GridInput value={r.forex} onChange={(v) => updateOther(r.id, { forex: v })} /></TableCell>
                            <TableCell className="text-right font-mono text-xs px-2">{fmt4(usdRate)}</TableCell>
                            <TableCell><GridInput type="number" align="right" value={r.unitPrice} decimalKey="unit-price" onChange={(v) => updateOther(r.id, { unitPrice: parseFloat(v) || 0 })} /></TableCell>
                            <TableCell className="text-right font-mono text-xs px-2">{fmt4(itemAmount / usdRate)}</TableCell>
                            <TableCell className="text-right font-mono text-xs px-2">{fmt4(itemAmount)}</TableCell>
                            <TableCell className="p-0 text-center"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOtherRows((rows) => rows.filter((x) => x.id !== r.id))}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button></TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/40 font-semibold [&>td]:border-r">
                        <TableCell colSpan={7} className="text-right text-xs pr-2">Total</TableCell>
                        <TableCell className="text-right font-mono text-xs px-2">{fmt4(otherTotal / usdRate)}</TableCell>
                        <TableCell className="text-right font-mono text-xs px-2">{fmt4(otherTotal)}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <Button variant="outline" size="sm" className="mt-1.5 h-7 text-xs" onClick={addOther}><Plus className="h-3.5 w-3.5 mr-1" />Add Row</Button>
              </div>
            </TabsContent>

            <TabsContent value="groupTotals" className="pt-3">
              <div className="rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead>Group Code</TableHead><TableHead>Group Name</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Share %</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {groupTotals.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No cost lines yet</TableCell></TableRow>
                    ) : groupTotals.map((g) => (
                      <TableRow key={g.code}>
                        <TableCell className="font-mono text-xs">{g.code}</TableCell>
                        <TableCell>{g.name}</TableCell>
                        <TableCell className="text-right font-mono">{fmt2(g.amount)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt2((g.amount / grandLineTotal) * 100)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="attachments" className="pt-3">
              <div className="rounded-md border p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Upload className="h-6 w-6" />
                <p className="text-sm">No attachments yet</p>
                <Button variant="outline" size="sm">Upload File</Button>
              </div>
            </TabsContent>

            <TabsContent value="gallery" className="pt-3">
              <div className="rounded-md border p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageOff className="h-6 w-6" />
                <p className="text-sm">No pictures yet</p>
                <Button variant="outline" size="sm">Add Picture</Button>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="customFields" className="pt-3">
          <div className="rounded-md border p-8 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <p className="text-sm">No customized fields configured</p>
            <Button variant="outline" size="sm">Add Field</Button>
          </div>
        </TabsContent>
      </Tabs>
      )}

      <CostDetailDialog
        open={!!costDetailRowId}
        onOpenChange={(o) => !o && setCostDetailRowId(null)}
        initialValue={costDetailRowId ? costDetails[costDetailRowId] || emptyCostDetail() : undefined}
        onSave={(totalCost, detail) => {
          if (!costDetailRowId) return;
          setCostDetails((d) => ({ ...d, [costDetailRowId]: detail }));
          updateRaw(costDetailRowId, { unitPrice: totalCost });
          toast.success("Cost detail saved");
        }}
      />

      <ProfitBreakdownDialog
        open={profitBreakdownOpen}
        onOpenChange={setProfitBreakdownOpen}
        netPrice={netPrice}
        usdRate={usdRate}
        onTransfer={(profitPct) => {
          setPct((p) => ({ ...p, profit: profitPct }));
          toast.success(`Profit % ${profitPct} transferred`);
        }}
      />
    </div>
  );
}
