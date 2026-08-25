"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";
import { settingsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { useMasterLookupField } from "@/hooks/use-master-lookup-field";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditableGridInput } from "@/components/ui/editable-grid-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Search, Plus, Trash2, ListOrdered, GripVertical, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { AutocompleteTextCell } from "@/components/legacy-erp/autocomplete-text-cell";

// Inventory Receipt detail grid — same click-to-edit spreadsheet interaction model as
// purchase-order-line-grid.tsx (flush editors, one active cell at a time, no inline "always
// on" input chrome). Type/Code/Name/Explanation/Special Code/Quantity/Unit/Price/Forex keep
// their prior cell implementation and persistence path. Gross Quantity ("Gross Weight") and
// VAT (I/E)/VAT % are ALSO editable now (see the Gross Weight / VAT fix below) — everything
// else in COLUMNS is the remaining required column catalog: real IM_ReceiptItem columns
// rendered read-only where the data already exists (see `dataKey` below — every one names a
// column inventory-receipt.service.ts's ITEM_COLUMNS now actually selects), or an em dash
// where no such column exists on the table.
//
// GROSS WEIGHT FIX: GrossQuantity was rendered via the generic read-only `ro()`/extraValue path
// (no editor ever mounted, so "enter/edit/clear" had nothing to act on). It is now a first-class
// LineRow field (string, same "" default as every other editable numeric — Quantity/Price/etc.)
// with its own EditableGridInput cell, following the exact controlled-input convention already
// proven on Quantity/Price: never null, always a string, buildDto sends `undefined` (not "" or
// null) when cleared so the DB column reverts to NULL instead of writing 0.
//
// VAT FIX: VAT (I/E) and VAT % were both read-only extras. Purchase Order's own VAT flow
// (purchase-order-line-grid.tsx's vatType/vatPct cells + its recalc()) is the reference: VAT
// (I/E) is a Select bound to `vatIncluded` (0|1, Exclusive/Inclusive — same hardcoded two-value
// convention as PO's vatType, no lookup table exists for it there either) and VAT % is an
// EditableGridInput bound to `vatRate` (string). Both feed the same recalc() shape PO uses:
// itemTotal = Quantity x Price, netItemTotal = Inclusive ? itemTotal : itemTotal + itemTotal *
// vatRate/100 — mirroring PO's Quantity x Rate -> price -> lineAmount chain with IR's own field
// names (Price here IS the unit price PO calls Rate; there is no separate computed "Price"
// column on this grid, IR's Price is user-entered). Item Amount / Item Net Total now render
// these computed values (fmt2, same as PO's Price/Item Amount cells) instead of stale `extra`
// data. Only itemTotal/netItemTotal are sent to buildDto, matching PO's own buildDto exactly —
// PO never sends VatAmount either, so IR doesn't invent that here; VAT Amount/VAT Base stay
// plain read-only extras, unchanged.
//
// Manage Columns (order + visibility, session/permanent persistence) AND per-header
// drag-to-reorder + drag-to-resize are a straight port of purchase-order-line-grid.tsx's own
// mechanisms — same state shape, same two-tier sessionStorage/UserSettings.tablePreferences
// persistence via the same settingsApi, same Reset Default / Save for This Session / Save
// Permanently footer — under IR-scoped keys so it never collides with Purchase Order's own
// saved preferences in the same tablePreferences blob. Column resizing (drag handle + double-
// click auto-fit) and arrow-key/Enter/F2/Tab/Escape cell navigation are likewise ported
// verbatim from PO's grid — previously this grid had neither (colWidths had no setter and
// static cells had no onKeyDown), which was the gap versus PO's "same resize/keyboard
// interaction" requirement.

type ColKey =
  | "itemOrderNo" | "type" | "itemId" | "code" | "name" | "color" | "stockOnHand" | "lastPurchasePrice" | "specialCode" | "explanation"
  | "manufacturingOrderNo" | "partyNo" | "accountCode" | "accountName" | "hsCode" | "hsDescription"
  | "c" | "lotCode" | "assortmentExplanation" | "lotQuantity"
  | "variant1" | "variant2" | "variant3" | "variant4" | "variant5"
  | "variant1Name" | "variant2Name" | "variant3Name" | "variant4Name" | "variant5Name"
  | "employeeCode" | "employeeName" | "projectCode" | "projectName"
  | "costCenterCode" | "costCenterName" | "machineCode" | "machineName"
  | "labColorCode" | "labColorName"
  | "rawWidth" | "rawWeight" | "dyeWidth" | "dyeWeight" | "fine" | "pus" | "fabricProductionType"
  | "grossQuantity" | "quantity" | "quantity2" | "quantity3" | "grossQuantity2" | "grossQuantity3"
  | "unit" | "wastagePct" | "calcAdditionalTaxAmount" | "calcAdditionalTaxForexAmount"
  | "rate" | "inventoryCostPrice" | "price" | "forex" | "forexRate" | "forexPrice"
  | "vatIE" | "vatPct" | "withholdingType" | "withholdingExplanation" | "withholdingFactor" | "withholdingDivisor"
  | "certificationCode" | "certificationName" | "exciseTaxCode" | "exciseTaxExplanation"
  | "price2" | "price3" | "forexPrice2" | "forexPrice3"
  | "extAddedToVatBase" | "extPct" | "extAmount"
  | "itemAmount" | "discountAmount" | "expenseAmount" | "vatAmount" | "vatBase"
  | "withholdingAmount1" | "withholdingAmount2" | "itemNetTotal" | "netQuantity" | "mainUnit"
  | "netPrice" | "forexNetPrice" | "itemForexAmount" | "forexDiscountAmount" | "forexExpenseAmount"
  | "forexVatAmount" | "forexVatBase" | "forexWithholdingAmount1" | "forexWithholdingAmount2" | "netItemForexAmount"
  | "closed" | "qcApproved" | "usedQuantity" | "returnQuantity" | "nonAllocatableQuantity" | "reservedQuantity"
  | "checked" | "taxExempt" | "customerOrderNo" | "packageQuantity" | "packageNo" | "packageCode"
  | "manProductCode" | "manufacturingOrder" | "workOrderNo" | "workOrderCertification"
  | "vatReportGroupingField1" | "vatReportGroupingField2" | "routeExplanation" | "routeProcesses"
  | "ipac" | "ipacNo" | "ipacDocumentNo" | "remarks" | "shippingMarks"
  | "poNo";

type Kind = "text" | "number" | "boolean" | "vatie";

interface ColumnDef {
  key: ColKey;
  label: string;
  align: "left" | "right";
  editable: boolean;
  // Property name on the raw API row (stashed verbatim on LineRow.extra) that this read-only
  // column displays. Undefined = the catalog requires this column to exist, but no matching
  // column exists on IM_ReceiptItem today — renders "—" always, per spec ("still include the
  // column ... render an appropriate empty value ... DO NOT invent/fabricate values").
  dataKey?: string;
  kind: Kind;
}

// Read-only column shorthand — every dataKey here is a real, already-selected IM_ReceiptItem
// column (see inventory-receipt.service.ts's ITEM_COLUMNS); omitting dataKey is the deliberate
// "catalog requires it, table doesn't have it" case.
const ro = (key: ColKey, label: string, kind: Kind, dataKey?: string): ColumnDef => ({
  key, label, editable: false, dataKey, kind, align: kind === "number" ? "right" : "left",
});

