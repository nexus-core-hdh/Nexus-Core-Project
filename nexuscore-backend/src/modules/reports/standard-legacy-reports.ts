// Standard Legacy ERP reports — seeded for every company (scripts/seed-legacy-standard-reports.ts)
// as ordinary, user-editable report definitions over the SQL sources in legacy-report-sources.ts.
// Same conventions as standard-reports.ts: only declared fields, validated like a designer save;
// `ask(...)` filters take their value when the report is opened (blank = no restriction).
import type { ReportDefinitionInput, ReportFilter } from './report-builder.service';
import { ORDER_FORM_SECTIONS, ORDER_FORM_SOURCE_KEY, ORDER_FORM_WORK_ORDER_FIELD } from './work-order-order-form.report';
import { GATE_PASS_RECEIPT_FIELD, GATE_PASS_SECTIONS, GATE_PASS_SOURCE_KEY } from './inward-gate-pass.report';
import { DYEING_FIELDS, DYEING_REPORT_NAME, DYEING_SECTIONS, DYEING_SOURCE_KEY } from './dyeing-follow-up.report';
import {
  PROCESS_FOLLOW_UP_EMPTY_FIELD, PROCESS_FOLLOW_UP_FIELDS, PROCESS_FOLLOW_UP_REPORT_NAME, PROCESS_FOLLOW_UP_SECTIONS, PROCESS_FOLLOW_UP_SOURCE_KEY,
} from './process-follow-up.report';
import { BOM_FALLBACK_FIELD, MATERIAL_REPORT_NAMES, MATERIAL_REPORT_SECTIONS, MATERIAL_REPORT_SOURCE_KEYS, YARN_REPORT_ORDER_NO_FIELD, YARN_REPORT_WORK_ORDERS_FIELD } from './yarn-requirement.report';

type Def = Omit<ReportDefinitionInput, 'filters'> & { filters?: Omit<ReportFilter, 'id'>[] };

const asc = (field: string) => ({ field, direction: 'asc' as const });
const desc = (field: string) => ({ field, direction: 'desc' as const });
const cols = (...fields: (string | { field: string; label?: string; total?: boolean })[]) =>
  fields.map((f) => (typeof f === 'string' ? { field: f } : f));
const total = (field: string, label?: string) => ({ field, total: true, ...(label ? { label } : {}) });
const ask = (field: string, operator: string) => ({ field, operator, prompt: true });
const is = (field: string, operator: string, value?: string, value2?: string) => ({ field, operator, ...(value ? { value } : {}), ...(value2 ? { value2 } : {}) });

const NOT_CANCELLED = is('cancelled', 'isFalse');

