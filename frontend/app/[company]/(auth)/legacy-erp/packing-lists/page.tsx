"use client";

// Packing List — one Work Order packed box range by box range. Header + lines are the legacy
// IM_PackagingList / IM_PackagingListItem; per-size quantities are stored per Work Order variant
// key ("Color‖Size") by the backend (packing-list.service.ts).
//
// Sizes are NEVER defined here: `sizes` is the selected Work Order's own resolved size array
// (Packing List API → CuttingCardService), in Order sequence. That ONE array builds the grid's
// size columns, its totals row, the save payload and the summary — so a 4-size Order shows 4
// columns, a 6-size Order shows 6, and nothing is inherited from a previously opened Order.
// Formulas: lib/legacy-erp/packing-list-calc.ts (live) / packing-list.calc.ts (server summary).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/lib/app-navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, FilePlus2, ImageOff, ListOrdered, ListX, Package, Plus, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";
import { currentAccountLabel } from "@/lib/legacy-erp/saved-line-refs";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { useWorkspaceRecordId } from "@/hooks/use-workspace-record-id";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { ManageColumnsModal } from "@/components/shared/manage-columns-modal";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { WorkOrdersLookupDialog } from "@/components/legacy-erp/work-orders-lookup";
import { EntityListLookupDialog } from "@/components/legacy-erp/entity-list-lookup-dialog";
import { RECEIPT_TYPES } from "@/lib/legacy-erp/receipt-types";
import { cn } from "@/lib/utils";
import { SUMMARY_ROW_LABELS, lineTotals, packingTotals } from "@/lib/legacy-erp/packing-list-calc";

const LIST_PATH = "/legacy-erp/packing-lists-list";
const CURRENT_ACCOUNTS_LIST_PATH = "/legacy-erp/current-accounts-list";
/** PROVISIONAL business rule: the Inventory Receipt type a Packing List's "Shipment" points at
 *  (IM_PackagingList.InventoryReceiptId → IM_Receipt). 120 = Wholesale Receipt, the only sales
 *  outflow type configured today — change here only. */
const SHIPMENT_RECEIPT_TYPE = 120;
/** Grid UDF scope key for this grid, matching the Grid UDF naming convention (not wired yet). */
const PACKING_LIST_LINE_GRID_KEY = "PackingListLine";

type Mode = "view" | "edit" | "create";

interface WorkOrderContext {
  workOrder: { id: number; workOrderNo: string | null; customerOrderNo: string | null; currentAccountId: number | null; factoryId: number | null; styleCardId: string | null };
  orderLine: { id: number; itemOrderNo: number | null; customerOrderNo: string | null } | null;
  sizes: string[];
  colors: string[];
  extraCuttingPercent: number;
}

interface Line {
  uid: string;
  id: number | null;
  startBox: string;
  endBox: string;
  color: string;
  styleWeight: string;
  packageWeight: string;
  quantities: Record<string, string>;
  otherQuantities: Record<string, number>;
}

const emptyForm = {
  packagingNo: "", packagingDate: new Date().toISOString().slice(0, 10), shipmentDate: "", documentNo: "", specialCode: "",
  explanation: "", workOrderId: null as number | null, currentAccountId: null as number | null, factoryId: null as number | null,
  inventoryReceiptId: null as number | null, customerOrderNo: "", styleWeight: "", packagingWeight: "", dimension: "",
};
type Form = typeof emptyForm;

const uid = () => Math.random().toString(36).slice(2, 10);
const dateOnly = (v: unknown) => (v ? String(v).slice(0, 10) : "");
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const sizeCol = (size: string) => `size:${size}`;
const FIXED_COLS = ["startBox", "endBox", "orderLine", "color"];
const DEL_W = 40;

const formFromRecord = (r: any): Form => ({
  packagingNo: str(r.packagingNo), packagingDate: dateOnly(r.packagingDate), shipmentDate: dateOnly(r.shipmentDate),
  documentNo: str(r.documentNo), specialCode: str(r.specialCode), explanation: str(r.explanation),
  workOrderId: r.workOrderId ?? null, currentAccountId: r.currentAccountId ?? null, factoryId: r.factoryId ?? null,
  inventoryReceiptId: r.inventoryReceiptId ?? null, customerOrderNo: str(r.customerOrderNo),
  styleWeight: str(r.styleWeight), packagingWeight: str(r.packagingWeight), dimension: str(r.dimension),
});

