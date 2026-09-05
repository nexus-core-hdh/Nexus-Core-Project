"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ClipboardList, Save, Plus, Trash2, Search, ArrowDownToLine, Image as ImageIcon, Ruler, Pencil, Copy, Hash } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { MasterAutocompleteField } from "@/components/legacy-erp/master-autocomplete-field";
import { FormTextField as FieldText, FormSwitchField as FieldCheck } from "@/components/forms/form-field";
import { CardLookupDialog, type CardLookupRow } from "@/components/legacy-erp/card-lookup-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelectSizesDialog, type SizeGroup } from "@/app/dashboard/(auth)/plm/_components/select-sizes-dialog";
import { BomTab } from "@/app/dashboard/(auth)/plm/style-cards/[id]/_components/bom-tab";
import { RowContextMenu, RowActionsMenu, type RowAction } from "@/components/legacy-erp/row-actions";
import { useWorkspaceSearchParams } from "@/hooks/use-workspace-search-params";
import { useWorkspaceDirty } from "@/hooks/use-workspace-dirty";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { useDecimalParameters } from "@/hooks/use-decimal-parameters";

const CURRENT_ACCOUNTS_LIST_PATH = "/dashboard/legacy-erp/current-accounts-list";
const OUTER_TABS = ["General", "Detail", "General Explanation", "Customized Fields"];
const SECONDARY_TABS = [
  "C/S Details", "Price", "Additional Quantity for Manufacturing", "Will Cut Qty",
  "Color/Size Explanation", "Color/Size Barcode", "Explanation", "Expenses", "Revenue",
  "BOM", "Activities", "Wash & Care", "Attachments", "Style Picture Gallery",
];
const BOM_SUB_TABS = ["fabric", "trim", "ornament", "process"] as const;
type BomLineType = (typeof BOM_SUB_TABS)[number];

const uid = () => Math.random().toString(36).slice(2, 10);
const num = (v: any) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const COLOR_SIZE_SEP = "‖"; // ‖ — client-side composite-key convention documented in work-order.service.ts

const emptyHeader = {
  workOrderNo: "", workOrderDate: new Date().toISOString().slice(0, 10),
  currentAccountId: "", currentAccountLabel: "", uD_Brands: "",
  deliveryDate: "", agreedDeliveryDate: "", planDate: "", shipmentDate: "",
  quantity: 0, isClosed: false, isSample: false,
  uD_SampleRevision: 0, uD_reasonOfRevision: "", explanation: "",
  // Detail tab — all real MA_WorkOrder columns (see work-order.service.ts's DETAIL_COLUMNS).
  // specialCode/customerOrderNo are the HEADER-level columns, distinct from the Style Info
  // grid's own per-row MA_WorkOrderItem.specialCode/customerOrderNo.
  specialCode: "", customerOrderNo: "", quantity2: 0, cmtPrice: 0,
  cmtForexId: "", cmtForexLabel: "",
  warehouseId: "", warehouseLabel: "", factoryId: "", factoryLabel: "",
  countryId: "", countryLabel: "", employeeId: "", employeeLabel: "",
  status: 0, seasonCode: "",
  productionColorCumulativeType: 0, rowColor: 0, productionCertificates: "",
  certificationId: "", certificationLabel: "", initialCostId: "", initialCostLabel: "",
  projectId: "", projectLabel: "", brokerId: "", brokerLabel: "",
  comissionPercent: 0, generalExpensePercent: 0,
  discountAmount: 0, discountType: 0, isItemDiscount: false, typeOfShipment: 0,
  handoverDate: "", cuttingApprovedDate: "",
};

// Status/DiscountType/TypeOfShipment/ProductionColorCumulativeType/RowColor are all real
// MA_WorkOrder smallint columns with NO existing lookup/enum master anywhere in this codebase
// (confirmed by inspection — same undocumented-business-convention pattern as RecipeType/ItemType
// elsewhere in this schema). No prior Work Order code defined labels for them either, so — per
// "if the system already uses 'Planned', preserve it" — since nothing pre-existing does, these
// are a new, clearly-documented convention assigned here, not extracted from existing code.
const STATUS_OPTIONS = [
  { value: 0, label: "Open" }, { value: 1, label: "Planned" }, { value: 2, label: "In Production" },
  { value: 3, label: "Completed" }, { value: 4, label: "Cancelled" },
];
const DISCOUNT_TYPE_OPTIONS = [{ value: 0, label: "Percent" }, { value: 1, label: "Amount" }];
const YES_NO_OPTIONS = [{ value: 0, label: "No" }, { value: 1, label: "Yes" }];
const SHIPMENT_TYPE_OPTIONS = [{ value: 0, label: "Not Specified" }, { value: 1, label: "By Sea" }, { value: 2, label: "By Air" }, { value: 3, label: "By Land" }];

// One Style Info row = one MA_WorkOrderItem. styleCardId/styleCode/styleName/routeCode/customerLabel
// are in-memory display fields resolved from the real Prisma StyleCard — per Global Rule #5, no
// bridge column exists between legacy MA_WorkOrder (bigint) and Prisma StyleCard (uuid), so on
// reload only the already-copied display values below come back, not a re-resolved StyleCard
// object; sizes/BOM-transfer require re-selecting the Style Card once per edit session.
type StyleRow = {
  id: string; recId?: number;
  styleCardId: string; styleCode: string; styleName: string;
  explanation: string; specialCode: string; routeCode: string;
  forexUnitPrice: number; unitPrice: number; packageQuantity: number;
  customerOrderNo: string; partOrderNo: string; shipmentDate: string;
};
const blankStyleRow = (): StyleRow => ({
  id: uid(), styleCardId: "", styleCode: "", styleName: "", explanation: "", specialCode: "", routeCode: "",
  forexUnitPrice: 0, unitPrice: 0, packageQuantity: 0, customerOrderNo: "", partOrderNo: "", shipmentDate: "",
});

// One Color row, pivoted from N flat MA_WorkOrderItemVariant rows (one per selected Size) via the
// Explanation="Color‖Size" composite key — see work-order.service.ts's own comment on this.
// customerOrderNo/partOrderNo/explanation/deliveryDate have no column on MA_WorkOrderItemVariant
// (verified against its real 21-column shape) — they mirror the single Style Info (MA_WorkOrderItem)
// row above and are shown read-only here purely for reference-screen visual parity; edit them on
// the Style Info row. price/surplus/lot ARE real per-row values (UnitPrice/AdditionalQuantity/
// Barcode), written identically onto every Size cell of that Color on save.
type QtyRow = { id: string; color: string; price: number; surplus: number; lot: string; sizes: Record<string, number> };
const blankQtyRow = (): QtyRow => ({ id: uid(), color: "", price: 0, surplus: 0, lot: "", sizes: {} });

type NoteRow = { id: number; explanationText?: string; explanation?: string; quantity?: number; amount?: number };

interface StyleCardLookupRow extends CardLookupRow { raw: any }