// ── Inventory ──────────────────────────────────────────────────────────────────
const INVENTORY: Def[] = [
  {
    name: 'Stock on Hand',
    description: 'Current stock of every inventory card in its base unit (same calculation as the Inventory Card screen).',
    dataSource: 'inventory-items',
    columns: cols('code', 'name', 'kind', 'group.name', 'unit.code', total('stockOnHand'), 'warehouse.name', 'lastReceiptDate'),
    filters: [ask('name', 'contains')],
    sorting: [asc('code')],
  },
  {
    name: 'Items with Stock',
    description: 'Inventory cards that currently have stock on hand.',
    dataSource: 'inventory-items',
    columns: cols('code', 'name', 'kind', 'group.name', 'unit.code', total('stockOnHand')),
    filters: [is('stockOnHand', 'gt', '0')],
    sorting: [desc('stockOnHand')],
  },
  {
    name: 'Negative Stock Items',
    description: 'Inventory cards whose stock went below zero — usually missing or mis-typed receipts.',
    dataSource: 'inventory-items',
    columns: cols('code', 'name', 'kind', 'unit.code', total('stockOnHand'), 'lastReceiptDate'),
    filters: [is('stockOnHand', 'lt', '0')],
    sorting: [asc('stockOnHand')],
  },
  {
    name: 'Low Stock Items',
    description: 'Inventory cards with stock at or below the quantity you enter.',
    dataSource: 'inventory-items',
    columns: cols('code', 'name', 'kind', 'group.name', 'unit.code', total('stockOnHand'), 'supplier.name'),
    filters: [ask('stockOnHand', 'lte'), is('inUse', 'isTrue')],
    sorting: [asc('stockOnHand')],
  },
  {
    name: 'Inventory Card Register',
    description: 'Every inventory card with group, category, unit, default warehouse and supplier.',
    dataSource: 'inventory-items',
    columns: cols('code', 'name', 'kind', 'group.name', 'category.name', 'unit.code', 'warehouse.name', 'supplier.name', 'inUse', 'insertedAt'),
    sorting: [asc('code')],
  },
  {
    name: 'Items by Group',
    description: 'Inventory cards in the group you enter.',
    dataSource: 'inventory-items',
    columns: cols('group.code', 'group.name', 'code', 'name', 'unit.code', total('stockOnHand')),
    filters: [ask('group.name', 'contains')],
    sorting: [asc('group.name'), asc('code')],
  },
  {
    name: 'Items by Kind',
    description: 'Inventory cards of the kind you enter (e.g. FABRIC, YARN, TRIM — the card\'s access code).',
    dataSource: 'inventory-items',
    columns: cols('kind', 'code', 'name', 'group.name', 'unit.code', total('stockOnHand')),
    filters: [ask('kind', 'equals')],
    sorting: [asc('kind'), asc('code')],
  },
  {
    name: 'Fabric Specifications',
    description: 'Composition, width, weight (GSM) and density of fabric cards.',
    dataSource: 'inventory-items',
    columns: cols('code', 'name', 'composition', 'width', 'weight', 'density', 'supplier.name'),
    filters: [ask('kind', 'contains')],
    sorting: [asc('code')],
  },
  {
    name: 'Items by Supplier',
    description: 'Inventory cards and their default supplier.',
    dataSource: 'inventory-items',
    columns: cols('supplier.code', 'supplier.name', 'code', 'name', 'unit.code', total('stockOnHand')),
    filters: [ask('supplier.name', 'contains')],
    sorting: [asc('supplier.name'), asc('code')],
  },
  {
    name: 'Inactive Inventory Cards',
    description: 'Inventory cards marked not in use, with any stock still on hand.',
    dataSource: 'inventory-items',
    columns: cols('code', 'name', 'kind', 'group.name', total('stockOnHand'), 'updatedAt'),
    filters: [is('inUse', 'isFalse')],
    sorting: [asc('code')],
  },
  {
    name: 'Items Without Movement',
    description: 'Inventory cards with no receipt since the date you enter (or never received).',
    dataSource: 'inventory-items',
    columns: cols('code', 'name', 'kind', 'lastReceiptDate', total('stockOnHand')),
    filters: [ask('lastReceiptDate', 'before')],
    sorting: [asc('lastReceiptDate')],
  },
  {
    name: 'Inventory Receipt Register',
    description: 'Every inventory receipt with type, account, warehouses and totals.',
    dataSource: 'inventory-receipts',
    columns: cols('receiptTypeName', 'receiptNo', 'receiptDate', 'documentNo', 'account.name', 'inWarehouse', 'outWarehouse', total('totalQty'), total('grandTotal'), 'forex', 'approved'),
    sorting: [desc('receiptDate')],
  },
  {
    name: 'Receipts in Period',
    description: 'Inventory receipts dated between the dates you enter.',
    dataSource: 'inventory-receipts',
    columns: cols('receiptDate', 'receiptTypeName', 'receiptNo', 'account.name', total('lineCount'), total('totalQty'), total('grandTotal')),
    filters: [ask('receiptDate', 'between')],
    sorting: [desc('receiptDate')],
  },
  {
    name: 'Receipts by Type',
    description: 'Inventory receipts of the type you enter (e.g. Purchase Receipt, Warehouse Transfer).',
    dataSource: 'inventory-receipts',
    columns: cols('receiptTypeName', 'receiptNo', 'receiptDate', 'account.name', total('totalQty'), total('grandTotal')),
    filters: [ask('receiptTypeName', 'contains')],
    sorting: [asc('receiptTypeName'), desc('receiptDate')],
  },
  {
    name: 'Unapproved Receipts',
    description: 'Inventory receipts not yet approved.',
    dataSource: 'inventory-receipts',
    columns: cols('receiptTypeName', 'receiptNo', 'receiptDate', 'account.name', total('grandTotal'), 'insertedAt'),
    filters: [is('approved', 'isFalse'), NOT_CANCELLED],
    sorting: [asc('receiptDate')],
  },
  {
    name: 'Warehouse Transfers',
    description: 'Warehouse transfer receipts with source and destination warehouses.',
    dataSource: 'inventory-receipts',
    columns: cols('receiptNo', 'receiptDate', 'outWarehouse', 'inWarehouse', total('lineCount'), total('totalQty'), 'explanation'),
    filters: [is('receiptType', 'eq', '17')],
    sorting: [desc('receiptDate')],
  },
  {
    name: 'Outside Process Receipts',
    description: 'Outside-process (subcontract) receipts sent and received, with subcontract type.',
    dataSource: 'inventory-receipts',
    columns: cols('receiptTypeName', 'receiptNo', 'receiptDate', 'account.name', 'subcontractType', total('totalQty')),
    filters: [ask('receiptTypeName', 'contains')],
    sorting: [desc('receiptDate')],
  },
  {
    name: 'Stock Movements by Item',
    description: 'Every receipt line of an item with signed quantity (+ in / − out).',
    dataSource: 'inventory-receipt-lines',
    columns: cols('item.code', 'item.name', 'receiptDate', 'receiptTypeName', 'direction', 'receiptNo', 'unit', total('signedQty'), 'inWarehouse', 'outWarehouse'),
    filters: [ask('item.name', 'contains')],
    sorting: [asc('item.code'), asc('receiptDate')],
  },
  {
    name: 'Inflows in Period',
    description: 'Receipt lines that brought stock in between the dates you enter.',
    dataSource: 'inventory-receipt-lines',
    columns: cols('receiptDate', 'receiptTypeName', 'receiptNo', 'item.code', 'item.name', 'unit', total('quantity'), total('netItemTotal')),
    filters: [is('direction', 'equals', 'Inflow'), ask('receiptDate', 'between')],
    sorting: [desc('receiptDate')],
  },
  {
    name: 'Outflows in Period',
    description: 'Receipt lines that took stock out between the dates you enter.',
    dataSource: 'inventory-receipt-lines',
    columns: cols('receiptDate', 'receiptTypeName', 'receiptNo', 'item.code', 'item.name', 'unit', total('quantity'), total('netItemTotal')),
    filters: [is('direction', 'equals', 'Outflow'), ask('receiptDate', 'between')],
    sorting: [desc('receiptDate')],
  },
  {
    name: 'Receipts by Lot / Party No',
    description: 'Receipt lines of a lot or party number.',
    dataSource: 'inventory-receipt-lines',
    columns: cols('partyNo', 'item.code', 'item.name', 'receiptTypeName', 'receiptNo', 'receiptDate', total('quantity'), 'unit'),
    filters: [ask('partyNo', 'contains')],
    sorting: [asc('partyNo'), asc('receiptDate')],
  },
  {
    name: 'Warehouse List',
    description: 'All warehouses with contact details and usage.',
    dataSource: 'warehouses',
    columns: cols('code', 'name', 'address', 'phone', 'inUse', 'virtual', total('items'), total('receiptsIn'), total('receiptsOut')),
    sorting: [asc('code')],
  },
  {
    name: 'Serial Card Balances',
    description: 'Rolls / lots with quantity, used and remaining quantity.',
    dataSource: 'serial-cards',
    columns: cols('serialCode', 'item.code', 'item.name', 'partyNo', total('quantity'), total('usedQuantity'), total('remaining'), 'supplier.name'),
    sorting: [asc('serialCode')],
  },
  {
    name: 'Open Rolls / Lots',
    description: 'Serial cards with quantity still remaining.',
    dataSource: 'serial-cards',
    columns: cols('serialCode', 'item.code', 'item.name', 'partyNo', 'width', 'weight', total('remaining')),
    filters: [is('remaining', 'gt', '0')],
    sorting: [asc('item.code'), asc('serialCode')],
  },
  {
    name: 'Expiring Serial Cards',
    description: 'Serial cards expiring before the date you enter.',
    dataSource: 'serial-cards',
    columns: cols('expirationDate', 'serialCode', 'item.name', 'partyNo', total('remaining')),
    filters: [ask('expirationDate', 'before'), is('remaining', 'gt', '0')],
    sorting: [asc('expirationDate')],
  },
];

