// Report Builder data sources for the Legacy ERP module.
//
// The Legacy ERP tables (IM_*, FI_*, MA_*, SM_*, MD_*) live outside the Prisma schema, so these
// are SQL sources (see SqlReportSource in report-sources.ts): each declares a fixed FROM clause
// (base table + lookup joins), a fixed row condition and every field as a fixed SQL expression.
// User input never becomes SQL text — report-sql.ts binds every filter value as a parameter.
//
// Scope matches the existing Legacy ERP screens: soft-deleted rows (and lines of soft-deleted
// headers) are excluded; like those screens there is no per-company filter on legacy data.
// Booleans are stored as smallint 0/1, so boolean fields are written as `(<col> = 1)`.
import { Prisma } from '@prisma/client';
import type { ReportField, ReportFieldType, SqlReportSource } from './report-sources';
import { RECEIPT_TYPES, DIRECTION_CLASS } from '../legacy-erp/receipt-types.config';
import { ORDER_TYPES } from '../legacy-erp/order-types.config';
import { CONTRACT_TYPES } from '../legacy-erp/contract-types.config';
import { stockOnHandSumSql } from '../legacy-erp/inventory-card.service';

type Spec = [key: string, label: string, type: ReportFieldType, sql: string | Prisma.Sql];

function fields(group: string, specs: Spec[]): ReportField[] {
  return specs.map(([key, label, type, sql]) => ({ key, label, group, type, sql }));
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** CASE expression turning a numeric code into its label (labels come from the app's own configs). */
const labelCase = (col: string, pairs: [number, string][]) =>
  `CASE ${col} ${pairs.map(([v, l]) => `WHEN ${v} THEN ${quote(l)}`).join(' ')} ELSE ${col}::text END`;
const bool = (col: string) => `(${col} = 1)`;

const RECEIPT_TYPE_LABEL = (col: string) => labelCase(col, RECEIPT_TYPES.map((t) => [t.receiptType, t.label]));
const ORDER_TYPE_LABEL = (col: string) => labelCase(col, ORDER_TYPES.map((t) => [t.receiptType, t.label]));
const CONTRACT_TYPE_LABEL = (col: string) => labelCase(col, CONTRACT_TYPES.map((t) => [t.receiptType, t.label]));
const DIRECTION_LABEL = (col: string) =>
  labelCase(col, Object.entries(DIRECTION_CLASS).map(([v, d]) => [Number(v), d === 'IN' ? 'Inflow' : d === 'OUT' ? 'Outflow' : d === 'TRANSFER' ? 'Transfer' : 'Other']));
const WORK_ORDER_STATUS = (col: string) => labelCase(col, [[0, 'Open'], [1, 'Planned'], [2, 'In Production'], [3, 'Completed'], [4, 'Cancelled']]);

const SECTION = {
  inventory: { title: 'Inventory Reports', icon: 'Boxes' },
  purchase: { title: 'Purchase Reports', icon: 'ShoppingCart' },
  production: { title: 'Production Reports', icon: 'Factory' },
  finance: { title: 'Finance Reports', icon: 'Landmark' },
  contracts: { title: 'Contract Reports', icon: 'FileSignature' },
};

/** Account (FI_Account) lookup fields: keys "<key>.code"/"<key>.name", read from SQL alias `alias`. */
const account = (key: string, alias: string, label: string): Spec[] => [
  [`${key}.code`, `${label} Code`, 'string', `${alias}."CurrentAccountCode"`],
  [`${key}.name`, label, 'string', `${alias}."CurrentAccountName"`],
];
const item = (alias: string): Spec[] => [
  ['item.code', 'Item Code', 'string', `${alias}."InventoryCode"`],
  ['item.name', 'Item', 'string', `${alias}."InventoryName"`],
  ['item.kind', 'Item Kind (Access Code)', 'string', `${alias}."AccessCode"`],
];

// ── Inventory ──────────────────────────────────────────────────────────────────

const INVENTORY_ITEMS: SqlReportSource = {
  kind: 'sql',
  key: 'inventory-items',
  module: 'legacy-erp',
  label: 'Inventory Cards',
  description: 'One row per inventory card (fabric, yarn, trim, ...) with group, unit, default warehouse, supplier and stock on hand.',
  from: `"IM_Item" i
    LEFT JOIN "IM_Group" g ON g."RecId" = i."GroupId"
    LEFT JOIN "IM_Category" c ON c."RecId" = i."CategoryId"
    LEFT JOIN "MD_UnitSetItem" u ON u."RecId" = i."UnitId"
    LEFT JOIN "IM_Warehouse" w ON w."RecId" = i."WarehouseId"
    LEFT JOIN "FI_Account" a ON a."RecId" = i."CurrentAccountId"`,
  where: `i."IsDeleted" = 0`,
  defaultSort: { field: 'code', direction: 'asc' },
  menuSection: SECTION.inventory,
  fields: [
    ...fields('Inventory Card', [
      ['code', 'Item Code', 'string', `i."InventoryCode"`],
      ['name', 'Item Name', 'string', `i."InventoryName"`],
      ['kind', 'Item Kind (Access Code)', 'string', `i."AccessCode"`],
      ['inventoryType', 'Inventory Type', 'number', `i."InventoryType"`],
      ['specialCode', 'Special Code', 'string', `i."SpecialCode"`],
      ['pluCode', 'PLU Code', 'string', `i."PluCode"`],
      ['producerCode', 'Producer Code', 'string', `i."ProducerInventoryCode"`],
      ['seasonCode', 'Season', 'string', `i."SeasonCode"`],
      ['genderCode', 'Gender', 'string', `i."GenderCode"`],
      ['priceGroup', 'Price Group', 'string', `i."PriceGroup"`],
      ['composition', 'Composition', 'string', `i."FComposition"`],
      ['width', 'Width', 'number', `i."FWidth"`],
      ['weight', 'Weight (GSM)', 'number', `i."FWeight"`],
      ['density', 'Density', 'number', `i."Density"`],
      ['cmtPrice', 'CMT Price', 'number', `i."CmtPrice"`],
      ['masterSize', 'Master Size', 'string', `i."MasterSize"`],
      ['inUse', 'In Use', 'boolean', bool('i."InUse"')],
      ['locked', 'Locked', 'boolean', bool('i."IsLocked"')],
      ['hasVariant', 'Has Variants', 'boolean', bool('i."HasVariant"')],
      ['forPurchase', 'Used for Purchase', 'boolean', bool('i."UseForPurchase"')],
      ['forSale', 'Used for Sale', 'boolean', bool('i."UseForSale"')],
      ['qcRequired', 'QC Required', 'boolean', bool('i."IsQCRequried"')],
      ['insertedAt', 'Created On', 'date', `i."InsertedAt"`],
      ['updatedAt', 'Updated On', 'date', `i."UpdatedAt"`],
    ]),
    ...fields('Stock', [
      ['stockOnHand', 'Stock on Hand (Base Unit)', 'number', Prisma.sql`(${stockOnHandSumSql(Prisma.sql`i."RecId"`)})`],
      ['receiptLines', 'Receipt Lines', 'number', `(SELECT count(*) FROM "IM_ReceiptItem" x JOIN "IM_Receipt" xr ON xr."RecId" = x."InventoryReceiptId" AND xr."IsDeleted" = 0 WHERE x."InventoryId" = i."RecId" AND x."IsDeleted" = 0)`],
      ['lastReceiptDate', 'Last Receipt Date', 'date', `(SELECT max(xr."ReceiptDate") FROM "IM_ReceiptItem" x JOIN "IM_Receipt" xr ON xr."RecId" = x."InventoryReceiptId" AND xr."IsDeleted" = 0 WHERE x."InventoryId" = i."RecId" AND x."IsDeleted" = 0)`],
    ]),
    ...fields('Group & Category', [
      ['group.code', 'Group Code', 'string', `g."GroupCode"`],
      ['group.name', 'Group', 'string', `g."GroupName"`],
      ['category.name', 'Category', 'string', `c."CategoryName"`],
    ]),
    ...fields('Unit', [['unit.code', 'Unit', 'string', `u."UnitCode"`], ['unit.name', 'Unit Name', 'string', `u."UnitName"`]]),
    ...fields('Default Warehouse', [['warehouse.code', 'Warehouse Code', 'string', `w."WarehouseCode"`], ['warehouse.name', 'Warehouse', 'string', `w."WarehouseName"`]]),
    ...fields('Supplier', account('supplier', 'a', 'Supplier')),
  ],
};

const RECEIPT_FROM = `"IM_Receipt" r
    LEFT JOIN "FI_Account" a ON a."RecId" = r."CurrentAccountId"
    LEFT JOIN "IM_Warehouse" wi ON wi."RecId" = r."InWarehouseId"
    LEFT JOIN "IM_Warehouse" wo ON wo."RecId" = r."OutWarehouseId"
    LEFT JOIN "MD_Forex" fx ON fx."RecId" = r."ForexId"
    LEFT JOIN "MD_SubcontractType" st ON st."RecId" = r."SubcontractTypeId"`;

const RECEIPT_HEADER: Spec[] = [
  ['receiptType', 'Receipt Type No', 'number', `r."ReceiptType"`],
  ['receiptTypeName', 'Receipt Type', 'string', RECEIPT_TYPE_LABEL('r."ReceiptType"')],
  ['direction', 'Direction', 'string', DIRECTION_LABEL('r."ReceiptType"')],
  ['receiptNo', 'Receipt No', 'string', `r."ReceiptNo"`],
  ['receiptDate', 'Receipt Date', 'date', `r."ReceiptDate"`],
  ['documentNo', 'Document No', 'string', `r."DocumentNo"`],
  ['customerOrderNo', 'Customer Order No', 'string', `r."CustomerOrderNo"`],
  ['explanation', 'Explanation', 'string', `r."Explanation"`],
  ['specialCode', 'Special Code', 'string', `r."SpecialCode"`],
];

const INVENTORY_RECEIPTS: SqlReportSource = {
  kind: 'sql',
  key: 'inventory-receipts',
  module: 'legacy-erp',
  label: 'Inventory Receipts',
  description: 'One row per inventory receipt (purchase, return, transfer, outside process, wholesale, ...) with account, warehouses and totals.',
  from: RECEIPT_FROM,
  where: `r."IsDeleted" = 0`,
  defaultSort: { field: 'receiptDate', direction: 'desc' },
  menuSection: SECTION.inventory,
  fields: [
    ...fields('Receipt', [
      ...RECEIPT_HEADER,
      ['shipmentDate', 'Shipment Date', 'date', `r."ShipmentDate"`],
      ['subTotal', 'Sub Total', 'number', `r."SubTotal"`],
      ['discounts', 'Discounts', 'number', `r."DiscountsTotal"`],
      ['expenses', 'Expenses', 'number', `r."ExpensesTotal"`],
      ['vat', 'VAT', 'number', `r."VatAmount"`],
      ['grandTotal', 'Grand Total', 'number', `r."GrandTotal"`],
      ['grandTotalForex', 'Grand Total (Forex)', 'number', `r."GrandTotalForex"`],
      ['forexRate', 'Forex Rate', 'number', `r."ForexRate"`],
      ['approved', 'Approved', 'boolean', bool('r."IsApproved"')],
      ['closed', 'Closed', 'boolean', bool('r."IsClosed"')],
      ['cancelled', 'Cancelled', 'boolean', bool('r."IsCancelled"')],
      ['insertedAt', 'Created On', 'date', `r."InsertedAt"`],
    ]),
    ...fields('Totals', [
      ['lineCount', 'Lines', 'number', `(SELECT count(*) FROM "IM_ReceiptItem" x WHERE x."InventoryReceiptId" = r."RecId" AND x."IsDeleted" = 0)`],
      ['totalQty', 'Total Quantity', 'number', `(SELECT COALESCE(sum(x."Quantity"), 0) FROM "IM_ReceiptItem" x WHERE x."InventoryReceiptId" = r."RecId" AND x."IsDeleted" = 0)`],
    ]),
    ...fields('Account', account('account', 'a', 'Account')),
    ...fields('Warehouses', [
      ['inWarehouse', 'In Warehouse', 'string', `wi."WarehouseName"`],
      ['outWarehouse', 'Out Warehouse', 'string', `wo."WarehouseName"`],
    ]),
    ...fields('Other', [
      ['forex', 'Currency', 'string', `fx."ForexCode"`],
      ['subcontractType', 'Subcontract Type', 'string', `st."SubcontractTypeName"`],
    ]),
  ],
};

const INVENTORY_RECEIPT_LINES: SqlReportSource = {
  kind: 'sql',
  key: 'inventory-receipt-lines',
  module: 'legacy-erp',
  label: 'Inventory Receipt Lines',
  description: 'One row per inventory receipt line: item, quantity, unit, price and amounts, with its receipt, account and warehouse.',
  from: `"IM_ReceiptItem" ri
    JOIN ${RECEIPT_FROM.replace('"IM_Receipt" r', '"IM_Receipt" r ON r."RecId" = ri."InventoryReceiptId"')}
    LEFT JOIN "IM_Item" i ON i."RecId" = ri."InventoryId"
    LEFT JOIN "MD_UnitSetItem" u ON u."RecId" = ri."UnitId"
    LEFT JOIN "MD_Forex" lfx ON lfx."RecId" = ri."ForexId"`,
  where: `ri."IsDeleted" = 0 AND r."IsDeleted" = 0`,
  defaultSort: { field: 'receiptDate', direction: 'desc' },
  menuSection: SECTION.inventory,
  fields: [
    ...fields('Receipt', RECEIPT_HEADER),
    ...fields('Item', item('i')),
    ...fields('Line', [
      ['lineNo', 'Line No', 'number', `ri."ItemOrderNo"`],
      ['unit', 'Unit', 'string', `u."UnitCode"`],
      ['quantity', 'Quantity', 'number', `ri."Quantity"`],
      ['signedQty', 'Signed Quantity (+in / −out)', 'number', `CASE WHEN r."ReceiptType" IN (${RECEIPT_TYPES.filter((t) => DIRECTION_CLASS[t.receiptType] === 'IN').map((t) => t.receiptType).join(',') || 'NULL'}) THEN ri."Quantity" WHEN r."ReceiptType" IN (${RECEIPT_TYPES.filter((t) => DIRECTION_CLASS[t.receiptType] === 'OUT').map((t) => t.receiptType).join(',') || 'NULL'}) THEN -ri."Quantity" ELSE 0 END`],
      ['unitPrice', 'Unit Price', 'number', `ri."UnitPrice"`],
      ['forexUnitPrice', 'Forex Unit Price', 'number', `ri."ForexUnitPrice"`],
      ['lineForex', 'Line Currency', 'string', `lfx."ForexCode"`],
      ['discount', 'Discount', 'number', `ri."DiscountAmount"`],
      ['vatRate', 'VAT %', 'number', `ri."VatRate"`],
      ['vatAmount', 'VAT', 'number', `ri."VatAmount"`],
      ['itemTotal', 'Line Total', 'number', `ri."ItemTotal"`],
      ['netItemTotal', 'Net Line Total', 'number', `ri."NetItemTotal"`],
      ['partyNo', 'Party / Lot No', 'string', `ri."PartyNo"`],
      ['lineExplanation', 'Line Explanation', 'string', `ri."Explanation"`],
      ['lineCustomerOrderNo', 'Line Customer Order No', 'string', `ri."CustomerOrderNo"`],
    ]),
    ...fields('Account', account('account', 'a', 'Account')),
    ...fields('Warehouses', [['inWarehouse', 'In Warehouse', 'string', `wi."WarehouseName"`], ['outWarehouse', 'Out Warehouse', 'string', `wo."WarehouseName"`]]),
  ],
};

const WAREHOUSES: SqlReportSource = {
  kind: 'sql',
  key: 'warehouses',
  module: 'legacy-erp',
  label: 'Warehouses',
  description: 'One row per warehouse with contact details and how much it is used.',
  from: `"IM_Warehouse" w`,
  where: `w."IsDeleted" = 0`,
  defaultSort: { field: 'code', direction: 'asc' },
  menuSection: SECTION.inventory,
  fields: fields('Warehouse', [
    ['code', 'Warehouse Code', 'string', `w."WarehouseCode"`],
    ['name', 'Warehouse', 'string', `w."WarehouseName"`],
    ['address', 'Address', 'string', `w."Address1"`],
    ['phone', 'Phone', 'string', `w."Phone"`],
    ['email', 'Email', 'string', `w."EMail"`],
    ['inUse', 'In Use', 'boolean', bool('w."InUse"')],
    ['virtual', 'Virtual', 'boolean', bool('w."IsVirtual"')],
    ['defaultMain', 'Default Main', 'boolean', bool('w."IsDefaultMain"')],
    ['startDate', 'Start Date', 'date', `w."StartDate"`],
    ['items', 'Items Defaulting Here', 'number', `(SELECT count(*) FROM "IM_Item" x WHERE x."WarehouseId" = w."RecId" AND x."IsDeleted" = 0)`],
    ['receiptsIn', 'Receipts In', 'number', `(SELECT count(*) FROM "IM_Receipt" x WHERE x."InWarehouseId" = w."RecId" AND x."IsDeleted" = 0)`],
    ['receiptsOut', 'Receipts Out', 'number', `(SELECT count(*) FROM "IM_Receipt" x WHERE x."OutWarehouseId" = w."RecId" AND x."IsDeleted" = 0)`],
  ]),
};

const SERIAL_CARDS: SqlReportSource = {
  kind: 'sql',
  key: 'serial-cards',
  module: 'legacy-erp',
  label: 'Serial Cards (Rolls / Lots)',
  description: 'One row per serial card (fabric roll, yarn lot, ...) with quantity used and remaining.',
  from: `"IM_SerialCard" sc
    LEFT JOIN "IM_Item" i ON i."RecId" = sc."InventoryId"
    LEFT JOIN "FI_Account" a ON a."RecId" = sc."CurrentAccountId"`,
  where: `sc."IsDeleted" = 0`,
  defaultSort: { field: 'serialCode', direction: 'asc' },
  menuSection: SECTION.inventory,
  fields: [
    ...fields('Serial Card', [
      ['serialCode', 'Serial Code', 'string', `sc."SerialCode"`],
      ['producerSerial', 'Producer Serial', 'string', `sc."ProducerSerialCode"`],
      ['partyNo', 'Party / Lot No', 'string', `sc."PartyNo"`],
      ['quantity', 'Quantity', 'number', `sc."Quantity"`],
      ['usedQuantity', 'Used Quantity', 'number', `sc."UsedQuantity"`],
      ['remaining', 'Remaining Quantity', 'number', `(COALESCE(sc."Quantity", 0) - COALESCE(sc."UsedQuantity", 0))`],
      ['width', 'Width', 'number', `sc."Width"`],
      ['weight', 'Weight', 'number', `sc."Weight"`],
      ['pieces', 'Pieces', 'number', `sc."PieceCount"`],
      ['manufacturingDate', 'Manufacturing Date', 'date', `sc."ManufacturingDate"`],
      ['expirationDate', 'Expiration Date', 'date', `sc."ExpirationDate"`],
      ['inUse', 'In Use', 'boolean', bool('sc."InUse"')],
      ['explanation', 'Explanation', 'string', `sc."Explanation"`],
    ]),
    ...fields('Item', item('i')),
    ...fields('Supplier', account('supplier', 'a', 'Supplier')),
  ],
};

// ── Purchase ───────────────────────────────────────────────────────────────────

const ORDER_FROM = `"IM_OrderReceipt" o
    LEFT JOIN "FI_Account" a ON a."RecId" = o."CurrentAccountId"
    LEFT JOIN "IM_Warehouse" w ON w."RecId" = o."WarehouseId"
    LEFT JOIN "MD_Forex" fx ON fx."RecId" = o."ForexId"`;
const ORDER_HEADER: Spec[] = [
  ['orderType', 'Order Type', 'string', ORDER_TYPE_LABEL('o."ReceiptType"')],
  ['orderNo', 'Order No', 'string', `o."ReceiptNo"`],
  ['orderDate', 'Order Date', 'date', `o."ReceiptDate"`],
  ['deliveryDate', 'Order Delivery Date', 'date', `o."OrderDeliveryDate"`],
  ['documentNo', 'Document No', 'string', `o."DocumentNo"`],
  ['customerOrderNo', 'Customer Order No', 'string', `o."CustomerOrderNo"`],
  ['seasonCode', 'Season', 'string', `o."SeasonCode"`],
];

const PURCHASE_ORDERS: SqlReportSource = {
  kind: 'sql',
  key: 'purchase-orders',
  module: 'legacy-erp',
  label: 'Purchase & Subcontract Orders',
  description: 'One row per purchase or subcontract order with supplier, warehouse, status flags and totals.',
  from: ORDER_FROM,
  where: `o."IsDeleted" = 0`,
  defaultSort: { field: 'orderDate', direction: 'desc' },
  menuSection: SECTION.purchase,
  fields: [
    ...fields('Order', [
      ...ORDER_HEADER,
      ['explanation', 'Explanation', 'string', `o."Explanation"`],
      ['subTotal', 'Sub Total', 'number', `o."SubTotal"`],
      ['discounts', 'Discounts', 'number', `o."DiscountsTotal"`],
      ['vat', 'VAT', 'number', `o."VatAmount"`],
      ['grandTotal', 'Grand Total', 'number', `o."GrandTotal"`],
      ['grandTotalForex', 'Grand Total (Forex)', 'number', `o."GrandTotalForex"`],
      ['forexRate', 'Forex Rate', 'number', `o."ForexRate"`],
      ['approved', 'Approved', 'boolean', bool('o."IsApproved"')],
      ['rejected', 'Rejected', 'boolean', bool('o."IsRejected"')],
      ['draft', 'Draft', 'boolean', bool('o."IsDraft"')],
      ['closed', 'Closed', 'boolean', bool('o."IsClosed"')],
      ['cancelled', 'Cancelled', 'boolean', bool('o."IsCancelled"')],
      ['insertedAt', 'Created On', 'date', `o."InsertedAt"`],
    ]),
    ...fields('Totals', [
      ['lineCount', 'Lines', 'number', `(SELECT count(*) FROM "IM_OrderReceiptItem" x WHERE x."OrderReceiptId" = o."RecId" AND x."IsDeleted" = 0)`],
      ['totalQty', 'Total Ordered Quantity', 'number', `(SELECT COALESCE(sum(x."Quantity"), 0) FROM "IM_OrderReceiptItem" x WHERE x."OrderReceiptId" = o."RecId" AND x."IsDeleted" = 0)`],
    ]),
    ...fields('Supplier', account('supplier', 'a', 'Supplier')),
    ...fields('Other', [['warehouse', 'Warehouse', 'string', `w."WarehouseName"`], ['forex', 'Currency', 'string', `fx."ForexCode"`]]),
  ],
};

const PURCHASE_ORDER_LINES: SqlReportSource = {
  kind: 'sql',
  key: 'purchase-order-lines',
  module: 'legacy-erp',
  label: 'Purchase & Subcontract Order Lines',
  description: 'One row per order line: item, quantity, unit, price, delivery date, with its order and supplier.',
  from: `"IM_OrderReceiptItem" oi
    JOIN ${ORDER_FROM.replace('"IM_OrderReceipt" o', '"IM_OrderReceipt" o ON o."RecId" = oi."OrderReceiptId"')}
    LEFT JOIN "IM_Item" i ON i."RecId" = oi."InventoryId"
    LEFT JOIN "MD_UnitSetItem" u ON u."RecId" = oi."UnitId"`,
  where: `oi."IsDeleted" = 0 AND o."IsDeleted" = 0`,
  defaultSort: { field: 'orderDate', direction: 'desc' },
  menuSection: SECTION.purchase,
  fields: [
    ...fields('Order', ORDER_HEADER),
    ...fields('Item', item('i')),
    ...fields('Line', [
      ['lineNo', 'Line No', 'number', `oi."ItemOrderNo"`],
      ['unit', 'Unit', 'string', `u."UnitCode"`],
      ['quantity', 'Quantity', 'number', `oi."Quantity"`],
      ['wastage', 'Wastage %', 'number', `oi."Wastage"`],
      ['unitPrice', 'Unit Price', 'number', `oi."UnitPrice"`],
      ['forexUnitPrice', 'Forex Unit Price', 'number', `oi."ForexUnitPrice"`],
      ['itemTotal', 'Line Total', 'number', `oi."ItemTotal"`],
      ['netItemTotal', 'Net Line Total', 'number', `oi."NetItemTotal"`],
      ['lineDeliveryDate', 'Line Delivery Date', 'date', `oi."DeliveryDate"`],
      ['partyNo', 'Party / Lot No', 'string', `oi."PartyNo"`],
      ['lineExplanation', 'Line Explanation', 'string', `oi."Explanation"`],
      ['lineClosed', 'Line Closed', 'boolean', bool('oi."IsClosed"')],
      ['lineCancelled', 'Line Cancelled', 'boolean', bool('oi."IsCancelled"')],
    ]),
    ...fields('Supplier', account('supplier', 'a', 'Supplier')),
    ...fields('Other', [['warehouse', 'Warehouse', 'string', `w."WarehouseName"`], ['forex', 'Currency', 'string', `fx."ForexCode"`]]),
  ],
};

// ── Production ─────────────────────────────────────────────────────────────────

const WORK_ORDER_FROM = `"MA_WorkOrder" wo
    LEFT JOIN "FI_Account" a ON a."RecId" = wo."CurrentAccountId"
    LEFT JOIN "FI_Account" fa ON fa."RecId" = wo."FactoryId"
    LEFT JOIN "IM_Warehouse" w ON w."RecId" = wo."WarehouseId"
    LEFT JOIN "StyleCard" sc ON sc."id" = wo."StyleCardId"`;
const WORK_ORDER_HEADER: Spec[] = [
  ['workOrderNo', 'Work Order No', 'string', `wo."WorkOrderNo"`],
  ['workOrderDate', 'Work Order Date', 'date', `wo."WorkOrderDate"`],
  ['status', 'Status', 'string', WORK_ORDER_STATUS('wo."Status"')],
  ['customerOrderNo', 'Customer Order No', 'string', `wo."CustomerOrderNo"`],
  ['deliveryDate', 'Delivery Date', 'date', `wo."DeliveryDate"`],
  ['seasonCode', 'Season', 'string', `wo."SeasonCode"`],
];

const WORK_ORDERS: SqlReportSource = {
  kind: 'sql',
  key: 'work-orders',
  module: 'legacy-erp',
  label: 'Work Orders',
  description: 'One row per production work order with customer, factory, linked PLM style, key dates and quantities.',
  from: WORK_ORDER_FROM,
  where: `wo."IsDeleted" = 0`,
  defaultSort: { field: 'workOrderDate', direction: 'desc' },
  menuSection: SECTION.production,
  fields: [
    ...fields('Work Order', [
      ...WORK_ORDER_HEADER,
      ['workOrderType', 'Work Order Type', 'number', `wo."WorkOrderType"`],
      ['planDate', 'Plan Date', 'date', `wo."PlanDate"`],
      ['agreedDeliveryDate', 'Agreed Delivery Date', 'date', `wo."AgreedDeliveryDate"`],
      ['shipmentDate', 'Shipment Date', 'date', `wo."ShipmentDate"`],
      ['handoverDate', 'Handover Date', 'date', `wo."HandoverDate"`],
      ['cuttingApprovedDate', 'Cutting Approved Date', 'date', `wo."CuttingApprovedDate"`],
      ['documentNo', 'Document No', 'string', `wo."DocumentNo"`],
      ['quantity', 'Quantity', 'number', `wo."Quantity"`],
      ['unitPrice', 'Unit Price', 'number', `wo."UnitPrice"`],
      ['cmtPrice', 'CMT Price', 'number', `wo."CmtPrice"`],
      ['orderValue', 'Order Value (Qty × Price)', 'number', `(COALESCE(wo."Quantity", 0) * COALESCE(wo."UnitPrice", 0))`],
      ['brands', 'Brands', 'string', `wo."UD_Brands"`],
      ['explanation', 'Explanation', 'string', `wo."Explanation"`],
      ['sample', 'Sample', 'boolean', bool('wo."IsSample"')],
      ['cuttingCompleted', 'Cutting Completed', 'boolean', bool('wo."IsCuttingCompleted"')],
      ['approved', 'Approved', 'boolean', bool('wo."IsApproved"')],
      ['closed', 'Closed', 'boolean', bool('wo."IsClosed"')],
      ['cancelled', 'Cancelled', 'boolean', bool('wo."IsCancelled"')],
      ['insertedAt', 'Created On', 'date', `wo."InsertedAt"`],
    ]),
    ...fields('Totals', [
      ['lineCount', 'Lines', 'number', `(SELECT count(*) FROM "MA_WorkOrderItem" x WHERE x."WorkOrderId" = wo."RecId" AND x."IsDeleted" = 0)`],
      ['linesQty', 'Total Line Quantity', 'number', `(SELECT COALESCE(sum(x."Quantity"), 0) FROM "MA_WorkOrderItem" x WHERE x."WorkOrderId" = wo."RecId" AND x."IsDeleted" = 0)`],
      ['shippedQty', 'Shipped Net Quantity', 'number', `(SELECT COALESCE(sum(x."ShippedNetQty"), 0) FROM "MA_WorkOrderItem" x WHERE x."WorkOrderId" = wo."RecId" AND x."IsDeleted" = 0)`],
    ]),
    ...fields('Customer', account('customer', 'a', 'Customer')),
    ...fields('Factory', account('factory', 'fa', 'Factory')),
    ...fields('PLM Style', [['style.number', 'Style No', 'string', `sc."styleNumber"`], ['style.name', 'Style Name', 'string', `sc."title"`]]),
    ...fields('Other', [['warehouse', 'Warehouse', 'string', `w."WarehouseName"`]]),
  ],
};

const WORK_ORDER_LINES: SqlReportSource = {
  kind: 'sql',
  key: 'work-order-lines',
  module: 'legacy-erp',
  label: 'Work Order Lines',
  description: 'One row per work order line: item, quantity, shipped quantity, dates and manufacturing factory.',
  from: `"MA_WorkOrderItem" woi
    JOIN ${WORK_ORDER_FROM.replace('"MA_WorkOrder" wo', '"MA_WorkOrder" wo ON wo."RecId" = woi."WorkOrderId"')}
    LEFT JOIN "IM_Item" i ON i."RecId" = woi."InventoryId"
    LEFT JOIN "MD_UnitSetItem" u ON u."RecId" = woi."InventoryUnitId"
    LEFT JOIN "FI_Account" mf ON mf."RecId" = woi."ManufacturingFactoryId"`,
  where: `woi."IsDeleted" = 0 AND wo."IsDeleted" = 0`,
  defaultSort: { field: 'workOrderDate', direction: 'desc' },
  menuSection: SECTION.production,
  fields: [
    ...fields('Work Order', WORK_ORDER_HEADER),
    ...fields('Item', item('i')),
    ...fields('Line', [
      ['lineNo', 'Line No', 'number', `woi."ItemOrderNo"`],
      ['unit', 'Unit', 'string', `u."UnitCode"`],
      ['quantity', 'Quantity', 'number', `woi."Quantity"`],
      ['shippedNet', 'Shipped Net Qty', 'number', `woi."ShippedNetQty"`],
      ['remainingToShip', 'Remaining to Ship', 'number', `(COALESCE(woi."Quantity", 0) - COALESCE(woi."ShippedNetQty", 0))`],
      ['unitPrice', 'Unit Price', 'number', `woi."UnitPrice"`],
      ['lineShipmentDate', 'Line Shipment Date', 'date', `woi."ShipmentDate"`],
      ['lineHandoverDate', 'Line Handover Date', 'date', `woi."HandoverDate"`],
      ['lineCustomerOrderNo', 'Line Customer Order No', 'string', `woi."CustomerOrderNo"`],
      ['lineExplanation', 'Line Explanation', 'string', `woi."Explanation"`],
      ['lineClosed', 'Line Closed', 'boolean', bool('woi."IsClosed"')],
      ['lineCancelled', 'Line Cancelled', 'boolean', bool('woi."IsCancelled"')],
    ]),
    ...fields('Customer', account('customer', 'a', 'Customer')),
    ...fields('Manufacturing Factory', account('manufacturingFactory', 'mf', 'Manufacturing Factory')),
    ...fields('PLM Style', [['style.number', 'Style No', 'string', `sc."styleNumber"`]]),
  ],
};

// ── Finance ────────────────────────────────────────────────────────────────────

const CURRENT_ACCOUNTS: SqlReportSource = {
  kind: 'sql',
  key: 'current-accounts',
  module: 'legacy-erp',
  label: 'Current Accounts',
  description: 'One row per customer / supplier account with terms, limits, flags, activity and balance.',
  from: `"FI_Account" a LEFT JOIN "MD_Forex" fx ON fx."RecId" = a."ForexId"`,
  where: `a."IsDeleted" = 0`,
  defaultSort: { field: 'code', direction: 'asc' },
  menuSection: SECTION.finance,
  fields: [
    ...fields('Account', [
      ['code', 'Account Code', 'string', `a."CurrentAccountCode"`],
      ['name', 'Account Name', 'string', `a."CurrentAccountName"`],
      ['tradeName', 'Trade Name', 'string', `a."TradeName"`],
      ['type', 'Account Type', 'number', `a."CurrentAccountType"`],
      ['kind', 'Account Kind', 'number', `a."CurrentAccountKind"`],
      ['email', 'Email', 'string', `a."EMail"`],
      ['phone', 'Mobile', 'string', `a."GsmPhone"`],
      ['taxNo', 'Tax No', 'string', `a."TaxNo"`],
      ['termDays', 'Payment Term (Days)', 'number', `a."TermDay"`],
      ['riskLimit', 'Risk Limit', 'number', `a."RiskLimit"`],
      ['interestRate', 'Interest %', 'number', `a."InterestRate"`],
      ['forex', 'Currency', 'string', `fx."ForexCode"`],
      ['specialCode', 'Special Code', 'string', `a."SpecialCode"`],
      ['blacklisted', 'Blacklisted', 'boolean', bool('a."IsBlackList"')],
      ['vip', 'VIP', 'boolean', bool('a."IsVip"')],
      ['dealer', 'Dealer', 'boolean', bool('a."IsDealer"')],
      ['subSupplier', 'Sub-Supplier', 'boolean', bool('a."IsSubSupplier"')],
      ['inUse', 'In Use', 'boolean', bool('a."InUse"')],
      ['insertedAt', 'Created On', 'date', `a."InsertedAt"`],
    ]),
    ...fields('Activity', [
      ['debit', 'Total Debit', 'number', `(SELECT COALESCE(sum(x."Debit"), 0) FROM "FI_ReceiptItem" x WHERE x."CurrentAccountId" = a."RecId" AND x."IsDeleted" = 0)`],
      ['credit', 'Total Credit', 'number', `(SELECT COALESCE(sum(x."Credit"), 0) FROM "FI_ReceiptItem" x WHERE x."CurrentAccountId" = a."RecId" AND x."IsDeleted" = 0)`],
      ['balance', 'Balance (Debit − Credit)', 'number', `(SELECT COALESCE(sum(x."Debit"), 0) - COALESCE(sum(x."Credit"), 0) FROM "FI_ReceiptItem" x WHERE x."CurrentAccountId" = a."RecId" AND x."IsDeleted" = 0)`],
      ['inventoryReceipts', 'Inventory Receipts', 'number', `(SELECT count(*) FROM "IM_Receipt" x WHERE x."CurrentAccountId" = a."RecId" AND x."IsDeleted" = 0)`],
      ['orders', 'Orders', 'number', `(SELECT count(*) FROM "IM_OrderReceipt" x WHERE x."CurrentAccountId" = a."RecId" AND x."IsDeleted" = 0)`],
      ['workOrders', 'Work Orders', 'number', `(SELECT count(*) FROM "MA_WorkOrder" x WHERE x."CurrentAccountId" = a."RecId" AND x."IsDeleted" = 0)`],
      ['lastReceiptDate', 'Last Inventory Receipt', 'date', `(SELECT max(x."ReceiptDate") FROM "IM_Receipt" x WHERE x."CurrentAccountId" = a."RecId" AND x."IsDeleted" = 0)`],
    ]),
  ],
};

const ACCOUNT_TRANSACTIONS: SqlReportSource = {
  kind: 'sql',
  key: 'account-transactions',
  module: 'legacy-erp',
  label: 'Current Account Transactions',
  description: 'One row per financial receipt line (debit / credit to a current account) with its receipt and currency.',
  from: `"FI_ReceiptItem" fi
    JOIN "FI_Receipt" f ON f."RecId" = fi."CurrentAccountReceiptId"
    LEFT JOIN "FI_Account" a ON a."RecId" = fi."CurrentAccountId"
    LEFT JOIN "MD_Forex" fx ON fx."RecId" = fi."ForexId"`,
  where: `fi."IsDeleted" = 0 AND f."IsDeleted" = 0`,
  defaultSort: { field: 'receiptDate', direction: 'desc' },
  menuSection: SECTION.finance,
  fields: [
    ...fields('Receipt', [
      ['receiptNo', 'Receipt No', 'string', `f."ReceiptNo"`],
      ['receiptDate', 'Receipt Date', 'date', `f."ReceiptDate"`],
      ['receiptType', 'Receipt Type', 'number', `f."ReceiptType"`],
      ['receiptExplanation', 'Receipt Explanation', 'string', `f."Explanation"`],
    ]),
    ...fields('Transaction', [
      ['documentNo', 'Document No', 'string', `fi."DocumentNo"`],
      ['explanation', 'Explanation', 'string', `fi."Explanation"`],
      ['termDate', 'Term (Due) Date', 'date', `fi."TermDate"`],
      ['debit', 'Debit', 'number', `fi."Debit"`],
      ['credit', 'Credit', 'number', `fi."Credit"`],
      ['net', 'Net (Debit − Credit)', 'number', `(COALESCE(fi."Debit", 0) - COALESCE(fi."Credit", 0))`],
      ['forex', 'Currency', 'string', `fx."ForexCode"`],
      ['forexRate', 'Forex Rate', 'number', `fi."ForexRate"`],
      ['forexDebit', 'Forex Debit', 'number', `fi."ForexDebit"`],
      ['forexCredit', 'Forex Credit', 'number', `fi."ForexCredit"`],
      ['paid', 'Paid', 'boolean', bool('fi."IsPaid"')],
    ]),
    ...fields('Account', account('account', 'a', 'Account')),
  ],
};

// ── Contracts ──────────────────────────────────────────────────────────────────

const CONTRACT_FROM = `"SM_Contract" c
    LEFT JOIN "FI_Account" a ON a."RecId" = c."CurrentAccountId"
    LEFT JOIN "MD_Forex" fx ON fx."RecId" = c."ForexId"`;
const CONTRACT_HEADER: Spec[] = [
  ['contractType', 'Contract Type', 'string', CONTRACT_TYPE_LABEL('c."ReceiptType"')],
  ['contractNo', 'Contract No', 'string', `c."ReceiptNo"`],
  ['contractDate', 'Contract Date', 'date', `c."ReceiptDate"`],
  ['startDate', 'Start Date', 'date', `c."StartDate"`],
  ['endDate', 'End Date', 'date', `c."EndDate"`],
];

const CONTRACTS: SqlReportSource = {
  kind: 'sql',
  key: 'contracts',
  module: 'legacy-erp',
  label: 'Contracts',
  description: 'One row per purchase / sale contract with account, validity period, amounts and status.',
  from: CONTRACT_FROM,
  where: `c."IsDeleted" = 0`,
  defaultSort: { field: 'contractDate', direction: 'desc' },
  menuSection: SECTION.contracts,
  fields: [
    ...fields('Contract', [
      ...CONTRACT_HEADER,
      ['documentNo', 'Document No', 'string', `c."DocumentNo"`],
      ['explanation', 'Explanation', 'string', `c."Explanation"`],
      ['contractAmount', 'Contract Amount', 'number', `c."ContractAmount"`],
      ['grandTotal', 'Grand Total', 'number', `c."GrandTotal"`],
      ['grandTotalForex', 'Grand Total (Forex)', 'number', `c."GrandTotalForex"`],
      ['installments', 'Installments', 'number', `c."InstallmentCount"`],
      ['interestRate', 'Interest %', 'number', `c."InterestRate"`],
      ['forex', 'Currency', 'string', `fx."ForexCode"`],
      ['approved', 'Approved', 'boolean', bool('c."IsApproved"')],
      ['closed', 'Closed', 'boolean', bool('c."IsClosed"')],
      ['cancelled', 'Cancelled', 'boolean', bool('c."IsCancelled"')],
      ['lineCount', 'Lines', 'number', `(SELECT count(*) FROM "SM_ContractItem" x WHERE x."ReceiptId" = c."RecId" AND x."IsDeleted" = 0)`],
    ]),
    ...fields('Account', account('account', 'a', 'Account')),
  ],
};

const CONTRACT_LINES: SqlReportSource = {
  kind: 'sql',
  key: 'contract-lines',
  module: 'legacy-erp',
  label: 'Contract Lines',
  description: 'One row per contract line: item, quantity, received quantity, price and delivery date.',
  from: `"SM_ContractItem" ci
    JOIN ${CONTRACT_FROM.replace('"SM_Contract" c', '"SM_Contract" c ON c."RecId" = ci."ReceiptId"')}
    LEFT JOIN "IM_Item" i ON i."RecId" = ci."InventoryId"
    LEFT JOIN "MD_UnitSetItem" u ON u."RecId" = ci."UnitId"`,
  where: `ci."IsDeleted" = 0 AND c."IsDeleted" = 0`,
  defaultSort: { field: 'contractDate', direction: 'desc' },
  menuSection: SECTION.contracts,
  fields: [
    ...fields('Contract', CONTRACT_HEADER),
    ...fields('Item', item('i')),
    ...fields('Line', [
      ['unit', 'Unit', 'string', `u."UnitCode"`],
      ['quantity', 'Quantity', 'number', `ci."Quantity"`],
      ['receivedQuantity', 'Received Quantity', 'number', `ci."ReceivedQuantity"`],
      ['openQuantity', 'Open Quantity', 'number', `(COALESCE(ci."Quantity", 0) - COALESCE(ci."ReceivedQuantity", 0))`],
      ['unitPrice', 'Unit Price', 'number', `ci."UnitPrice"`],
      ['itemTotal', 'Line Total', 'number', `ci."ItemTotal"`],
      ['lineDeliveryDate', 'Delivery Date', 'date', `ci."DeliveryDate"`],
      ['lineExplanation', 'Line Explanation', 'string', `ci."Explanation"`],
    ]),
    ...fields('Account', account('account', 'a', 'Account')),
  ],
};

export const LEGACY_REPORT_SOURCES: SqlReportSource[] = [
  INVENTORY_ITEMS, INVENTORY_RECEIPTS, INVENTORY_RECEIPT_LINES, WAREHOUSES, SERIAL_CARDS,
  PURCHASE_ORDERS, PURCHASE_ORDER_LINES,
  WORK_ORDERS, WORK_ORDER_LINES,
  CURRENT_ACCOUNTS, ACCOUNT_TRANSACTIONS,
  CONTRACTS, CONTRACT_LINES,
];
