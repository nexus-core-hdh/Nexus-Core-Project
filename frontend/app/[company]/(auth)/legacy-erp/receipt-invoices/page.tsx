"use client";

// Invoice — the legacy invoice entry screen (reference: "Invoice [1-Purchase Invoice]"), one per
// receipt type (?receiptType=N: its own menu entry and its own workspace tab, registry.tsx
// MULTI_KEY_ROUTES). A SEPARATE screen: the Inventory Receipt screen and lists are untouched.
//
// Data model (verified against the live database — see invoice.service.ts): the invoice header is
// the legacy IM_Invoice row (number, date, document, current account, warehouse, Explanation /
// Special Code, export fields, Subtotal / VAT / Grand Total, approval). It is linked to ONE
// Inventory Receipt of the same type (IM_Invoice.InventoryReceiptId); that receipt supplies what
// IM_Invoice itself has no column for — the detail lines (edited here through the receipt's own
// line grid and APIs, with the receipt's own validation and locks), Shipment Date and Receipt
// Document (read-only), and Integration -> Order: the receipt's SUBCONTRACT Order
// (IM_Receipt.ScriptId -> IM_OrderReceipt type 3), saved on the receipt through its own API.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, FilePlus2, Lock, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { getReceiptTypeConfig } from "@/lib/legacy-erp/receipt-types";
import { EMPTY_RECEIPT_TOTALS, type ReceiptTotals } from "@/lib/legacy-erp/receipt-totals";
import { currentAppPath } from "@/lib/company-path";
import { cn } from "@/lib/utils";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { useWorkspaceTabTitle } from "@/hooks/use-workspace-tab-title";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { useWorkspaceTabContext } from "@/components/layout/workspace/workspace-tab-context";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { EntityListLookupDialog } from "@/components/legacy-erp/entity-list-lookup-dialog";
import { AttachmentsTab } from "@/components/legacy-erp/attachments-tab";
import { InventoryReceiptLineGrid, type ColKey, type InventoryReceiptLineGridHandle } from "../inventory-receipts/_components/inventory-receipt-line-grid";
import { SourceReceiptPicker, type SourceReceiptRow } from "./_components/source-receipt-picker";

const CURRENT_ACCOUNTS_LIST_PATH = "/legacy-erp/current-accounts-list";
/** IM_OrderReceipt.ReceiptType of a Subcontract Order (order-types.config.ts). */
const SUBCONTRACT_ORDER_TYPE = 3;
const TABS = ["General", "Detail", "Export", "Totals", "Attachments"] as const;
// The reference invoice grid's columns, in its order (then VAT % and the line amounts the totals use).
// Its own saved layout ("invoiceLineGrid") — the Inventory Receipt screen's layout is untouched; every
// other receipt-line column stays available through Manage Columns.
const INVOICE_COLUMN_LAYOUT: { storageKey: string; order: ColKey[] } = {
  storageKey: "invoiceLineGrid",
  order: ["type", "code", "name", "explanation", "manufacturingOrderNo", "accountCode", "grossQuantity", "quantity", "unit", "rate", "price", "forex", "forexPrice", "vatIE", "vatPct", "itemAmount", "itemNetTotal"],
};

const emptyForm: Record<string, any> = {
  receiptNo: "", receiptDate: new Date().toISOString().slice(0, 10), documentNo: "",
  currentAccountId: "", currentAccountCode: "", currentAccountName: "",
  inWarehouseId: "", warehouseCode: "", warehouseName: "",
  explanation: "", specialCode: "", eximInvoiceNo: "", customerOrderNo: "", isEximReceipt: 0,
  // The linked Inventory Receipt and what the invoice shows from it.
  inventoryReceiptId: "", inventoryReceiptNo: "", shipmentDate: "", receiptDocumentNo: "", receiptApproved: 0, vehicleNo: "", driverName: "",
  orderId: "", orderNo: "",
  isApproved: 0, approvedAt: null,
};
const dateOnly = (v: unknown) => (v ? String(v).slice(0, 10) : "");
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
/** Invoice header fields (IM_Invoice) — what the dirty check and Save compare. */
const INVOICE_KEYS = ["receiptDate", "documentNo", "currentAccountId", "inWarehouseId", "inventoryReceiptId", "explanation", "specialCode", "eximInvoiceNo", "customerOrderNo", "isEximReceipt"] as const;