// ── Purchase ───────────────────────────────────────────────────────────────────
const PURCHASE: Def[] = [
  {
    name: 'Purchase Order Register',
    description: 'Every purchase and subcontract order with supplier, quantities, totals and status.',
    dataSource: 'purchase-orders',
    columns: cols('orderType', 'orderNo', 'orderDate', 'deliveryDate', 'supplier.name', total('totalQty'), total('grandTotal'), 'forex', 'approved', 'closed'),
    sorting: [desc('orderDate')],
  },
  {
    name: 'Orders in Period',
    description: 'Orders dated between the dates you enter.',
    dataSource: 'purchase-orders',
    columns: cols('orderDate', 'orderType', 'orderNo', 'supplier.name', total('lineCount'), total('totalQty'), total('grandTotal')),
    filters: [ask('orderDate', 'between')],
    sorting: [desc('orderDate')],
  },
  {
    name: 'Open Orders',
    description: 'Orders that are not closed or cancelled, by delivery date.',
    dataSource: 'purchase-orders',
    columns: cols('deliveryDate', 'orderType', 'orderNo', 'supplier.name', total('totalQty'), total('grandTotal')),
    filters: [is('closed', 'isFalse'), NOT_CANCELLED],
    sorting: [asc('deliveryDate')],
  },
  {
    name: 'Orders Due Before Date',
    description: 'Open orders due for delivery before the date you enter.',
    dataSource: 'purchase-orders',
    columns: cols('deliveryDate', 'orderNo', 'supplier.name', total('totalQty'), total('grandTotal')),
    filters: [is('closed', 'isFalse'), NOT_CANCELLED, ask('deliveryDate', 'before')],
    sorting: [asc('deliveryDate')],
  },
  {
    name: 'Orders Pending Approval',
    description: 'Orders not yet approved (and not rejected or cancelled).',
    dataSource: 'purchase-orders',
    columns: cols('orderType', 'orderNo', 'orderDate', 'supplier.name', total('grandTotal'), 'insertedAt'),
    filters: [is('approved', 'isFalse'), is('rejected', 'isFalse'), NOT_CANCELLED],
    sorting: [asc('orderDate')],
  },
  {
    name: 'Orders by Supplier',
    description: 'All orders placed with a supplier.',
    dataSource: 'purchase-orders',
    columns: cols('supplier.code', 'supplier.name', 'orderNo', 'orderDate', 'deliveryDate', total('totalQty'), total('grandTotal')),
    filters: [ask('supplier.name', 'contains')],
    sorting: [asc('supplier.name'), desc('orderDate')],
  },
  {
    name: 'Subcontract Orders',
    description: 'Subcontract orders with subcontractor and quantities.',
    dataSource: 'purchase-orders',
    columns: cols('orderNo', 'orderDate', 'deliveryDate', 'supplier.name', total('totalQty'), total('grandTotal'), 'closed'),
    filters: [is('orderType', 'equals', 'Subcontract Order')],
    sorting: [desc('orderDate')],
  },
  {
    name: 'Ordered Items',
    description: 'Order lines of an item across all purchase / subcontract orders.',
    dataSource: 'purchase-order-lines',
    columns: cols('item.code', 'item.name', 'orderType', 'orderNo', 'orderDate', 'supplier.name', 'unit', total('quantity'), 'unitPrice', total('netItemTotal')),
    filters: [ask('item.name', 'contains')],
    sorting: [asc('item.code'), desc('orderDate')],
  },
  {
    name: 'Purchase Price History',
    description: 'Unit prices paid for each item over time and by supplier.',
    dataSource: 'purchase-order-lines',
    columns: cols('item.code', 'item.name', 'orderDate', 'supplier.name', 'unit', 'unitPrice', 'forex', 'forexUnitPrice'),
    filters: [ask('item.name', 'contains')],
    sorting: [asc('item.code'), desc('orderDate')],
  },
  {
    name: 'Order Lines Due in Period',
    description: 'Order lines with a delivery date between the dates you enter.',
    dataSource: 'purchase-order-lines',
    columns: cols('lineDeliveryDate', 'orderNo', 'supplier.name', 'item.code', 'item.name', 'unit', total('quantity')),
    filters: [ask('lineDeliveryDate', 'between'), is('lineClosed', 'isFalse'), is('lineCancelled', 'isFalse')],
    sorting: [asc('lineDeliveryDate')],
  },
  {
    name: 'Purchase Receipts in Period',
    description: 'Purchase receipt lines (goods received) between the dates you enter.',
    dataSource: 'inventory-receipt-lines',
    columns: cols('receiptDate', 'receiptNo', 'account.name', 'item.code', 'item.name', 'unit', total('quantity'), 'unitPrice', total('netItemTotal')),
    filters: [is('receiptType', 'eq', '2'), ask('receiptDate', 'between')],
    sorting: [desc('receiptDate')],
  },
  {
    name: 'Purchases by Supplier',
    description: 'Purchase receipt value per supplier.',
    dataSource: 'inventory-receipts',
    columns: cols('account.name', 'receiptNo', 'receiptDate', total('totalQty'), total('grandTotal'), 'forex'),
    filters: [is('receiptType', 'eq', '2'), ask('account.name', 'contains')],
    sorting: [asc('account.name'), desc('receiptDate')],
  },
  {
    name: 'Purchase Returns',
    description: 'Purchase return receipts with supplier and value.',
    dataSource: 'inventory-receipts',
    columns: cols('receiptNo', 'receiptDate', 'account.name', total('totalQty'), total('grandTotal'), 'explanation'),
    filters: [is('receiptType', 'eq', '122')],
    sorting: [desc('receiptDate')],
  },
];