// Work Order transaction screen — dense legacy-ERP layout matching the reference screenshots.
// General/Style Info/Size Selection/C-S Details/BOM all bind to the real, pre-existing
// MA_WorkOrder/MA_WorkOrderItem/MA_WorkOrderItemVariant/MA_Recipe/MA_RecipeItem legacy tables
// (work-order.service.ts) plus the real Prisma StyleCard (Style master) — no new database
// structure. Style is looked up via the SAME StyleCard the PLM Style Card screen already owns
// (plmApi.styleCards), never a second Style master.
export default function WorkOrderPage() {
  const router = useRouter();
  const searchParams = useWorkspaceSearchParams();
  const initialMode = (searchParams.get("mode") as "view" | "edit" | "create" | null) || "create";
  const initialId = searchParams.get("id");
  const { round, ensureLoaded } = useDecimalParameters();
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);

  const [woId, setWoId] = useState<number | null>(null);
  const [header, setHeader] = useState(emptyHeader);
  const [readOnly, setReadOnly] = useState(initialMode === "view");
  const [loading, setLoading] = useState(!!initialId);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(emptyHeader);

  const [styleRows, setStyleRows] = useState<StyleRow[]>([blankStyleRow()]);
  const [styleCardFull, setStyleCardFull] = useState<any>(null); // full detail of styleRows[0]'s StyleCard, for sizes/washCare/gallery
  const [availableSizes, setAvailableSizes] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [qtyRows, setQtyRows] = useState<QtyRow[]>([blankQtyRow()]);
  const [primaryItemId, setPrimaryItemId] = useState<number | undefined>(undefined);

  const [explanationRows, setExplanationRows] = useState<NoteRow[]>([]);
  const [activityRows, setActivityRows] = useState<NoteRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<NoteRow[]>([]);

  // BOM rows/tab state now live entirely inside BomTab (mounted below in "workOrder" mode) — no
  // parallel bomLines/bomTab state here anymore.
  const [bomReloadTick, setBomReloadTick] = useState(0);

  const [styleLookupOpen, setStyleLookupOpen] = useState(false);
  const [lookupRowId, setLookupRowId] = useState<string | null>(null);

  const totalQuantity = useMemo(
    () => qtyRows.reduce((sum, r) => sum + Object.values(r.sizes).reduce((s, v) => s + num(v), 0), 0),
    [qtyRows],
  );

  const load = async (id: number) => {
    setLoading(true);
    try {
      const wo = await legacyErpApi.workOrders.get(id);
      const acc = (wo as any).currentAccountId ? await legacyErpApi.accounts.get((wo as any).currentAccountId).catch(() => null) : null;
      const f = {
        ...emptyHeader, ...(wo as any),
        workOrderDate: (wo as any).workOrderDate ? String((wo as any).workOrderDate).slice(0, 10) : emptyHeader.workOrderDate,
        deliveryDate: (wo as any).deliveryDate ? String((wo as any).deliveryDate).slice(0, 10) : "",
        agreedDeliveryDate: (wo as any).agreedDeliveryDate ? String((wo as any).agreedDeliveryDate).slice(0, 10) : "",
        planDate: (wo as any).planDate ? String((wo as any).planDate).slice(0, 10) : "",
        shipmentDate: (wo as any).shipmentDate ? String((wo as any).shipmentDate).slice(0, 10) : "",
        handoverDate: (wo as any).handoverDate ? String((wo as any).handoverDate).slice(0, 10) : "",
        cuttingApprovedDate: (wo as any).cuttingApprovedDate ? String((wo as any).cuttingApprovedDate).slice(0, 10) : "",
        isClosed: !!(wo as any).isClosed, isSample: !!(wo as any).isSample, isItemDiscount: !!(wo as any).isItemDiscount,
        currentAccountLabel: acc ? `${(acc as any).code} — ${(acc as any).name}` : "",
      };
      setHeader(f);
      setLastSaved(f);
      setWoId((wo as any).id);

      // Resolve the 8 FK ids stored on the header (Warehouse/Factory/Country/Customer Represent/
      // Certification/Initial Cost/Project/Commissioner/CMT Forex) back to display labels — the
      // list endpoints only support typeahead search, so a saved id needs the dedicated
      // resolve-by-id lookup (legacy-master-lookup.controller.ts's new :key/:id route) instead.
      const resolveLabel = (key: string, id: any) => id ? legacyErpApi.lookupTableGet(key, Number(id)).catch(() => null) : Promise.resolve(null);
      const resolveAccount = (id: any) => id ? legacyErpApi.accounts.get(Number(id)).catch(() => null) : Promise.resolve(null);
      Promise.all([
        resolveLabel("warehouse", f.warehouseId), resolveAccount(f.factoryId), resolveLabel("country", f.countryId),
        resolveLabel("employee", f.employeeId), resolveLabel("certification", f.certificationId),
        resolveLabel("initial-cost", f.initialCostId), resolveLabel("project", f.projectId),
        resolveAccount(f.brokerId), resolveLabel("forex", f.cmtForexId),
      ]).then(([wh, fac, ctry, emp, cert, ic, proj, brk, fx]: any[]) => {
        const labels = {
          warehouseLabel: wh?.name || "", factoryLabel: fac ? `${fac.code} — ${fac.name}` : "",
          countryLabel: ctry?.name || "", employeeLabel: emp?.name || "", certificationLabel: cert?.name || "",
          initialCostLabel: ic?.name || "", projectLabel: proj?.name || "",
          brokerLabel: brk ? `${brk.code} — ${brk.name}` : "", cmtForexLabel: fx?.name || "",
        };
        // Applied to BOTH header and lastSaved — resolving a display label is not a user edit,
        // so it must never flip isDirty (and trigger useWorkspaceDirty's auto-save) on its own.
        setHeader((p) => ({ ...p, ...labels }));
        setLastSaved((p) => ({ ...p, ...labels }));
      });

      const items = await legacyErpApi.workOrders.listItems(id).catch(() => []);
      const itemList = Array.isArray(items) ? items : [];
      setStyleRows(itemList.length ? itemList.map((r: any) => ({
        id: uid(), recId: r.id, styleCardId: "", styleCode: "", styleName: r.explanation || "",
        explanation: r.explanation || "", specialCode: r.specialCode || "", routeCode: "",
        forexUnitPrice: num(r.forexUnitPrice), unitPrice: num(r.unitPrice), packageQuantity: num(r.packageQuantity),
        customerOrderNo: r.customerOrderNo || "", partOrderNo: r.partOrderNo || "",
        shipmentDate: r.shipmentDate ? String(r.shipmentDate).slice(0, 10) : "",
      })) : [blankStyleRow()]);

      const primId = itemList[0]?.id;
      setPrimaryItemId(primId);
      const variants = primId ? await legacyErpApi.workOrders.listItemVariants(primId).catch(() => []) : [];
      const variantList = Array.isArray(variants) ? variants : [];
      const byColor = new Map<string, QtyRow>();
      const sizesSeen = new Set<string>();
      for (const v of variantList) {
        const [color, size] = String(v.explanation || "").split(COLOR_SIZE_SEP);
        if (!color) continue;
        if (size) sizesSeen.add(size);
        if (!byColor.has(color)) byColor.set(color, { id: uid(), color, price: num(v.unitPrice), surplus: num(v.additionalQuantity), lot: v.barcode || "", sizes: {} });
        const row = byColor.get(color)!;
        if (size) row.sizes[size] = num(v.quantity);
      }
      setQtyRows(byColor.size ? Array.from(byColor.values()) : [blankQtyRow()]);
      const reloadedSizes = Array.from(sizesSeen);
      setSelectedSizes(reloadedSizes);
      setAvailableSizes(reloadedSizes);
      // Which Size Group these came from isn't persisted anywhere (no new table, per the task's
      // own constraint) — only the resolved size codes round-trip via MA_WorkOrderItemVariant.
      // Right-click -> Select Size still works normally to load a (possibly different) group.
      setSizeGroupLabel(reloadedSizes.length ? "saved sizes" : "");

      // BOM itself (Fabric/Trim/Ornament/Process rows) is loaded by BomTab's own internal load()
      // once mounted in "workOrder" mode below — no parallel fetch/state here.
      const [expl, acts, exps] = await Promise.all([
        legacyErpApi.workOrders.listTab(id, "work-order-explanation").catch(() => []),
        legacyErpApi.workOrders.listTab(id, "work-order-activities").catch(() => []),
        legacyErpApi.workOrders.listTab(id, "work-order-expenses").catch(() => []),
      ]);
      setExplanationRows(Array.isArray(expl) ? expl : []);
      setActivityRows(Array.isArray(acts) ? acts : []);
      setExpenseRows(Array.isArray(exps) ? exps : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load work order");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (initialId) load(Number(initialId)); }, [initialId]);
  useEffect(() => { setReadOnly(initialMode === "view"); }, [initialMode]);

  const set = (key: keyof typeof header, value: any) => setHeader((p) => ({ ...p, [key]: value }));
  const isDirty = !readOnly && (JSON.stringify(header) !== JSON.stringify(lastSaved));
  useWorkspaceDirty(isDirty, async () => { await save(); });
  useWorkspaceRecordLabel(woId ? header.workOrderNo || undefined : undefined);

  // ── Style selection ─────────────────────────────────────────────────────────────────────
  const openStyleLookup = (rowId: string) => { setLookupRowId(rowId); setStyleLookupOpen(true); };

  const onStyleSelected = async (row: StyleCardLookupRow) => {
    const card = row.raw;
    setStyleRows((rs) => rs.map((r) => r.id === lookupRowId ? {
      ...r, styleCardId: card.id, styleCode: card.styleNumber, styleName: card.title,
      routeCode: card.bomRouteCode || "", customerOrderNo: r.customerOrderNo,
    } : r));
    // First Style row drives BOM-transfer/Wash&Care/Gallery for this Work Order (sizes are a
    // separate, explicit action — see "Select Size" below, not tied to Style selection itself).
    if (styleRows[0]?.id === lookupRowId || styleRows.length === 1) {
      try {
        const full: any = await plmApi.styleCards.get(card.id);
        setStyleCardFull(full);
      } catch {
        toast.error("Failed to load Style Card");
      }
    }
  };

  const toggleSize = (code: string) => {
    setSelectedSizes((prev) => {
      const isRemoving = prev.includes(code);
      if (isRemoving) {
        const hasData = qtyRows.some((r) => num(r.sizes[code]) > 0);
        if (hasData && !window.confirm(`"${code}" has entered quantities. Remove this size column anyway?`)) return prev;
        return prev.filter((s) => s !== code);
      }
      return [...prev, code].sort((a, b) => availableSizes.indexOf(a) - availableSizes.indexOf(b));
    });
  };

  // ── Select Size (right-click) — Size Group / Size Set master (MA_SizeSet/MA_SizeSetItem), the
  // same existing master + SelectSizesDialog StyleCard's own Sizes UI already uses (generalized
  // with an onApply callback so this writes to Work Order's own in-memory sizes, never to
  // StyleCard.sizes). Single-select by construction — SelectSizesDialog applies exactly one
  // group per click, always a full replace of whatever was previously loaded, never a merge of
  // two groups. No restriction from Style was found to honor (StyleCard.masterSize is plain free
  // text, not a Size Group relationship — confirmed by inspection), so every existing, active
  // Size Group is offered, per "use the existing Size Group master according to current ERP rules".
  const [sizeGroupDialogOpen, setSizeGroupDialogOpen] = useState(false);
  const [sizeGroupLabel, setSizeGroupLabel] = useState("");
  const applySizeGroup = (codes: string[], group: SizeGroup): boolean => {
    const hasQtyData = qtyRows.some((r) => Object.values(r.sizes).some((v) => num(v) > 0));
    if (hasQtyData) {
      if (!window.confirm(`Replace the current size selection with "${group.name.trim()}"? Existing Manufacturing Quantities for sizes not in this group will be lost.`)) {
        return false; // Cancel = keep current group and quantities
      }
    }
    setAvailableSizes(codes);
    setSelectedSizes(codes);
    setSizeGroupLabel(group.name.trim());
    return true;
  };

  // ── Save / Copy Order — shared builders ─────────────────────────────────────────────────
  // Extracted so "Copy Order" (right-click) can reuse the exact same field mapping save() uses,
  // instead of a second hand-maintained copy of it drifting out of sync over time.
  const buildHeaderDto = (): Record<string, any> => ({
    workOrderDate: header.workOrderDate, currentAccountId: header.currentAccountId ? Number(header.currentAccountId) : undefined,
    uD_Brands: header.uD_Brands, deliveryDate: header.deliveryDate || undefined, agreedDeliveryDate: header.agreedDeliveryDate || undefined,
    planDate: header.planDate || undefined, shipmentDate: header.shipmentDate || undefined,
    quantity: totalQuantity || header.quantity, isClosed: header.isClosed, isSample: header.isSample,
    uD_SampleRevision: header.uD_SampleRevision, uD_reasonOfRevision: header.uD_reasonOfRevision, explanation: header.explanation,
    // Detail tab
    specialCode: header.specialCode || undefined, customerOrderNo: header.customerOrderNo || undefined,
    quantity2: round(header.quantity2, "quantity"), cmtPrice: round(header.cmtPrice, "unit-price"),
    cmtForexId: header.cmtForexId ? Number(header.cmtForexId) : undefined,
    warehouseId: header.warehouseId ? Number(header.warehouseId) : undefined,
    factoryId: header.factoryId ? Number(header.factoryId) : undefined,
    countryId: header.countryId ? Number(header.countryId) : undefined,
    employeeId: header.employeeId ? Number(header.employeeId) : undefined,
    status: header.status, seasonCode: header.seasonCode || undefined,
    productionColorCumulativeType: header.productionColorCumulativeType, rowColor: header.rowColor,
    productionCertificates: header.productionCertificates || undefined,
    certificationId: header.certificationId ? Number(header.certificationId) : undefined,
    initialCostId: header.initialCostId ? Number(header.initialCostId) : undefined,
    projectId: header.projectId ? Number(header.projectId) : undefined,
    brokerId: header.brokerId ? Number(header.brokerId) : undefined,
    comissionPercent: round(header.comissionPercent, "recipe-percent"), generalExpensePercent: round(header.generalExpensePercent, "recipe-percent"),
    discountAmount: round(header.discountAmount, "amount"), discountType: header.discountType,
    isItemDiscount: header.isItemDiscount, typeOfShipment: header.typeOfShipment,
    handoverDate: header.handoverDate || undefined, cuttingApprovedDate: header.cuttingApprovedDate || undefined,
  });
  const buildStyleRowsDto = () => styleRows.map((r) => ({
    explanation: r.explanation || r.styleName, specialCode: r.specialCode || r.styleCode,
    customerOrderNo: r.customerOrderNo, partOrderNo: r.partOrderNo,
    forexUnitPrice: round(r.forexUnitPrice, "forex-unit-price"), unitPrice: round(r.unitPrice, "unit-price"),
    packageQuantity: r.packageQuantity, shipmentDate: r.shipmentDate || undefined,
  }));
  const buildVariantRows = () => qtyRows.flatMap((r) => selectedSizes.map((size) => ({
    explanation: `${r.color}${COLOR_SIZE_SEP}${size}`,
    quantity: round(r.sizes[size] ?? 0, "variant-quantity"),
    unitPrice: round(r.price, "unit-price"),
    additionalQuantity: round(r.surplus, "variant-quantity"),
    barcode: r.lot || "",
  })));
  // ── Save ─────────────────────────────────────────────────────────────────────────────────
  // BOM is intentionally NOT part of this save — BomTab (the reused Sample BOM component,
  // mounted below in "workOrder" mode) owns its own Save action, exactly like it already does for
  // Style Card/Sample Card. Two Save buttons (header vs. BOM) is the existing Sample BOM
  // behavior, not a new inconsistency introduced for Work Order.
  const save = async () => {
    setSaving(true);
    try {
      const dto = buildHeaderDto();
      let id = woId;
      if (id) {
        await legacyErpApi.workOrders.update(id, dto);
      } else {
        if (header.workOrderNo) dto.workOrderNo = header.workOrderNo;
        const created: any = await legacyErpApi.workOrders.create(dto);
        id = created.id;
        setWoId(id);
        router.replace(`/dashboard/legacy-erp/work-orders?id=${id}&mode=edit`, { scroll: false });
      }

      const savedItems: any = await legacyErpApi.workOrders.upsertItems(id!, buildStyleRowsDto());
      const primId = Array.isArray(savedItems) ? savedItems[0]?.id : undefined;
      setPrimaryItemId(primId);
      if (primId) await legacyErpApi.workOrders.upsertItemVariants(primId, buildVariantRows());

      toast.success("Work order saved");
      setLastSaved(header);
      await load(id!);
    } catch (e: any) {
      toast.error(e.message || "Failed to save work order");
    } finally {
      setSaving(false);
    }
  };

  // ── Copy Order (right-click) — a NEW Work Order, never touching the original. Reuses the
  // exact same create/upsertItems/upsertItemVariants calls save() already uses; the new
  // WorkOrderNo comes from the same auto-numbering nextWorkOrderNo() create() already falls back
  // to (workOrderNo is deliberately never copied), and every child row is a fresh INSERT under
  // the new header's own RecId, never the original's — no primary key is ever copied. BOM is
  // copied by reading the ORIGINAL's already-persisted MA_RecipeItem rows fresh (BomTab owns its
  // own unsaved edits, not exposed to this page) and re-inserting them under the new id — the raw
  // rows' own id/recipeId fields are simply ignored by upsertBom (it only reads known column
  // keys), so this can never carry over the original's primary keys.
  const [copying, setCopying] = useState(false);
  const copyOrder = async () => {
    if (!woId) return;
    setCopying(true);
    try {
      const created: any = await legacyErpApi.workOrders.create(buildHeaderDto());
      const newId = created.id;
      const savedItems: any = await legacyErpApi.workOrders.upsertItems(newId, buildStyleRowsDto());
      const newPrimId = Array.isArray(savedItems) ? savedItems[0]?.id : undefined;
      if (newPrimId) await legacyErpApi.workOrders.upsertItemVariants(newPrimId, buildVariantRows());
      for (const lt of BOM_SUB_TABS) {
        const existingLines = await legacyErpApi.workOrders.listBom(woId, lt).catch(() => []);
        if (Array.isArray(existingLines) && existingLines.length) await legacyErpApi.workOrders.upsertBom(newId, lt, existingLines);
      }
      toast.success(`Copied to new Work Order ${created.workOrderNo}`);
      router.push(`/dashboard/legacy-erp/work-orders?id=${newId}&mode=edit`);
    } catch (e: any) {
      toast.error(e.message || "Failed to copy work order");
    } finally {
      setCopying(false);
    }
  };

  // ── Edit (view -> edit, same screen) ────────────────────────────────────────────────────
  const switchToEdit = () => {
    setReadOnly(false);
    if (woId) router.replace(`/dashboard/legacy-erp/work-orders?id=${woId}&mode=edit`, { scroll: false });
  };

  // ── Edit Code — WorkOrderNo, using the uniqueness check work-order.service.ts's update()
  // now also runs (assertWorkOrderNoAvailable, the same helper create() already used — not a new
  // validation mechanism, just newly wired into update() too).
  const [editCodeOpen, setEditCodeOpen] = useState(false);
  const [editCodeValue, setEditCodeValue] = useState("");
  const [editCodeSaving, setEditCodeSaving] = useState(false);
  const openEditCode = () => { setEditCodeValue(header.workOrderNo); setEditCodeOpen(true); };
  const submitEditCode = async () => {
    if (!woId) return;
    const next = editCodeValue.trim();
    if (!next || next === header.workOrderNo) return setEditCodeOpen(false);
    setEditCodeSaving(true);
    try {
      await legacyErpApi.workOrders.update(woId, { workOrderNo: next });
      toast.success("Order No updated");
      setEditCodeOpen(false);
      await load(woId);
    } catch (e: any) {
      toast.error(e.message || "Failed to update Order No"); // surfaces the existing 409 uniqueness conflict as-is
    } finally {
      setEditCodeSaving(false);
    }
  };

  // ── Right-click menu — RowContextMenu/RowActionsMenu, the SAME existing ERP context-menu
  // primitive every other Legacy ERP screen already uses (purchase-orders/page.tsx, the Sizes
  // panel above, etc.) — not a new menu system. Each entry calls the exact handler this screen
  // already has; disabled reflects genuine data-state, not a placeholder.
  const workOrderActions: RowAction[] = [
    { key: "save", label: "Save", icon: Save, onSelect: save, disabled: readOnly || saving },
    { key: "edit", label: "Edit", icon: Pencil, onSelect: switchToEdit, disabled: !readOnly },
    { key: "copy-order", label: "Copy Order", icon: Copy, onSelect: copyOrder, disabled: !woId || copying, separatorBefore: true },
    { key: "edit-code", label: "Edit Code", icon: Hash, onSelect: openEditCode, disabled: !woId || readOnly },
    { key: "select-size", label: "Select Size", icon: Ruler, onSelect: () => setSizeGroupDialogOpen(true), disabled: readOnly || !styleRows[0]?.styleCardId, separatorBefore: true },
  ];

  // Transfer buttons live in BomTab's own toolbar (via its toolbarExtra slot) — after a
  // successful transfer, bumping bomReloadTick remounts BomTab so its internal load() re-fetches
  // the freshly-written MA_RecipeItem rows (BomTab has no exposed imperative reload API, and
  // adding one would mean touching its internals just for this — a key-based remount reuses what
  // already exists).
  const [transferring, setTransferring] = useState(false);
  const transferFromStyleCard = async () => {
    const styleCardId = styleRows[0]?.styleCardId;
    if (!styleCardId) return toast.error("Select a Style first");
    if (!woId) return toast.error("Save the work order first, then Transfer from Style Card");
    setTransferring(true);
    try {
      await legacyErpApi.workOrders.transferBomFromStyleCard(woId, styleCardId);
      setBomReloadTick((t) => t + 1);
      toast.success("BOM transferred from Style Card");
    } catch (e: any) {
      toast.error(e.message || "Transfer failed");
    } finally {
      setTransferring(false);
    }
  };

  const addNote = async (tab: "work-order-explanation" | "work-order-activities" | "work-order-expenses", setRows: (fn: (rs: NoteRow[]) => NoteRow[]) => void, dto: Record<string, any>) => {
    if (!woId) return toast.error("Save the work order first");
    try {
      const row: any = await legacyErpApi.workOrders.createTabRow(woId, tab, dto);
      setRows((rs) => [...rs, row]);
    } catch (e: any) { toast.error(e.message || "Failed to add row"); }
  };
  const removeNote = async (tab: "work-order-explanation" | "work-order-activities" | "work-order-expenses", setRows: (fn: (rs: NoteRow[]) => NoteRow[]) => void, id: number) => {
    if (!woId) return;
    try { await legacyErpApi.workOrders.removeTabRow(woId, tab, id); setRows((rs) => rs.filter((r) => r.id !== id)); }
    catch (e: any) { toast.error(e.message || "Failed to remove row"); }
  };

  const titleText = woId ? `Work Order ${header.workOrderNo}` : "New Work Order";
  const th = "border-r border-border/70 bg-muted/50 px-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/90 h-6 whitespace-nowrap";
  const td = "border-r border-b border-border/50 p-0";
  const cellInput = "h-6 w-full bg-transparent px-1.5 text-[11.5px] outline-none";
  const detailInput = "h-7 w-full rounded border bg-background px-1.5 text-xs outline-none disabled:opacity-60";

  if (loading) return <p className="p-8 text-center text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="mx-auto max-w-[1900px] space-y-3 p-4">
      <LegacyErpBreadcrumb trail={[
        { label: "Legacy ERP" },
        { label: "Work Orders", href: "/dashboard/legacy-erp/work-orders-list" },
        ...(woId ? [{ label: header.workOrderNo }] : []),
      ]} />

      {/* Right-click anywhere on the Work Order — Save/Edit/Copy Order/Edit Code/Select Size —
          same RowContextMenu/RowActionsMenu primitive purchase-orders/page.tsx's own universal
          action menu already uses, not a new context-menu system. */}
      <RowContextMenu actions={workOrderActions}>
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/10">
              <ClipboardList className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[15px] font-semibold leading-tight">{titleText}</h1>
              <p className="text-[11px] text-muted-foreground">Manufacturing Work Order</p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-dashed bg-background text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
            </div>
            <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving || readOnly}>
              <Save className="h-3.5 w-3.5 mr-1" />{saving ? "Saving..." : "Save"}
            </Button>
            <RowActionsMenu actions={workOrderActions} />
          </div>

          <Tabs defaultValue="General">
        <TabsList className="h-8 flex-wrap">{OUTER_TABS.map((t) => <TabsTrigger key={t} value={t} className="h-7 text-xs">{t}</TabsTrigger>)}</TabsList>

        <TabsContent value="General" className="pt-2 space-y-2">
          <fieldset disabled={readOnly} className="contents">
            {/* General header — dense inline grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border p-2 sm:grid-cols-4 lg:grid-cols-6 [&_label]:text-[10.5px] [&_input]:h-7 [&_input]:text-xs">
              <FieldText label="Order No" value={woId ? header.workOrderNo : "(auto on Save)"} onChange={() => {}} disabled />
              <FieldText label="Date" type="date" value={header.workOrderDate} onChange={(v) => set("workOrderDate", v)} />
              <FieldCheck label="Closed" checked={header.isClosed} onChange={(v) => set("isClosed", v)} />
              <FieldCheck label="Sample" checked={header.isSample} onChange={(v) => set("isSample", v)} />
              <div className="col-span-2">
                <MasterAutocompleteField
                  label="Customer" masterKey="currentAccount" displayValue={header.currentAccountLabel ?? ""}
                  fetchOptions={(term) => legacyErpApi.accounts.list(term) as Promise<any[]>}
                  lookupPath={CURRENT_ACCOUNTS_LIST_PATH}
                  onSelect={(o) => setHeader((p) => ({ ...p, currentAccountId: String(o.id), currentAccountLabel: `${o.code} — ${o.name}` }))}
                  onClear={() => setHeader((p) => ({ ...p, currentAccountId: "", currentAccountLabel: "" }))}
                />
              </div>
              <FieldText label="Brand" value={header.uD_Brands} onChange={(v) => set("uD_Brands", v)} />
              <FieldText label="Delivery" type="date" value={header.deliveryDate} onChange={(v) => set("deliveryDate", v)} />
              <FieldText label="A. Delivery" type="date" value={header.agreedDeliveryDate} onChange={(v) => set("agreedDeliveryDate", v)} />
              <FieldText label="Planned" type="date" value={header.planDate} onChange={(v) => set("planDate", v)} />
              <FieldText label="Shipment" type="date" value={header.shipmentDate} onChange={(v) => set("shipmentDate", v)} />
              <FieldText label="Quantity" type="number" value={totalQuantity || header.quantity} onChange={() => {}} disabled />
              <FieldText label="Revision #" type="number" value={header.uD_SampleRevision} onChange={(v) => set("uD_SampleRevision", parseFloat(v) || 0)} />
              <div className="col-span-2 sm:col-span-2 lg:col-span-3">
                <FieldText label="Reason of Revision" value={header.uD_reasonOfRevision} onChange={(v) => set("uD_reasonOfRevision", v)} />
              </div>
            </div>

            {/* Style Info grid */}
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full min-w-[1500px] table-fixed border-collapse text-[11.5px]">
                <thead><tr>
                  <th className={th} style={{ width: 120 }}>Style Code</th>
                  <th className={th} style={{ width: 200 }}>Style Name</th>
                  <th className={th} style={{ width: 220 }}>Explanation</th>
                  <th className={th} style={{ width: 110 }}>Special Code</th>
                  <th className={th} style={{ width: 100 }}>Route Code</th>
                  <th className={th} style={{ width: 140 }}>Customer Order No</th>
                  <th className={th} style={{ width: 120 }}>Part Order No</th>
                  <th className={`${th} text-right`} style={{ width: 100 }}>Forex Price</th>
                  <th className={`${th} text-right`} style={{ width: 100 }}>Price</th>
                  <th className={`${th} text-right`} style={{ width: 100 }}>Package (Lot)</th>
                  <th className={`${th} text-right`} style={{ width: 100 }}>Total Quantity</th>
                  <th className={th} style={{ width: 120 }}>Ship Date</th>
                  <th className={th} style={{ width: 32 }} />
                </tr></thead>
                <tbody>
                  {styleRows.map((r) => (
                    <tr key={r.id}>
                      <td className={td}>
                        <button type="button" disabled={readOnly} onClick={() => openStyleLookup(r.id)}
                          className="flex h-6 w-full items-center gap-1 px-1.5 text-[11.5px] font-mono hover:bg-accent">
                          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />{r.styleCode || "Select..."}
                        </button>
                      </td>
                      <td className={td}><span className="flex h-6 items-center px-1.5 truncate">{r.styleName}</span></td>
                      <td className={td}><input className={cellInput} value={r.explanation} disabled={readOnly} onChange={(e) => setStyleRows((rs) => rs.map((x) => x.id === r.id ? { ...x, explanation: e.target.value } : x))} /></td>
                      <td className={td}><input className={cellInput} value={r.specialCode} disabled={readOnly} onChange={(e) => setStyleRows((rs) => rs.map((x) => x.id === r.id ? { ...x, specialCode: e.target.value } : x))} /></td>
                      <td className={td}><span className="flex h-6 items-center px-1.5 truncate text-muted-foreground">{r.routeCode}</span></td>
                      <td className={td}><input className={cellInput} value={r.customerOrderNo} disabled={readOnly} onChange={(e) => setStyleRows((rs) => rs.map((x) => x.id === r.id ? { ...x, customerOrderNo: e.target.value } : x))} /></td>
                      <td className={td}><input className={cellInput} value={r.partOrderNo} disabled={readOnly} onChange={(e) => setStyleRows((rs) => rs.map((x) => x.id === r.id ? { ...x, partOrderNo: e.target.value } : x))} /></td>
                      <td className={td}><input type="number" className={`${cellInput} text-right font-mono`} value={r.forexUnitPrice} disabled={readOnly} onChange={(e) => setStyleRows((rs) => rs.map((x) => x.id === r.id ? { ...x, forexUnitPrice: parseFloat(e.target.value) || 0 } : x))} /></td>
                      <td className={td}><input type="number" className={`${cellInput} text-right font-mono`} value={r.unitPrice} disabled={readOnly} onChange={(e) => setStyleRows((rs) => rs.map((x) => x.id === r.id ? { ...x, unitPrice: parseFloat(e.target.value) || 0 } : x))} /></td>
                      <td className={td}><input type="number" className={`${cellInput} text-right font-mono`} value={r.packageQuantity} disabled={readOnly} onChange={(e) => setStyleRows((rs) => rs.map((x) => x.id === r.id ? { ...x, packageQuantity: parseFloat(e.target.value) || 0 } : x))} /></td>
                      <td className={td}><span className="flex h-6 items-center justify-end px-1.5 font-mono text-muted-foreground">{totalQuantity}</span></td>
                      <td className={td}><input type="date" className={cellInput} value={r.shipmentDate} disabled={readOnly} onChange={(e) => setStyleRows((rs) => rs.map((x) => x.id === r.id ? { ...x, shipmentDate: e.target.value } : x))} /></td>
                      <td className={`${td} text-center`}>
                        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={readOnly} onClick={() => setStyleRows((rs) => rs.filter((x) => x.id !== r.id))}><Trash2 className="h-3 w-3 text-muted-foreground" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" className="h-6 text-[11px]" disabled={readOnly} onClick={() => setStyleRows((rs) => [...rs, blankStyleRow()])}><Plus className="h-3 w-3 mr-1" />Add Style Row</Button>

            {/* Size selection — reuses the selected Style Card's own sizes (real StyleCard.sizes), never hardcoded.
                No nested RowContextMenu here on purpose — right-clicking anywhere on the Work Order
                (including this panel) already shows the single unified menu wrapping the whole
                screen below, so a second, narrower menu scoped to just this div would contradict
                "same 5 items on every right-click". */}
            <div className="rounded-md border p-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/90">
                    Sizes {sizeGroupLabel ? `— ${sizeGroupLabel}` : "— right-click, Select Size"}
                  </span>
                  <RowActionsMenu actions={workOrderActions} />
                </div>
                {availableSizes.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No Size Group selected yet — right-click here (or use the ⋮ menu) → Select Size.</p>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {availableSizes.map((s) => (
                      <label key={s} className="flex items-center gap-1.5 text-[11.5px]">
                        <Checkbox checked={selectedSizes.includes(s)} disabled={readOnly} onCheckedChange={() => toggleSize(s)} className="h-3.5 w-3.5" />
                        {s}
                      </label>
                    ))}
                  </div>
                )}
            </div>
            <SelectSizesDialog
              open={sizeGroupDialogOpen} onOpenChange={setSizeGroupDialogOpen}
              currentSizes={selectedSizes} onApply={applySizeGroup}
            />

            {/* Secondary tabs */}
            <Tabs defaultValue="C/S Details">
              <TabsList className="h-7 flex-wrap justify-start overflow-x-auto">
                {SECONDARY_TABS.map((t) => <TabsTrigger key={t} value={t} className="h-6 whitespace-nowrap px-2 text-[11px]">{t}</TabsTrigger>)}
              </TabsList>

              <TabsContent value="C/S Details" className="pt-2">
                <ManufacturingQuantitiesGrid
                  readOnly={readOnly} qtyRows={qtyRows} setQtyRows={setQtyRows} selectedSizes={selectedSizes}
                  styleRow={styleRows[0]} round={round} onSelectSize={() => setSizeGroupDialogOpen(true)}
                />
              </TabsContent>

              <TabsContent value="Price" className="pt-2">
                <p className="text-[11.5px] text-muted-foreground">Uses the Price / Forex Price fields already entered on the Style Info row above — no separate structure exists for a per-color Price breakdown on this table.</p>
              </TabsContent>

              <TabsContent value="Additional Quantity for Manufacturing" className="pt-2">
                <QtySurplusGrid readOnly={readOnly} qtyRows={qtyRows} setQtyRows={setQtyRows} />
              </TabsContent>

              <TabsContent value="Will Cut Qty" className="pt-2">
                <p className="text-[11.5px] text-muted-foreground">No existing Will-Cut quantity structure identified on MA_WorkOrder* — not implemented this pass rather than inventing a schema.</p>
              </TabsContent>

              <TabsContent value="Color/Size Explanation" className="pt-2">
                <p className="text-[11.5px] text-muted-foreground">No dedicated existing per-Color/Size explanation column exists on MA_WorkOrderItemVariant beyond the Color/Size key itself — not implemented this pass.</p>
              </TabsContent>

              <TabsContent value="Color/Size Barcode" className="pt-2">
                <LotByColorGrid readOnly={readOnly} qtyRows={qtyRows} setQtyRows={setQtyRows} selectedSizes={selectedSizes} />
              </TabsContent>

              <TabsContent value="Explanation" className="pt-2 space-y-1.5">
                {explanationRows.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
                    <span className="flex-1">{r.explanationText}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={readOnly} onClick={() => removeNote("work-order-explanation", setExplanationRows, r.id)}><Trash2 className="h-3 w-3 text-muted-foreground" /></Button>
                  </div>
                ))}
                <AddNoteRow disabled={readOnly} placeholder="Add explanation..." onAdd={(text) => addNote("work-order-explanation", setExplanationRows, { explanationText: text })} />
              </TabsContent>

              <TabsContent value="Expenses" className="pt-2 space-y-1.5">
                {expenseRows.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
                    <span className="flex-1">{r.explanation}</span>
                    <span className="font-mono text-muted-foreground">{r.amount}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={readOnly} onClick={() => removeNote("work-order-expenses", setExpenseRows, r.id)}><Trash2 className="h-3 w-3 text-muted-foreground" /></Button>
                  </div>
                ))}
                <AddNoteRow disabled={readOnly} placeholder="Add expense..." onAdd={(text) => addNote("work-order-expenses", setExpenseRows, { explanation: text, amount: 0 })} />
              </TabsContent>

              <TabsContent value="Revenue" className="pt-2">
                <p className="text-[11.5px] text-muted-foreground">No existing Work Order revenue data structure identified — not implemented this pass.</p>
              </TabsContent>

              <TabsContent value="BOM" className="pt-2 space-y-2">
                {/* Reuses the EXACT existing Sample BOM component (BomTab, from
                    plm/style-cards/[id]/_components/bom-tab.tsx — the same one plm/sample-cards
                    already mounts) in "workOrder" mode: same columns, calculations, column
                    manager, grid/lookup behavior; only persistence differs (MA_Recipe/
                    MA_RecipeItem instead of StyleBomLine). Not a second BOM implementation. */}
                {!woId ? (
                  <p className="text-[11.5px] text-muted-foreground">Save the Work Order first — BOM lines persist under this Work Order's own record (MA_Recipe.WorkOrderId).</p>
                ) : (
                  <BomTab
                    key={bomReloadTick}
                    workOrder={{
                      workOrderId: woId,
                      toolbarExtra: (
                        <div className="flex gap-1.5">
                          <Button variant="outline" size="sm" className="h-6 text-[11px]" disabled={readOnly || transferring} onClick={transferFromStyleCard}>
                            <ArrowDownToLine className="h-3 w-3 mr-1" />Transfer from Style Card
                          </Button>
                          <Button variant="outline" size="sm" className="h-6 text-[11px]" disabled title="No existing Customer Trim source identified for this Work Order's Customer — not implemented this pass (Sample BOM has no Customer Trim transfer either)">
                            <ArrowDownToLine className="h-3 w-3 mr-1" />Transfer Customer Trims
                          </Button>
                        </div>
                      ),
                    }}
                  />
                )}
              </TabsContent>

              <TabsContent value="Activities" className="pt-2 space-y-1.5">
                {activityRows.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
                    <span className="flex-1">{r.explanation}</span>
                    <span className="font-mono text-muted-foreground">{r.quantity}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={readOnly} onClick={() => removeNote("work-order-activities", setActivityRows, r.id)}><Trash2 className="h-3 w-3 text-muted-foreground" /></Button>
                  </div>
                ))}
                <AddNoteRow disabled={readOnly} placeholder="Add activity..." onAdd={(text) => addNote("work-order-activities", setActivityRows, { explanation: text, quantity: 0 })} />
              </TabsContent>

              <TabsContent value="Wash & Care" className="pt-2">
                {styleCardFull?.washCare ? (
                  <div className="grid grid-cols-2 gap-1.5 rounded border p-2 text-[11.5px] sm:grid-cols-4">
                    {Object.entries(styleCardFull.washCare).filter(([k]) => !["id", "styleCardId", "createdAt", "updatedAt"].includes(k)).map(([k, v]) => (
                      <div key={k}><span className="text-muted-foreground">{k}: </span><span>{String(v ?? "—")}</span></div>
                    ))}
                    <p className="col-span-full text-[10.5px] text-muted-foreground">Read-only, from the selected Style Card's own Wash &amp; Care.</p>
                  </div>
                ) : <p className="text-[11.5px] text-muted-foreground">No Wash & Care data on the selected Style Card.</p>}
              </TabsContent>

              <TabsContent value="Attachments" className="pt-2">
                <p className="text-[11.5px] text-muted-foreground">MA_WorkOrderAttachment exists but its binary-storage plumbing (separate from the generic satellite-CRUD pattern used elsewhere here) was not wired in this pass.</p>
              </TabsContent>

              <TabsContent value="Style Picture Gallery" className="pt-2">
                {Array.isArray(styleCardFull?.attachments) && styleCardFull.attachments.length ? (
                  <div className="flex flex-wrap gap-2">
                    {styleCardFull.attachments.map((a: any, i: number) => (
                      <img key={i} src={typeof a === "string" ? a : a?.url} alt="" className="h-20 w-20 rounded border object-cover" />
                    ))}
                  </div>
                ) : <p className="text-[11.5px] text-muted-foreground">No images on the selected Style Card.</p>}
              </TabsContent>
            </Tabs>
          </fieldset>
        </TabsContent>

        <TabsContent value="Detail" className="pt-2">
          <fieldset disabled={readOnly} className="contents">
            <div className="grid grid-cols-1 gap-x-8 gap-y-1 rounded-md border p-2 lg:grid-cols-2">
              {/* LEFT SIDE */}
              <div className="space-y-1">
                <DField label="Special Code"><input className={detailInput} value={header.specialCode} onChange={(e) => set("specialCode", e.target.value)} /></DField>
                <DField label="Customer Order No"><input className={detailInput} value={header.customerOrderNo} onChange={(e) => set("customerOrderNo", e.target.value)} /></DField>
                <DField label="Cutting Extra"><input type="number" className={`${detailInput} text-right font-mono`} value={header.quantity2} onChange={(e) => set("quantity2", parseFloat(e.target.value) || 0)} /></DField>
                <DField label="CMT Price">
                  <div className="flex gap-1">
                    <input type="number" className={`${detailInput} text-right font-mono`} value={header.cmtPrice} onChange={(e) => set("cmtPrice", parseFloat(e.target.value) || 0)} />
                    <div className="w-28 shrink-0">
                      <MasterAutocompleteField label="CMT Forex" masterKey="forex" compact displayValue={header.cmtForexLabel}
                        onSelect={(o) => setHeader((p) => ({ ...p, cmtForexId: String(o.id), cmtForexLabel: o.name }))}
                        onClear={() => setHeader((p) => ({ ...p, cmtForexId: "", cmtForexLabel: "" }))} />
                    </div>
                  </div>
                </DField>
                <DField label="Warehouse">
                  <MasterAutocompleteField label="Warehouse" masterKey="warehouse" compact displayValue={header.warehouseLabel}
                    onSelect={(o) => setHeader((p) => ({ ...p, warehouseId: String(o.id), warehouseLabel: o.name }))}
                    onClear={() => setHeader((p) => ({ ...p, warehouseId: "", warehouseLabel: "" }))} />
                </DField>
                <DField label="Factory">
                  <MasterAutocompleteField label="Factory" masterKey="factory-account" compact displayValue={header.factoryLabel}
                    fetchOptions={(term) => legacyErpApi.accounts.list(term) as Promise<any[]>} lookupPath={CURRENT_ACCOUNTS_LIST_PATH}
                    onSelect={(o: any) => setHeader((p) => ({ ...p, factoryId: String(o.id), factoryLabel: `${o.code} — ${o.name}` }))}
                    onClear={() => setHeader((p) => ({ ...p, factoryId: "", factoryLabel: "" }))} />
                </DField>
                <DField label="Country">
                  <MasterAutocompleteField label="Country" masterKey="country" compact displayValue={header.countryLabel}
                    onSelect={(o) => setHeader((p) => ({ ...p, countryId: String(o.id), countryLabel: o.name }))}
                    onClear={() => setHeader((p) => ({ ...p, countryId: "", countryLabel: "" }))} />
                </DField>
                <DField label="Customer Represent">
                  <MasterAutocompleteField label="Customer Represent" masterKey="employee" compact displayValue={header.employeeLabel}
                    onSelect={(o) => setHeader((p) => ({ ...p, employeeId: String(o.id), employeeLabel: o.name }))}
                    onClear={() => setHeader((p) => ({ ...p, employeeId: "", employeeLabel: "" }))} />
                </DField>
                <DField label="Status"><DSelect value={header.status} onChange={(v) => set("status", v)} options={STATUS_OPTIONS} /></DField>
                <DField label="Season">
                  {/* MA_WorkOrder.SeasonCode is a plain varchar (confirmed live — no FK), so this
                      stays a free-text column; the existing Season master (SeasonCard, via
                      plmApi.seasons) is wired in as pick-assist only — selecting a season fills
                      the text, but typing an untracked season still commits, matching what the
                      real column actually allows. */}
                  <MasterAutocompleteField label="Season" masterKey="season" compact displayValue={header.seasonCode}
                    fetchOptions={async (term) => {
                      const rows: any = await plmApi.seasons.list(term ? { search: term } : {});
                      return (Array.isArray(rows) ? rows : []).map((s: any) => ({ id: s.id, code: s.code, name: s.name }));
                    }}
                    onSelect={(o) => set("seasonCode", o.code || o.name)}
                    onFreeTextCommit={(text) => set("seasonCode", text)}
                    onClear={() => set("seasonCode", "")}
                  />
                </DField>
                <DField label="Explanation"><input className={detailInput} value={header.explanation} onChange={(e) => set("explanation", e.target.value)} /></DField>
              </div>

              {/* RIGHT SIDE */}
              <div className="space-y-1">
                <DField label="Color Based Mfg."><DSelect value={header.productionColorCumulativeType} onChange={(v) => set("productionColorCumulativeType", v)} options={YES_NO_OPTIONS} /></DField>
                <DField label="Main Color Column"><DSelect value={header.rowColor} onChange={(v) => set("rowColor", v)} options={YES_NO_OPTIONS} /></DField>
                <DField label="Manufacturing Cert."><input className={detailInput} value={header.productionCertificates} onChange={(e) => set("productionCertificates", e.target.value)} /></DField>
                <DField label="Certification">
                  <MasterAutocompleteField label="Certification" masterKey="certification" compact displayValue={header.certificationLabel}
                    onSelect={(o) => setHeader((p) => ({ ...p, certificationId: String(o.id), certificationLabel: o.name }))}
                    onClear={() => setHeader((p) => ({ ...p, certificationId: "", certificationLabel: "" }))} />
                </DField>
                <DField label="Initial Cost">
                  <MasterAutocompleteField label="Initial Cost" masterKey="initial-cost" compact displayValue={header.initialCostLabel}
                    onSelect={(o) => setHeader((p) => ({ ...p, initialCostId: String(o.id), initialCostLabel: o.name }))}
                    onClear={() => setHeader((p) => ({ ...p, initialCostId: "", initialCostLabel: "" }))} />
                </DField>
                <DField label="Project No">
                  <MasterAutocompleteField label="Project No" masterKey="project" compact displayValue={header.projectLabel}
                    onSelect={(o) => setHeader((p) => ({ ...p, projectId: String(o.id), projectLabel: o.name }))}
                    onClear={() => setHeader((p) => ({ ...p, projectId: "", projectLabel: "" }))} />
                </DField>
                <DField label="Commissioner">
                  <MasterAutocompleteField label="Commissioner" masterKey="broker-account" compact displayValue={header.brokerLabel}
                    fetchOptions={(term) => legacyErpApi.accounts.list(term) as Promise<any[]>} lookupPath={CURRENT_ACCOUNTS_LIST_PATH}
                    onSelect={(o: any) => setHeader((p) => ({ ...p, brokerId: String(o.id), brokerLabel: `${o.code} — ${o.name}` }))}
                    onClear={() => setHeader((p) => ({ ...p, brokerId: "", brokerLabel: "" }))} />
                </DField>
                <DField label="Commission % / Gen. Exp.">
                  <div className="flex gap-1">
                    <input type="number" className={`${detailInput} text-right font-mono`} value={header.comissionPercent} onChange={(e) => set("comissionPercent", parseFloat(e.target.value) || 0)} />
                    <input type="number" className={`${detailInput} text-right font-mono`} value={header.generalExpensePercent} onChange={(e) => set("generalExpensePercent", parseFloat(e.target.value) || 0)} />
                  </div>
                </DField>
                <DField label="Discount">
                  <div className="flex gap-1">
                    <input type="number" className={`${detailInput} text-right font-mono`} value={header.discountAmount} onChange={(e) => set("discountAmount", parseFloat(e.target.value) || 0)} />
                    <div className="w-28 shrink-0"><DSelect value={header.discountType} onChange={(v) => set("discountType", v)} options={DISCOUNT_TYPE_OPTIONS} /></div>
                  </div>
                </DField>
                <DField label="Apply Discount to Item">
                  <Checkbox checked={header.isItemDiscount} onCheckedChange={(v) => setHeader((p) => ({ ...p, isItemDiscount: !!v }))} className="h-3.5 w-3.5" />
                </DField>
                <DField label="Purchase / Shipment Type"><DSelect value={header.typeOfShipment} onChange={(v) => set("typeOfShipment", v)} options={SHIPMENT_TYPE_OPTIONS} /></DField>
                <DField label="Handover Date"><input type="date" className={detailInput} value={header.handoverDate} onChange={(e) => set("handoverDate", e.target.value)} /></DField>
                <DField label="Cutting Approval Date"><input type="date" className={detailInput} value={header.cuttingApprovedDate} onChange={(e) => set("cuttingApprovedDate", e.target.value)} /></DField>
              </div>
            </div>
          </fieldset>
        </TabsContent>
        <TabsContent value="General Explanation" className="pt-2">
          <p className="text-[11.5px] text-muted-foreground">See the Explanation tab under General's secondary tab bar (MA_WorkOrderExplanation).</p>
        </TabsContent>
        <TabsContent value="Customized Fields" className="pt-2">
          <p className="text-[11.5px] text-muted-foreground">No existing custom-fields structure identified for Work Order — not implemented this pass.</p>
        </TabsContent>
          </Tabs>
        </div>
      </RowContextMenu>

      <CardLookupDialog<StyleCardLookupRow>
        open={styleLookupOpen}
        onOpenChange={setStyleLookupOpen}
        title="Select Style"
        fetchOptions={async (search) => {
          // plm()'s query-string builder runs every value through URLSearchParams, which
          // stringifies `undefined` to the literal text "undefined" instead of omitting the key
          // (confirmed live) — sending {search: undefined} on the dialog's initial open therefore
          // asked the backend for style cards whose Code/Name literally CONTAINS "undefined",
          // silently returning zero real rows. This is the actual root cause of "no Style can be
          // selected / no sizes ever load": the query object must omit `search` entirely when
          // there's no term, not pass it as undefined.
          const q: Record<string, any> = { limit: 50 };
          if (search) q.search = search;
          const res: any = await plmApi.styleCards.list(q);
          const rows = Array.isArray(res) ? res : res?.data || [];
          return rows.map((c: any): StyleCardLookupRow => ({ id: c.id, inventoryCode: c.styleNumber, inventoryName: c.title, inUse: c.status !== "archived", raw: c }));
        }}
        onSelect={onStyleSelected}
      />

      <Dialog open={editCodeOpen} onOpenChange={setEditCodeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Order No</DialogTitle></DialogHeader>
          <input
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none"
            value={editCodeValue}
            onChange={(e) => setEditCodeValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitEditCode(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCodeOpen(false)}>Cancel</Button>
            <Button onClick={submitEditCode} disabled={editCodeSaving || !editCodeValue.trim()}>{editCodeSaving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Detail tab's label+control row — fixed-width label column so both sides' controls line up
// consistently, matching the reference's compact two-column form density (General/C-S Details).
function DField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[128px_1fr] items-center gap-2">
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// Detail tab's compact dropdown — the same shadcn Select component/density already used for
// Unit etc. in style-cards/[id]/_components/bom-tab.tsx, not a raw <select>.
function DSelect({ value, onChange, options, disabled }: { value: number; onChange: (v: number) => void; options: { value: number; label: string }[]; disabled?: boolean }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))} disabled={disabled}>
      <SelectTrigger className="h-7 w-full text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function AddNoteRow({ onAdd, disabled, placeholder }: { onAdd: (text: string) => void; disabled?: boolean; placeholder: string }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex items-center gap-2">
      <input className="h-7 flex-1 rounded border bg-background px-2 text-xs outline-none" placeholder={placeholder} value={value} disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) { onAdd(value.trim()); setValue(""); } }} />
      <Button size="sm" variant="outline" className="h-7" disabled={disabled || !value.trim()} onClick={() => { onAdd(value.trim()); setValue(""); }}><Plus className="h-3 w-3" /></Button>
    </div>
  );
}