function Group({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn("min-w-0 rounded-sm border border-border px-3 pb-2 pt-0.5", className)}>
      <legend className="px-1 text-[11.5px] text-foreground/80">{title}</legend>
      <div className="space-y-1">{children}</div>
    </fieldset>
  );
}
function Row({ label, children, strong, labelWidth = 112, htmlFor }: { label: string; children: ReactNode; strong?: boolean; labelWidth?: number; htmlFor?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <label htmlFor={htmlFor} style={{ width: labelWidth }} className={cn("shrink-0 truncate text-right", strong ? "text-[14px] font-semibold" : "text-[11.5px] text-foreground/80")}>{label}</label>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}
const box = "h-6 rounded-sm border border-input bg-background px-1.5 text-[12px] outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground read-only:bg-muted/40";

export default function InvoicePage() {
  const params = useWorkspaceSearchParams();
  const receiptType = Number(params.get("receiptType")) || 2;
  const cfg = getReceiptTypeConfig(receiptType);
  const invoices = useMemo(() => legacyErpApi.invoices(receiptType), [receiptType]);
  const receipts = useMemo(() => (receiptType === 2 ? legacyErpApi.inventoryReceipts : legacyErpApi.receipts(receiptType)) as any, [receiptType]);
  const initialId = params.get("id") ? Number(params.get("id")) : null;

  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const lastSavedRef = useRef<Record<string, any>>(emptyForm);
  const [activeTab, setActiveTab] = useState<string>("General");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [udfDirtyBy, setUdfDirtyBy] = useState<Record<number, boolean>>({});
  /** Each shown receipt's line totals (the invoice's are their sum). */
  const [totalsByReceipt, setTotalsByReceipt] = useState<Record<number, ReceiptTotals>>({});
  const [selectedStock, setSelectedStock] = useState<{ stockOnHand: number | null; unit: string } | null>(null);
  const [orderLookupOpen, setOrderLookupOpen] = useState(false);
  const [receiptLookupOpen, setReceiptLookupOpen] = useState(false);
  const [invoiceLookupOpen, setInvoiceLookupOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  /** A new invoice's receipts (Source Receipt; first = header source). 2+ = one consolidated invoice. */
  const [sources, setSources] = useState<SourceReceiptRow[]>([]);
  /** A saved invoice's receipts (invoice.service get().receipts). */
  const [savedReceipts, setSavedReceipts] = useState<SourceReceiptRow[]>([]);
  const gridRefs = useRef<Record<number, InventoryReceiptLineGridHandle | null>>({});

  const isApproved = !!invoiceId && !!Number(form.isApproved);
  const readOnly = isApproved;
  const receiptId = Number(form.inventoryReceiptId) || null;
  const consolidated = invoiceId ? savedReceipts.length > 1 : sources.length > 1;
  // The receipts whose lines the invoice shows, each under its number when there are several.
  const lineReceipts: { id: number; receiptNo: string }[] = !invoiceId ? sources.map((s) => ({ id: s.id, receiptNo: s.receiptNo }))
    : consolidated ? savedReceipts.map((s) => ({ id: Number(s.id), receiptNo: s.receiptNo }))
    : receiptId ? [{ id: receiptId, receiptNo: form.inventoryReceiptNo }] : [];
  const totals: ReceiptTotals = lineReceipts.reduce((a, { id }) => {
    const t = totalsByReceipt[id];
    return t ? { items: a.items + t.items, totalQuantity: a.totalQuantity + t.totalQuantity, totalGrossQuantity: a.totalGrossQuantity + t.totalGrossQuantity,
      subTotal: a.subTotal + t.subTotal, vatTotal: a.vatTotal + t.vatTotal, grandTotal: a.grandTotal + t.grandTotal } : a;
  }, EMPTY_RECEIPT_TOTALS);
  const gridUdfDirty = lineReceipts.some(({ id }) => udfDirtyBy[id]);
  const grids = () => lineReceipts.map(({ id }) => [id, gridRefs.current[id]] as const).filter(([, g]) => !!g) as [number, InventoryReceiptLineGridHandle][];
  const receiptLocked = !!Number(form.receiptApproved);
  // Lines are the receipt's: locked by an approved invoice or an approved receipt (backend too).
  const linesReadOnly = readOnly || receiptLocked;
  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));
  const changed = (keys: readonly string[]) => keys.some((k) => str(form[k]) !== str(lastSavedRef.current[k]));
  const isDirty = !readOnly && (changed([...INVOICE_KEYS, "orderId"]) || gridUdfDirty);

  const { round, ensureLoaded } = useDecimalParameters();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);
  const fmt = (v: number, key: "quantity" | "amount") => round(v, key).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  // ── Load ───────────────────────────────────────────────────────────────────────────────────────
  const fromInvoice = (r: any) => ({
    ...emptyForm,
    receiptNo: str(r.receiptNo), receiptDate: dateOnly(r.receiptDate) || emptyForm.receiptDate, documentNo: str(r.documentNo),
    currentAccountId: str(r.currentAccountId), currentAccountCode: str(r.currentAccountCode), currentAccountName: str(r.currentAccountName),
    inWarehouseId: str(r.inWarehouseId), warehouseCode: str(r.warehouseCode), warehouseName: str(r.warehouseName),
    explanation: str(r.explanation), specialCode: str(r.specialCode), eximInvoiceNo: str(r.eximInvoiceNo), customerOrderNo: str(r.customerOrderNo),
    isEximReceipt: Number(r.isEximReceipt) ? 1 : 0,
    inventoryReceiptId: str(r.inventoryReceiptId), inventoryReceiptNo: str(r.inventoryReceiptNo), shipmentDate: dateOnly(r.shipmentDate),
    receiptDocumentNo: str(r.receiptDocumentNo), receiptApproved: Number(r.receiptApproved) ? 1 : 0, orderId: str(r.orderId), orderNo: str(r.orderNo),
    vehicleNo: str(r.vehicleNo), driverName: str(r.driverName),
    isApproved: Number(r.isApproved) ? 1 : 0, approvedAt: r.approvedAt ?? null,
  });
  const show = (r: any) => {
    const f = fromInvoice(r);
    setForm(f);
    lastSavedRef.current = f;
    setInvoiceId(Number(r.id));
    setSources([]);
    setSavedReceipts(Array.isArray(r.receipts) ? r.receipts : []);
  };
  const clearSources = () => { setSources([]); setSavedReceipts([]); setTotalsByReceipt({}); };
  const loadById = async (id: number) => {
    try { show(await invoices.get(id)); } catch (e: any) { toast.error(e.message || "Could not load the invoice"); }
  };
  const previewNumber = () => invoices.previewNextCode().then((r: any) => {
    setForm((p) => ({ ...p, receiptNo: r.code }));
    lastSavedRef.current = { ...lastSavedRef.current, receiptNo: r.code };
  }).catch(() => {});
  useEffect(() => { if (initialId) loadById(initialId); else previewNumber(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const newRecord = () => {
    if (isDirty && !window.confirm("Discard unsaved changes?")) return;
    setInvoiceId(null);
    setForm(emptyForm);
    lastSavedRef.current = emptyForm;
    clearSources();
    previewNumber();
  };
  const openInvoice = async (r: any) => {
    if (isDirty && !window.confirm("Discard unsaved changes?")) return;
    await loadById(Number(r.id));
  };

  // ── Integration ────────────────────────────────────────────────────────────────────────────────
  /** Links an Inventory Receipt: its Shipment Date / Document / Order / lock come along; an empty
   *  Current Account or Warehouse defaults from it. */
  const selectReceipt = async (c: any) => {
    // A new invoice takes the picked receipt's whole saved header (Create New's Source Receipt).
    if (!invoiceId) { await pickSource(c); return; }
    const r: any = await receipts.get(Number(c.id)).catch(() => null);
    if (!r) { toast.error("Could not load that receipt"); return; }
    const [account, warehouse]: any[] = await Promise.all([
      !form.currentAccountId && r.currentAccountId ? legacyErpApi.accounts.get(r.currentAccountId).catch(() => null) : null,
      !form.inWarehouseId && r.inWarehouseId ? legacyErpApi.warehouses.get(r.inWarehouseId).catch(() => null) : null,
    ]);
    setForm((p) => ({
      ...p,
      inventoryReceiptId: str(r.id), inventoryReceiptNo: str(r.receiptNo), shipmentDate: dateOnly(r.shipmentDate), receiptDocumentNo: str(r.documentNo),
      receiptApproved: Number(r.isApproved) ? 1 : 0, orderId: str(r.scriptId), orderNo: str(r.scriptReceiptNo),
      vehicleNo: str(r.plateNumber), driverName: str(r.driverName),
      ...(account ? { currentAccountId: str(r.currentAccountId), currentAccountCode: str(account.currentAccountCode), currentAccountName: str(account.currentAccountName) } : {}),
      ...(warehouse ? { inWarehouseId: str(r.inWarehouseId), warehouseCode: str(warehouse.warehouseCode), warehouseName: str(warehouse.warehouseName) } : {}),
    }));
    // The receipt's own Order is now the saved one for comparison.
    lastSavedRef.current = { ...lastSavedRef.current, orderId: str(r.scriptId) };
  };
  /** Create New → Source Receipt. An already-invoiced receipt opens its invoice (never a second).
   *  Receipts are added to the new invoice's set (`replace`: the set becomes these) — all of one
   *  Current Account (by id); the server re-checks every rule on Save. The FIRST receipt's saved
   *  header (server-shaped, company-scoped) fills the form for review; every receipt's lines show. */
  const openExisting = async (invId: number, invNo: string, recNo: string) => {
    toast.info(`Receipt ${recNo} is already on invoice ${invNo} — opening it.`);
    await loadById(invId);
  };
  const addSources = async (rows: SourceReceiptRow[], replace = false) => {
    const invoiced = rows.find((r) => r.invoiceId);
    if (invoiced) { await openExisting(Number(invoiced.invoiceId), str(invoiced.invoiceNo), str(invoiced.receiptNo)); return; }
    const next = replace ? rows : [...sources, ...rows.filter((r) => !sources.some((s) => s.id === r.id))];
    if (!next.length) return;
    const account = Number(next[0].currentAccountId) || null;
    if (next.length > 1 && next.some((r) => (Number(r.currentAccountId) || null) !== account)) {
      toast.error("Receipts of different Current Accounts can't be on one invoice.");
      return;
    }
    if (next.length > 1 && form.currentAccountId && account !== Number(form.currentAccountId)) {
      toast.error(`These receipts are not for ${form.currentAccountName || "the invoice's Current Account"}.`);
      return;
    }
    if (!replace && sources.length && sources[0].id === next[0].id) { setSources(next); set("inventoryReceiptNo", next.map((s) => s.receiptNo).join(", ")); return; }
    if (!(await fillFromReceipt(next[0].id))) return;
    setSources(next);
    set("inventoryReceiptNo", next.map((s) => s.receiptNo).join(", "));
  };
  const removeSource = async (id: number) => {
    const next = sources.filter((s) => s.id !== id);
    if (!next.length) { clearReceiptFields(); setSources([]); return; }
    if (sources[0].id === id && !(await fillFromReceipt(next[0].id))) return;
    setSources(next);
    set("inventoryReceiptNo", next.map((s) => s.receiptNo).join(", "));
  };
  const RECEIPT_FIELDS = ["inventoryReceiptId", "inventoryReceiptNo", "shipmentDate", "receiptDocumentNo", "receiptApproved", "vehicleNo", "driverName", "orderId", "orderNo"] as const;
  const clearReceiptFields = () => {
    setForm((p) => ({ ...p, ...Object.fromEntries(RECEIPT_FIELDS.map((k) => [k, emptyForm[k]])) }));
    lastSavedRef.current = { ...lastSavedRef.current, orderId: "" };
    setTotalsByReceipt({});
  };
  /** Selecting a different Current Account on a new invoice drops receipts of the previous one. */
  const changeAccount = (o: any) => {
    const id = str(o?.id);
    if (!invoiceId && sources.length && Number(sources[0].currentAccountId) !== Number(id)) {
      toast.info(`Receipts of ${form.currentAccountName || "the previous Current Account"} were removed — select ${str(o?.name)}'s receipts.`);
      setSources([]);
      clearReceiptFields();
    }
    setForm((p) => ({ ...p, currentAccountId: id, currentAccountCode: str(o?.code), currentAccountName: str(o?.name) }));
  };
  const pickSource = (row: SourceReceiptRow) => addSources([row], true);
  /** The form from a receipt's saved header (false when it is already invoiced / can't be read). */
  const fillFromReceipt = async (id: number): Promise<boolean> => {
    let r: any;
    try { r = await invoices.sourceReceipt(Number(id)); } catch (e: any) { toast.error(e.message || "Could not load that receipt"); return false; }
    if (r.invoiceId) { await openExisting(Number(r.invoiceId), str(r.invoiceNo), str(r.receiptNo)); return false; }
    setForm((p) => ({
      ...p,
      receiptDate: dateOnly(r.receiptDate) || p.receiptDate, documentNo: str(r.documentNo),
      currentAccountId: str(r.currentAccountId), currentAccountCode: str(r.currentAccountCode), currentAccountName: str(r.currentAccountName),
      inWarehouseId: str(r.inWarehouseId), warehouseCode: str(r.warehouseCode), warehouseName: str(r.warehouseName),
      explanation: str(r.explanation), specialCode: str(r.specialCode), eximInvoiceNo: str(r.eximInvoiceNo), customerOrderNo: str(r.customerOrderNo),
      isEximReceipt: Number(r.isEximReceipt) ? 1 : 0,
      inventoryReceiptId: str(r.id), inventoryReceiptNo: str(r.receiptNo), shipmentDate: dateOnly(r.shipmentDate), receiptDocumentNo: str(r.documentNo),
      receiptApproved: Number(r.isApproved) ? 1 : 0, orderId: str(r.orderId), orderNo: str(r.orderNo),
      vehicleNo: str(r.vehicleNo), driverName: str(r.driverName),
    }));
    // The receipt's own Order is the saved one for comparison.
    lastSavedRef.current = { ...lastSavedRef.current, orderId: str(r.orderId) };
    return true;
  };
  const selectOrder = (o: any) =>setForm((p) => ({ ...p, orderId: str(o.id), orderNo: str(o.receiptNo) }));

  // ── Save ───────────────────────────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!receiptId) { toast.error(invoiceId ? "Select the Inventory Receipt this invoice is for (Integration)." : "Select the receipts this invoice is for (Source Receipt → Select Receipts)."); return; }
    if (!form.currentAccountId) { toast.error("Current Account is required"); return; }
    if (!form.inWarehouseId) { toast.error("Warehouse is required"); return; }
    if (!grids().every(([, g]) => g.validateUdf())) return;
    setSaving(true);
    try {
      // Order lives on the receipt (IM_Receipt.ScriptId) — saved through the receipt's own API and
      // rules (refused while the receipt is approved).
      if (str(form.orderId) !== str(lastSavedRef.current.orderId)) {
        await receipts.update(receiptId, { scriptId: form.orderId ? Number(form.orderId) : null });
      }
      for (const [id, g] of grids()) await g.saveUdf(id);
      const dto = {
        receiptDate: form.receiptDate || null, documentNo: form.documentNo.trim() || null,
        currentAccountId: Number(form.currentAccountId), inWarehouseId: Number(form.inWarehouseId), inventoryReceiptId: receiptId,
        explanation: form.explanation.trim() || null, specialCode: form.specialCode.trim() || null,
        eximInvoiceNo: form.eximInvoiceNo.trim() || null, customerOrderNo: form.customerOrderNo.trim() || null, isEximReceipt: form.isEximReceipt ? 1 : 0,
      };
      // A new invoice also takes the (first) receipt's other saved header columns (as Create Invoice
      // does); the reviewed fields above are kept. Several receipts → one consolidated invoice.
      show(invoiceId ? await invoices.update(invoiceId, dto)
        : await invoices.create({ ...dto, inventoryReceiptIds: sources.map((s) => s.id), copyReceiptHeader: true }));
      toast.success(invoiceId ? "Invoice updated" : "Invoice created");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };
  useWorkspaceDirty(isDirty, async () => { await save(); });

  // ── Approve / Unapprove / Delete / Close ───────────────────────────────────────────────────────
  const approve = async () => {
    if (!invoiceId) return;
    if (isDirty) { toast.error("Save your changes before approving."); return; }
    setBusy(true);
    try { show(await invoices.approve(invoiceId)); toast.success("Invoice approved"); }
    catch (e: any) { toast.error(e.message || "Approval failed"); } finally { setBusy(false); }
  };
  const unapprove = async () => {
    if (!invoiceId) return;
    setBusy(true);
    try { show(await invoices.unapprove(invoiceId)); toast.success("Invoice reopened"); }
    catch (e: any) { toast.error(e.message || "Unapprove failed"); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!invoiceId) return;
    try { await invoices.delete(invoiceId); toast.success("Invoice deleted"); setDeleteOpen(false); setInvoiceId(null); setForm(emptyForm); lastSavedRef.current = emptyForm; clearSources(); previewNumber(); }
    catch (e: any) { toast.error(e.message); }
  };
  const tabCtx = useWorkspaceTabContext();
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const close = () => {
    if (isDirty && !window.confirm("Close without saving?")) return;
    closeTab(tabCtx?.tabKey ?? currentAppPath(false));
  };

  const statusText = isApproved ? "Approved" : "Unapproved";
  const docTitle = `Invoice [${receiptType}-${cfg.label}] [${statusText}] - ${form.receiptNo || "New"}`;
  useWorkspaceTabTitle(invoiceId ? docTitle : `New ${cfg.label} Invoice`);

  return (
    <div className="space-y-2 p-3 text-[12px]" data-testid="invoice-screen">
      {/* Document header — type, number, status — and the actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 data-testid="document-title" className="truncate text-[13px] font-semibold text-primary">{docTitle}</h1>
          {invoiceId && (
            <Badge variant={isApproved ? "default" : "secondary"} className="h-5 text-[11px] font-normal">
              {isApproved ? `Approved${form.approvedAt ? ` · ${dateOnly(form.approvedAt)}` : ""}` : "Unapproved"}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={newRecord}><FilePlus2 className="mr-1.5 h-3.5 w-3.5" />New</Button>
          {invoiceId && !isApproved && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={approve} disabled={busy}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Approve</Button>}
          {isApproved && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={unapprove} disabled={busy}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Unapprove</Button>}
          {!readOnly && <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}><Save className="mr-1.5 h-3.5 w-3.5" />{saving ? "Saving..." : "Save"}</Button>}
          {invoiceId && !isApproved && <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={close}><X className="mr-1 h-3.5 w-3.5" />Close</Button>
        </div>
      </div>

      {isApproved && (
        <p className="rounded-sm border bg-muted/40 px-3 py-1 text-[11.5px] text-muted-foreground">
          This invoice is approved, so it and its receipt&apos;s lines are locked. Click <span className="font-medium text-foreground">Unapprove</span> to change them.
        </p>
      )}
      {!isApproved && receiptLocked && (
        <p className="rounded-sm border bg-muted/40 px-3 py-1 text-[11.5px] text-muted-foreground">
          Receipt {form.inventoryReceiptNo} is approved, so its lines and Order are locked. Unapprove it on the Inventory Receipt screen to change them.
        </p>
      )}

      {!invoiceId && (
        <SourceReceiptPicker api={invoices} accountId={Number(form.currentAccountId) || null} accountName={form.currentAccountName}
          selected={sources} onAdd={(rows) => addSources(rows)} onRemove={removeSource}
          onOpenInvoice={(r) => openExisting(Number(r.invoiceId), str(r.invoiceNo), str(r.receiptNo))} />
      )}
      {invoiceId && consolidated && (
        <p data-testid="consolidated-receipts" className="rounded-sm border bg-muted/40 px-3 py-1 text-[11.5px] text-muted-foreground">
          Consolidated invoice of {savedReceipts.length} receipts: <span className="font-mono text-foreground">{savedReceipts.map((r) => r.receiptNo).join(", ")}</span>. Their lines are shown below, each under its receipt.
        </p>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0">
        <TabsList className="h-7 justify-start gap-0.5 rounded-none border-b bg-transparent p-0">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}
              className="h-7 flex-none rounded-none rounded-t-sm border border-b-0 border-border bg-muted/40 px-4 text-[12px] font-normal shadow-none data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-none">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="rounded-b-sm border border-t-0 border-border bg-background p-2">
          <fieldset disabled={readOnly} className="contents">
            <TabsContent value="General" className="mt-0">
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                <div className="space-y-2 lg:col-span-2">
                  <Group title="General Info">
                    <Row label="Receipt No" strong htmlFor="inv-no">
                      <InputGroup className="h-7 w-64">
                        <InputGroupInput id="inv-no" value={form.receiptNo} readOnly className="font-mono text-[13px] font-semibold" />
                        <InputGroupAddon align="inline-end">
                          <Button type="button" variant="ghost" size="icon" className="h-5 w-5" title="Find an invoice" aria-label="Find an invoice" onClick={() => setInvoiceLookupOpen(true)}>
                            <Search className="h-3.5 w-3.5" />
                          </Button>
                        </InputGroupAddon>
                      </InputGroup>
                    </Row>
                    <Row label="Receipt Date" htmlFor="inv-date"><input id="inv-date" type="date" className={cn(box, "w-36")} value={form.receiptDate} onChange={(e) => set("receiptDate", e.target.value)} /></Row>
                    <Row label="Shipment Date" htmlFor="inv-shipment">
                      {/* The linked receipt's (IM_Invoice has no Shipment Date). */}
                      <input id="inv-shipment" type="date" readOnly tabIndex={-1} className={cn(box, "w-36")} value={form.shipmentDate} />
                    </Row>
                    <Row label="Document" htmlFor="inv-document"><input id="inv-document" className={cn(box, "w-36")} value={form.documentNo} onChange={(e) => set("documentNo", e.target.value)} /></Row>
                    <Row label="Receipt Document" htmlFor="inv-receipt-document">
                      <input id="inv-receipt-document" readOnly tabIndex={-1} className={cn(box, "w-36")} value={form.receiptDocumentNo} />
                    </Row>
                    {/* The linked receipt's (IM_Invoice has no Vehicle No / Driver Name). */}
                    <Row label="Vehicle No" htmlFor="inv-vehicle"><input id="inv-vehicle" readOnly tabIndex={-1} className={cn(box, "w-36")} value={form.vehicleNo} /></Row>
                    <Row label="Driver Name" htmlFor="inv-driver"><input id="inv-driver" readOnly tabIndex={-1} className={cn(box, "w-56")} value={form.driverName} /></Row>
                  </Group>
                  <Group title="Current Account Info">
                    <Row label="Current Account">
                      <div className="w-40 shrink-0">
                        <MasterAutocompleteField label="" compact masterKey="currentAccount" displayValue={form.currentAccountCode}
                          fetchOptions={(term) => legacyErpApi.accounts.list(term) as Promise<any[]>} lookupPath={CURRENT_ACCOUNTS_LIST_PATH}
                          onSelect={changeAccount}
                          onClear={() => setForm((p) => ({ ...p, currentAccountId: "", currentAccountCode: "", currentAccountName: "" }))} />
                      </div>
                      <span data-testid="current-account-name" className="truncate">{form.currentAccountName}</span>
                    </Row>
                  </Group>
                  <Group title="Warehouse Info">
                    <Row label="Warehouse">
                      <div className="w-40 shrink-0">
                        <MasterAutocompleteField label="" compact masterKey="warehouse" displayValue={form.warehouseCode || form.warehouseName}
                          onSelect={(o: any) => setForm((p) => ({ ...p, inWarehouseId: str(o.id), warehouseCode: str(o.code), warehouseName: str(o.name) }))}
                          onClear={() => setForm((p) => ({ ...p, inWarehouseId: "", warehouseCode: "", warehouseName: "" }))} />
                      </div>
                      <span data-testid="warehouse-name" className="truncate">{form.warehouseCode ? form.warehouseName : ""}</span>
                    </Row>
                  </Group>
                </div>
                <Group title="Integration" className="self-start">
                  <Row label="Order" labelWidth={110}>
                    {/* The linked receipt's Subcontract Order (IM_Receipt.ScriptId). */}
                    <InputGroup className="h-6">
                      <InputGroupInput aria-label="Order" readOnly value={form.orderNo} placeholder={receiptId ? "Subcontract Order..." : "Select a receipt first"} className="h-6 font-mono text-[12px]" />
                      <InputGroupAddon align="inline-end">
                        {form.orderId && !readOnly && !receiptLocked && (
                          <Button type="button" variant="ghost" size="icon" className="h-5 w-5" aria-label="Clear order" onClick={() => setForm((p) => ({ ...p, orderId: "", orderNo: "" }))}><X className="h-3.5 w-3.5" /></Button>
                        )}
                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5" aria-label="Search Subcontract Orders" disabled={readOnly || receiptLocked || !receiptId} onClick={() => setOrderLookupOpen(true)}><Search className="h-3.5 w-3.5" /></Button>
                      </InputGroupAddon>
                    </InputGroup>
                  </Row>
                  <Row label="Inventory Receipt" labelWidth={110}>
                    <InputGroup className="h-6">
                      <InputGroupInput aria-label="Inventory Receipt" readOnly value={form.inventoryReceiptNo} placeholder={`${cfg.label}...`} className="h-6 font-mono text-[12px]" />
                      <InputGroupAddon align="inline-end">
                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5" aria-label="Search Inventory Receipts" disabled={readOnly || consolidated} onClick={() => setReceiptLookupOpen(true)}><Search className="h-3.5 w-3.5" /></Button>
                      </InputGroupAddon>
                    </InputGroup>
                  </Row>
                </Group>
              </div>
            </TabsContent>

            <TabsContent value="Detail" className="mt-0">
              <Group title="Detail" className="max-w-xl">
                <Row label="Explanation" htmlFor="inv-explanation"><input id="inv-explanation" className={cn(box, "w-full")} value={form.explanation} onChange={(e) => set("explanation", e.target.value)} /></Row>
                <Row label="Special Code" htmlFor="inv-special"><input id="inv-special" className={cn(box, "w-48")} value={form.specialCode} onChange={(e) => set("specialCode", e.target.value)} /></Row>
              </Group>
            </TabsContent>

            <TabsContent value="Export" className="mt-0">
              <Group title="Export" className="max-w-xl">
                <Row label="Exim Invoice No" htmlFor="inv-exim"><input id="inv-exim" className={cn(box, "w-56")} value={form.eximInvoiceNo} onChange={(e) => set("eximInvoiceNo", e.target.value)} /></Row>
                <Row label="Customer Order No" htmlFor="inv-customer-order"><input id="inv-customer-order" className={cn(box, "w-56")} value={form.customerOrderNo} onChange={(e) => set("customerOrderNo", e.target.value)} /></Row>
                <Row label="Exim Receipt" htmlFor="inv-is-exim"><input id="inv-is-exim" type="checkbox" className="h-3.5 w-3.5" checked={!!form.isEximReceipt} onChange={(e) => set("isEximReceipt", e.target.checked ? 1 : 0)} /></Row>
              </Group>
            </TabsContent>
          </fieldset>

          <TabsContent value="Totals" className="mt-0">
            <Group title="Totals" className="max-w-md">
              {([
                ["Items", String(totals.items), "items"],
                ["Total Quantity", fmt(totals.totalQuantity, "quantity"), "totalQuantity"],
                ["Total Gross Quantity", fmt(totals.totalGrossQuantity, "quantity"), "totalGrossQuantity"],
                ["Subtotal", fmt(totals.subTotal, "amount"), "subTotal"],
                ["VAT Total", fmt(totals.vatTotal, "amount"), "vatTotal"],
                ["Grand Total", fmt(totals.grandTotal, "amount"), "grandTotal"],
              ] as const).map(([label, value, key]) => (
                <Row key={key} label={label} labelWidth={150}><span data-totals-tab={key} className={cn("tabular-nums", key === "grandTotal" && "font-semibold")}>{value}</span></Row>
              ))}
            </Group>
          </TabsContent>
          <TabsContent value="Attachments" className="mt-0">
            {invoiceId ? <AttachmentsTab itemId={invoiceId} readOnly={readOnly} api={invoices} /> : (
              <Empty className="py-6"><EmptyHeader><EmptyMedia variant="icon"><Lock /></EmptyMedia><EmptyTitle className="text-sm">Save required</EmptyTitle><EmptyDescription>Save the invoice first to add attachments.</EmptyDescription></EmptyHeader></Empty>
            )}
          </TabsContent>
        </div>
      </Tabs>

      {/* Detail lines — the linked receipt's lines, through the receipt's own line grid and APIs. */}
      {/* A consolidated invoice shows each receipt's own lines under its number. */}
      {lineReceipts.length ? lineReceipts.map(({ id, receiptNo }) => (
        <div key={id} data-testid="receipt-lines" data-receipt-no={receiptNo} className="space-y-1">
          {lineReceipts.length > 1 && (
            <div className="flex items-baseline gap-2 border-b pb-0.5 text-[12px]">
              <span className="font-semibold">Receipt <span className="font-mono">{receiptNo}</span></span>
              {totalsByReceipt[id] && <span data-testid="receipt-lines-summary" className="text-muted-foreground">{totalsByReceipt[id].items} line{totalsByReceipt[id].items === 1 ? "" : "s"} · {fmt(totalsByReceipt[id].grandTotal, "amount")}</span>}
            </div>
          )}
          <InventoryReceiptLineGrid key={id} ref={(g) => { gridRefs.current[id] = g; }} inventoryReceiptId={id} readOnly={linesReadOnly} api={receipts}
            onUdfDirtyChange={(d) => setUdfDirtyBy((p) => (p[id] === d ? p : { ...p, [id]: d }))} hideFooter columnLayout={INVOICE_COLUMN_LAYOUT}
            onTotalsChange={(t, sel) => { setTotalsByReceipt((p) => ({ ...p, [id]: t })); setSelectedStock(sel); }} />
        </div>
      )) : (
        <div data-testid="no-receipt" className="rounded-sm border border-dashed px-3 py-6 text-center text-muted-foreground">
          Select the receipts this invoice is for (Source Receipt → Select Receipts); the first one&apos;s header fills in and their lines appear here.
        </div>
      )}

      <div data-testid="invoice-totals" className="grid grid-cols-1 gap-x-10 gap-y-1 rounded-sm border bg-muted/30 px-3 py-2 sm:grid-cols-2">
        <dl className="grid grid-cols-[150px_auto] items-baseline gap-x-3 gap-y-0.5">
          <dt className="text-right text-muted-foreground">Stock on Hand</dt>
          <dd data-total="stockOnHand" className="tabular-nums">{selectedStock ? <>{fmt(selectedStock.stockOnHand ?? 0, "quantity")}{selectedStock.unit && <span className="ml-2">{selectedStock.unit}</span>}</> : <span className="text-muted-foreground">—</span>}</dd>
          <dt className="text-right text-muted-foreground">Total Quantity</dt>
          <dd data-total="totalQuantity" className="tabular-nums">{fmt(totals.totalQuantity, "quantity")} <span className="ml-2">({totals.items} Item{totals.items === 1 ? "" : "s"})</span></dd>
          <dt className="text-right text-muted-foreground">Total Gross Quantity</dt>
          <dd data-total="totalGrossQuantity" className="tabular-nums">{fmt(totals.totalGrossQuantity, "quantity")}</dd>
        </dl>
        <dl className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-0.5 sm:justify-self-end">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd data-total="subTotal" className="text-right tabular-nums">{fmt(totals.subTotal, "amount")}</dd>
          <dt className="text-muted-foreground">VAT Total</dt>
          <dd data-total="vatTotal" className="text-right tabular-nums">{fmt(totals.vatTotal, "amount")}</dd>
          <dt className="font-semibold">Grand Total</dt>
          <dd data-total="grandTotal" className="text-right font-semibold tabular-nums">{fmt(totals.grandTotal, "amount")}</dd>
        </dl>
      </div>

      <EntityListLookupDialog<any>
        open={invoiceLookupOpen} onOpenChange={setInvoiceLookupOpen}
        title={`${cfg.label} Invoices`} description="Open an existing invoice."
        columns={[
          { key: "receiptNo", label: "Invoice No", sortable: true, render: (r: any) => <span className="font-mono text-xs">{r.receiptNo}</span> },
          { key: "receiptDate", label: "Date", sortable: true, render: (r: any) => dateOnly(r.receiptDate) || "—" },
          { key: "inventoryReceiptNo", label: "Inventory Receipt", sortable: true, render: (r: any) => r.inventoryReceiptNo || "—" },
          { key: "currentAccountName", label: "Current Account", sortable: true, render: (r: any) => r.currentAccountName || "—" },
        ]}
        load={(term, req) => invoices.list(term, req)}
        defaultSortBy="receiptNo" defaultSortDir="desc" searchPlaceholder="Search by invoice or receipt no..."
        getRowKey={(r: any) => r.id} storageKey={`invoiceLookup_${receiptType}`} onSelect={openInvoice}
      />
      <EntityListLookupDialog<any>
        open={receiptLookupOpen} onOpenChange={setReceiptLookupOpen}
        title={`${cfg.label} List`} description="Receipts of this type and Current Account that are not on another invoice."
        columns={[
          { key: "receiptNo", label: "Receipt No", sortable: true, render: (r: any) => <span className="font-mono text-xs">{r.receiptNo}</span> },
          { key: "receiptDate", label: "Receipt Date", sortable: true, render: (r: any) => dateOnly(r.receiptDate) || "—" },
          { key: "currentAccountName", label: "Current Account", sortable: true, render: (r: any) => r.currentAccountName || "—" },
          { key: "documentNo", label: "Document", render: (r: any) => r.documentNo || "—" },
        ]}
        load={(term, req) => invoices.receiptCandidates(term, invoiceId, req, Number(form.currentAccountId) || null)}
        defaultSortBy="receiptNo" defaultSortDir="desc" searchPlaceholder="Search by Receipt No..."
        getRowKey={(r: any) => r.id} storageKey={`invoiceReceiptLookup_${receiptType}`} onSelect={selectReceipt}
      />
      <EntityListLookupDialog<any>
        open={orderLookupOpen} onOpenChange={setOrderLookupOpen}
        title="Subcontract Orders List" description="Pick the Subcontract Order the receipt belongs to."
        columns={[
          { key: "receiptNo", label: "Order No", sortable: true, render: (r: any) => <span className="font-mono text-xs">{r.receiptNo}</span> },
          { key: "receiptDate", label: "Order Date", sortable: true, render: (r: any) => dateOnly(r.receiptDate) || "—" },
          { key: "documentNo", label: "Document No", sortable: true, render: (r: any) => r.documentNo || "—" },
        ]}
        load={(term, req) => legacyErpApi.orders(SUBCONTRACT_ORDER_TYPE).list(term, "all", req)}
        defaultSortBy="receiptNo" defaultSortDir="desc" searchPlaceholder="Search by Order No..."
        getRowKey={(r: any) => r.id} storageKey="invoiceSubcontractOrderLookup" onSelect={selectOrder}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice {form.receiptNo}?</AlertDialogTitle>
            <AlertDialogDescription>The invoice is removed and its receipt becomes available for another invoice. The receipt and its lines are not changed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={remove}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