// ── Production ─────────────────────────────────────────────────────────────────
const PRODUCTION: Def[] = [
  {
    name: 'Work Order Register',
    description: 'Every work order with customer, linked style, quantity, dates and status.',
    dataSource: 'work-orders',
    columns: cols('workOrderNo', 'workOrderDate', 'customer.name', 'style.number', 'customerOrderNo', total('quantity'), 'deliveryDate', 'status', 'factory.name'),
    sorting: [desc('workOrderDate')],
  },
  {
    name: 'Open Work Orders',
    description: 'Work orders that are open, planned or in production.',
    dataSource: 'work-orders',
    columns: cols('deliveryDate', 'workOrderNo', 'customer.name', 'style.number', total('quantity'), total('shippedQty'), 'status'),
    filters: [is('status', 'notEquals', 'Completed'), is('status', 'notEquals', 'Cancelled')],
    sorting: [asc('deliveryDate')],
  },
  {
    name: 'Late Work Orders',
    description: 'Unfinished work orders with a delivery date before the date you enter (enter today for everything late).',
    dataSource: 'work-orders',
    columns: cols('deliveryDate', 'workOrderNo', 'customer.name', 'style.number', total('quantity'), 'status', 'factory.name'),
    filters: [is('status', 'notEquals', 'Completed'), is('status', 'notEquals', 'Cancelled'), ask('deliveryDate', 'before')],
    sorting: [asc('deliveryDate')],
  },
  {
    name: 'Work Orders Due in Period',
    description: 'Work orders with a delivery date between the dates you enter.',
    dataSource: 'work-orders',
    columns: cols('deliveryDate', 'workOrderNo', 'customer.name', 'style.number', total('quantity'), 'status'),
    filters: [ask('deliveryDate', 'between')],
    sorting: [asc('deliveryDate')],
  },
  {
    name: 'Shipments in Period',
    description: 'Work orders with a shipment date between the dates you enter.',
    dataSource: 'work-orders',
    columns: cols('shipmentDate', 'workOrderNo', 'customer.name', 'style.number', total('quantity'), total('shippedQty')),
    filters: [ask('shipmentDate', 'between')],
    sorting: [asc('shipmentDate')],
  },
  {
    name: 'Work Orders by Customer',
    description: 'All work orders of a customer.',
    dataSource: 'work-orders',
    columns: cols('customer.name', 'workOrderNo', 'workOrderDate', 'customerOrderNo', total('quantity'), total('orderValue'), 'status'),
    filters: [ask('customer.name', 'contains')],
    sorting: [asc('customer.name'), desc('workOrderDate')],
  },
  {
    name: 'Work Orders by Factory',
    description: 'Work orders allocated to each factory.',
    dataSource: 'work-orders',
    columns: cols('factory.name', 'workOrderNo', 'customer.name', 'style.number', total('quantity'), 'deliveryDate', 'status'),
    filters: [ask('factory.name', 'contains')],
    sorting: [asc('factory.name'), asc('deliveryDate')],
  },
  {
    name: 'Work Orders by Season',
    description: 'Work orders of the season you enter.',
    dataSource: 'work-orders',
    columns: cols('seasonCode', 'workOrderNo', 'customer.name', 'style.number', 'brands', total('quantity'), 'status'),
    filters: [ask('seasonCode', 'contains')],
    sorting: [asc('seasonCode'), asc('workOrderNo')],
  },
  {
    name: 'Work Order Value',
    description: 'Quantity × unit price and CMT price per work order.',
    dataSource: 'work-orders',
    columns: cols('workOrderNo', 'customer.name', total('quantity'), 'unitPrice', total('orderValue'), 'cmtPrice', 'status'),
    sorting: [desc('orderValue')],
  },
  {
    name: 'Cutting Status',
    description: 'Work orders with cutting approval date and whether cutting is completed.',
    dataSource: 'work-orders',
    columns: cols('workOrderNo', 'customer.name', 'style.number', total('quantity'), 'cuttingApprovedDate', 'cuttingCompleted', 'status'),
    filters: [is('cancelled', 'isFalse')],
    sorting: [asc('cuttingApprovedDate')],
  },
  {
    name: 'Work Order Shipping Progress',
    description: 'Ordered vs shipped quantity per work order line, with what remains to ship.',
    dataSource: 'work-order-lines',
    columns: cols('workOrderNo', 'customer.name', 'item.code', 'item.name', total('quantity'), total('shippedNet'), total('remainingToShip'), 'lineShipmentDate'),
    filters: [is('lineCancelled', 'isFalse')],
    sorting: [asc('workOrderNo'), asc('lineNo')],
  },
  {
    name: 'Unshipped Work Order Lines',
    description: 'Work order lines with quantity still to ship.',
    dataSource: 'work-order-lines',
    columns: cols('lineShipmentDate', 'workOrderNo', 'customer.name', 'item.name', total('remainingToShip'), 'manufacturingFactory.name'),
    filters: [is('remainingToShip', 'gt', '0'), is('lineClosed', 'isFalse'), is('lineCancelled', 'isFalse')],
    sorting: [asc('lineShipmentDate')],
  },
  {
    name: 'Work Order Lines by Factory',
    description: 'Work order lines per manufacturing factory.',
    dataSource: 'work-order-lines',
    columns: cols('manufacturingFactory.name', 'workOrderNo', 'item.name', total('quantity'), total('shippedNet'), 'status'),
    filters: [ask('manufacturingFactory.name', 'contains')],
    sorting: [asc('manufacturingFactory.name'), asc('workOrderNo')],
  },
];