// Manufacturing Quantities (C/S Details) — the single unified grid matching the reference legacy
// screen: fixed columns, THEN the Style's own selected sizes as dynamic columns immediately after
// Lot, THEN a per-row Total, THEN a footer summary row (Total Lots / per-size column totals /
// Grand Total) so the footer can never drift out of sync with the header — both read the exact
// same `selectedSizes` array. Customer Order No/Part Order No/Explanation/Delivery Date are
// read-only mirrors of the single Style Info row (MA_WorkOrderItem has no per-Color equivalent
// columns) — edit those on the Style Info grid above; Price/Surplus/Lot are real per-row values.
function ManufacturingQuantitiesGrid({ readOnly, qtyRows, setQtyRows, selectedSizes, styleRow, round, onSelectSize }: {
  readOnly: boolean; qtyRows: QtyRow[]; setQtyRows: (fn: (rs: QtyRow[]) => QtyRow[]) => void; selectedSizes: string[];
  styleRow?: StyleRow; round: (v: unknown, k: any) => number; onSelectSize: () => void;
}) {
  const th = "border-r border-border/70 bg-muted/50 px-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/90 h-6 whitespace-nowrap";
  const td = "border-r border-b border-border/50 p-0";
  const cellInput = "h-6 w-full bg-transparent px-1.5 text-[11.5px] outline-none";
  const rowTotal = (r: QtyRow) => round(selectedSizes.reduce((s, sz) => s + num(r.sizes[sz]), 0), "quantity");
  const grandTotal = round(qtyRows.reduce((s, r) => s + rowTotal(r), 0), "quantity");
  const totalLots = qtyRows.filter((r) => r.lot.trim()).length;

  // No Size Group has been applied yet — the dynamic size columns genuinely can't render without
  // a real, non-hardcoded size source (per the task's own hard rule). Point directly at the
  // action that resolves it instead of a passive message, since this exact empty state is what
  // was being read as "the columns aren't showing" — they're correctly absent until a group is
  // actually picked, not hidden/filtered by a bug.
  if (!selectedSizes.length) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-4">
        <p className="text-[11.5px] text-muted-foreground">No Size Group selected yet — the dynamic size columns (e.g. Lot | 2Y | 3Y | 4Y | ... | Total) appear here once one is picked.</p>
        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={readOnly} onClick={onSelectSize}>
          <Ruler className="h-3.5 w-3.5 mr-1.5" />Select Size
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full min-w-[1600px] table-fixed border-collapse text-[11.5px]">
        <thead><tr>
          <th className={th} style={{ width: 140 }}>Color</th>
          <th className={th} style={{ width: 130 }}>Customer Order No</th>
          <th className={th} style={{ width: 120 }}>Part Order No</th>
          <th className={th} style={{ width: 160 }}>Explanation</th>
          <th className={th} style={{ width: 110 }}>Delivery Date</th>
          <th className={`${th} text-right`} style={{ width: 90 }}>Price</th>
          <th className={`${th} text-right`} style={{ width: 110 }}>Cutting/Mfg Surplus</th>
          <th className={th} style={{ width: 90 }}>Lot</th>
          {selectedSizes.map((s) => <th key={s} className={`${th} text-right`} style={{ width: 70 }}>{s}</th>)}
          <th className={`${th} text-right`} style={{ width: 90 }}>Total</th>
          <th className={th} style={{ width: 32 }} />
        </tr></thead>
        <tbody>
          {qtyRows.map((r) => (
            <tr key={r.id}>
              <td className={td}><input className={cellInput} value={r.color} disabled={readOnly} onChange={(e) => setQtyRows((rs) => rs.map((x) => x.id === r.id ? { ...x, color: e.target.value } : x))} /></td>
              <td className={td}><span className="flex h-6 items-center px-1.5 truncate text-muted-foreground">{styleRow?.customerOrderNo || "—"}</span></td>
              <td className={td}><span className="flex h-6 items-center px-1.5 truncate text-muted-foreground">{styleRow?.partOrderNo || "—"}</span></td>
              <td className={td}><span className="flex h-6 items-center px-1.5 truncate text-muted-foreground">{styleRow?.explanation || "—"}</span></td>
              <td className={td}><span className="flex h-6 items-center px-1.5 truncate text-muted-foreground">{styleRow?.shipmentDate || "—"}</span></td>
              <td className={td}><input type="number" className={`${cellInput} text-right font-mono`} value={r.price} disabled={readOnly} onChange={(e) => setQtyRows((rs) => rs.map((x) => x.id === r.id ? { ...x, price: parseFloat(e.target.value) || 0 } : x))} /></td>
              <td className={td}><input type="number" className={`${cellInput} text-right font-mono`} value={r.surplus} disabled={readOnly} onChange={(e) => setQtyRows((rs) => rs.map((x) => x.id === r.id ? { ...x, surplus: parseFloat(e.target.value) || 0 } : x))} /></td>
              <td className={td}><input className={cellInput} value={r.lot} disabled={readOnly} onChange={(e) => setQtyRows((rs) => rs.map((x) => x.id === r.id ? { ...x, lot: e.target.value } : x))} /></td>
              {selectedSizes.map((s) => (
                <td key={s} className={td}>
                  <input type="number" className={`${cellInput} text-right font-mono`} value={r.sizes[s] ?? ""} disabled={readOnly}
                    onChange={(e) => setQtyRows((rs) => rs.map((x) => x.id === r.id ? { ...x, sizes: { ...x.sizes, [s]: parseFloat(e.target.value) || 0 } } : x))} />
                </td>
              ))}
              <td className={td}><span className="flex h-6 items-center justify-end px-1.5 font-mono">{rowTotal(r)}</span></td>
              <td className={`${td} text-center`}><Button variant="ghost" size="icon" className="h-6 w-6" disabled={readOnly} onClick={() => setQtyRows((rs) => rs.filter((x) => x.id !== r.id))}><Trash2 className="h-3 w-3 text-muted-foreground" /></Button></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40 font-medium">
            <td className={td} colSpan={7}><span className="flex h-6 items-center px-1.5">Total Lots: {totalLots}</span></td>
            <td className={td} />
            {selectedSizes.map((s) => (
              <td key={s} className={td}>
                <span className="flex h-6 items-center justify-end px-1.5 font-mono">{round(qtyRows.reduce((sum, r) => sum + num(r.sizes[s]), 0), "quantity")}</span>
              </td>
            ))}
            <td className={td}><span className="flex h-6 items-center justify-end px-1.5 font-mono">{grandTotal}</span></td>
            <td className={td} />
          </tr>
        </tfoot>
      </table>
      <Button variant="outline" size="sm" className="m-1.5 h-6 text-[11px]" disabled={readOnly} onClick={() => setQtyRows((rs) => [...rs, blankQtyRow()])}><Plus className="h-3 w-3 mr-1" />Add Color</Button>
    </div>
  );
}

// Color/Size Barcode — read-only, derived from the same per-Color Lot value entered in C/S
// Details (MA_WorkOrderItemVariant.Barcode has one real value per row; the underlying schema
// can't hold a second independent "per-cell" barcode without a new column, so this view shows
// the same value repeated across the same selected sizes rather than inventing a second field).
function LotByColorGrid({ readOnly, qtyRows, setQtyRows, selectedSizes }: {
  readOnly: boolean; qtyRows: QtyRow[]; setQtyRows: (fn: (rs: QtyRow[]) => QtyRow[]) => void; selectedSizes: string[];
}) {
  const th = "border-r border-border/70 bg-muted/50 px-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/90 h-6 whitespace-nowrap";
  const td = "border-r border-b border-border/50 p-0";
  const cellInput = "h-6 w-full bg-transparent px-1.5 text-[11.5px] outline-none";
  if (!selectedSizes.length) return <p className="text-[11.5px] text-muted-foreground">No sizes selected.</p>;
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full min-w-[600px] table-fixed border-collapse text-[11.5px]">
        <thead><tr>
          <th className={th} style={{ width: 160 }}>Color</th>
          <th className={th} style={{ width: 120 }}>Lot</th>
          {selectedSizes.map((s) => <th key={s} className={`${th} text-right`} style={{ width: 80 }}>{s}</th>)}
        </tr></thead>
        <tbody>
          {qtyRows.map((r) => (
            <tr key={r.id}>
              <td className={td}><span className="flex h-6 items-center px-1.5 truncate">{r.color || "—"}</span></td>
              <td className={td}><input className={cellInput} value={r.lot} disabled={readOnly} onChange={(e) => setQtyRows((rs) => rs.map((x) => x.id === r.id ? { ...x, lot: e.target.value } : x))} /></td>
              {selectedSizes.map((s) => (
                <td key={s} className={td}><span className="flex h-6 items-center justify-end px-1.5 font-mono text-muted-foreground">{r.lot || "—"}</span></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-1.5 text-[10.5px] text-muted-foreground">Same Lot value as C/S Details, shown per selected size — MA_WorkOrderItemVariant.Barcode holds one value per Color, not per Color+Size cell.</p>
    </div>
  );
}

function QtySurplusGrid({ readOnly, qtyRows, setQtyRows }: { readOnly: boolean; qtyRows: QtyRow[]; setQtyRows: (fn: (rs: QtyRow[]) => QtyRow[]) => void }) {
  const th = "border-r border-border/70 bg-muted/50 px-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/90 h-6";
  const td = "border-r border-b border-border/50 p-0";
  const cellInput = "h-6 w-full bg-transparent px-1.5 text-[11.5px] outline-none";
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full min-w-[400px] table-fixed border-collapse text-[11.5px]">
        <thead><tr><th className={th} style={{ width: 200 }}>Color</th><th className={`${th} text-right`} style={{ width: 140 }}>Cutting/Mfg Surplus</th></tr></thead>
        <tbody>
          {qtyRows.map((r) => (
            <tr key={r.id}>
              <td className={td}><span className="flex h-6 items-center px-1.5">{r.color || "—"}</span></td>
              <td className={td}><input type="number" className={`${cellInput} text-right font-mono`} value={r.surplus} disabled={readOnly} onChange={(e) => setQtyRows((rs) => rs.map((x) => x.id === r.id ? { ...x, surplus: parseFloat(e.target.value) || 0 } : x))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="p-1.5 text-[10.5px] text-muted-foreground">Stored via MA_WorkOrderItemVariant.AdditionalQuantity (one value per Color, applied across its Size cells).</p>
    </div>
  );
}