const lineFromApi = (l: any, sizes: string[]): Line => ({
  uid: uid(), id: l.id, startBox: str(l.startBox), endBox: str(l.endBox), color: str(l.color),
  styleWeight: str(l.styleWeight), packageWeight: str(l.packageWeight),
  quantities: Object.fromEntries(sizes.map((s) => [s, l.quantities?.[s] ? String(l.quantities[s]) : ""])),
  otherQuantities: l.otherQuantities ?? {},
});

const asCalcLine = (l: Line) => ({
  startBox: l.startBox, endBox: l.endBox, styleWeight: l.styleWeight, packageWeight: l.packageWeight,
  sizes: Object.fromEntries(Object.entries(l.quantities).map(([k, v]) => [k, Number(v) || 0])),
});

const attachmentUrl = (a: any) => (String(a.url || "").startsWith("http") ? a.url : `${process.env.NEXT_PUBLIC_NEXUSCORE_API_URL || "http://localhost:4000/api/v1"}/${String(a.url || "").replace(/^\//, "")}`);

export default function PackingListPage() {
  const router = useRouter();
  const params = useWorkspaceSearchParams();
  const { round, ensureLoaded } = useDecimalParameters();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);

  const initialId = params.get("id") ? Number(params.get("id")) : null;
  const [id, setId] = useState<number | null>(initialId);
  const [mode, setMode] = useState<Mode>(initialId ? (params.get("mode") === "edit" ? "edit" : "view") : "create");
  const [form, setForm] = useState<Form>(emptyForm);
  const [isApproved, setIsApproved] = useState(false);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [labels, setLabels] = useState({ workOrderNo: "", customer: "", factory: "", shipment: "" });
  const [ctx, setCtx] = useState<WorkOrderContext | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [style, setStyle] = useState<any>(null);
  const [loading, setLoading] = useState(!!initialId);
  const [saving, setSaving] = useState(false);
  const [woLookupOpen, setWoLookupOpen] = useState(false);
  const [shipmentLookupOpen, setShipmentLookupOpen] = useState(false);
  const [pendingWorkOrder, setPendingWorkOrder] = useState<{ wo: any; nextCtx: WorkOrderContext; dropped: string[] } | null>(null);

  useWorkspaceRecordId(id);
  useWorkspaceRecordLabel(id ? form.packagingNo || undefined : undefined);

  const sizes = ctx?.sizes ?? [];
  const readOnly = mode === "view" || isApproved;
  const lastSavedRef = useRef<string>(JSON.stringify({ form: emptyForm, lines: [] }));
  const snapshot = (f: Form, ls: Line[]) => JSON.stringify({ form: f, lines: ls.map(({ uid: _u, ...l }) => l) });
  const isDirty = !readOnly && snapshot(form, lines) !== lastSavedRef.current;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  // ── Loading ───────────────────────────────────────────────────────────────────────────────
  const loadAccountLabel = (accountId: number | null) =>
    accountId ? legacyErpApi.accounts.get(accountId).then((a: any) => currentAccountLabel(a)).catch(() => "") : Promise.resolve("");

  const loadStyle = (styleCardId: string | null) => {
    if (!styleCardId) { setStyle(null); return; }
    plmApi.styleCards.get(styleCardId).then(setStyle).catch(() => setStyle(null));
  };

  const loadContext = (workOrderId: number) => legacyErpApi.packingLists.workOrderContext(workOrderId) as Promise<WorkOrderContext>;

  const loadRecord = useCallback(async (recordId: number) => {
    setLoading(true);
    try {
      const [header, lineData]: any[] = await Promise.all([legacyErpApi.packingLists.get(recordId), legacyErpApi.packingLists.getLines(recordId)]);
      const f = formFromRecord(header);
      const nextCtx = header.workOrderId ? await loadContext(header.workOrderId) : null;
      const ls = (lineData.lines as any[]).map((l) => lineFromApi(l, lineData.sizes));
      setForm(f);
      setIsApproved(!!header.isApproved);
      setApprovedAt(header.approvedAt ? String(header.approvedAt) : null);
      setCtx(nextCtx);
      setLines(ls);
      setLabels({
        workOrderNo: header.workOrderNo ?? "",
        customer: header.customerName ? `${header.customerCode ?? ""} — ${header.customerName}` : "",
        factory: header.factoryName ? `${header.factoryCode ?? ""} — ${header.factoryName}` : "",
        shipment: header.shipmentReceiptNo ?? "",
      });
      lastSavedRef.current = snapshot(f, ls);
      loadStyle(nextCtx?.workOrder.styleCardId ?? null);
      legacyErpApi.packingLists.summary(recordId).then(setSummary).catch(() => setSummary(null));
    } catch (e: any) {
      toast.error(e.message || "Failed to load Packing List");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialId) loadRecord(initialId);
    else legacyErpApi.packingLists.previewNextCode().then((r: any) => set("packagingNo", r.code)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Work Order selection ─────────────────────────────────────────────────────────────────
  /** Re-binds every line to the new Order's sizes BY SIZE CODE: a size both Orders share keeps its
   *  quantity; a size the new Order lacks is dropped (the user confirms first, see below). */
  const applyWorkOrder = async (wo: any, nextCtx: WorkOrderContext) => {
    setCtx(nextCtx);
    setLines((prev) => prev.map((l) => ({
      ...l,
      color: nextCtx.colors.find((c) => c.toLowerCase() === l.color.toLowerCase()) ?? (nextCtx.colors.length === 1 ? nextCtx.colors[0] : ""),
      quantities: Object.fromEntries(nextCtx.sizes.map((s) => [s, l.quantities[s] ?? ""])),
    })));
    const [customer, factory] = await Promise.all([loadAccountLabel(nextCtx.workOrder.currentAccountId), loadAccountLabel(nextCtx.workOrder.factoryId)]);
    setForm((p) => ({
      ...p,
      workOrderId: nextCtx.workOrder.id,
      currentAccountId: nextCtx.workOrder.currentAccountId ?? p.currentAccountId,
      factoryId: nextCtx.workOrder.factoryId ?? p.factoryId,
      customerOrderNo: nextCtx.workOrder.customerOrderNo ?? p.customerOrderNo,
    }));
    setLabels((p) => ({
      ...p, workOrderNo: wo.workOrderNo ?? nextCtx.workOrder.workOrderNo ?? "",
      customer: customer || p.customer, factory: factory || p.factory,
    }));
    loadStyle(nextCtx.workOrder.styleCardId);
  };

  const selectWorkOrder = async (wo: any) => {
    try {
      const nextCtx = await loadContext(Number(wo.id));
      const dropped = sizes.filter((s) => !nextCtx.sizes.includes(s) && lines.some((l) => Number(l.quantities[s]) > 0));
      if (dropped.length) setPendingWorkOrder({ wo, nextCtx, dropped });
      else await applyWorkOrder(wo, nextCtx);
    } catch (e: any) {
      toast.error(e.message || "Failed to load the Work Order");
    }
  };

  // ── Lines ─────────────────────────────────────────────────────────────────────────────────
  const addLine = () => setLines((prev) => {
    const next = prev.reduce((m, l) => Math.max(m, Number(l.endBox) || 0), 0) + 1;
    return [...prev, {
      uid: uid(), id: null, startBox: String(next), endBox: String(next),
      color: ctx?.colors.length === 1 ? ctx.colors[0] : "",
      styleWeight: form.styleWeight, packageWeight: form.packagingWeight,
      quantities: Object.fromEntries(sizes.map((s) => [s, ""])), otherQuantities: {},
    }];
  });
  const updateLine = (lineUid: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => (l.uid === lineUid ? { ...l, ...patch } : l)));
  const setQty = (lineUid: string, size: string, v: string) =>
    setLines((prev) => prev.map((l) => (l.uid === lineUid ? { ...l, quantities: { ...l.quantities, [size]: v } } : l)));
  const removeLine = (lineUid: string) => setLines((prev) => prev.filter((l) => l.uid !== lineUid));

  // ── Save / approve ────────────────────────────────────────────────────────────────────────
  const headerPayload = () => ({
    packagingDate: form.packagingDate || null, shipmentDate: form.shipmentDate || null, documentNo: form.documentNo,
    specialCode: form.specialCode, explanation: form.explanation, workOrderId: form.workOrderId,
    currentAccountId: form.currentAccountId, factoryId: form.factoryId, inventoryReceiptId: form.inventoryReceiptId,
    customerOrderNo: form.customerOrderNo, styleWeight: form.styleWeight, packagingWeight: form.packagingWeight, dimension: form.dimension,
  });
  const linesPayload = () => lines.map((l) => ({
    id: l.id, startBox: Number(l.startBox), endBox: Number(l.endBox), color: l.color,
    styleWeight: l.styleWeight === "" ? null : l.styleWeight, packageWeight: l.packageWeight === "" ? null : l.packageWeight,
    quantities: Object.fromEntries(sizes.map((s) => [s, l.quantities[s] === "" ? 0 : Number(l.quantities[s])])),
  }));

  const save = async () => {
    if (!form.workOrderId) { toast.error("Select an Order No first."); return; }
    setSaving(true);
    try {
      let recordId = id;
      if (!recordId) {
        const created: any = await legacyErpApi.packingLists.create(headerPayload());
        recordId = Number(created.id);
        setId(recordId);
        setMode("edit");
      } else {
        await legacyErpApi.packingLists.update(recordId, headerPayload());
      }
      await legacyErpApi.packingLists.saveLines(recordId, linesPayload());
      toast.success("Packing List saved");
      await loadRecord(recordId);
    } catch (e: any) {
      toast.error(e.message || "Failed to save Packing List");
    } finally {
      setSaving(false);
    }
  };
  useWorkspaceDirty(isDirty, save);

  const setApproval = async (approve: boolean) => {
    if (!id) return;
    if (approve && isDirty) { toast.error("Save your changes before approving."); return; }
    try {
      await (approve ? legacyErpApi.packingLists.approve(id) : legacyErpApi.packingLists.unapprove(id));
      toast.success(approve ? "Packing List approved" : "Packing List reopened");
      await loadRecord(id);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const newRecord = () => router.push(`/legacy-erp/packing-lists?mode=create`);

  // ── Grid columns: fixed + ONE dynamic column per Order size + computed ─────────────────────
  const columnDefs = useMemo(() => [
    { key: "startBox", label: "From (Box)", defaultWidth: 80, minWidth: 60, align: "right" as const },
    { key: "endBox", label: "To (Box)", defaultWidth: 80, minWidth: 60, align: "right" as const },
    { key: "orderLine", label: "Order Line", defaultWidth: 90, minWidth: 70 },
    { key: "color", label: "Color", defaultWidth: 150, minWidth: 100 },
    { key: "styleWeight", label: "Style Weight", defaultWidth: 95, minWidth: 70, align: "right" as const },
    { key: "packageWeight", label: "Package Weight", defaultWidth: 100, minWidth: 70, align: "right" as const },
    ...sizes.map((s) => ({ key: sizeCol(s), label: s, defaultWidth: 72, minWidth: 56, align: "right" as const })),
    { key: "inBox", label: "In Box Qty", defaultWidth: 90, minWidth: 70, align: "right" as const },
    { key: "total", label: "Total", defaultWidth: 90, minWidth: 70, align: "right" as const },
    { key: "netWeight", label: "Net Weight", defaultWidth: 100, minWidth: 70, align: "right" as const },
    { key: "totalPackageWeight", label: "Total Package Weight", defaultWidth: 120, minWidth: 80, align: "right" as const },
    { key: "grossWeight", label: "Gross Weight", defaultWidth: 105, minWidth: 70, align: "right" as const },
  ], [sizes]);
  const columnByKey = useMemo(() => new Map(columnDefs.map((c) => [c.key, c])), [columnDefs]);
  const gridColumns = useGridColumns<string>({ storageKey: "packingListGrid", columns: columnDefs, fixedColumns: FIXED_COLS });
  const displayColumns = gridColumns.displayColumnDefs.map((c) => columnByKey.get(c.key)).filter((c): c is NonNullable<typeof c> => !!c);

  const totals = useMemo(() => packingTotals(lines.map(asCalcLine), sizes), [lines, sizes]);
  const fmtW = (v: number) => v.toFixed(4);
  const fmtQ = (v: number) => round(v, "quantity");

  const renderCell = (line: Line, key: string) => {
    if (key.startsWith("size:")) {
      const size = key.slice(5);
      return <EditableGridInput type="number" align="right" nonNegative decimalKey="quantity" value={line.quantities[size] ?? ""} disabled={readOnly} onChange={(v) => setQty(line.uid, size, v)} />;
    }
    const t = lineTotals(asCalcLine(line), sizes);
    const ro = (v: React.ReactNode) => <span className="flex h-8 items-center justify-end px-2 font-mono text-[11.5px]">{v}</span>;
    switch (key) {
      case "startBox": return <EditableGridInput type="number" align="right" nonNegative value={line.startBox} disabled={readOnly} onChange={(v) => updateLine(line.uid, { startBox: v })} />;
      case "endBox": return <EditableGridInput type="number" align="right" nonNegative value={line.endBox} disabled={readOnly} onChange={(v) => updateLine(line.uid, { endBox: v })} />;
      case "orderLine": return <span className="flex h-8 items-center px-2 font-mono text-[11.5px]">{ctx?.orderLine?.itemOrderNo ?? ctx?.orderLine?.customerOrderNo ?? "—"}</span>;
      case "color":
        return (
          <Select value={line.color || undefined} onValueChange={(v) => updateLine(line.uid, { color: v })} disabled={readOnly || !ctx?.colors.length}>
            <SelectTrigger size="sm" className="h-8 w-full rounded-none border-0 text-[11.5px] shadow-none"><SelectValue placeholder={ctx?.colors.length ? "Select color" : "No colors on Order"} /></SelectTrigger>
            <SelectContent>{(ctx?.colors ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        );
      case "styleWeight": return <EditableGridInput type="number" align="right" nonNegative value={line.styleWeight} disabled={readOnly} onChange={(v) => updateLine(line.uid, { styleWeight: v })} />;
      case "packageWeight": return <EditableGridInput type="number" align="right" nonNegative value={line.packageWeight} disabled={readOnly} onChange={(v) => updateLine(line.uid, { packageWeight: v })} />;
      case "inBox": return ro(fmtQ(t.inBoxQuantity));
      case "total": return ro(fmtQ(t.totalQuantity));
      case "netWeight": return ro(fmtW(t.netWeight));
      case "totalPackageWeight": return ro(fmtW(t.totalPackageWeight));
      case "grossWeight": return ro(fmtW(t.grossWeight));
      default: return null;
    }
  };
  const footerCell = (key: string) => {
    if (key.startsWith("size:")) return fmtQ(totals.bySize[key.slice(5)] ?? 0);
    switch (key) {
      case "startBox": return "Total";
      case "endBox": return `${totals.boxes} box${totals.boxes === 1 ? "" : "es"}`;
      case "total": return fmtQ(totals.totalQuantity);
      case "netWeight": return fmtW(totals.netWeight);
      case "totalPackageWeight": return fmtW(totals.totalPackageWeight);
      case "grossWeight": return fmtW(totals.grossWeight);
      default: return "";
    }
  };

  const images = (style?.attachments ?? []).filter((a: any) => String(a.type || "").startsWith("image/"));
  const staleLines = lines.filter((l) => Object.keys(l.otherQuantities).length > 0);
  const lbl = "text-[11px] text-muted-foreground";
  const field = "h-8 text-[12.5px]";
  const th = "border-r border-border/70 bg-slate-700 dark:bg-slate-800 px-2 text-[10.5px] font-semibold uppercase tracking-wide text-white h-7 whitespace-nowrap";
  const td = "border-r border-b border-border/50 px-2 text-right font-mono text-[11.5px] h-7";

  if (loading) return <div className="space-y-3 p-4"><Skeleton className="h-8 w-80" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="space-y-3 p-4">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <h1 className="text-[15px] font-semibold">{id ? `Packing List — ${form.packagingNo}` : "New Packing List"}</h1>
          {id && (
            <Badge variant={isApproved ? "default" : "secondary"} className="text-[11px] font-normal">
              {isApproved ? `Approved${approvedAt ? ` · ${dateOnly(approvedAt)}` : ""}` : "Unapproved"}
            </Badge>
          )}
          {mode === "view" && !isApproved && <Badge variant="outline" className="text-[11px] font-normal">View</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={newRecord}><FilePlus2 className="mr-1.5 h-3.5 w-3.5" />New</Button>
          {mode === "view" && !isApproved && <Button size="sm" variant="outline" onClick={() => setMode("edit")}>Edit</Button>}
          {id && !isApproved && <Button size="sm" variant="outline" onClick={() => setApproval(true)}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Approve</Button>}
          {id && isApproved && <Button size="sm" variant="outline" onClick={() => setApproval(false)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Unapprove</Button>}
          {!readOnly && <Button size="sm" onClick={save} disabled={saving || !isDirty}><Save className="mr-1.5 h-3.5 w-3.5" />{saving ? "Saving..." : "Save"}</Button>}
        </div>
      </div>

      {/* Header */}
      <Tabs defaultValue="general" className="rounded-md border">
        <TabsList className="h-8 rounded-none rounded-t-md border-b bg-muted/40 p-0">
          <TabsTrigger value="general" className="h-8 rounded-none px-4 text-xs">General</TabsTrigger>
          <TabsTrigger value="detail" className="h-8 rounded-none px-4 text-xs">Detail</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="m-0 p-3">
          <div className="grid grid-cols-12 gap-x-4 gap-y-2">
            <div className="col-span-12 grid grid-cols-3 gap-x-4 gap-y-2 lg:col-span-10">
              <div className="space-y-0.5"><label className={lbl}>Packing No</label><Input className={cn(field, "font-mono font-semibold")} value={form.packagingNo} readOnly /></div>
              <div className="space-y-0.5"><label className={lbl}>Packing Date</label><Input type="date" className={field} value={form.packagingDate} disabled={readOnly} onChange={(e) => set("packagingDate", e.target.value)} /></div>
              <div className="space-y-0.5"><label className={lbl}>Shipment Date</label><Input type="date" className={field} value={form.shipmentDate} disabled={readOnly} onChange={(e) => set("shipmentDate", e.target.value)} /></div>

              <div className="space-y-0.5">
                <label className={lbl}>Order No</label>
                <InputGroup className="h-8">
                  <InputGroupInput className="text-[12.5px] font-mono" readOnly value={labels.workOrderNo} placeholder="Select an Order..." onClick={() => !readOnly && setWoLookupOpen(true)} />
                  <InputGroupAddon align="inline-end">
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={readOnly} onClick={() => setWoLookupOpen(true)} title="Search Work Orders" aria-label="Search Work Orders"><Search className="h-3.5 w-3.5" /></Button>
                  </InputGroupAddon>
                </InputGroup>
              </div>
              <div className="space-y-0.5"><label className={lbl}>Customer Order No</label><Input className={field} value={form.customerOrderNo} disabled={readOnly} onChange={(e) => set("customerOrderNo", e.target.value)} /></div>
              <div className="space-y-0.5">
                <label className={lbl}>Shipment</label>
                <InputGroup className="h-8">
                  <InputGroupInput className="text-[12.5px] font-mono" readOnly value={labels.shipment} placeholder="Shipment receipt..." onClick={() => !readOnly && setShipmentLookupOpen(true)} />
                  <InputGroupAddon align="inline-end">
                    {form.inventoryReceiptId && !readOnly && (
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => { set("inventoryReceiptId", null); setLabels((p) => ({ ...p, shipment: "" })); }} title="Clear" aria-label="Clear shipment"><X className="h-3.5 w-3.5" /></Button>
                    )}
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={readOnly} onClick={() => setShipmentLookupOpen(true)} title="Search shipment receipts" aria-label="Search shipment receipts"><Search className="h-3.5 w-3.5" /></Button>
                  </InputGroupAddon>
                </InputGroup>
              </div>

              <div className={cn("space-y-0.5", readOnly && "pointer-events-none opacity-70")}>
                <label className={lbl}>Customer</label>
                <MasterAutocompleteField label="" compact masterKey="current-account" displayValue={labels.customer}
                  fetchOptions={(term) => legacyErpApi.accounts.list(term) as Promise<any[]>} lookupPath={CURRENT_ACCOUNTS_LIST_PATH}
                  onSelect={(o: any) => { set("currentAccountId", Number(o.id)); setLabels((p) => ({ ...p, customer: `${o.code ?? ""} — ${o.name}` })); }}
                  onClear={() => { set("currentAccountId", null); setLabels((p) => ({ ...p, customer: "" })); }} />
              </div>
              <div className={cn("space-y-0.5", readOnly && "pointer-events-none opacity-70")}>
                <label className={lbl}>Factory</label>
                <MasterAutocompleteField label="" compact masterKey="factory-account" displayValue={labels.factory}
                  fetchOptions={(term) => legacyErpApi.accounts.list(term) as Promise<any[]>} lookupPath={CURRENT_ACCOUNTS_LIST_PATH}
                  onSelect={(o: any) => { set("factoryId", Number(o.id)); setLabels((p) => ({ ...p, factory: `${o.code ?? ""} — ${o.name}` })); }}
                  onClear={() => { set("factoryId", null); setLabels((p) => ({ ...p, factory: "" })); }} />
              </div>
              <div className="space-y-0.5">
                <label className={lbl}>Style</label>
                <p className="flex h-8 items-center truncate rounded-md border border-input bg-muted/30 px-2 text-[12.5px]">
                  {style ? `${style.styleNumber} — ${style.title}` : <span className="text-muted-foreground">—</span>}
                </p>
              </div>

              <div className="space-y-0.5"><label className={lbl}>Style Weight</label><Input type="number" min={0} step="any" className={field} value={form.styleWeight} disabled={readOnly} onChange={(e) => set("styleWeight", e.target.value)} /></div>
              <div className="space-y-0.5"><label className={lbl}>Package Weight</label><Input type="number" min={0} step="any" className={field} value={form.packagingWeight} disabled={readOnly} onChange={(e) => set("packagingWeight", e.target.value)} /></div>
              <div className="space-y-0.5"><label className={lbl}>Dimensions</label><Input className={field} value={form.dimension} disabled={readOnly} placeholder="e.g. 60X40X30 CM" onChange={(e) => set("dimension", e.target.value)} /></div>
            </div>
            <div className="col-span-12 lg:col-span-2">
              <div className="flex h-full min-h-28 items-center justify-center overflow-hidden rounded-md border bg-muted/20">
                {images.length
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={attachmentUrl(images[0])} alt={style?.title ?? "Style"} className="max-h-40 w-full object-contain" />
                  : <span className="flex flex-col items-center gap-1 text-[11px] text-muted-foreground"><ImageOff className="h-5 w-5" />{style ? "No style image" : "Style image"}</span>}
              </div>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="detail" className="m-0 p-3">
          <div className="grid grid-cols-3 gap-x-4 gap-y-2">
            <div className="space-y-0.5"><label className={lbl}>Document No</label><Input className={field} value={form.documentNo} disabled={readOnly} onChange={(e) => set("documentNo", e.target.value)} /></div>
            <div className="space-y-0.5"><label className={lbl}>Special Code</label><Input className={field} value={form.specialCode} disabled={readOnly} onChange={(e) => set("specialCode", e.target.value)} /></div>
            <div className="col-span-3 space-y-0.5"><label className={lbl}>Explanation</label><Input className={field} value={form.explanation} disabled={readOnly} onChange={(e) => set("explanation", e.target.value)} /></div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail grid */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          Detail{ctx && <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">— {sizes.length} size{sizes.length === 1 ? "" : "s"} from Order {ctx.workOrder.workOrderNo}</span>}
        </p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={gridColumns.manageColumns.openModal}><ListOrdered className="mr-1.5 h-3.5 w-3.5" />Manage Columns</Button>
          {!readOnly && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addLine} disabled={!ctx}><Plus className="mr-1.5 h-3.5 w-3.5" />Add Row</Button>}
        </div>
      </div>

      {staleLines.length > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11.5px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {staleLines.length} line{staleLines.length === 1 ? " has" : "s have"} saved quantities for sizes that are not on this Order ({Array.from(new Set(staleLines.flatMap((l) => Object.keys(l.otherQuantities)))).join(", ")}). They are kept until you save; saving sets them to 0.
        </p>
      )}

      {!ctx ? (
        <div className="rounded-md border border-dashed">
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Package /></EmptyMedia>
              <EmptyTitle className="text-sm">Select an Order</EmptyTitle>
              <EmptyDescription>The size columns come from the selected Order&apos;s own sizes.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <div className="max-h-[52vh] overflow-auto">
            <Table className="table-fixed" style={{ width: gridColumns.totalWidth(DEL_W), minWidth: "100%" }}>
              <colgroup>
                {displayColumns.map((c) => <col key={c.key} style={{ width: gridColumns.getWidth(c.key) }} />)}
                <col style={{ width: DEL_W }} />
              </colgroup>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="border-b bg-slate-700 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800 [&>th]:text-white">
                  {displayColumns.map((c) => {
                    const fixed = FIXED_COLS.includes(c.key);
                    return (
                      <TableHead key={c.key} className="relative h-8 p-0 text-[10.5px] font-semibold uppercase tracking-wide text-white"
                        onDragOver={gridColumns.getHeaderDragProps(c.key).onDragOver} onDrop={gridColumns.getHeaderDragProps(c.key).onDrop}>
                        <span title={c.label} draggable={!fixed}
                          onDragStart={gridColumns.getHeaderDragProps(c.key).onDragStart} onDragEnd={gridColumns.getHeaderDragProps(c.key).onDragEnd}
                          className={cn("flex h-8 w-full min-w-0 items-center truncate px-2", c.align === "right" ? "justify-end" : "justify-start", !fixed && "cursor-grab")}>
                          {c.label}
                        </span>
                        <div className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-white/40" onMouseDown={gridColumns.startResize(c.key)} onDoubleClick={() => gridColumns.resetWidth(c.key)} aria-hidden="true" />
                      </TableHead>
                    );
                  })}
                  <TableHead className="h-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={displayColumns.length + 1} className="py-6">
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon"><ListX /></EmptyMedia>
                          <EmptyTitle className="text-sm">No boxes yet</EmptyTitle>
                          <EmptyDescription>{readOnly ? "This Packing List has no lines." : 'Click "Add Row" to pack the first box range.'}</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : lines.map((line) => (
                  <TableRow key={line.uid} className="group">
                    {displayColumns.map((c) => <TableCell key={c.key} className="border-r border-border/40 p-0">{renderCell(line, c.key)}</TableCell>)}
                    <TableCell className="p-0 text-center">
                      {!readOnly && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-60 group-hover:opacity-100" onClick={() => removeLine(line.uid)} aria-label="Remove line">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {lines.length > 0 && (
                <TableFooter>
                  <TableRow className="bg-muted/60 font-semibold">
                    {displayColumns.map((c) => (
                      <TableCell key={c.key} className={cn("h-8 border-r border-border/40 px-2 font-mono text-[11.5px]", c.align === "right" && "text-right")}>{footerCell(c.key)}</TableCell>
                    ))}
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </div>
      )}

      {/* Summary — the SAME `sizes` array as the grid above */}
      {ctx && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
            Summary{!!ctx.extraCuttingPercent && <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">(Will Be Cut — Extra Cutting {ctx.extraCuttingPercent}%)</span>}
            {!summary && id && <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">— loading…</span>}
            {!id && <span className="ml-1.5 font-normal normal-case text-muted-foreground/70">— available after the first save</span>}
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[700px] table-fixed border-collapse text-[11.5px]">
              <thead>
                <tr>
                  <th className={cn(th, "text-left")} style={{ width: 170 }} />
                  {sizes.map((s) => <th key={s} className={cn(th, "text-right")} style={{ width: 80 }}>{s}</th>)}
                  <th className={cn(th, "text-right")} style={{ width: 100 }}>Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {SUMMARY_ROW_LABELS.map(([key, label]) => {
                  const pct = key === "orderMinusShipmentPercent";
                  const value = (v: unknown) => (summary ? (pct ? `${Number(v ?? 0).toFixed(2)}%` : fmtQ(Number(v ?? 0))) : "—");
                  const negative = (v: unknown) => summary && Number(v) < 0;
                  return (
                    <tr key={key} className={cn(key === "shipment" && "bg-sky-50 dark:bg-sky-950/30", key === "order" && "bg-amber-50/60 dark:bg-amber-950/20")}>
                      <td className="border-r border-b border-border/50 px-2 text-[11.5px] font-medium h-7">{label}</td>
                      {sizes.map((s) => <td key={s} className={cn(td, negative(summary?.rows?.[key]?.[s]) && "text-destructive")}>{value(summary?.rows?.[key]?.[s])}</td>)}
                      <td className={cn(td, "font-semibold", negative(summary?.totals?.[key]) && "text-destructive")}>{value(summary?.totals?.[key])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 pt-1 text-[11.5px]">
            {[["Boxes", String(totals.boxes)], ["Net Weight", fmtW(totals.netWeight)], ["Package Weight", fmtW(totals.totalPackageWeight)], ["Gross Weight", fmtW(totals.grossWeight)]].map(([k, v]) => (
              <span key={k} className="rounded border px-2 py-0.5"><span className="text-muted-foreground">{k}: </span><span className="font-mono font-semibold">{v}</span></span>
            ))}
          </div>
        </div>
      )}

      <WorkOrdersLookupDialog open={woLookupOpen} onOpenChange={setWoLookupOpen} onSelect={(wo) => selectWorkOrder(wo)} />

      <EntityListLookupDialog<any>
        open={shipmentLookupOpen}
        onOpenChange={setShipmentLookupOpen}
        title={`${RECEIPT_TYPES.find((t) => t.receiptType === SHIPMENT_RECEIPT_TYPE)?.label ?? "Shipment"} List`}
        description="Pick the shipment receipt this Packing List ships on."
        columns={[
          { key: "receiptNo", label: "Receipt No", sortable: true, render: (r: any) => <span className="font-mono text-xs">{r.receiptNo}</span> },
          { key: "receiptDate", label: "Receipt Date", sortable: true, render: (r: any) => dateOnly(r.receiptDate) },
          { key: "documentNo", label: "Document No", render: (r: any) => r.documentNo || "—" },
          { key: "explanation", label: "Explanation", render: (r: any) => r.explanation || "—" },
        ]}
        load={(term, req) => legacyErpApi.receipts(SHIPMENT_RECEIPT_TYPE).list(term, undefined, req)}
        defaultSortBy="receiptNo"
        defaultSortDir="desc"
        getRowKey={(r: any) => r.id}
        storageKey="packingListShipmentLookup"
        onSelect={(r: any) => { set("inventoryReceiptId", Number(r.id)); setLabels((p) => ({ ...p, shipment: r.receiptNo })); }}
      />

      <ManageColumnsModal
        state={gridColumns.manageColumns}
        fixedColumns={FIXED_COLS}
        columns={columnDefs}
        description="Show, hide and reorder columns. From/To Box, Order Line and Color always stay first; one column per Order size."
      />

      <AlertDialog open={!!pendingWorkOrder} onOpenChange={(open) => !open && setPendingWorkOrder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change the Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Order {pendingWorkOrder?.wo?.workOrderNo} has no size {pendingWorkOrder?.dropped.join(", ")}. Quantities entered under
              {pendingWorkOrder?.dropped.length === 1 ? " that size" : " those sizes"} will be removed from the lines; sizes both Orders share keep their quantities.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingWorkOrder) applyWorkOrder(pendingWorkOrder.wo, pendingWorkOrder.nextCtx); setPendingWorkOrder(null); }}>Change Order</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