// ── Finance ────────────────────────────────────────────────────────────────────
const FINANCE: Def[] = [
  {
    name: 'Account Balances',
    description: 'Debit, credit and balance of every current account.',
    dataSource: 'current-accounts',
    columns: cols('code', 'name', 'forex', total('debit'), total('credit'), total('balance')),
    sorting: [asc('code')],
  },
  {
    name: 'Accounts with Open Balance',
    description: 'Current accounts whose balance is not zero, largest first.',
    dataSource: 'current-accounts',
    columns: cols('code', 'name', 'termDays', total('balance')),
    filters: [is('balance', 'neq', '0')],
    sorting: [desc('balance')],
  },
  {
    name: 'Current Account List',
    description: 'All customers and suppliers with contact details, terms and limits.',
    dataSource: 'current-accounts',
    columns: cols('code', 'name', 'tradeName', 'email', 'phone', 'taxNo', 'termDays', 'riskLimit', 'forex', 'inUse'),
    sorting: [asc('code')],
  },
  {
    name: 'Account Activity Summary',
    description: 'Receipts, orders and work orders per account, with the last receipt date.',
    dataSource: 'current-accounts',
    columns: cols('code', 'name', total('inventoryReceipts'), total('orders'), total('workOrders'), 'lastReceiptDate', total('balance')),
    sorting: [desc('inventoryReceipts')],
  },
  {
    name: 'Inactive Accounts',
    description: 'Accounts with no inventory receipt since the date you enter.',
    dataSource: 'current-accounts',
    columns: cols('code', 'name', 'lastReceiptDate', total('balance'), 'inUse'),
    filters: [ask('lastReceiptDate', 'before')],
    sorting: [asc('lastReceiptDate')],
  },
  {
    name: 'Blacklisted Accounts',
    description: 'Accounts marked as blacklisted.',
    dataSource: 'current-accounts',
    columns: cols('code', 'name', 'phone', 'email', total('balance')),
    filters: [is('blacklisted', 'isTrue')],
    sorting: [asc('name')],
  },
  {
    name: 'Account Statement',
    description: 'All debit / credit transactions of an account, by date.',
    dataSource: 'account-transactions',
    columns: cols('receiptDate', 'receiptNo', 'documentNo', 'explanation', 'termDate', total('debit'), total('credit'), total('net'), 'forex'),
    filters: [ask('account.name', 'contains'), ask('receiptDate', 'between')],
    sorting: [asc('receiptDate')],
  },
  {
    name: 'Transactions in Period',
    description: 'All current account transactions between the dates you enter.',
    dataSource: 'account-transactions',
    columns: cols('receiptDate', 'receiptNo', 'account.name', 'explanation', total('debit'), total('credit'), 'forex'),
    filters: [ask('receiptDate', 'between')],
    sorting: [desc('receiptDate')],
  },
  {
    name: 'Payments Due',
    description: 'Unpaid transactions with a term (due) date before the date you enter.',
    dataSource: 'account-transactions',
    columns: cols('termDate', 'account.name', 'receiptNo', 'documentNo', total('debit'), total('credit'), 'forex'),
    filters: [is('paid', 'isFalse'), ask('termDate', 'before')],
    sorting: [asc('termDate')],
  },
  {
    name: 'Foreign Currency Transactions',
    description: 'Transactions in the currency you enter, with forex amounts and rates.',
    dataSource: 'account-transactions',
    columns: cols('receiptDate', 'account.name', 'forex', 'forexRate', total('forexDebit'), total('forexCredit'), total('debit'), total('credit')),
    filters: [ask('forex', 'equals')],
    sorting: [desc('receiptDate')],
  },
];