const COLUMNS: ColumnDef[] = [
  ro("itemOrderNo", "ItemOrderNo", "number", "itemOrderNo"),
  { key: "type", label: "Type", align: "left", editable: true, kind: "text" },
  ro("itemId", "Item Id", "number"), // special-cased in render: reads row.inventoryId directly
  // Code is bound to the selected Inventory item and auto-populated — never typed directly,
  // matching Purchase Order/Purchase Contract's own locked Code cell. Search/select happens on
  // Name instead (below).
  { key: "code", label: "Code", align: "left", editable: false, kind: "text" },
  { key: "name", label: "Name", align: "left", editable: true, kind: "text" },
  // Color — IM_ReceiptItem.ColorCardId, the exact same field/master Purchase Order's own line
  // grid already uses for its "Colour" column (see purchase-order-line-grid.tsx's own "color"
  // cell). Already round-tripped through buildDto/fromApiRow; this is the missing UI column.
  { key: "color", label: "Color", align: "left", editable: true, kind: "text" },
  // Stock On Hand / Last Purchase Price — special-cased in render (like Item Id above): read
  // live off row.stockOnHand/row.lastPurchasePrice, not extra[dataKey] — neither is a real
  // IM_ReceiptItem column, both are derived server-side from real transaction history by the
  // same inventoryCards.list() call Code/Name already use to resolve, so there's nothing in
  // `extra` for them to read.
  ro("stockOnHand", "Stock On Hand", "number"),
  ro("lastPurchasePrice", "Last Purchase Price", "number"),
  { key: "specialCode", label: "Special Code", align: "left", editable: true, kind: "text" },
  { key: "explanation", label: "Explanation", align: "left", editable: true, kind: "text" },
  ro("manufacturingOrderNo", "Manufacturing Order No", "text", "manufacturingOrderNo"),
  ro("partyNo", "Party (Lot No)", "text", "partyNo"),
  ro("accountCode", "Account Code", "text"),
  ro("accountName", "Account Name", "text"),
  ro("hsCode", "HS Code", "text"),
  ro("hsDescription", "HS Description", "text"),
  ro("c", "C", "text"),
  ro("lotCode", "Lot Code", "text"),
  ro("assortmentExplanation", "Assortment Explanation", "text"),
  ro("lotQuantity", "Lot Quantity", "number", "lotQuantity"),
  ro("variant1", "Variant1", "text"),
  ro("variant2", "Variant2", "text"),
  ro("variant3", "Variant3", "text"),
  ro("variant4", "Variant4", "text"),
  ro("variant5", "Variant5", "text"),
  ro("variant1Name", "Variant1 Name", "text"),
  ro("variant2Name", "Variant2 Name", "text"),
  ro("variant3Name", "Variant3 Name", "text"),
  ro("variant4Name", "Variant4 Name", "text"),
  ro("variant5Name", "Variant5 Name", "text"),
  ro("employeeCode", "Employee Code", "text"),
  ro("employeeName", "Employee Name", "text"),
  ro("projectCode", "Project Code", "text"),
  ro("projectName", "Project Name", "text"),
  ro("costCenterCode", "Cost Center Code", "text"),
  ro("costCenterName", "Cost Center Name", "text"),
  ro("machineCode", "Machine Code", "text"),
  ro("machineName", "Machine Name", "text"),
  ro("labColorCode", "Laboratory Color Code", "text"),
  ro("labColorName", "Laboratory Color Name", "text"),
  ro("rawWidth", "Raw Width", "number", "rawWidth"),
  ro("rawWeight", "Raw Weight", "number", "rawWeight"),
  ro("dyeWidth", "Dye Width", "number", "dyeWidth"),
  ro("dyeWeight", "Dye Weight", "number", "dyeWeight"),
  ro("fine", "Fine", "number", "fine"),
  ro("pus", "Pus", "number", "pus"),
  ro("fabricProductionType", "Fabric Production Type", "number", "fabricProductionMethod"),
  { key: "grossQuantity", label: "Gross Quantity", align: "right", editable: true, kind: "number" },
  { key: "quantity", label: "Quantity", align: "right", editable: true, kind: "number" },
  ro("quantity2", "2.Quantity", "number", "quantity2"),
  ro("quantity3", "3.Quantity", "number", "quantity3"),
  ro("grossQuantity2", "Gross 2.Quantity", "number", "grossQuantity2"),
  ro("grossQuantity3", "Gross 3.Quantity", "number", "grossQuantity3"),
  { key: "unit", label: "Unit", align: "left", editable: true, kind: "text" },
  ro("wastagePct", "Wastage%", "number"),
  ro("calcAdditionalTaxAmount", "Calculated Additional Tax Amount", "number"),
  ro("calcAdditionalTaxForexAmount", "Calculated Additional Tax Forex Amount", "number"),
  ro("rate", "Rate", "number", "materialPrice"),
  ro("inventoryCostPrice", "Inventory Cost Price", "number", "costPrice"),
  { key: "price", label: "Price", align: "right", editable: true, kind: "number" },
  { key: "forex", label: "Forex", align: "left", editable: true, kind: "text" },
  ro("forexRate", "Forex Rate", "number", "forexRate"),
  ro("forexPrice", "Forex Price", "number", "forexUnitPrice"),
  { key: "vatIE", label: "VAT (I/E)", align: "left", editable: true, kind: "vatie" },
  { key: "vatPct", label: "VAT %", align: "right", editable: true, kind: "number" },
  ro("withholdingType", "Withholding Type", "number", "withholdingTypeId"),
  ro("withholdingExplanation", "Withholding Explanation", "text"),
  ro("withholdingFactor", "Withholding Factor", "number", "withholdingFactor"),
  ro("withholdingDivisor", "Withholding Divisor", "number", "withholdingDivisor"),
  ro("certificationCode", "Certification Code", "text"),
  ro("certificationName", "Certification Name", "text"),
  ro("exciseTaxCode", "Excise Tax Code", "text"),
  ro("exciseTaxExplanation", "Excise Tax Explanation", "text"),
  ro("price2", "2.Price", "number", "unitPrice2"),
  ro("price3", "3.Price", "number", "unitPrice3"),
  ro("forexPrice2", "Forex 2.Price", "number", "forexUnitPrice2"),
  ro("forexPrice3", "Forex 3.Price", "number", "forexUnitPrice3"),
  ro("extAddedToVatBase", "EXT Will be Added To VAT Base", "boolean", "addToVatBase"),
  ro("extPct", "EXT %", "number", "exciseTaxRate"),
  ro("extAmount", "EXT Amount", "number", "exciseTaxAmount"),
  ro("itemAmount", "Item Amount", "number", "itemTotal"),
  ro("discountAmount", "Discount Amount", "number", "discountAmount"),
  ro("expenseAmount", "Expense Amount", "number", "expenseAmount"),
  ro("vatAmount", "VAT Amount", "number", "vatAmount"),
  ro("vatBase", "VAT Base", "number", "vatBaseAmount"),
  ro("withholdingAmount1", "Withholding Amount-1", "number", "withholdingAmount1"),
  ro("withholdingAmount2", "Withholding Amount-2", "number", "withholdingAmount2"),
  ro("itemNetTotal", "Item Net Total", "number", "netItemTotal"),
  ro("netQuantity", "Net Quantity", "number", "netQuantity"),
  ro("mainUnit", "Main Unit", "text"),
  ro("netPrice", "Net Price", "number", "netUnitPrice"),
  ro("forexNetPrice", "Forex Net Price", "number", "netUnitPriceForex"),
  ro("itemForexAmount", "Item Forex Amount", "number", "itemTotalForex"),
  ro("forexDiscountAmount", "Forex Discount Amount", "number", "discountsTotalForex"),
  ro("forexExpenseAmount", "Forex Expense Amount", "number", "expensesTotalForex"),
  ro("forexVatAmount", "Forex VAT Amount", "number", "vatAmountForex"),
  ro("forexVatBase", "Forex VAT Base", "number", "vatBaseAmountForex"),
  ro("forexWithholdingAmount1", "Forex Withholding Amount-1", "number", "withholdingAmount1Forex"),
  ro("forexWithholdingAmount2", "Forex Withholding Amount-2", "number", "withholdingAmount2Forex"),
  ro("netItemForexAmount", "Net Item Forex Amount", "number", "netItemTotalForex"),
  ro("closed", "Closed", "boolean", "isClosed"),
  ro("qcApproved", "QC Approved", "boolean", "isQCApproved"),
  ro("usedQuantity", "Used Quantity", "number", "usedQuantity"),
  ro("returnQuantity", "Return Quantity", "number", "returnedQuantity"),
  ro("nonAllocatableQuantity", "NonAllocatable Quantity", "number", "noneAllocatableQuantity"),
  ro("reservedQuantity", "Reserved Quantity", "number"),
  ro("checked", "Checked", "boolean", "isChecked"),
  ro("taxExempt", "Tax Exempt", "boolean", "isTaxExempted"),
  ro("customerOrderNo", "Customer Order No", "text", "customerOrderNo"),
  ro("packageQuantity", "Package (Roll) Quantity", "number", "packageQuantity"),
  ro("packageNo", "Package No", "number", "packageNo"),
  ro("packageCode", "Package Code", "text"),
  ro("manProductCode", "Man.Product Code", "text"),
  ro("manufacturingOrder", "Manufacturing Order", "text"),
  ro("workOrderNo", "Work Order No", "number", "workOrderReceiptItemId"),
  ro("workOrderCertification", "Work Order Certification", "text"),
  ro("vatReportGroupingField1", "VAT Report Grouping Field-1", "text", "vatListGField01"),
  ro("vatReportGroupingField2", "VAT Report Grouping Field-2", "text", "vatListGField02"),
  ro("routeExplanation", "Route Explanation", "text"),
  ro("routeProcesses", "Route Processes", "text"),
  ro("ipac", "IPAC", "number", "eximIpacItemId"),
  ro("ipacNo", "IPAC No", "number"),
  ro("ipacDocumentNo", "IPAC Document No", "text", "eximIpacItemDocumentNo"),
  ro("remarks", "Remarks", "text", "uD_Expfield"),
  ro("shippingMarks", "Shipping Marks", "text", "uD_ShippingMarks"),
  // PO No — Pending Orders import (Purchase Receipt -> Current Account -> right-click ->
  // Pending Orders). Special-cased in render like itemId/stockOnHand above (reads the
  // dedicated LineRow.poReceiptNo field, not extra[dataKey]) since it's resolved via a
  // separate join in inventory-receipt.service.ts's listItems(), not a plain IM_ReceiptItem
  // column.
  ro("poNo", "PO No", "text"),
];
const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));

// Type/Code/Name are permanently first and unhideable — same rule as Purchase Order's own
// FIXED_COLS (purchase-order-line-grid.tsx), applied here to the same three columns.
const FIXED_COLS: ColKey[] = ["type", "code", "name"];
const REORDERABLE_DEFAULT: ColKey[] = COLUMNS.filter((c) => !FIXED_COLS.includes(c.key)).map((c) => c.key);

// Column order/visibility persistence — IR-scoped keys so this never collides with Purchase
// Order's own saved values in the same sessionStorage / UserSettings.tablePreferences blob.
// Mechanism is a direct port of purchase-order-line-grid.tsx's own (see its comment for the
// session-vs-permanent rationale): "Save for This Session" -> sessionStorage only; "Save
// Permanently" -> additionally settingsApi.updateCurrentSettings (server-side shallow-merged
// tablePreferences, same endpoint the Workspace store already uses, no new backend endpoint).
const SESSION_COLUMN_ORDER_KEY = "ir-line-grid-column-order";
const PERMANENT_COLUMN_ORDER_SETTINGS_KEY = "irLineGridColumnOrder";
const SESSION_HIDDEN_COLUMNS_KEY = "ir-line-grid-hidden-columns";
const PERMANENT_HIDDEN_COLUMNS_SETTINGS_KEY = "irLineGridHiddenColumns";
const sanitizeColumnOrder = (saved: unknown): ColKey[] => {
  if (!Array.isArray(saved)) return REORDERABLE_DEFAULT;
  const validSaved = saved.filter((k): k is ColKey => REORDERABLE_DEFAULT.includes(k as ColKey));
  const missing = REORDERABLE_DEFAULT.filter((k) => !validSaved.includes(k));
  return [...validSaved, ...missing];
};
// No saved value (new user, or an old pre-Manage-Columns preference blob) => empty hidden set,
// i.e. every column visible — "IMPORTANT CHANGE FROM THE LEGACY SCREEN: by default, ALL
// available columns above must be VISIBLE."
const sanitizeHiddenColumns = (saved: unknown): ColKey[] =>
  Array.isArray(saved) ? saved.filter((k): k is ColKey => REORDERABLE_DEFAULT.includes(k as ColKey)) : [];

const DEFAULT_WIDTHS: Record<ColKey, number> = Object.fromEntries(
  COLUMNS.map((c) => {
    const overrides: Partial<Record<ColKey, number>> = {
      type: 110, code: 140, name: 260, explanation: 200, specialCode: 130,
      quantity: 100, unit: 90, price: 110, forex: 100, itemOrderNo: 96, itemId: 96,
    };
    return [c.key, overrides[c.key] ?? (c.align === "right" ? 110 : 150)];
  }),
) as Record<ColKey, number>;

// Resize floor — same idea as purchase-order-line-grid.tsx's own MIN_WIDTHS: a flat
// numeric-narrow/text-roomy default for the catalog's ~100 mostly-generic columns, with a
// handful of overrides for the columns that actually get typed into or carry long labels.
const MIN_WIDTHS: Record<ColKey, number> = Object.fromEntries(
  COLUMNS.map((c) => {
    const overrides: Partial<Record<ColKey, number>> = {
      type: 96, code: 104, name: 150, explanation: 130, specialCode: 100,
      quantity: 82, unit: 70, price: 90, forex: 76, itemOrderNo: 80, itemId: 80,
    };
    return [c.key, overrides[c.key] ?? (c.align === "right" ? 70 : 90)];
  }),
) as Record<ColKey, number>;

const ROW_H = "h-12";
const HEADER_H = "h-11";
const CELL_PAD = "px-3.5";
const CELL_BORDER = "border-r border-b border-border";
const FIRST_COL_BORDER = "border-l border-border";
const EDITOR_CONTROL = "h-full! w-full min-w-0 rounded-none border-0 bg-background px-3.5 text-[13px] font-medium shadow-none focus-visible:ring-0";
const EDITOR_WRAP = "flex h-12 items-stretch";
const DEL_W = 44;

const INVENTORY_CARDS_LIST_PATH = "/dashboard/legacy-erp/inventory-cards-list";

// Same "no lookup/enum table for item type" situation as Purchase Order's own grid — Inventory
// only, matching the reference screenshot (no Service/Fixed Asset rows shown there).
const TYPE_OPTIONS = [{ value: "inventory", label: "Inventory" }];