// ── Contracts ──────────────────────────────────────────────────────────────────
const CONTRACTS: Def[] = [
  {
    name: 'Contract Register',
    description: 'Every purchase and sale contract with account, validity and amounts.',
    dataSource: 'contracts',
    columns: cols('contractType', 'contractNo', 'contractDate', 'account.name', 'startDate', 'endDate', total('contractAmount'), total('grandTotal'), 'forex', 'approved'),
    sorting: [desc('contractDate')],
  },
  {
    name: 'Active Contracts',
    description: 'Contracts not closed or cancelled, by end date.',
    dataSource: 'contracts',
    columns: cols('endDate', 'contractType', 'contractNo', 'account.name', total('grandTotal')),
    filters: [is('closed', 'isFalse'), NOT_CANCELLED],
    sorting: [asc('endDate')],
  },
  {
    name: 'Contracts Expiring Before Date',
    description: 'Open contracts ending before the date you enter.',
    dataSource: 'contracts',
    columns: cols('endDate', 'contractNo', 'account.name', total('grandTotal')),
    filters: [is('closed', 'isFalse'), NOT_CANCELLED, ask('endDate', 'before')],
    sorting: [asc('endDate')],
  },
  {
    name: 'Contracts by Account',
    description: 'All contracts of an account.',
    dataSource: 'contracts',
    columns: cols('account.name', 'contractType', 'contractNo', 'contractDate', total('grandTotal'), 'closed'),
    filters: [ask('account.name', 'contains')],
    sorting: [asc('account.name'), desc('contractDate')],
  },
  {
    name: 'Contract Fulfilment',
    description: 'Contracted vs received quantity per contract line, with the open quantity.',
    dataSource: 'contract-lines',
    columns: cols('contractNo', 'account.name', 'item.code', 'item.name', 'unit', total('quantity'), total('receivedQuantity'), total('openQuantity'), 'lineDeliveryDate'),
    sorting: [asc('contractNo')],
  },
  {
    name: 'Open Contract Lines',
    description: 'Contract lines with quantity still open.',
    dataSource: 'contract-lines',
    columns: cols('lineDeliveryDate', 'contractNo', 'account.name', 'item.name', total('openQuantity'), 'unitPrice'),
    filters: [is('openQuantity', 'gt', '0')],
    sorting: [asc('lineDeliveryDate')],
  },
];

// ── Documents ──────────────────────────────────────────────────────────────────

const DOCUMENTS: Def[] = [
  {
    // Opened from the Work Orders list: right-click → Print → Order Form (the list passes the
    // Work Order to the "ask when running" filter).
    name: 'Order Form',
    description: 'A Work Order printed as the Order Form: header, Color/Size Chart, recipes, requirements and embellishments.',
    dataSource: ORDER_FORM_SOURCE_KEY,
    columns: cols(...ORDER_FORM_SECTIONS.map(([key]) => key)),
    filters: [ask(ORDER_FORM_WORK_ORDER_FIELD, 'eq')],
  },
  {
    // Opened from an inward Inventory Receipt: right-click / ⋮ → Print → Inward Gate Pass.
    name: 'Inward Gate Pass',
    description: 'An inward receipt printed as the Inward Gate Pass: supplier, IGP #, warehouse, driver, vehicle, party OGP, received items with totals, and signatures.',
    dataSource: GATE_PASS_SOURCE_KEY,
    columns: cols(...GATE_PASS_SECTIONS.map(([key]) => key)),
    filters: [ask(GATE_PASS_RECEIPT_FIELD, 'eq')],
  },
  // Opened from the Work Orders list (the selected Work Orders) or a Work Order: Print → Yarn /
  // Fabric / Trim Requirement. Same layout for the three materials.
  ...(['yarn', 'fabric', 'trim'] as const).map((material): Def => ({
    name: MATERIAL_REPORT_NAMES[material],
    description: `${material[0].toUpperCase()}${material.slice(1)} requirement of the chosen Work Orders — each Work Order with its ${material === 'yarn' ? 'yarns' : `${material}s`}, purchase orders, receipts and production issues — and Cumulative Totals.`,
    dataSource: MATERIAL_REPORT_SOURCE_KEYS[material],
    columns: cols(...MATERIAL_REPORT_SECTIONS(material).map(([key]) => key)),
    // Asked each run; left blank it means No — requirements are never calculated from the BOM unasked.
    filters: [ask(YARN_REPORT_WORK_ORDERS_FIELD, 'in'), ask(YARN_REPORT_ORDER_NO_FIELD, 'startsWith'), ask(BOM_FALLBACK_FIELD, 'equals')],
  })),
  {
    // Every filter asked when the report runs, all optional (blank = no restriction), combined with AND.
    name: DYEING_REPORT_NAME,
    description: 'Outside-process sent, received and returned quantities by subcontractor and Party No, with Party / Subcontractor totals, Kalan and Fire%.',
    dataSource: DYEING_SOURCE_KEY,
    columns: cols(...DYEING_SECTIONS.map(([key]) => key)),
    filters: [
      ask(DYEING_FIELDS.dateFrom, 'gte'), ask(DYEING_FIELDS.dateTo, 'lte'), ask(DYEING_FIELDS.subcontractors, 'in'),
      ask(DYEING_FIELDS.partyNo, 'contains'), ask(DYEING_FIELDS.receiptNo, 'contains'), ask(DYEING_FIELDS.documentNo, 'contains'),
      ask(DYEING_FIELDS.inventory, 'in'), ask(DYEING_FIELDS.inventoryName, 'contains'), ask(DYEING_FIELDS.process, 'equals'),
      ask(DYEING_FIELDS.workOrders, 'in'),
    ],
  },
  {
    // Every filter asked when the report runs, all optional (blank = no restriction), combined with AND.
    name: PROCESS_FOLLOW_UP_REPORT_NAME,
    description: 'Order Manufacturing sent, received (A / B quality ...), return and repair quantities per Work Order, Color and Factory, one section per Process with its total and Balance.',
    dataSource: PROCESS_FOLLOW_UP_SOURCE_KEY,
    columns: cols(...PROCESS_FOLLOW_UP_SECTIONS.map(([key]) => key)),
    filters: [
      ask(PROCESS_FOLLOW_UP_FIELDS.dateFrom, 'gte'), ask(PROCESS_FOLLOW_UP_FIELDS.dateTo, 'lte'),
      ask(PROCESS_FOLLOW_UP_FIELDS.customers, 'in'), ask(PROCESS_FOLLOW_UP_FIELDS.workOrders, 'in'),
      ask(PROCESS_FOLLOW_UP_FIELDS.orderNo, 'contains'), ask(PROCESS_FOLLOW_UP_FIELDS.styleCode, 'contains'),
      ask(PROCESS_FOLLOW_UP_FIELDS.styleName, 'contains'), ask(PROCESS_FOLLOW_UP_FIELDS.color, 'contains'),
      ask(PROCESS_FOLLOW_UP_FIELDS.processes, 'in'), ask(PROCESS_FOLLOW_UP_FIELDS.factories, 'in'),
      // Left blank it means No — only processes with entries, as on the legacy report.
      ask(PROCESS_FOLLOW_UP_EMPTY_FIELD, 'equals'),
    ],
  },
];

export const STANDARD_LEGACY_REPORTS: Def[] = [...INVENTORY, ...PURCHASE, ...PRODUCTION, ...FINANCE, ...CONTRACTS, ...DOCUMENTS];

export function standardLegacyReportInputs(): ReportDefinitionInput[] {
  return STANDARD_LEGACY_REPORTS.map((d) => ({ ...d, filters: (d.filters ?? []) as ReportFilter[] }));
}