const uid = () => Math.random().toString(36).slice(2, 10);
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmtCell = (v: string) => (v === "" || v == null ? "—" : num(v).toLocaleString(undefined, { maximumFractionDigits: 4 }));
// Display for a COMPUTED numeric row field (itemTotal/netItemTotal) — same convention as
// purchase-order-line-grid.tsx's own fmt2 for its Price/Item Amount cells: always 2 decimals,
// "0.00" for null rather than an em dash (a computed total is never "not yet typed into").
const fmt2 = (n: number | null) => (n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Formatting for the read-only catalog columns — reads straight off LineRow.extra (the raw,
// unmodified API row for this line; see fromApiRow below). Never fabricates a value: a
// dataKey-less column, or one whose value is null/undefined/empty on this row, always renders
// "—", exactly as the spec requires.
const fmtBool = (v: any) => (v === 1 || v === true ? "Yes" : v === 0 || v === false ? "No" : "—");
const fmtVatIE = (v: any) => (v === 1 ? "Inclusive" : v === 0 ? "Exclusive" : "—");
const fmtText = (v: any) => (v === null || v === undefined || v === "" ? "—" : String(v));
const fmtNum = (v: any) => (v === null || v === undefined || v === "" ? "—" : num(v).toLocaleString(undefined, { maximumFractionDigits: 4 }));
const extraValue = (col: ColumnDef, extra: Record<string, any>): string => {
  if (!col.dataKey) return "—";
  const v = extra[col.dataKey];
  if (col.kind === "number") return fmtNum(v);
  if (col.kind === "boolean") return fmtBool(v);
  if (col.kind === "vatie") return fmtVatIE(v);
  return fmtText(v);
};

interface LineRow {
  clientId: string;
  __rowId: number | null;
  inventoryId: number | null;
  code: string;
  name: string;
  // Live-only, never persisted — see the stockOnHand/lastPurchasePrice ColumnDef comment above.
  stockOnHand: number | null;
  lastPurchasePrice: number | null;
  explanation: string;
  specialCode: string;
  quantity: string;
  unitId: number | null;
  unit: string;
  price: string;
  forexId: number | null;
  forexCode: string;
  // Gross Weight (Gross Quantity) — plain editable numeric, same "" default and string-typed
  // controlled-input convention as Quantity/Price above. Not part of the VAT/total calc chain.
  grossQuantity: string;
  // VAT — same shape as purchase-order-line-grid.tsx's own vatIncluded/vatRate: vatIncluded is
  // 0|1 (Exclusive/Inclusive), vatRate is the editable percentage. Both feed recalc() below.
  vatIncluded: 0 | 1;
  vatRate: string;
  // Computed, mirroring PO's own price/lineAmount: itemTotal = Quantity x Price, netItemTotal =
  // Inclusive ? itemTotal : itemTotal + VAT. Never directly edited — recalc() is the only writer.
  itemTotal: number | null;
  netItemTotal: number | null;
  // Pending Orders import — the originating Purchase Order line this receipt line was created
  // from (IM_ReceiptItem.OrderReceiptItemId, a real pre-existing FK — see
  // inventory-receipt.service.ts). Persisted via buildDto. poReceiptNo is display-only (the
  // PO's own ReceiptNo, resolved server-side on load or set locally at import time), same
  // "live-only, never persisted" treatment as stockOnHand/lastPurchasePrice above.
  orderReceiptItemId: number | null;
  poReceiptNo: string;
  // Related Receipt import — the originating receipt line (Receipt Type 2 or 11 — see
  // receipt-types.config.ts's RELATED_IMPORT_SOURCE_TYPES) this line was imported from
  // (IM_ReceiptItem.PurchaseReceiptItemId, the same self-reference column assertReturnQty()
  // already enforces for Purchase Return — see inventory-receipt.service.ts). Mutually exclusive
  // with orderReceiptItemId in practice (a line is either Pending-Orders-imported or
  // Related-Receipt-imported, never both), but kept as its own field rather than overloading
  // orderReceiptItemId since they're genuinely different source relationships/columns.
  // sourceReceiptNo/sourceReceiptType are display-only (resolved server-side on load, same
  // "live-only, never persisted" treatment as poReceiptNo above).
  purchaseReceiptItemId: number | null;
  sourceReceiptNo: string;
  sourceReceiptType: number | null;
  // Colour — IM_ReceiptItem.ColorCardId (ColorCard.id, text), the exact same field/master
  // Purchase Order's own line grid already uses for its "Colour" column. Populated today only
  // via Pending Orders import (carried straight across from the source PO line); persisted
  // through buildDto like every other real column here.
  colorCardId: string | null;
  // Display text for colorCardId — resolved client-side from colorOptions, never itself sent
  // through buildDto (colorCardId is the single source of truth), same convention as PO's own
  // LineRow.color.
  color: string;
  // Variant breakdown rows copied from the source PO line at import time, not yet created on
  // the server (createItemVariant needs this line's own real __rowId, which only exists after
  // this line itself is persisted — see persistRow/commitDrafts). Cleared once created; never
  // sent through buildDto, never itself a persisted column.
  pendingVariants: { inventoryVariantId: number; quantity: number; netUnitPrice: number | null; orderReceiptItemVariantId: number }[];
  // The raw API row this line was hydrated from (or {} for a not-yet-saved row) — every
  // read-only catalog column's dataKey is looked up in here, never a separately maintained
  // field, so there's exactly one place a saved line's extra data lives.
  extra: Record<string, any>;
}

const emptyLine = (): LineRow => ({
  clientId: uid(), __rowId: null, inventoryId: null, code: "", name: "",
  stockOnHand: null, lastPurchasePrice: null, explanation: "",
  specialCode: "", quantity: "", unitId: null, unit: "", price: "", forexId: null, forexCode: "",
  grossQuantity: "", vatIncluded: 0, vatRate: "", itemTotal: null, netItemTotal: null,
  orderReceiptItemId: null, poReceiptNo: "",
  purchaseReceiptItemId: null, sourceReceiptNo: "", sourceReceiptType: null,
  colorCardId: null, color: "", pendingVariants: [],
  extra: {},
});

// Quantity x Price -> itemTotal -> VAT -> netItemTotal, the same calc chain as Purchase Order's
// own recalc() (purchase-order-line-grid.tsx), renamed to this grid's own field names (Price
// here is PO's Rate; there is no separate computed "Price" column on this grid).
function recalc(row: LineRow): LineRow {
  // effectiveQuantity = GrossQuantity > 0 ? GrossQuantity : Quantity — Gross Weight now drives
  // the total when set, instead of being captured-but-ignored.
  const effectiveQuantity = num(row.grossQuantity) > 0 ? num(row.grossQuantity) : num(row.quantity);
  const itemTotal = effectiveQuantity * num(row.price);
  const vatAmount = itemTotal * (num(row.vatRate) / 100);
  const netItemTotal = row.vatIncluded ? itemTotal : itemTotal + vatAmount;
  return { ...row, itemTotal, netItemTotal };
}

const isBlankLine = (row: LineRow) => !row.inventoryId && !row.code.trim();

/** The subset of legacyErpApi.inventoryReceipts this grid needs — legacyErpApi.receipts(type)
 *  (Receipt Screen Replication's generic client) satisfies this shape as-is. */
export interface InventoryReceiptItemsApi {
  listItems: (id: number) => Promise<any>;
  createItem: (id: number, d: any) => Promise<any>;
  updateItem: (id: number, itemId: number, d: any) => Promise<any>;
  removeItem: (id: number, itemId: number) => Promise<any>;
}

interface Props {
  inventoryReceiptId: number | null;
  readOnly?: boolean;
  /** Which receipt type's API this instance reads/writes through — defaults to Purchase
   *  Receipt's own client, unchanged for every existing caller that doesn't pass this. */
  api?: InventoryReceiptItemsApi;
}

export interface ImportedPendingLine {
  inventoryId: number; code: string; name: string; quantity: number;
  unitId: number | null; unit: string; unitPrice: number | null; orderReceiptItemId: number; poReceiptNo: string;
  colorCardId: string | null;
  variants: { inventoryVariantId: number; quantity: number; netUnitPrice: number | null; orderReceiptItemVariantId: number }[];
}

// Related Receipt import (Current-Account-aware) — same shape as ImportedPendingLine, sourced
// from a Receipt Type 2/11 line instead of a Purchase Order line. No variants: no equivalent
// IM_ReceiptItemVariant->IM_ReceiptItemVariant traceability column exists (only Order->Receipt
// variant linking is wired — see inventory-receipt.service.ts's ITEM_VARIANT_COLUMNS).
export interface ImportedRelatedLine {
  inventoryId: number; code: string; name: string; quantity: number;
  unitId: number | null; unit: string; unitPrice: number | null;
  purchaseReceiptItemId: number; sourceReceiptNo: string;
  colorCardId: string | null;
}

export interface InventoryReceiptLineGridHandle {
  commitDrafts: (newInventoryReceiptId: number) => Promise<void>;
  /** Pending Orders import — appends the given lines (replacing the trailing blank placeholder).
   *  Reuses the exact same draft-vs-persisted branching persistRow/commitDrafts already have:
   *  on an already-saved receipt these persist immediately; on a new/unsaved one they become
   *  ordinary drafts that the existing commitDrafts() creates for real on Save. */
  importLines: (lines: ImportedPendingLine[]) => void;
  /** PO line ids already present on this grid (persisted or still-draft) — lets the Pending
   *  Orders dialog exclude lines already imported, even before the receipt is saved. */
  getImportedOrderReceiptItemIds: () => number[];
  /** Related Receipt import — same append/persist behavior as importLines above, for lines
   *  sourced from a Receipt Type 2/11 line instead of a Purchase Order line. */
  importRelatedLines: (lines: ImportedRelatedLine[]) => void;
  /** purchaseReceiptItemIds already present on this grid — lets the Related Receipt dialog
   *  exclude already-imported source lines, same role as getImportedOrderReceiptItemIds. */
  getImportedPurchaseReceiptItemIds: () => number[];
  /** Current Account change handling — invalidates every Related-Receipt-imported line (they
   *  were sourced under the OLD Current Account and are no longer guaranteed eligible under the
   *  new one). Unsaved draft lines are removed outright (nothing lost — never persisted); an
   *  already-persisted line has its stale purchaseReceiptItemId link cleared instead of the line
   *  itself being deleted, so the user's entered item/quantity isn't silently destroyed — it
   *  just becomes an ordinary manually-entered line. Returns counts for the caller's toast. */
  clearRelatedImportedLines: () => Promise<{ removedDrafts: number; detachedLines: number }>;
}

export const InventoryReceiptLineGrid = forwardRef<InventoryReceiptLineGridHandle, Props>(function InventoryReceiptLineGrid(
  { inventoryReceiptId, readOnly = false, api = legacyErpApi.inventoryReceipts },
  ref,
) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LineRow[]>(() => [emptyLine()]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [forexOptions, setForexOptions] = useState<any[]>([]);
  // Unit — the flat cross-set MD_UnitSetItem list, kept ONLY to resolve an already-saved line's
  // Unit display label (see hydrateUnits/importLines below), the same narrow role
  // purchase-order-line-grid.tsx's own `unitOptions` plays there. The Unit CELL's actual
  // dropdown source is the item-scoped list below, not this one.
  const [unitOptions, setUnitOptions] = useState<any[]>([]);
  // Per-Item Unit options (IM_ItemUnitItemSize via legacyErpApi.lookupItemUnits) — the same
  // resolver purchase-order-line-grid.tsx's own itemUnitsByInventoryId already uses, reused
  // verbatim here instead of a second copy: keyed by inventoryId since each item has its own
  // configured unit set, and ordered by the backend with the item's Main Unit first.
  const [itemUnitsByInventoryId, setItemUnitsByInventoryId] = useState<Record<string, any[]>>({});
  const itemUnitsRef = useRef(itemUnitsByInventoryId);
  itemUnitsRef.current = itemUnitsByInventoryId;
  const itemUnitsFetchRef = useRef<Record<string, Promise<any[]> | undefined>>({});
  const fetchItemUnits = useCallback((inventoryId: number): Promise<any[]> => {
    const key = String(inventoryId);
    if (itemUnitsRef.current[key]) return Promise.resolve(itemUnitsRef.current[key]);
    const inFlight = itemUnitsFetchRef.current[key];
    if (inFlight) return inFlight;
    const p = legacyErpApi.lookupItemUnits(inventoryId)
      .then((r: any) => {
        const list = Array.isArray(r) ? r : [];
        setItemUnitsByInventoryId((prev) => ({ ...prev, [key]: list }));
        return list;
      })
      .catch(() => {
        setItemUnitsByInventoryId((prev) => ({ ...prev, [key]: [] }));
        return [];
      })
      .finally(() => { delete itemUnitsFetchRef.current[key]; });
    itemUnitsFetchRef.current[key] = p;
    return p;
  }, []);
  const ensureItemUnitsLoaded = useCallback((inventoryId: number | null | undefined) => {
    if (inventoryId == null) return;
    fetchItemUnits(Number(inventoryId));
  }, [fetchItemUnits]);
  // Code field's smart-search datasource — the SAME Inventory Card List aggregation
  // hydrateCodesNames already uses to resolve saved lines' Code/Name (see
  // purchase-order-line-grid.tsx's own inventoryOptions for the reference implementation),
  // fetched once here too so typing into a brand-new row's Code field has something to search
  // against immediately, without a per-keystroke request.
  const [inventoryOptions, setInventoryOptions] = useState<any[]>([]);
  // Color — the same plmApi.colors master Purchase Order's own line grid already uses for its
  // "Color" cell (purchase-order-line-grid.tsx:324,350). Feeds the color cell's autocomplete
  // options here the same way.
  const [colorOptions, setColorOptions] = useState<any[]>([]);
  const [cursor, setCursor] = useState<{ clientId: string; col: ColKey } | null>(null);
  const [editing, setEditing] = useState(false);
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(DEFAULT_WIDTHS);

  useEffect(() => {
    legacyErpApi.lookupTable("forex").then((r: any) => setForexOptions(Array.isArray(r) ? r : [])).catch(() => {});
    legacyErpApi.lookupTable("unit").then((r: any) => setUnitOptions(Array.isArray(r) ? r : [])).catch(() => {});
    legacyErpApi.inventoryCards.list().then((r: any) => setInventoryOptions(Array.isArray(r) ? r : [])).catch(() => {});
    plmApi.colors.list().then((r: any) => setColorOptions(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  // IM_Item.InventoryCode/InventoryName via the same inventoryCards.list() aggregation Code's
  // lookup dialog and hydrateCodesNames already read from — no separate Inventory Card table,
  // no duplicated data. Every row is Type=Inventory on this grid (no Fixed Asset/Service split
  // here, unlike Purchase Order), so unlike PO's own inventoryCodeOptions this isn't filtered
  // by sourceType.
  const inventoryCodeOptions = useMemo(
    () => inventoryOptions.map((o) => ({ id: String(o.id), code: o.inventoryCode, name: o.inventoryName })),
    [inventoryOptions],
  );
  // Resolves a picked suggestion's id back to the full record (stockOnHand/lastPurchasePrice
  // etc.) — same purpose as purchase-order-line-grid.tsx's own inventoryById.
  const inventoryById = useMemo(() => new Map(inventoryOptions.map((o) => [String(o.id), o])), [inventoryOptions]);

  const hydrateCodesNames = async (list: LineRow[]): Promise<LineRow[]> => {
    if (!list.length) return list;
    try {
      const all: any = await legacyErpApi.inventoryCards.list();
      const byId = new Map<string, any>((Array.isArray(all) ? all : []).map((r: any) => [String(r.id), r]));
      return list.map((row) => {
        if (!row.inventoryId) return row;
        const match = byId.get(String(row.inventoryId));
        if (!match) return row;
        return { ...row, code: match.inventoryCode, name: match.inventoryName, stockOnHand: match.stockOnHand ?? null, lastPurchasePrice: match.lastPurchasePrice ?? null };
      });
    } catch {
      return list;
    }
  };

  const hydrateForex = async (list: LineRow[]): Promise<LineRow[]> => {
    if (!list.some((r) => r.forexId != null)) return list;
    try {
      const all: any = await legacyErpApi.lookupTable("forex");
      const byId = new Map<string, any>((Array.isArray(all) ? all : []).map((f: any) => [String(f.id), f]));
      return list.map((row) => (row.forexId == null ? row : { ...row, forexCode: byId.get(String(row.forexId))?.code || byId.get(String(row.forexId))?.name || row.forexCode }));
    } catch {
      return list;
    }
  };

  const hydrateUnits = async (list: LineRow[]): Promise<LineRow[]> => {
    if (!list.some((r) => r.unitId != null)) return list;
    try {
      const all: any = await legacyErpApi.lookupTable("unit");
      const byId = new Map<string, any>((Array.isArray(all) ? all : []).map((u: any) => [String(u.id), u]));
      return list.map((row) => (row.unitId == null ? row : { ...row, unit: byId.get(String(row.unitId))?.code || byId.get(String(row.unitId))?.name || row.unit }));
    } catch {
      return list;
    }
  };

  // Colour display resolution — same shape/purpose as purchase-order-line-grid.tsx's own
  // color-hydration step (lines 430-439): resolves each saved row's colorCardId to a
  // code/name for display, via its own fresh fetch rather than the colorOptions state (avoids
  // a race with that state's own mount-time fetch).
  const hydrateColors = async (list: LineRow[]): Promise<LineRow[]> => {
    if (!list.some((r) => r.colorCardId != null)) return list;
    try {
      const all: any = await plmApi.colors.list();
      const byId = new Map<string, any>((Array.isArray(all) ? all : []).map((c: any) => [String(c.id), c]));
      return list.map((row) => (row.colorCardId == null ? row : { ...row, color: byId.get(String(row.colorCardId))?.code || byId.get(String(row.colorCardId))?.name || row.color }));
    } catch {
      return list;
    }
  };

  const fromApiRow = (r: any): LineRow => recalc({
    clientId: uid(), __rowId: r.id, inventoryId: r.inventoryId ?? null,
    code: "", name: "", stockOnHand: null, lastPurchasePrice: null,
    explanation: r.explanation ?? "", specialCode: r.specialCode ?? "",
    quantity: r.quantity != null ? String(r.quantity) : "",
    unitId: r.unitId ?? null, unit: "",
    price: r.unitPrice != null ? String(r.unitPrice) : "",
    forexId: r.forexId ?? null, forexCode: "",
    grossQuantity: r.grossQuantity != null ? String(r.grossQuantity) : "",
    vatIncluded: r.vatIncluded ? 1 : 0,
    vatRate: r.vatRate != null ? String(r.vatRate) : "",
    itemTotal: r.itemTotal ?? null,
    netItemTotal: r.netItemTotal ?? null,
    orderReceiptItemId: r.orderReceiptItemId ?? null,
    poReceiptNo: r.orderReceiptNo ?? "",
    purchaseReceiptItemId: r.purchaseReceiptItemId ?? null,
    sourceReceiptNo: r.sourceReceiptNo ?? "",
    sourceReceiptType: r.sourceReceiptType ?? null,
    colorCardId: r.colorCardId ?? null,
    pendingVariants: [],
    extra: r,
  });

  const load = async (idOverride?: number | null) => {
    const id = idOverride ?? inventoryReceiptId;
    if (!id) { setRows([emptyLine()]); return; }
    setLoading(true);
    try {
      const r: any = await api.listItems(id);
      const list = (Array.isArray(r) ? r : []).map(fromApiRow);
      const withCodes = await hydrateCodesNames(list);
      const withForex = await hydrateForex(withCodes);
      const withUnits = await hydrateUnits(withForex);
      setRows(withUnits.length ? withUnits : [emptyLine()]);
      // Prefetch each distinct item's own valid units so the Unit cell's dropdown is ready the
      // moment a saved line is opened for edit — same prefetch purchase-order-line-grid.tsx's
      // own load() already does.
      Array.from(new Set(withUnits.map((r) => r.inventoryId).filter((id): id is number => id != null)))
        .forEach((id) => ensureItemUnitsLoaded(id));
    } catch (e: any) {
      toast.error(e.message || "Failed to load purchase receipt lines");
      setRows([emptyLine()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [inventoryReceiptId]);

  const buildDto = useCallback((row: LineRow) => ({
    inventoryId: row.inventoryId,
    quantity: row.quantity === "" ? undefined : num(row.quantity),
    unitId: row.unitId ?? undefined,
    unitPrice: row.price === "" ? undefined : num(row.price),
    forexId: row.forexId ?? undefined,
    explanation: row.explanation === "" ? undefined : row.explanation,
    specialCode: row.specialCode === "" ? undefined : row.specialCode,
    // Gross Weight — sent as explicit undefined (not 0) when cleared, same "don't write a false
    // zero" convention as every other optional numeric field here.
    grossQuantity: row.grossQuantity === "" ? undefined : num(row.grossQuantity),
    // VAT — mirrors purchase-order-line-grid.tsx's own buildDto exactly: vatIncluded/vatRate are
    // sent, plus the two computed totals (itemTotal/netItemTotal). PO never sends VatAmount
    // separately either, so this doesn't invent that here.
    vatIncluded: row.vatIncluded,
    vatRate: row.vatRate === "" ? undefined : num(row.vatRate),
    itemTotal: row.itemTotal ?? undefined,
    netItemTotal: row.netItemTotal ?? undefined,
    // Pending Orders import — carries the originating PO line reference through to
    // IM_ReceiptItem.OrderReceiptItemId; undefined (not sent) for every manually-added line,
    // exactly as before.
    orderReceiptItemId: row.orderReceiptItemId ?? undefined,
    // Related Receipt import — carries the originating Receipt Type 2/11 line reference through
    // to IM_ReceiptItem.PurchaseReceiptItemId; undefined (not sent) for every other line, exactly
    // like orderReceiptItemId above. The backend re-validates this server-side on create (Current
    // Account match + remaining quantity — see inventory-receipt.service.ts's createItem/
    // assertRelatedImportSource/assertReturnQty), so this is never trusted as the final word.
    purchaseReceiptItemId: row.purchaseReceiptItemId ?? undefined,
    // Colour — IM_ReceiptItem.ColorCardId, carried across from the source PO line at import
    // time (see importLines below); undefined for every manually-added line.
    colorCardId: row.colorCardId ?? undefined,
  }), []);

  // Variant breakdown — creates each of a just-persisted line's still-pending
  // IM_ReceiptItemVariant rows (copied from the source PO line at import time — see
  // importLines below), now that the line itself has a real id to hang them off. Hardcoded to
  // legacyErpApi.inventoryReceipts (not the generic `api` prop) because Pending Orders import,
  // and therefore pendingVariants, only ever exists on Purchase Receipt's own screen — the same
  // scoping the variant routes themselves have (see inventory-receipt.controller.ts).
  const createPendingVariants = async (receiptId: number, receiptItemId: number, variants: LineRow["pendingVariants"]) => {
    for (const v of variants) {
      try {
        await legacyErpApi.inventoryReceipts.createItemVariant(receiptId, receiptItemId, {
          inventoryVariantId: v.inventoryVariantId,
          quantity: v.quantity,
          netUnitPrice: v.netUnitPrice ?? undefined,
          orderReceiptItemVariantId: v.orderReceiptItemVariantId,
        });
      } catch (e: any) {
        toast.error(e.message || "Failed to save a variant line");
      }
    }
  };

  const persistRow = useCallback(async (clientId: string, row: LineRow) => {
    if (!inventoryReceiptId) return;
    if (row.__rowId == null && isBlankLine(row)) return;
    try {
      if (row.__rowId == null) {
        const saved: any = await api.createItem(inventoryReceiptId, buildDto(row));
        setRows((prev) => prev.map((r) => (r.clientId === clientId && r.__rowId == null ? { ...r, __rowId: saved.id, extra: saved, pendingVariants: [] } : r)));
        if (row.pendingVariants.length) await createPendingVariants(inventoryReceiptId, saved.id, row.pendingVariants);
      } else {
        const saved: any = await api.updateItem(inventoryReceiptId, row.__rowId, buildDto(row));
        setRows((prev) => prev.map((r) => (r.clientId === clientId ? { ...r, extra: saved ?? r.extra } : r)));
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save line");
    }
  }, [inventoryReceiptId, buildDto, api]);

  const commitDrafts = async (newInventoryReceiptId: number) => {
    const draftRows = rows.filter((r) => !isBlankLine(r) && r.__rowId == null);
    for (const row of draftRows) {
      try {
        const saved: any = await api.createItem(newInventoryReceiptId, buildDto(row));
        if (row.pendingVariants.length) await createPendingVariants(newInventoryReceiptId, saved.id, row.pendingVariants);
      } catch (e: any) {
        toast.error(e.message || "Failed to save a line item");
      }
    }
    await load(newInventoryReceiptId);
  };

  // Pending Orders import — appends new draft rows carrying each selected PO line's reference.
  // Deliberately reuses persistRow/commitDrafts rather than a new persistence path: when this
  // receipt already has an id, the freshly-appended rows are persisted immediately below (same
  // call persistRow's own Enter/Tab/blur handlers already make); when it doesn't yet, they're
  // left as ordinary drafts and the existing commitDrafts(newId) — already wired into the
  // header's own save() — creates them for real once the header is saved, exactly like any
  // manually-typed draft line.
  const importLines = (lines: ImportedPendingLine[]) => {
    if (!lines.length) return;
    const newRows = lines.map((l) => {
      // Resolve the Unit label from the same already-loaded unitOptions this grid's own "unit"
      // cell Select already uses — a PO line only carries unitId, not a display label.
      const unitMatch = l.unitId != null ? unitOptions.find((u) => String(u.id) === String(l.unitId)) : undefined;
      return recalc({
        ...emptyLine(),
        inventoryId: l.inventoryId, code: l.code, name: l.name,
        quantity: String(l.quantity), unitId: l.unitId, unit: l.unit || unitMatch?.code || unitMatch?.name || "",
        // Price — carried over from the originating PO line (IM_OrderReceiptItem.UnitPrice) via
        // buildDto's existing unitPrice field below; not a second price source.
        price: l.unitPrice != null ? String(l.unitPrice) : "",
        orderReceiptItemId: l.orderReceiptItemId, poReceiptNo: l.poReceiptNo,
        // Colour/Variant — carried over from the source PO line. colorCardId flows straight
        // through buildDto onto IM_ReceiptItem.ColorCardId; variants are held here until this
        // row itself is persisted (see persistRow/commitDrafts's createPendingVariants call).
        colorCardId: l.colorCardId,
        pendingVariants: l.variants ?? [],
      });
    });
    setRows((prev) => [...prev.filter((r) => !isBlankLine(r)), ...newRows, emptyLine()]);
    if (inventoryReceiptId) {
      newRows.forEach((row) => persistRow(row.clientId, row));
    }
    // Prefer the item's own configured Unit over whatever Unit the PO line happened to carry —
    // per spec, a PO/global Unit that isn't actually one of the item's configured units must
    // never be blindly copied onto the receipt line. The PO's Unit is kept only when it's
    // genuinely one of the item's valid units (an explicitly-defined valid business rule);
    // otherwise it's replaced with the item's Main Unit, same normalization selectItemOnRow
    // applies on manual selection. Backend createItem/updateItem also re-normalizes this as a
    // safety net, so this stays correct even for a not-yet-saved header (import lines still
    // ordinary drafts here — see commitDrafts).
    newRows.forEach((row) => {
      if (row.inventoryId == null) return;
      fetchItemUnits(row.inventoryId).then((list) => {
        if (!list.length) return;
        const stillValid = row.unitId != null && list.some((u) => Number(u.id) === Number(row.unitId));
        if (stillValid) return;
        const main = list[0];
        updateRow(row.clientId, { unitId: Number(main.id), unit: main.code || main.name || "" }, !!inventoryReceiptId);
      });
    });
  };

  const getImportedOrderReceiptItemIds = () => rows.filter((r) => r.orderReceiptItemId != null).map((r) => r.orderReceiptItemId as number);

  // Related Receipt import — same append/persist shape as importLines above (Pending Orders),
  // sourced from a Receipt Type 2/11 line via purchaseReceiptItemId instead of orderReceiptItemId.
  const importRelatedLines = (lines: ImportedRelatedLine[]) => {
    if (!lines.length) return;
    const newRows = lines.map((l) => {
      const unitMatch = l.unitId != null ? unitOptions.find((u) => String(u.id) === String(l.unitId)) : undefined;
      return recalc({
        ...emptyLine(),
        inventoryId: l.inventoryId, code: l.code, name: l.name,
        quantity: String(l.quantity), unitId: l.unitId, unit: l.unit || unitMatch?.code || unitMatch?.name || "",
        price: l.unitPrice != null ? String(l.unitPrice) : "",
        purchaseReceiptItemId: l.purchaseReceiptItemId, sourceReceiptNo: l.sourceReceiptNo,
        colorCardId: l.colorCardId,
      });
    });
    setRows((prev) => [...prev.filter((r) => !isBlankLine(r)), ...newRows, emptyLine()]);
    if (inventoryReceiptId) {
      newRows.forEach((row) => persistRow(row.clientId, row));
    }
    // Same item-configured-Unit normalization importLines applies above.
    newRows.forEach((row) => {
      if (row.inventoryId == null) return;
      fetchItemUnits(row.inventoryId).then((list) => {
        if (!list.length) return;
        const stillValid = row.unitId != null && list.some((u) => Number(u.id) === Number(row.unitId));
        if (stillValid) return;
        const main = list[0];
        updateRow(row.clientId, { unitId: Number(main.id), unit: main.code || main.name || "" }, !!inventoryReceiptId);
      });
    });
  };

  const getImportedPurchaseReceiptItemIds = () => rows.filter((r) => r.purchaseReceiptItemId != null).map((r) => r.purchaseReceiptItemId as number);

  // Current Account change handling (spec: "Clear/invalidate previously selected related receipt
  // lines that belong to the old Current Account... Do not allow stale or cross-account source
  // selections to remain silently active"). Draft rows are simply dropped — nothing persisted to
  // lose. A persisted row keeps its item/quantity but has its stale source link cleared via
  // updateItem (ITEM_COLUMNS-filter convention: explicit null IS sent and written, unlike
  // undefined which omits the column — see inventory-receipt.service.ts's updateItem), which
  // also makes the invalidation visible (poReceiptNo/sourceReceiptNo columns go blank) rather
  // than silently leaving a now-irrelevant reference active.
  const clearRelatedImportedLines = async (): Promise<{ removedDrafts: number; detachedLines: number }> => {
    const toDrop = rows.filter((r) => r.purchaseReceiptItemId != null && r.__rowId == null);
    const toDetach = rows.filter((r) => r.purchaseReceiptItemId != null && r.__rowId != null);
    if (!toDrop.length && !toDetach.length) return { removedDrafts: 0, detachedLines: 0 };

    if (inventoryReceiptId) {
      for (const row of toDetach) {
        try {
          await api.updateItem(inventoryReceiptId, row.__rowId as number, { purchaseReceiptItemId: null });
        } catch (e: any) {
          toast.error(e.message || "Failed to clear a related-receipt line");
        }
      }
    }
    const dropIds = new Set(toDrop.map((r) => r.clientId));
    const detachIds = new Set(toDetach.map((r) => r.clientId));
    setRows((prev) => {
      const next = prev
        .filter((r) => !dropIds.has(r.clientId))
        .map((r) => (detachIds.has(r.clientId) ? { ...r, purchaseReceiptItemId: null, sourceReceiptNo: "" } : r));
      return next.length ? next : [emptyLine()];
    });
    return { removedDrafts: toDrop.length, detachedLines: toDetach.length };
  };

  useImperativeHandle(ref, () => ({
    commitDrafts, importLines, getImportedOrderReceiptItemIds,
    importRelatedLines, getImportedPurchaseReceiptItemIds, clearRelatedImportedLines,
  }), [rows, inventoryReceiptId, api]);

  const addRow = () => setRows((prev) => [...prev, emptyLine()]);

  const removeRow = async (clientId: string) => {
    const row = rows.find((r) => r.clientId === clientId);
    if (!row) return;
    if (row.__rowId != null && inventoryReceiptId) {
      try {
        await api.removeItem(inventoryReceiptId, row.__rowId);
      } catch (e: any) {
        toast.error(e.message);
        return;
      }
    }
    setRows((prev) => prev.filter((r) => r.clientId !== clientId));
  };

  const updateRow = useCallback((clientId: string, patch: Partial<LineRow>, commit = false) => {
    setRows((prev) => prev.map((r) => {
      if (r.clientId !== clientId) return r;
      const updated = recalc({ ...r, ...patch });
      if (commit) persistRow(clientId, updated);
      return updated;
    }));
  }, [persistRow]);

  // Single shared Item -> Unit resolver for every item-selection path on this grid (Name
  // autocomplete, the full Inventory lookup dialog) — mirrors purchase-order-line-grid.tsx's
  // own item-selection handlers, plus auto-population: the previous item's Unit is cleared
  // immediately (never left stale on the new item), then the newly selected item's own
  // configured units are fetched and its Main Unit (list[0] — legacyErpApi.lookupItemUnits
  // already orders Main Unit first) is applied as soon as it resolves. An item with no
  // configured units at all leaves Unit blank for manual selection, same as today.
  const selectItemOnRow = useCallback((clientId: string, itemPatch: Partial<LineRow> & { inventoryId: number }) => {
    updateRow(clientId, { ...itemPatch, unitId: null, unit: "" }, false);
    fetchItemUnits(itemPatch.inventoryId).then((list) => {
      const main = list[0];
      updateRow(clientId, {
        ...itemPatch,
        unitId: main ? Number(main.id) : null,
        unit: main ? (main.code || main.name || "") : "",
      }, true);
    });
  }, [updateRow, fetchItemUnits]);

  const { openFullScreen: openInventoryLookup } = useMasterLookupField(
    "inventory",
    (selection) => {
      if (!pendingClientIdRef.current) return;
      selectItemOnRow(pendingClientIdRef.current, {
        inventoryId: Number(selection.id),
        code: selection.code,
        name: selection.name,
      });
      pendingClientIdRef.current = null;
    },
    INVENTORY_CARDS_LIST_PATH,
  );
  const pendingClientIdRef = useMemo(() => ({ current: null as string | null }), []);
  const openLookupForRow = (clientId: string) => { pendingClientIdRef.current = clientId; openInventoryLookup(); };

  const visibleRows = useMemo(
    () => rows.filter((r) => isBlankLine(r) || !searchTerm.trim() ||
      [r.code, r.name, r.explanation, r.specialCode, r.unit].some((v) => (v || "").toLowerCase().includes(searchTerm.trim().toLowerCase()))),
    [rows, searchTerm],
  );

  // ---- Column visibility (Manage Columns) — direct port of purchase-order-line-grid.tsx's own
  // columnOrder/hiddenColumns state + modal, see that file's own comments for the full
  // rationale. Default state (nothing hidden, catalog declaration order) already satisfies
  // "all columns visible by default" with zero extra code — sanitizeHiddenColumns only ever
  // removes entries, it never hides anything on its own.
  const [columnOrder, setColumnOrder] = useState<ColKey[]>(REORDERABLE_DEFAULT);
  const [hiddenColumns, setHiddenColumns] = useState<Set<ColKey>>(new Set());
  const displayColumnDefs = useMemo(
    () => [...FIXED_COLS, ...columnOrder.filter((k) => !hiddenColumns.has(k))].map((k) => COLUMN_BY_KEY.get(k)!),
    [columnOrder, hiddenColumns],
  );

  // ---- Inline header drag-to-reorder — direct port of purchase-order-line-grid.tsx's own
  // handleDragStartCol/handleDragOverCol/handleDropCol/handleDragEndCol (see that file's own
  // comment on why the drop-target handlers live on the <th> while `draggable` lives on the
  // label span, not the whole header cell). Writes into the SAME columnOrder state the Manage
  // Columns modal reads/writes — a second, inline entry point onto that one source of truth,
  // not a parallel ordering mechanism.
  const dragColRef = useRef<ColKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColKey | null>(null);
  const handleDragStartCol = (key: ColKey) => (e: React.DragEvent) => {
    dragColRef.current = key;
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOverCol = (key: ColKey) => (e: React.DragEvent) => {
    if (!dragColRef.current || dragColRef.current === key || FIXED_COLS.includes(key)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCol !== key) setDragOverCol(key);
  };
  const handleDropCol = (key: ColKey) => (e: React.DragEvent) => {
    e.preventDefault();
    const dragged = dragColRef.current;
    dragColRef.current = null;
    setDragOverCol(null);
    if (!dragged || dragged === key || FIXED_COLS.includes(key)) return;
    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== dragged);
      next.splice(next.indexOf(key), 0, dragged);
      return next;
    });
  };
  const handleDragEndCol = () => { dragColRef.current = null; setDragOverCol(null); };

  // Restore persisted column order + visibility on mount — session override wins if present,
  // otherwise the permanently saved UserSettings.tablePreferences value, otherwise the built-in
  // default (nothing hidden, catalog order) — i.e. every column visible.
  useEffect(() => {
    let sessionOrderFound = false;
    try {
      const sessionRaw = sessionStorage.getItem(SESSION_COLUMN_ORDER_KEY);
      if (sessionRaw) { setColumnOrder(sanitizeColumnOrder(JSON.parse(sessionRaw))); sessionOrderFound = true; }
    } catch {}
    try {
      const sessionHiddenRaw = sessionStorage.getItem(SESSION_HIDDEN_COLUMNS_KEY);
      if (sessionHiddenRaw) setHiddenColumns(new Set(sanitizeHiddenColumns(JSON.parse(sessionHiddenRaw))));
    } catch {}
    if (sessionOrderFound) return;
    settingsApi.getCurrentSettings()
      .then((s: any) => {
        const savedOrder = s?.tablePreferences?.[PERMANENT_COLUMN_ORDER_SETTINGS_KEY];
        if (Array.isArray(savedOrder) && savedOrder.length) setColumnOrder(sanitizeColumnOrder(savedOrder));
        const savedHidden = s?.tablePreferences?.[PERMANENT_HIDDEN_COLUMNS_SETTINGS_KEY];
        if (Array.isArray(savedHidden)) setHiddenColumns(new Set(sanitizeHiddenColumns(savedHidden)));
      })
      .catch(() => {});
  }, []);

  // ---- Column Manager modal (order + visibility, session/permanent persistence) — same
  // draft-then-Save/Cancel/Reset model as Purchase Order's modal: edits its own modalOrder/
  // modalHidden state so Cancel discards cleanly, Reset Default only resets the draft.
  const [reorderOpen, setReorderOpen] = useState(false);
  const [modalOrder, setModalOrder] = useState<ColKey[]>(columnOrder);
  const [modalHidden, setModalHidden] = useState<Set<ColKey>>(hiddenColumns);
  const [columnSearch, setColumnSearch] = useState("");
  const [savingColumnPrefs, setSavingColumnPrefs] = useState(false);
  const modalDragRef = useRef<ColKey | null>(null);
  const [modalDragOver, setModalDragOver] = useState<ColKey | null>(null);

  const openReorderModal = () => {
    setModalOrder(columnOrder);
    setModalHidden(new Set(hiddenColumns));
    setColumnSearch("");
    setReorderOpen(true);
  };
  const handleModalDragStart = (key: ColKey) => (e: React.DragEvent) => {
    modalDragRef.current = key;
    e.dataTransfer.effectAllowed = "move";
  };
  const handleModalDragOver = (key: ColKey) => (e: React.DragEvent) => {
    if (!modalDragRef.current || modalDragRef.current === key) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (modalDragOver !== key) setModalDragOver(key);
  };
  const handleModalDrop = (key: ColKey) => (e: React.DragEvent) => {
    e.preventDefault();
    const dragged = modalDragRef.current;
    modalDragRef.current = null;
    setModalDragOver(null);
    if (!dragged || dragged === key) return;
    setModalOrder((prev) => {
      const next = prev.filter((k) => k !== dragged);
      next.splice(next.indexOf(key), 0, dragged);
      return next;
    });
  };
  const handleModalDragEnd = () => { modalDragRef.current = null; setModalDragOver(null); };
  const toggleModalHidden = (key: ColKey, visible: boolean) => {
    setModalHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(key); else next.add(key);
      return next;
    });
  };
  const resetModalToDefault = () => { setModalOrder(REORDERABLE_DEFAULT); setModalHidden(new Set()); };

  const applySessionColumnPrefs = (order: ColKey[], hidden: Set<ColKey>) => {
    setColumnOrder(order);
    setHiddenColumns(hidden);
    try {
      sessionStorage.setItem(SESSION_COLUMN_ORDER_KEY, JSON.stringify(order));
      sessionStorage.setItem(SESSION_HIDDEN_COLUMNS_KEY, JSON.stringify(Array.from(hidden)));
    } catch {}
  };
  const saveForSession = () => { applySessionColumnPrefs(modalOrder, modalHidden); setReorderOpen(false); };
  const savePermanently = async () => {
    setSavingColumnPrefs(true);
    try {
      applySessionColumnPrefs(modalOrder, modalHidden);
      await settingsApi.updateCurrentSettings({
        tablePreferences: {
          [PERMANENT_COLUMN_ORDER_SETTINGS_KEY]: modalOrder,
          [PERMANENT_HIDDEN_COLUMNS_SETTINGS_KEY]: Array.from(modalHidden),
        },
      });
      toast.success("Column preferences saved");
      setReorderOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save column preferences");
    } finally {
      setSavingColumnPrefs(false);
    }
  };
  const modalOrderFiltered = useMemo(() => {
    const q = columnSearch.trim().toLowerCase();
    if (!q) return modalOrder;
    return modalOrder.filter((k) => COLUMN_BY_KEY.get(k)!.label.toLowerCase().includes(q));
  }, [modalOrder, columnSearch]);

  const isActive = (clientId: string, col: ColKey) => cursor?.clientId === clientId && cursor.col === col;

  // ---- Arrow-key / Enter / F2 / Tab / Escape cell navigation — direct port of
  // purchase-order-line-grid.tsx's own moveCursor/handleStaticKeyDown/cancelEdit. Every
  // displayed column is navigable here (there's no PO-style `navigable` flag on this grid's
  // ColumnDef — every column, editable or read-only, is a stop, same as PO where every column
  // including its own computed Price/Item Amount cells is navigable too).
  const navOrder = useMemo(() => displayColumnDefs.map((c) => c.key), [displayColumnDefs]);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const cellKey = (clientId: string, col: ColKey) => `${clientId}:${col}`;
  const registerCell = (key: string) => (el: HTMLDivElement | null) => {
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  };

  const moveCursor = useCallback((rowDelta: number, colDelta: number) => {
    setCursor((current) => {
      if (!current) return current;
      const rowIdx = visibleRows.findIndex((r) => r.clientId === current.clientId);
      const colIdx = navOrder.indexOf(current.col);
      if (rowIdx === -1 || colIdx === -1) return current;
      const nextRow = visibleRows[Math.min(Math.max(rowIdx + rowDelta, 0), visibleRows.length - 1)];
      const nextCol = navOrder[Math.min(Math.max(colIdx + colDelta, 0), navOrder.length - 1)];
      return { clientId: nextRow.clientId, col: nextCol };
    });
    setEditing(false);
  }, [visibleRows, navOrder]);

  useEffect(() => {
    if (!cursor || editing) return;
    cellRefs.current.get(cellKey(cursor.clientId, cursor.col))?.focus();
  }, [cursor, editing]);

  // Snapshot of the row exactly as it was when editing began, so Escape restores it instead of
  // just closing the editor with whatever was already typed still sitting in row state — same
  // rationale as purchase-order-line-grid.tsx's own preEditSnapshotRef/cancelEdit.
  const preEditSnapshotRef = useRef<LineRow | null>(null);
  const cancelEdit = useCallback((clientId: string) => {
    const snap = preEditSnapshotRef.current;
    preEditSnapshotRef.current = null;
    if (snap && snap.clientId === clientId) {
      setRows((prev) => prev.map((r) => (r.clientId === clientId ? snap : r)));
    }
    setEditing(false);
  }, []);

  const activateCell = useCallback((row: LineRow, col: ColKey) => {
    if (readOnly) return;
    setCursor({ clientId: row.clientId, col });
    const def = COLUMN_BY_KEY.get(col);
    if (!def?.editable) return;
    preEditSnapshotRef.current = row;
    setEditing(true);
  }, [readOnly]);

  const handleStaticKeyDown = useCallback((e: React.KeyboardEvent, row: LineRow, col: ColKey) => {
    switch (e.key) {
      case "ArrowUp": e.preventDefault(); moveCursor(-1, 0); break;
      case "ArrowDown": e.preventDefault(); moveCursor(1, 0); break;
      case "ArrowLeft": e.preventDefault(); moveCursor(0, -1); break;
      case "ArrowRight": e.preventDefault(); moveCursor(0, 1); break;
      case "Enter": case "F2": e.preventDefault(); activateCell(row, col); break;
    }
  }, [moveCursor, activateCell]);

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent, row: LineRow) => {
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(row.clientId); return; }
    if (e.key === "Enter") { e.preventDefault(); persistRow(row.clientId, row); setEditing(false); moveCursor(1, 0); return; }
    if (e.key === "Tab") { e.preventDefault(); persistRow(row.clientId, row); setEditing(false); moveCursor(0, e.shiftKey ? -1 : 1); }
  }, [persistRow, moveCursor, cancelEdit]);

  const cellCls = (clientId: string, col: ColKey, extra?: string) =>
    cn(CELL_BORDER, isActive(clientId, col) && "ring-2 ring-inset ring-primary", extra);

  const staticCellProps = (row: LineRow, col: ColKey, value: React.ReactNode, align: "left" | "right" = "left", muted = false) => ({
    ref: registerCell(cellKey(row.clientId, col)),
    role: "gridcell", tabIndex: readOnly ? -1 : 0,
    title: typeof value === "string" ? value : undefined,
    onClick: () => activateCell(row, col),
    onKeyDown: (e: React.KeyboardEvent) => handleStaticKeyDown(e, row, col),
    className: cn(CELL_PAD, "flex h-full w-full items-center text-[13px] font-medium outline-none cursor-default select-none",
      align === "right" ? "justify-end tabular-nums" : "justify-start", muted && "font-normal text-muted-foreground"),
    children: <span data-col={col} className="min-w-0 truncate">{value}</span>,
  });

  // ---- Resizable columns — direct port of purchase-order-line-grid.tsx's own startResize/
  // autoFitColumn (component-state only, no backend persistence, same as PO). This was the
  // concrete resize gap versus PO: colWidths previously had no setter at all.
  const gridRootRef = useRef<HTMLDivElement>(null);
  const startResize = (key: ColKey) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[key];
    const onMove = (ev: MouseEvent) => {
      setColWidths((prev) => ({ ...prev, [key]: Math.max(MIN_WIDTHS[key], startWidth + (ev.clientX - startX)) }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const autoFitColumn = (key: ColKey) => {
    if (!gridRootRef.current) return;
    const els = gridRootRef.current.querySelectorAll<HTMLElement>(`[data-col="${key}"]`);
    let max = 0;
    els.forEach((el) => { max = Math.max(max, el.scrollWidth); });
    if (max === 0) return;
    const next = Math.min(480, Math.max(MIN_WIDTHS[key], max + 16));
    setColWidths((prev) => ({ ...prev, [key]: next }));
  };

  const totalTableWidth = displayColumnDefs.reduce((sum, c) => sum + colWidths[c.key], 0) + (!readOnly ? DEL_W : 0);

  // Item summary footer — same pattern as Purchase Order's own line grid
  // (purchase-order-line-grid.tsx): Total Records/Quantity/Amount from this grid's own rows,
  // plus Stock on Hand/Last Purchase Price for whichever row is currently the active cell.
  // stockOnHand/lastPurchasePrice are never fetched separately here either — they ride along
  // on the same inventoryCards.list() call hydrateCodesNames already makes to resolve Code/Name.
  const { totalRecords, totalQuantity, totalAmount } = useMemo(() => {
    const realRows = rows.filter((r) => !isBlankLine(r));
    return {
      totalRecords: realRows.length,
      totalQuantity: realRows.reduce((s, r) => s + num(r.quantity), 0),
      totalAmount: realRows.reduce((s, r) => s + num(r.netItemTotal ?? 0), 0),
    };
  }, [rows]);
  const stockRow = cursor ? rows.find((r) => r.clientId === cursor.clientId) : undefined;
  const showStock = !!stockRow && stockRow.inventoryId != null;

  if (loading) return <Skeleton className="h-48 w-full rounded-lg" />;

  return (
    <div ref={gridRootRef} className="ir-grid rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      {/* Single scrolling element for the whole grid (the shared Table component's own built-in
          wrapper) — same fix as purchase-order-line-grid.tsx's own .po-grid style block for the
          same reason: two nested overflow-auto containers desyncs a sticky header from the body
          it's scrolling with. */}
      <style>{`
        .ir-grid [data-slot="table-container"] {
          max-height: 520px;
          overflow: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .ir-grid [data-slot="table-container"]::-webkit-scrollbar { height: 8px; width: 8px; }
        .ir-grid [data-slot="table-container"]::-webkit-scrollbar-track { background: transparent; }
        .ir-grid [data-slot="table-container"]::-webkit-scrollbar-thumb { background-color: var(--border); border-radius: 9999px; }
        .ir-grid [data-slot="table-container"]::-webkit-scrollbar-thumb:hover { background-color: var(--muted-foreground); }
        .ir-resize-handle:hover, .ir-resize-handle.active { background-color: var(--primary); }
      `}</style>

      {/* Toolbar — Search left, Manage Columns + Add Row right, same row, same placement as
          Purchase Order's own grid toolbar (purchase-order-line-grid.tsx). */}
      <div className={cn(HEADER_H, "flex items-center justify-between gap-3 border-b border-border px-3")}>
        <div className="relative w-full max-w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search lines..."
            aria-label="Search detail lines"
            className="h-7 border-0 bg-muted/40 pl-8 text-[13px] shadow-none focus-visible:ring-1"
          />
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[13px]" onClick={openReorderModal}>
              <ListOrdered className="h-3.5 w-3.5 mr-1" />Manage Columns
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-[13px]" onClick={addRow}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add Row
            </Button>
          </div>
        )}
      </div>

      <Table role="grid" aria-label="Purchase receipt detail lines" className="table-fixed" style={{ width: totalTableWidth, minWidth: "100%" }}>
        <colgroup>
          {displayColumnDefs.map((col) => <col key={col.key} style={{ width: colWidths[col.key] }} />)}
          {!readOnly && <col style={{ width: DEL_W }} />}
        </colgroup>
        <TableHeader>
          <TableRow className={cn(HEADER_H, "bg-muted hover:bg-muted")}>
            {displayColumnDefs.map((col, i) => {
              const fixed = FIXED_COLS.includes(col.key);
              return (
                <TableHead
                  key={col.key}
                  role="columnheader"
                  scope="col"
                  onDragOver={!fixed ? handleDragOverCol(col.key) : undefined}
                  onDrop={!fixed ? handleDropCol(col.key) : undefined}
                  className={cn(
                    "relative p-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                    CELL_BORDER, i === 0 && FIRST_COL_BORDER,
                    dragOverCol === col.key && "bg-primary/15",
                  )}
                >
                  <span
                    title={col.label}
                    draggable={!fixed && !readOnly}
                    onDragStart={!fixed ? handleDragStartCol(col.key) : undefined}
                    onDragEnd={!fixed ? handleDragEndCol : undefined}
                    data-col={col.key}
                    className={cn(
                      HEADER_H, "flex w-full min-w-0 items-center justify-center truncate text-center", CELL_PAD,
                      !fixed && !readOnly && "cursor-grab active:cursor-grabbing",
                    )}
                  >
                    {col.label}
                  </span>
                  <div
                    className="ir-resize-handle absolute right-0 top-0 h-full w-1.5 cursor-col-resize"
                    onMouseDown={startResize(col.key)}
                    onDoubleClick={() => autoFitColumn(col.key)}
                    title="Drag to resize · double-click to auto-fit"
                    aria-hidden="true"
                  />
                </TableHead>
              );
            })}
            {!readOnly && <TableHead role="columnheader" aria-label="Delete line actions" className={cn("p-0", CELL_BORDER)} />}
          </TableRow>
        </TableHeader>
        <TableBody>
            {visibleRows.map((r, idx) => {
              const rowBg = idx % 2 === 1 ? "bg-muted/20" : "bg-card";

              return (
                <TableRow key={r.clientId} className={cn(ROW_H, "group transition-colors [&>td]:p-0", "hover:bg-muted/30", rowBg)}>
                  {displayColumnDefs.map((col, i) => {
                    const firstBorder = i === 0 ? FIRST_COL_BORDER : undefined;

                    if (col.key === "type") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "type", firstBorder)}>
                          {isActive(r.clientId, "type") && editing ? (
                            <div className={EDITOR_WRAP}>
                              <Select value="inventory" defaultOpen onOpenChange={(open) => !open && setEditing(false)}>
                                <SelectTrigger className={EDITOR_CONTROL}><SelectValue /></SelectTrigger>
                                <SelectContent>{TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          ) : <div {...staticCellProps(r, "type", "Inventory")} />}
                        </TableCell>
                      );
                    }

                    if (col.key === "itemId") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "itemId", firstBorder)}>
                          <div {...staticCellProps(r, "itemId", r.inventoryId != null ? String(r.inventoryId) : "—", "right", r.inventoryId == null)} />
                        </TableCell>
                      );
                    }

                    // PO NO — read-only, Pending Orders import reference (see LineRow.poReceiptNo
                    // comment above).
                    if (col.key === "poNo") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "poNo", firstBorder)}>
                          <div {...staticCellProps(r, "poNo", r.poReceiptNo || "—", "left", !r.poReceiptNo)} />
                        </TableCell>
                      );
                    }

                    // CODE — read-only, bound to whichever Inventory item Name's search/select
                    // resolved (see the Name cell below). Never typed directly, never
                    // regenerated. editable:false in COLUMNS already makes activateCell() a
                    // no-op beyond moving the cursor here, so this cell has no editing branch.
                    if (col.key === "code") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "code", firstBorder)}>
                          <div {...staticCellProps(r, "code", r.code || "—", "left", !r.code)} />
                        </TableCell>
                      );
                    }

                    // NAME — smart-search autocomplete relocated here from Code, per spec:
                    // search/select by Name, Code auto-fills read-only. Same shared
                    // AutocompleteTextCell + Inventory Card List datasource Code used to search
                    // (client-side CONTAINS match over inventoryCardsList(), now matching Name
                    // text too — see autocomplete-text-cell.tsx). Selecting a suggestion
                    // resolves inventoryId + code + name + stockOnHand + lastPurchasePrice
                    // together; free-typed text with nothing picked just saves the typed Name
                    // and leaves inventoryId/Code untouched.
                    if (col.key === "name") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "name", firstBorder)}>
                          {isActive(r.clientId, "name") && editing ? (
                            <div className={cn(EDITOR_WRAP, "gap-0")}>
                              <AutocompleteTextCell
                                autoFocus
                                value={r.name}
                                options={inventoryCodeOptions}
                                disabled={readOnly}
                                showDropdownIcon
                                onChange={(v) => updateRow(r.clientId, { name: v })}
                                onCancel={() => cancelEdit(r.clientId)}
                                onDoubleClick={() => !readOnly && openLookupForRow(r.clientId)}
                                onSelectOption={(o) => {
                                  const match = inventoryById.get(o.id);
                                  setEditing(false);
                                  selectItemOnRow(r.clientId, {
                                    inventoryId: Number(o.id), code: o.code ?? "", name: o.name ?? "",
                                    stockOnHand: typeof match?.stockOnHand === "number" ? match.stockOnHand : null,
                                    lastPurchasePrice: typeof match?.lastPurchasePrice === "number" ? match.lastPurchasePrice : null,
                                  });
                                }}
                                onCommit={(finalValue) => {
                                  setEditing(false);
                                  updateRow(r.clientId, { name: finalValue }, true);
                                }}
                              />
                              <Button variant="ghost" size="icon" className="h-full w-8 shrink-0 rounded-none border-l border-border"
                                title="Search Inventory" onMouseDown={(e) => e.preventDefault()} onClick={() => openLookupForRow(r.clientId)}>
                                <Search className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : <div {...staticCellProps(r, "name", r.name || "—", "left", !r.name)} />}
                        </TableCell>
                      );
                    }

                    // STOCK ON HAND / LAST PURCHASE PRICE — read-only, live values (see the
                    // ColumnDef/LineRow comments above), refreshed whenever Name's selection
                    // changes the row's inventoryId.
                    if (col.key === "stockOnHand") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "stockOnHand", firstBorder)}>
                          <div {...staticCellProps(r, "stockOnHand", r.stockOnHand != null ? r.stockOnHand.toLocaleString() : "—", "right", r.stockOnHand == null)} />
                        </TableCell>
                      );
                    }
                    if (col.key === "lastPurchasePrice") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "lastPurchasePrice", firstBorder)}>
                          <div {...staticCellProps(r, "lastPurchasePrice", r.lastPurchasePrice != null ? r.lastPurchasePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—", "right", r.lastPurchasePrice == null)} />
                        </TableCell>
                      );
                    }

                    if (col.key === "explanation") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "explanation", firstBorder)}>
                          {isActive(r.clientId, "explanation") && editing ? (
                            <div className={EDITOR_WRAP}>
                              <EditableGridInput autoFocus value={r.explanation} disabled={readOnly}
                                onChange={(v) => updateRow(r.clientId, { explanation: v })}
                                onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                                onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                            </div>
                          ) : <div {...staticCellProps(r, "explanation", r.explanation || "—", "left", !r.explanation)} />}
                        </TableCell>
                      );
                    }

                    if (col.key === "specialCode") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "specialCode", firstBorder)}>
                          {isActive(r.clientId, "specialCode") && editing ? (
                            <div className={EDITOR_WRAP}>
                              <EditableGridInput autoFocus value={r.specialCode} disabled={readOnly}
                                onChange={(v) => updateRow(r.clientId, { specialCode: v })}
                                onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                                onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                            </div>
                          ) : <div {...staticCellProps(r, "specialCode", r.specialCode || "—", "left", !r.specialCode)} />}
                        </TableCell>
                      );
                    }

                    if (col.key === "quantity") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "quantity", firstBorder)}>
                          {isActive(r.clientId, "quantity") && editing ? (
                            <div className={EDITOR_WRAP}>
                              <EditableGridInput autoFocus type="number" align="right" value={r.quantity} disabled={readOnly}
                                onChange={(v) => updateRow(r.clientId, { quantity: v })}
                                onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                                onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                            </div>
                          ) : <div {...staticCellProps(r, "quantity", fmtCell(r.quantity), "right", r.quantity === "")} />}
                        </TableCell>
                      );
                    }

                    if (col.key === "unit") {
                      // Scoped to the selected item's own configured units (IM_ItemUnitItemSize)
                      // — not every MD_UnitSetItem in the database. Empty until an item is
                      // picked, same restriction purchase-order-line-grid.tsx's own Unit cell
                      // already applies.
                      const rowUnitOptions = r.inventoryId != null ? (itemUnitsByInventoryId[String(r.inventoryId)] ?? []) : [];
                      // Base Unit + Unit Conversion display hint (spec Section 9) — same additive
                      // tooltip as purchase-order-line-grid.tsx's own Unit cell, reusing the same
                      // unitFactor/unitDivisor/isMainUnit fields listItemUnits now returns.
                      const selectedUnit = rowUnitOptions.find((u: any) => String(u.id) === String(r.unitId));
                      const baseUnit = rowUnitOptions.find((u: any) => u.isMainUnit);
                      const conversionHint = selectedUnit && !selectedUnit.isMainUnit && baseUnit && selectedUnit.unitFactor && selectedUnit.unitDivisor
                        ? `${selectedUnit.unitFactor} ${selectedUnit.code || selectedUnit.name} = ${selectedUnit.unitDivisor} ${baseUnit.code || baseUnit.name}`
                        : undefined;
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "unit", firstBorder)}>
                          {isActive(r.clientId, "unit") && editing ? (
                            <div className={EDITOR_WRAP}>
                              <Select value={r.unitId != null ? String(r.unitId) : ""} defaultOpen
                                onOpenChange={(open) => !open && setEditing(false)}
                                onValueChange={(v) => { const m = rowUnitOptions.find((u) => String(u.id) === v); updateRow(r.clientId, { unitId: Number(v), unit: m?.code || m?.name || "" }, true); setEditing(false); }}>
                                <SelectTrigger className={EDITOR_CONTROL}><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>{rowUnitOptions.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.code || u.name}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          ) : <div {...staticCellProps(r, "unit", r.unit || "—", "left", !r.unit)} title={conversionHint || (r.unit || "—")} />}
                        </TableCell>
                      );
                    }

                    if (col.key === "price") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "price", firstBorder)}>
                          {isActive(r.clientId, "price") && editing ? (
                            <div className={EDITOR_WRAP}>
                              <EditableGridInput autoFocus type="number" align="right" value={r.price} disabled={readOnly}
                                onChange={(v) => updateRow(r.clientId, { price: v })}
                                onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                                onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                            </div>
                          ) : <div {...staticCellProps(r, "price", fmtCell(r.price), "right", r.price === "")} />}
                        </TableCell>
                      );
                    }

                    if (col.key === "forex") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "forex", firstBorder)}>
                          {isActive(r.clientId, "forex") && editing ? (
                            <div className={EDITOR_WRAP}>
                              <Select value={r.forexId != null ? String(r.forexId) : ""} defaultOpen
                                onOpenChange={(open) => !open && setEditing(false)}
                                onValueChange={(v) => { const m = forexOptions.find((f) => String(f.id) === v); updateRow(r.clientId, { forexId: Number(v), forexCode: m?.code || m?.name || "" }, true); setEditing(false); }}>
                                <SelectTrigger className={EDITOR_CONTROL}><SelectValue placeholder="—" /></SelectTrigger>
                                <SelectContent>{forexOptions.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.code || f.name}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          ) : <div {...staticCellProps(r, "forex", r.forexCode || "—", "left", !r.forexCode)} />}
                        </TableCell>
                      );
                    }

                    // GROSS WEIGHT (Gross Quantity) — plain editable numeric, identical
                    // structure to Quantity/Price above (the fix for the reported bug: this used
                    // to fall through to the generic read-only branch below).
                    if (col.key === "grossQuantity") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "grossQuantity", firstBorder)}>
                          {isActive(r.clientId, "grossQuantity") && editing ? (
                            <div className={EDITOR_WRAP}>
                              <EditableGridInput autoFocus type="number" align="right" value={r.grossQuantity} disabled={readOnly}
                                onChange={(v) => updateRow(r.clientId, { grossQuantity: v })}
                                onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                                onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                            </div>
                          ) : <div {...staticCellProps(r, "grossQuantity", fmtCell(r.grossQuantity), "right", r.grossQuantity === "")} />}
                        </TableCell>
                      );
                    }

                    // VAT (I/E) — Select bound to vatIncluded, same Exclusive/Inclusive hardcoded
                    // two-value convention as purchase-order-line-grid.tsx's own vatType cell (no
                    // lookup table exists for this there either).
                    if (col.key === "vatIE") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "vatIE", firstBorder)}>
                          {isActive(r.clientId, "vatIE") && editing ? (
                            <div className={EDITOR_WRAP}>
                              <Select value={r.vatIncluded ? "Inclusive" : "Exclusive"} defaultOpen
                                onOpenChange={(open) => !open && setEditing(false)}
                                onValueChange={(v) => { updateRow(r.clientId, { vatIncluded: v === "Inclusive" ? 1 : 0 }, true); setEditing(false); }}>
                                <SelectTrigger className={EDITOR_CONTROL}><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="Exclusive">Exclusive</SelectItem><SelectItem value="Inclusive">Inclusive</SelectItem></SelectContent>
                              </Select>
                            </div>
                          ) : <div {...staticCellProps(r, "vatIE", r.vatIncluded ? "Inclusive" : "Exclusive", "left")} />}
                        </TableCell>
                      );
                    }

                    // VAT % — editable numeric, same pattern as Quantity/Price, feeds recalc().
                    if (col.key === "vatPct") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "vatPct", firstBorder)}>
                          {isActive(r.clientId, "vatPct") && editing ? (
                            <div className={EDITOR_WRAP}>
                              <EditableGridInput autoFocus type="number" align="right" value={r.vatRate} disabled={readOnly}
                                onChange={(v) => updateRow(r.clientId, { vatRate: v })}
                                onBlur={() => { persistRow(r.clientId, r); setEditing(false); }}
                                onKeyDown={(e) => handleEditorKeyDown(e, r)} className={EDITOR_CONTROL} />
                            </div>
                          ) : <div {...staticCellProps(r, "vatPct", fmtCell(r.vatRate), "right", r.vatRate === "")} />}
                        </TableCell>
                      );
                    }

                    // ITEM AMOUNT / ITEM NET TOTAL — computed (recalc()), read-only, same fmt2
                    // convention as PO's own Price/Item Amount cells. No editor branch: these
                    // are derived, never directly typed into, exactly like PO's price/itemAmount.
                    if (col.key === "itemAmount") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "itemAmount", firstBorder)}>
                          <div {...staticCellProps(r, "itemAmount", fmt2(r.itemTotal), "right")} />
                        </TableCell>
                      );
                    }
                    if (col.key === "itemNetTotal") {
                      return (
                        <TableCell key={col.key} className={cellCls(r.clientId, "itemNetTotal", firstBorder)}>
                          <div {...staticCellProps(r, "itemNetTotal", fmt2(r.netItemTotal), "right")} />
                        </TableCell>
                      );
                    }

                    // Every remaining catalog column: real-data-when-available, read-only cell.
                    const value = extraValue(col, r.extra);
                    return (
                      <TableCell key={col.key} className={cellCls(r.clientId, col.key, firstBorder)}>
                        <div {...staticCellProps(r, col.key, value, col.align, value === "—")} />
                      </TableCell>
                    );
                  })}

                  {!readOnly && (
                    <TableCell className={cn("text-center", CELL_BORDER)}>
                      <div className="flex h-full items-center justify-center">
                        {rows.length > 1 && (
                          <Trash2 role="button" tabIndex={0} aria-label="Delete line"
                            onClick={() => setPendingDeleteId(r.clientId)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPendingDeleteId(r.clientId); } }}
                            className="h-4 w-4 cursor-pointer text-muted-foreground outline-none hover:text-destructive focus-visible:text-destructive" />
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

      {/* Footer — Total Records / Total Quantity / Total Amount, plus the selected item's Stock
          on Hand / Last Purchase Price. Same markup/placement as Purchase Order's own grid
          footer (purchase-order-line-grid.tsx) so this reads as the same feature, not a
          lookalike rebuilt from scratch. */}
      <div className={cn(HEADER_H, "flex items-center justify-end gap-5 px-3 text-[13px]")}>
        <span className="text-muted-foreground">Total Records <span className="ml-1.5 font-semibold text-foreground tabular-nums">{totalRecords}</span></span>
        <span className="text-muted-foreground">Total Quantity <span className="ml-1.5 font-semibold text-foreground tabular-nums">{totalQuantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></span>
        <span className="text-muted-foreground">Total Amount <span className="ml-1.5 font-semibold text-foreground tabular-nums">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
        {showStock && (
          <span className="border-l border-border pl-5 text-muted-foreground">
            Stock on Hand
            <span className="ml-1.5 font-semibold text-foreground tabular-nums">
              {(stockRow!.stockOnHand ?? 0).toLocaleString()}{stockRow!.unit ? ` ${stockRow!.unit}` : ""}
            </span>
          </span>
        )}
        {showStock && stockRow!.lastPurchasePrice != null && (
          <span className="border-l border-border pl-5 text-muted-foreground">
            Last Purchase Price
            <span className="ml-1.5 font-semibold text-foreground tabular-nums">
              {stockRow!.lastPurchasePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </span>
        )}
      </div>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this line?</AlertDialogTitle>
            <AlertDialogDescription>This removes the line item. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (pendingDeleteId !== null) removeRow(pendingDeleteId); setPendingDeleteId(null); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Column Manager — identical structure/copy/footer actions to Purchase Order's own modal
          (purchase-order-line-grid.tsx), scoped to this grid's own COLUMN_BY_KEY/FIXED_COLS. */}
      <Dialog open={reorderOpen} onOpenChange={setReorderOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-md flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
            <DialogTitle>Column Manager</DialogTitle>
            <DialogDescription>Show, hide and reorder columns. Type, Code and Name are required and always stay first.</DialogDescription>
          </DialogHeader>

          <div className="shrink-0 border-b border-border px-5 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={columnSearch}
                onChange={(e) => setColumnSearch(e.target.value)}
                placeholder="Search columns..."
                aria-label="Search columns"
                className="h-8 pl-8 text-[13px]"
              />
            </div>
          </div>

          <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
            {FIXED_COLS.map((key) => {
              const col = COLUMN_BY_KEY.get(key)!;
              return (
                <div key={key} className="flex items-center gap-3 rounded-md border border-transparent bg-muted/40 px-3 py-2.5">
                  <Checkbox checked disabled aria-label={`${col.label} is a required column and cannot be hidden`} />
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 text-[13px] font-medium">{col.label}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Required
                  </span>
                </div>
              );
            })}

            {modalOrderFiltered.length === 0 && columnSearch.trim() !== "" && (
              <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">No columns match &ldquo;{columnSearch}&rdquo;</p>
            )}

            {modalOrderFiltered.map((key) => {
              const col = COLUMN_BY_KEY.get(key)!;
              const visible = !modalHidden.has(key);
              return (
                <div
                  key={key}
                  onDragOver={handleModalDragOver(key)}
                  onDrop={handleModalDrop(key)}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors",
                    modalDragOver === key ? "border-primary bg-primary/10" : "border-border bg-card",
                    !visible && "opacity-60",
                  )}
                >
                  <Checkbox
                    checked={visible}
                    onCheckedChange={(checked) => toggleModalHidden(key, checked === true)}
                    aria-label={`Show ${col.label} column`}
                  />
                  <span
                    draggable
                    onDragStart={handleModalDragStart(key)}
                    onDragEnd={handleModalDragEnd}
                    className="flex shrink-0 cursor-grab items-center active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-[13px] font-medium">{col.label}</span>
                </div>
              );
            })}
          </div>

          <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border px-5 py-3 sm:justify-between">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setReorderOpen(false)}>Cancel</Button>
              <Button variant="ghost" size="sm" onClick={resetModalToDefault}>Reset Default</Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={saveForSession}>Save for This Session</Button>
              <Button size="sm" onClick={savePermanently} disabled={savingColumnPrefs}>
                {savingColumnPrefs ? "Saving..." : "Save Permanently"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
