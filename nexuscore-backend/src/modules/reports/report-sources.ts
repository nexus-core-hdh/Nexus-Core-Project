// Report Builder data sources — the whitelist of everything a user-defined report can read.
//
// A report definition never names a table or column directly: it picks a source by `key` and
// fields by their `key`, and the query engine (report-builder.service.ts) turns those into a
// Prisma query. Anything not declared here simply cannot be queried, so there is no way to reach
// other tables, raw SQL, or another branch's data from a report.
//
// Cross-table columns come from to-one relations (each base row stays one report row): a field's
// `path` is the relation chain followed by the scalar, e.g. ['customer', 'name']. Counts of
// to-many relations (BOM lines, costing sheets, ...) are exposed through `countOf`, and values
// calculated from other columns of the same row (a line's amount, ...) through `compute`.
//
// Adding a source: declare it below with its Prisma model, fields and — for a table without its
// own branchId — the `scope` relation that leads to the record that has one.

import type { Prisma } from '@prisma/client';
import { LEGACY_REPORT_SOURCES } from './legacy-report-sources';

export type ReportFieldType = 'string' | 'number' | 'date' | 'boolean';

export interface ReportComputed {
  /** Paths of the numeric values the calculation reads (relation names then scalar). */
  deps: string[][];
  /** Receives the dependency values in `deps` order (missing ones as 0). */
  fn: (values: number[]) => number;
}

export interface ReportField {
  /** Stable id used in saved definitions, e.g. "customer.name". */
  key: string;
  label: string;
  /** Display group in the builder: the base table or the related table the field comes from. */
  group: string;
  type: ReportFieldType;
  /** Relation names followed by the scalar field name. Unset for count and computed fields. */
  path?: string[];
  /** Name of a to-many relation whose row count this field reports. */
  countOf?: string;
  /** Value calculated from other values of the same row — shown and totalled, but not
   *  filterable or sortable (the database cannot filter or order on it). */
  compute?: ReportComputed;
  /** SQL sources only: the column expression (over the source's table aliases). Always a fixed
   *  string or Prisma.Sql written here — never built from user input. */
  sql?: string | Prisma.Sql;
}

interface ReportSourceBase {
  key: string;
  module: string;
  label: string;
  description: string;
  /** Order used when a report sets no sorting. */
  defaultSort: { field: string; direction: 'asc' | 'desc' };
  /** Menu section (in the module's menu group) the source's reports are listed in. */
  menuSection: { title: string; icon: string };
  fields: ReportField[];
}

/** A Prisma model, queried through the Prisma client (PLM). */
export interface PrismaReportSource extends ReportSourceBase {
  kind?: 'prisma';
  /** Prisma delegate name, e.g. "styleBomLine". */
  model: string;
  /** Relation path to the record that carries `branchId` ([] = this table has it itself). */
  scope: string[];
  /** The scoped record's branchId is optional and a null branch means "shared by every branch"
   *  (e.g. document types / templates): include those rows too. */
  scopeIncludesShared?: boolean;
}

/**
 * A raw table outside the Prisma schema (the Legacy ERP tables), queried with parameterised SQL
 * built only from the fixed `from`/`where`/field expressions declared here; user input only
 * ever reaches the query as bound parameters (see report-sql.ts).
 */
export interface SqlReportSource extends ReportSourceBase {
  kind: 'sql';
  /** FROM clause: base table with its alias, plus any LEFT JOINs the fields use. */
  from: string;
  /** Fixed row condition, e.g. excluding soft-deleted rows. */
  where: string;
}

export type ReportSource = PrismaReportSource | SqlReportSource;

type FieldSpec = [key: string, label: string, type?: ReportFieldType];

/** Fields of the base table itself. */
function own(group: string, specs: FieldSpec[]): ReportField[] {
  return specs.map(([key, label, type = 'string']) => ({ key, label, group, type, path: [key] }));
}

/** Fields of a to-one related table (or a chain of them, e.g. "costingSheet.styleCard"). */
function related(relation: string, group: string, specs: FieldSpec[]): ReportField[] {
  const chain = relation.split('.');
  return specs.map(([key, label, type = 'string']) => ({
    key: `${relation}.${key}`,
    label,
    group,
    type,
    path: [...chain, key],
  }));
}

/** Row counts of to-many relations. */
function counts(group: string, specs: [relation: string, label: string][]): ReportField[] {
  return specs.map(([relation, label]) => ({ key: `count.${relation}`, label, group, type: 'number', countOf: relation }));
}

/** A number calculated from other numeric columns of the same row. */
function computed(group: string, key: string, label: string, deps: string[], fn: (v: number[]) => number): ReportField {
  return { key: `calc.${key}`, label, group, type: 'number', compute: { deps: deps.map((d) => d.split('.')), fn } };
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

const CUSTOMER: FieldSpec[] = [['name', 'Customer'], ['email', 'Customer Email'], ['phone', 'Customer Phone'], ['city', 'Customer City'], ['country', 'Customer Country']];
const DEPARTMENT: FieldSpec[] = [['code', 'Department Code'], ['name', 'Department']];
const employee = (label: string): FieldSpec[] => [['employeeNumber', `${label} No`], ['name', label]];
const STYLE_REF: FieldSpec[] = [['styleNumber', 'Style No'], ['title', 'Style Name'], ['season', 'Style Season'], ['brand', 'Style Brand'], ['status', 'Style Status']];
const SAMPLE_REF: FieldSpec[] = [['sampleNumber', 'Sample No'], ['title', 'Sample Name'], ['status', 'Sample Status']];
const COSTING_REF: FieldSpec[] = [['costingNo', 'Costing No'], ['costingDate', 'Costing Date', 'date'], ['styleCode', 'Costing Style Code'], ['accountName', 'Costing Account'], ['brand', 'Costing Brand']];

const SECTION = {
  style: { title: 'Style Card Reports', icon: 'Shirt' },
  sample: { title: 'Sample Card Reports', icon: 'FlaskConical' },
  costing: { title: 'Costing Sheet Reports', icon: 'BadgeDollarSign' },
  orders: { title: 'Order & Task Reports', icon: 'ClipboardList' },
  bom: { title: 'BOM Reports', icon: 'Layers' },
  product: { title: 'Product & Design Reports', icon: 'Package' },
};
const NEWEST = { field: 'createdAt', direction: 'desc' as const };

// ── Style / Sample / Costing headers ───────────────────────────────────────────

const STYLE_CARDS: PrismaReportSource = {
  key: 'style-cards',
  module: 'plm',
  label: 'Style Cards',
  description: 'One row per Style Card, with its customer, department, people, route and counts of related records.',
  model: 'styleCard',
  scope: [],
  defaultSort: NEWEST,
  menuSection: SECTION.style,
  fields: [
    ...own('Style Card', [
      ['styleNumber', 'Style No'], ['title', 'Name'], ['status', 'Status'], ['season', 'Season'], ['year', 'Year', 'number'],
      ['brand', 'Brand'], ['gender', 'Gender'], ['category', 'Category'], ['groupCode', 'Group Code'], ['groupName', 'Group Name'],
      ['customerStyleNo', 'Customer Style No'], ['contactPerson', 'Contact Person'], ['productCode', 'Product Code'],
      ['accessCode', 'Access Code'], ['specialCode', 'Special Code'], ['garmentWash', 'Garment Wash'], ['garmentDye', 'Garment Dye'],
      ['masterSize', 'Master Size'], ['bomRouteCode', 'Route Code'], ['bomEmbroideryRoute', 'Embroidery Route'],
      ['bomCmtPrice', 'CMT Price', 'number'], ['bomRunningQuantity', 'Running Quantity', 'number'],
      ['inUse', 'In Use', 'boolean'], ['sentByCustomer', 'Sent by Customer', 'boolean'], ['description', 'Description'],
      ['createdAt', 'Created On', 'date'], ['updatedAt', 'Updated On', 'date'],
    ]),
    ...related('customer', 'Customer', CUSTOMER),
    ...related('department', 'Department', DEPARTMENT),
    ...related('designer', 'Designer', employee('Designer')),
    ...related('representative', 'Representative', employee('Representative')),
    ...related('productionMerchandiser', 'Production Merchandiser', employee('Production Merchandiser')),
    ...related('productMerchandiser', 'Product Merchandiser', employee('Product Merchandiser')),
    ...related('moodBoard', 'Mood Board', [['title', 'Mood Board'], ['theme', 'Mood Board Theme']]),
    ...related('measurementChart', 'Measurement Chart', [['name', 'Measurement Chart']]),
    ...related('bomRouteCard', 'Route', [['code', 'Route Card Code'], ['name', 'Route Card']]),
    ...counts('Counts', [
      ['bomLines', 'BOM Lines'], ['sampleCards', 'Sample Cards'], ['costingSheets', 'Costing Sheets'],
      ['plmOrders', 'Orders'], ['productCards', 'Product Cards'], ['plmTasks', 'Tasks'],
    ]),
  ],
};

const SAMPLE_CARDS: PrismaReportSource = {
  key: 'sample-cards',
  module: 'plm',
  label: 'Sample Cards',
  description: 'One row per Sample Card, with its sample type, linked Style Card, customer, people and route.',
  model: 'sampleCard',
  scope: [],
  defaultSort: NEWEST,
  menuSection: SECTION.sample,
  fields: [
    ...own('Sample Card', [
      ['sampleNumber', 'Sample No'], ['title', 'Name'], ['status', 'Status'], ['season', 'Season'], ['year', 'Year', 'number'],
      ['brand', 'Brand'], ['gender', 'Gender'], ['category', 'Category'], ['groupCode', 'Group Code'],
      ['colorway', 'Colorway'], ['size', 'Size'], ['quantity', 'Quantity', 'number'], ['assignedTo', 'Assigned To'],
      ['dueDate', 'Due Date', 'date'], ['cost', 'Cost', 'number'], ['currency', 'Currency'],
      ['customerStyleNo', 'Customer Style No'], ['contactPerson', 'Contact Person'], ['accessCode', 'Access Code'],
      ['specialCode', 'Special Code'], ['garmentWash', 'Garment Wash'], ['garmentDye', 'Garment Dye'], ['masterSize', 'Master Size'],
      ['description', 'Description'], ['notes', 'Notes'], ['createdAt', 'Created On', 'date'], ['updatedAt', 'Updated On', 'date'],
    ]),
    ...related('sampleType', 'Sample Type', [['code', 'Sample Type Code'], ['name', 'Sample Type']]),
    ...related('styleCard', 'Style Card', STYLE_REF),
    ...related('customer', 'Customer', CUSTOMER),
    ...related('department', 'Department', DEPARTMENT),
    ...related('designer', 'Designer', employee('Designer')),
    ...related('representative', 'Representative', employee('Representative')),
    ...related('routeCard', 'Route', [['code', 'Route Card Code'], ['name', 'Route Card']]),
    ...related('measurementChart', 'Measurement Chart', [['name', 'Measurement Chart']]),
    ...counts('Counts', [['bomLines', 'BOM Lines'], ['costingSheets', 'Costing Sheets'], ['orders', 'Orders'], ['history', 'Status Changes']]),
  ],
};

const COSTING_SHEETS: PrismaReportSource = {
  key: 'costing-sheets',
  module: 'plm',
  label: 'Costing Sheets',
  description: 'One row per Costing Sheet, with its rates, quoted price, percentages and linked Style/Sample Card.',
  model: 'costingSheet',
  scope: [],
  defaultSort: NEWEST,
  menuSection: SECTION.costing,
  fields: [
    ...own('Costing Sheet', [
      ['costingNo', 'Costing No'], ['costingDate', 'Costing Date', 'date'], ['styleCode', 'Style Code'], ['styleName', 'Style Name'],
      ['accountCode', 'Account Code'], ['accountName', 'Account'], ['category', 'Category'], ['brand', 'Brand'],
      ['pkrRate', 'PKR Rate', 'number'], ['foreignCurrency', 'Foreign Currency'], ['foreignRate', 'Foreign Rate', 'number'],
      ['secondForeignCurrency', '2nd Foreign Currency'], ['secondForeignRate', '2nd Foreign Rate', 'number'],
      ['quotedPriceForex', 'Quoted Price Currency'], ['quotedPrice', 'Quoted Price', 'number'], ['orderQuantity', 'Order Quantity', 'number'],
      ['shippingTerms', 'Shipping Terms'], ['paymentTerms', 'Payment Terms'],
      ['overheadPct', 'Overhead %', 'number'], ['wastePct', 'Waste %', 'number'], ['gSuppliesPct', 'G. Supplies %', 'number'],
      ['excessProductionPct', 'Excess Production %', 'number'], ['profitPct', 'Profit %', 'number'],
      ['financialCostPct', 'Financial Cost %', 'number'], ['commissionPct', 'Commission %', 'number'], ['commission3Pct', 'Commission 3 %', 'number'],
      ['createdAt', 'Created On', 'date'], ['updatedAt', 'Updated On', 'date'],
    ]),
    computed('Costing Sheet', 'orderValue', 'Order Value (Quoted × Qty)', ['quotedPrice', 'orderQuantity'], ([p, q]) => round(p * q, 2)),
    ...related('styleCard', 'Style Card', STYLE_REF),
    ...related('sampleCard', 'Sample Card', SAMPLE_REF),
    ...counts('Counts', [['rawMaterialLines', 'Raw Material Lines'], ['laborLines', 'Labor Lines'], ['otherLines', 'Other Cost Lines']]),
  ],
};

// ── Orders & tasks ─────────────────────────────────────────────────────────────

const PLM_ORDERS: PrismaReportSource = {
  key: 'plm-orders',
  module: 'plm',
  label: 'PLM Orders',
  description: 'One row per PLM order: buyer, quantities, order/delivery/shipment dates, status and the style or sample it is for.',
  model: 'plmOrder',
  scope: [],
  defaultSort: NEWEST,
  menuSection: SECTION.orders,
  fields: [
    ...own('Order', [
      ['orderNumber', 'Order No'], ['orderType', 'Order Type'], ['buyerName', 'Buyer'], ['customerOrderNo', 'Customer Order No'],
      ['orderGroup', 'Order Group'], ['quantity', 'Quantity', 'number'], ['orderDate', 'Order Date', 'date'],
      ['deliveryDate', 'Delivery Date', 'date'], ['shipmentDate', 'Shipment Date', 'date'], ['status', 'Status'],
      ['totalCost', 'Total Cost', 'number'], ['currency', 'Currency'], ['notes', 'Notes'],
      ['createdAt', 'Created On', 'date'], ['updatedAt', 'Updated On', 'date'],
    ]),
    computed('Order', 'unitCost', 'Cost per Piece', ['totalCost', 'quantity'], ([c, q]) => (q ? round(c / q, 4) : 0)),
    ...related('styleCard', 'Style Card', STYLE_REF),
    ...related('styleCard.customer', 'Style Customer', [['name', 'Customer']]),
    ...related('sampleCard', 'Sample Card', SAMPLE_REF),
    ...related('sampleType', 'Sample Type', [['name', 'Order Sample Type']]),
    ...counts('Counts', [['tasks', 'Tasks']]),
  ],
};

const PLM_TASKS: PrismaReportSource = {
  key: 'plm-tasks',
  module: 'plm',
  label: 'PLM Tasks',
  description: 'One row per PLM task: type, assignee, priority, planned vs actual dates and hours, and its order and style.',
  model: 'plmTask',
  scope: [],
  defaultSort: { field: 'plannedEnd', direction: 'asc' },
  menuSection: SECTION.orders,
  fields: [
    ...own('Task', [
      ['taskNumber', 'Task No'], ['title', 'Task'], ['taskType', 'Task Type'], ['assignedTo', 'Assigned To'], ['priority', 'Priority'],
      ['status', 'Status'], ['plannedStart', 'Planned Start', 'date'], ['plannedEnd', 'Planned End', 'date'],
      ['actualStart', 'Actual Start', 'date'], ['actualEnd', 'Actual End', 'date'], ['estimatedHrs', 'Estimated Hours', 'number'],
      ['actualHrs', 'Actual Hours', 'number'], ['description', 'Description'], ['notes', 'Notes'],
      ['createdAt', 'Created On', 'date'], ['updatedAt', 'Updated On', 'date'],
    ]),
    computed('Task', 'hoursVariance', 'Hours Over/Under Estimate', ['actualHrs', 'estimatedHrs'], ([a, e]) => round(a - e, 2)),
    ...related('plmOrder', 'Order', [['orderNumber', 'Order No'], ['buyerName', 'Buyer'], ['deliveryDate', 'Order Delivery Date', 'date'], ['status', 'Order Status']]),
    ...related('styleCard', 'Style Card', STYLE_REF),
  ],
};

// ── BOM lines ──────────────────────────────────────────────────────────────────

const BOM_LINE: FieldSpec[] = [
  ['lineType', 'Line Type'], ['category', 'Category'], ['fabricCode', 'Material Code'], ['fabricName', 'Material'],
  ['explanation', 'Explanation'], ['placement', 'Placement'], ['component', 'Component'], ['process', 'Process'],
  ['variant', 'Variant'], ['bodyColor', 'Body Color'], ['printColor', 'Print Color'], ['unit', 'Unit'],
  ['quantity', 'Quantity', 'number'], ['wastePct', 'Waste %', 'number'], ['dyeWastagePct', 'Dye Wastage %', 'number'],
  ['otherWastagePct', 'Other Wastage %', 'number'], ['printWastagePct', 'Print Wastage %', 'number'],
  ['unitPrice', 'Unit Price', 'number'], ['forex', 'Currency'], ['marketLength', 'Marker Length', 'number'],
  ['marketWidth', 'Marker Width', 'number'], ['marketWeight', 'Marker Weight', 'number'], ['dia', 'Dia'], ['gauge', 'Gauge'],
  ['finishWidth', 'Finish Width'], ['finishRoute', 'Finish Route'], ['dyeingProcess', 'Dyeing Process'],
  ['dyeingInstruction', 'Dyeing Instruction'], ['revision', 'Revision'], ['reasonRevision', 'Revision Reason'],
  ['condition', 'Condition'], ['orderCondition', 'Order Condition'], ['manProductCode', 'Manufacturer Product Code'],
  ['mainFabric', 'Main Fabric', 'boolean'], ['willBeCut', 'Will Be Cut', 'boolean'],
  ['notForRequirement', 'Not for Requirement', 'boolean'], ['useFixQuantity', 'Fixed Quantity', 'boolean'],
  ['remarks', 'Remarks'], ['sortOrder', 'Line Order', 'number'],
];
const BOM_WASTE = ['wastePct', 'dyeWastagePct', 'otherWastagePct', 'printWastagePct'];
const bomCalcs = (group: string): ReportField[] => [
  computed(group, 'totalWastePct', 'Total Wastage %', BOM_WASTE, (w) => round(w.reduce((a, b) => a + b, 0), 2)),
  computed(group, 'requiredQty', 'Required Qty (incl. Wastage)', ['quantity', ...BOM_WASTE], ([q, ...w]) => round(q * (1 + w.reduce((a, b) => a + b, 0) / 100))),
  computed(group, 'amount', 'Amount', ['quantity', 'unitPrice', ...BOM_WASTE], ([q, p, ...w]) => round(q * (1 + w.reduce((a, b) => a + b, 0) / 100) * p, 2)),
];

const STYLE_BOM_LINES: PrismaReportSource = {
  key: 'style-bom-lines',
  module: 'plm',
  label: 'Style BOM Lines',
  description: 'One row per Style Card BOM line (fabric, trim, ...) with quantities, wastage, required quantity and amount.',
  model: 'styleBomLine',
  scope: ['styleCard'],
  defaultSort: { field: 'sortOrder', direction: 'asc' },
  menuSection: SECTION.bom,
  fields: [
    ...own('BOM Line', BOM_LINE),
    ...bomCalcs('BOM Line'),
    ...related('styleCard', 'Style Card', STYLE_REF),
    ...related('styleCard.customer', 'Style Customer', [['name', 'Customer']]),
    ...related('colorCard', 'Color', [['code', 'Color Code'], ['name', 'Color']]),
  ],
};

const SAMPLE_BOM_LINES: PrismaReportSource = {
  key: 'sample-bom-lines',
  module: 'plm',
  label: 'Sample BOM Lines',
  description: 'One row per Sample Card BOM line with quantities, wastage, required quantity and amount.',
  model: 'sampleBomLine',
  scope: ['sampleCard'],
  defaultSort: { field: 'sortOrder', direction: 'asc' },
  menuSection: SECTION.bom,
  fields: [
    ...own('BOM Line', BOM_LINE),
    ...bomCalcs('BOM Line'),
    ...related('sampleCard', 'Sample Card', SAMPLE_REF),
    ...related('sampleCard.styleCard', 'Style Card', [['styleNumber', 'Style No'], ['title', 'Style Name']]),
    ...related('sampleCard.customer', 'Sample Customer', [['name', 'Customer']]),
    ...related('colorCard', 'Color', [['code', 'Color Code'], ['name', 'Color']]),
  ],
};

// ── Costing lines ──────────────────────────────────────────────────────────────

const COSTING_LINE_GROUP: FieldSpec[] = [['groupCode', 'Group Code'], ['groupName', 'Group'], ['explanation', 'Explanation']];

const COSTING_RAW_MATERIALS: PrismaReportSource = {
  key: 'costing-raw-materials',
  module: 'plm',
  label: 'Costing Raw Material Lines',
  description: 'One row per raw material line of a costing sheet, with quantity, waste, unit price and amount.',
  model: 'costingRawMaterialLine',
  scope: ['costingSheet'],
  defaultSort: { field: 'sortOrder', direction: 'asc' },
  menuSection: SECTION.costing,
  fields: [
    ...own('Raw Material Line', [
      ...COSTING_LINE_GROUP, ['inventoryCode', 'Material Code'], ['inventoryName', 'Material'], ['unit', 'Unit'],
      ['quantity', 'Quantity', 'number'], ['wastePct', 'Waste %', 'number'], ['unitPrice', 'Unit Price', 'number'], ['forex', 'Currency'],
      ['sortOrder', 'Line Order', 'number'],
    ]),
    computed('Raw Material Line', 'amount', 'Amount', ['quantity', 'unitPrice', 'wastePct'], ([q, p, w]) => round(q * p * (1 + w / 100), 2)),
    ...related('costingSheet', 'Costing Sheet', COSTING_REF),
    ...related('costingSheet.styleCard', 'Style Card', [['styleNumber', 'Style No'], ['title', 'Style Name']]),
  ],
};

const COSTING_LABOR: PrismaReportSource = {
  key: 'costing-labor',
  module: 'plm',
  label: 'Costing Labor Lines',
  description: 'One row per labor/process line of a costing sheet, with quantity, waste, unit price and amount.',
  model: 'costingLaborLine',
  scope: ['costingSheet'],
  defaultSort: { field: 'sortOrder', direction: 'asc' },
  menuSection: SECTION.costing,
  fields: [
    ...own('Labor Line', [
      ...COSTING_LINE_GROUP, ['quantity', 'Quantity', 'number'], ['wastePct', 'Waste %', 'number'],
      ['unitPrice', 'Unit Price', 'number'], ['forex', 'Currency'], ['sortOrder', 'Line Order', 'number'],
    ]),
    computed('Labor Line', 'amount', 'Amount', ['quantity', 'unitPrice', 'wastePct'], ([q, p, w]) => round(q * p * (1 + w / 100), 2)),
    ...related('costingSheet', 'Costing Sheet', COSTING_REF),
    ...related('costingSheet.styleCard', 'Style Card', [['styleNumber', 'Style No'], ['title', 'Style Name']]),
  ],
};

const COSTING_OTHER: PrismaReportSource = {
  key: 'costing-other',
  module: 'plm',
  label: 'Costing Other Lines',
  description: 'One row per other-cost line of a costing sheet (testing, freight, ...), with quantity, unit price and amount.',
  model: 'costingOtherLine',
  scope: ['costingSheet'],
  defaultSort: { field: 'sortOrder', direction: 'asc' },
  menuSection: SECTION.costing,
  fields: [
    ...own('Other Cost Line', [
      ...COSTING_LINE_GROUP, ['quantity', 'Quantity', 'number'], ['unitPrice', 'Unit Price', 'number'], ['forex', 'Currency'],
      ['sortOrder', 'Line Order', 'number'],
    ]),
    computed('Other Cost Line', 'amount', 'Amount', ['quantity', 'unitPrice'], ([q, p]) => round(q * p, 2)),
    ...related('costingSheet', 'Costing Sheet', COSTING_REF),
    ...related('costingSheet.styleCard', 'Style Card', [['styleNumber', 'Style No'], ['title', 'Style Name']]),
  ],
};

// ── Products, design & history ─────────────────────────────────────────────────

const PRODUCT_CARDS: PrismaReportSource = {
  key: 'product-cards',
  module: 'plm',
  label: 'Product Cards',
  description: 'One row per Product Card: category, season, target vs actual cost and its Style Card.',
  model: 'productCard',
  scope: [],
  defaultSort: NEWEST,
  menuSection: SECTION.product,
  fields: [
    ...own('Product Card', [
      ['productNumber', 'Product No'], ['title', 'Name'], ['category', 'Category'], ['subCategory', 'Sub-Category'],
      ['gender', 'Gender'], ['season', 'Season'], ['year', 'Year', 'number'], ['status', 'Status'],
      ['targetCost', 'Target Cost', 'number'], ['actualCost', 'Actual Cost', 'number'], ['currency', 'Currency'],
      ['description', 'Description'], ['createdAt', 'Created On', 'date'], ['updatedAt', 'Updated On', 'date'],
    ]),
    computed('Product Card', 'costVariance', 'Cost Variance (Actual − Target)', ['actualCost', 'targetCost'], ([a, t]) => round(a - t, 2)),
    ...related('styleCard', 'Style Card', STYLE_REF),
    ...counts('Counts', [['swatches', 'Swatches'], ['measurements', 'Measurements']]),
  ],
};

const MOOD_BOARDS: PrismaReportSource = {
  key: 'mood-boards',
  module: 'plm',
  label: 'Mood Boards',
  description: 'One row per Mood Board: season, theme, status and how many styles it inspired.',
  model: 'moodBoard',
  scope: [],
  defaultSort: NEWEST,
  menuSection: SECTION.product,
  fields: [
    ...own('Mood Board', [
      ['title', 'Title'], ['season', 'Season'], ['year', 'Year', 'number'], ['theme', 'Theme'], ['status', 'Status'],
      ['description', 'Description'], ['createdAt', 'Created On', 'date'], ['updatedAt', 'Updated On', 'date'],
    ]),
    ...counts('Counts', [['styleCards', 'Styles']]),
  ],
};

const STUDY_TEMPLATES: PrismaReportSource = {
  key: 'study-templates',
  module: 'plm',
  label: 'Study Templates',
  description: 'One row per work-study template: total standard time and the style or sample it belongs to.',
  model: 'studyTemplateCard',
  scope: [],
  defaultSort: NEWEST,
  menuSection: SECTION.product,
  fields: [
    ...own('Study Template', [
      ['name', 'Name'], ['description', 'Description'], ['totalTime', 'Total Time (min)', 'number'],
      ['isActive', 'Active', 'boolean'], ['createdAt', 'Created On', 'date'],
    ]),
    ...related('styleCard', 'Style Card', STYLE_REF),
    ...related('sampleCard', 'Sample Card', SAMPLE_REF),
    ...counts('Counts', [['lines', 'Operations']]),
  ],
};

const SAMPLE_HISTORY: PrismaReportSource = {
  key: 'sample-history',
  module: 'plm',
  label: 'Sample Status History',
  description: 'One row per Sample Card status change: what changed, from/to status, who and when.',
  model: 'sampleCardHistory',
  scope: ['sampleCard'],
  defaultSort: NEWEST,
  menuSection: SECTION.sample,
  fields: [
    ...own('Status Change', [
      ['createdAt', 'Changed On', 'date'], ['action', 'Action'], ['fromStatus', 'From Status'], ['toStatus', 'To Status'],
      ['changedBy', 'Changed By'], ['notes', 'Notes'],
    ]),
    ...related('sampleCard', 'Sample Card', [...SAMPLE_REF, ['dueDate', 'Sample Due Date', 'date']]),
    ...related('sampleCard.sampleType', 'Sample Type', [['name', 'Sample Type']]),
    ...related('sampleCard.customer', 'Sample Customer', [['name', 'Customer']]),
  ],
};

// ── Docket Management ──────────────────────────────────────────────────────────

const DOCKET_SECTION = {
  dockets: { title: 'Docket Reports', icon: 'FolderOpen' },
  documents: { title: 'Document Reports', icon: 'FileText' },
  audit: { title: 'Approval & Audit Reports', icon: 'ClipboardCheck' },
  setup: { title: 'Docket Setup Reports', icon: 'Settings' },
};
const DOCKET_REF: FieldSpec[] = [
  ['docketNumber', 'Docket No'], ['title', 'Docket'], ['entityType', 'Docket For'], ['status', 'Docket Status'],
  ['completeness', 'Docket Completeness %', 'number'],
];
const DOC_TYPE_REF: FieldSpec[] = [['code', 'Document Type Code'], ['name', 'Document Type'], ['category', 'Document Category']];

const DOCKETS: PrismaReportSource = {
  key: 'dockets',
  module: 'docket',
  label: 'Dockets',
  description: 'One row per docket (style, sample, product or order docket) with status, completeness and item counts.',
  model: 'docket',
  scope: [],
  defaultSort: NEWEST,
  menuSection: DOCKET_SECTION.dockets,
  fields: [
    ...own('Docket', [
      ['docketNumber', 'Docket No'], ['title', 'Title'], ['entityType', 'Docket For'], ['status', 'Status'],
      ['completeness', 'Completeness %', 'number'], ['totalItems', 'Total Items', 'number'], ['approvedItems', 'Approved Items', 'number'],
      ['pendingItems', 'Pending Items', 'number'], ['missingItems', 'Missing Items', 'number'],
      ['lockedAt', 'Locked On', 'date'], ['lockedBy', 'Locked By'], ['approvedAt', 'Approved On', 'date'], ['approvedBy', 'Approved By'],
      ['createdBy', 'Created By'], ['createdAt', 'Created On', 'date'], ['updatedAt', 'Updated On', 'date'],
    ]),
    computed('Docket', 'outstanding', 'Outstanding Items (Pending + Missing)', ['pendingItems', 'missingItems'], ([p, m]) => p + m),
    ...related('template', 'Template', [['code', 'Template Code'], ['name', 'Template']]),
    ...counts('Counts', [['items', 'Items'], ['shareLinks', 'Share Links'], ['auditLogs', 'Audit Entries']]),
  ],
};

const DOCKET_ITEMS: PrismaReportSource = {
  key: 'docket-items',
  module: 'docket',
  label: 'Docket Items',
  description: 'One row per required document slot of a docket: status, due and expiry dates, approval and rejection details.',
  model: 'docketItem',
  scope: ['docket'],
  defaultSort: { field: 'dueDate', direction: 'asc' },
  menuSection: DOCKET_SECTION.documents,
  fields: [
    ...own('Docket Item', [
      ['title', 'Item'], ['status', 'Status'], ['isRequired', 'Required', 'boolean'], ['sequence', 'Sequence', 'number'],
      ['currentVersion', 'Current Version'], ['dueDate', 'Due Date', 'date'], ['expiryDate', 'Expiry Date', 'date'],
      ['approvedBy', 'Approved By'], ['approvedAt', 'Approved On', 'date'], ['rejectedBy', 'Rejected By'], ['rejectedAt', 'Rejected On', 'date'],
      ['rejectionReason', 'Rejection Reason'], ['notes', 'Notes'],
    ]),
    ...related('docket', 'Docket', DOCKET_REF),
    ...related('documentTypeCard', 'Document Type', [...DOC_TYPE_REF, ['requiresApproval', 'Type Requires Approval', 'boolean'], ['expiryDays', 'Type Validity (Days)', 'number']]),
    ...counts('Counts', [['documents', 'Uploaded Versions'], ['approvalHistory', 'Approval Actions']]),
  ],
};

const DOCKET_DOCUMENTS: PrismaReportSource = {
  key: 'docket-documents',
  module: 'docket',
  label: 'Docket Documents (Files)',
  description: 'One row per uploaded file version: file name, type, size, version, uploader and the docket item it belongs to.',
  model: 'docketDocument',
  scope: ['docketItem', 'docket'],
  defaultSort: { field: 'uploadedAt', direction: 'desc' },
  menuSection: DOCKET_SECTION.documents,
  fields: [
    ...own('Document', [
      ['documentNumber', 'Document No'], ['fileName', 'File Name'], ['fileType', 'File Type'], ['fileSizeMb', 'Size (MB)', 'number'],
      ['version', 'Version'], ['versionNotes', 'Version Notes'], ['isLatest', 'Latest Version', 'boolean'],
      ['isWatermarked', 'Watermarked', 'boolean'], ['uploadedBy', 'Uploaded By'], ['uploadedAt', 'Uploaded On', 'date'],
    ]),
    ...related('docketItem', 'Docket Item', [['title', 'Item'], ['status', 'Item Status']]),
    ...related('docketItem.documentTypeCard', 'Document Type', DOC_TYPE_REF),
    ...related('docketItem.docket', 'Docket', DOCKET_REF),
  ],
};

const DOCKET_APPROVALS: PrismaReportSource = {
  key: 'docket-approvals',
  module: 'docket',
  label: 'Docket Approval History',
  description: 'One row per approval action on a docket item: approved, rejected, revision requested — who, when and why.',
  model: 'docketItemApproval',
  scope: ['docketItem', 'docket'],
  defaultSort: NEWEST,
  menuSection: DOCKET_SECTION.audit,
  fields: [
    ...own('Approval Action', [
      ['createdAt', 'Action On', 'date'], ['action', 'Action'], ['actionBy', 'Action By'], ['fromStatus', 'From Status'],
      ['toStatus', 'To Status'], ['comments', 'Comments'], ['documentVersion', 'Document Version'],
    ]),
    ...related('docketItem', 'Docket Item', [['title', 'Item'], ['status', 'Current Item Status']]),
    ...related('docketItem.documentTypeCard', 'Document Type', DOC_TYPE_REF),
    ...related('docketItem.docket', 'Docket', DOCKET_REF),
  ],
};

const DOCKET_AUDIT: PrismaReportSource = {
  key: 'docket-audit',
  module: 'docket',
  label: 'Docket Audit Log',
  description: 'One row per docket audit entry: what happened, who did it, when and from which IP address.',
  model: 'docketAuditLog',
  scope: ['docket'],
  defaultSort: NEWEST,
  menuSection: DOCKET_SECTION.audit,
  fields: [
    ...own('Audit Entry', [
      ['createdAt', 'On', 'date'], ['action', 'Action'], ['entityRef', 'Reference'], ['changedBy', 'Changed By'], ['ipAddress', 'IP Address'],
    ]),
    ...related('docket', 'Docket', DOCKET_REF),
  ],
};

const DOCKET_SHARE_LINKS: PrismaReportSource = {
  key: 'docket-share-links',
  module: 'docket',
  label: 'Docket Share Links',
  description: 'One row per docket share link: who it was shared with, access type, expiry and usage. Link tokens and passwords are never exposed.',
  model: 'docketShareLink',
  scope: ['docket'],
  defaultSort: NEWEST,
  menuSection: DOCKET_SECTION.audit,
  fields: [
    ...own('Share Link', [
      ['title', 'Title'], ['accessType', 'Access Type'], ['sharedWith', 'Shared With'], ['sharedBy', 'Shared By'],
      ['expiresAt', 'Expires On', 'date'], ['isActive', 'Active', 'boolean'], ['lastAccessedAt', 'Last Accessed', 'date'],
      ['accessCount', 'Access Count', 'number'], ['watermark', 'Watermarked', 'boolean'], ['createdAt', 'Created On', 'date'],
    ]),
    ...related('docket', 'Docket', DOCKET_REF),
    ...counts('Counts', [['accessLogs', 'Access Log Entries']]),
  ],
};

const DOCUMENT_TYPES: PrismaReportSource = {
  key: 'document-types',
  module: 'docket',
  label: 'Document Types',
  description: 'One row per document type: category, size limit, approval requirement, validity and how often it is used.',
  model: 'documentTypeCard',
  scope: [],
  scopeIncludesShared: true,
  defaultSort: { field: 'code', direction: 'asc' },
  menuSection: DOCKET_SECTION.setup,
  fields: [
    ...own('Document Type', [
      ['code', 'Code'], ['name', 'Name'], ['category', 'Category'], ['description', 'Description'], ['maxSizeMb', 'Max Size (MB)', 'number'],
      ['requiresApproval', 'Requires Approval', 'boolean'], ['expiryDays', 'Validity (Days)', 'number'], ['isActive', 'Active', 'boolean'],
      ['createdAt', 'Created On', 'date'],
    ]),
    ...counts('Usage', [['docketItems', 'Docket Items'], ['docketTemplateItems', 'Used in Templates']]),
  ],
};

const DOCKET_TEMPLATES: PrismaReportSource = {
  key: 'docket-templates',
  module: 'docket',
  label: 'Docket Templates',
  description: 'One row per docket template: what it is for, whether it is the default, its documents and how many dockets use it.',
  model: 'docketTemplate',
  scope: [],
  scopeIncludesShared: true,
  defaultSort: { field: 'code', direction: 'asc' },
  menuSection: DOCKET_SECTION.setup,
  fields: [
    ...own('Template', [
      ['code', 'Code'], ['name', 'Name'], ['entityType', 'Template For'], ['description', 'Description'],
      ['isDefault', 'Default', 'boolean'], ['isActive', 'Active', 'boolean'], ['createdBy', 'Created By'], ['createdAt', 'Created On', 'date'],
    ]),
    ...counts('Usage', [['items', 'Documents in Template'], ['dockets', 'Dockets Using It']]),
  ],
};

const DOCKET_SOURCES: PrismaReportSource[] = [
  DOCKETS, DOCKET_ITEMS, DOCKET_DOCUMENTS, DOCKET_APPROVALS, DOCKET_AUDIT, DOCKET_SHARE_LINKS, DOCUMENT_TYPES, DOCKET_TEMPLATES,
];

export const REPORT_SOURCES: ReportSource[] = [
  ...LEGACY_REPORT_SOURCES,
  STYLE_CARDS, SAMPLE_CARDS, COSTING_SHEETS,
  PLM_ORDERS, PLM_TASKS,
  STYLE_BOM_LINES, SAMPLE_BOM_LINES,
  COSTING_RAW_MATERIALS, COSTING_LABOR, COSTING_OTHER,
  PRODUCT_CARDS, MOOD_BOARDS, STUDY_TEMPLATES, SAMPLE_HISTORY,
  ...DOCKET_SOURCES,
];

export function findReportSource(key: string, module?: string): ReportSource | undefined {
  return REPORT_SOURCES.find((s) => s.key === key && (!module || s.module === module));
}

/** Every menu section title any source uses (so empty ones can be recognised and removed). */
export const REPORT_SECTION_TITLES = new Set(REPORT_SOURCES.map((s) => s.menuSection.title));

/** Filter operators per field type. Count and computed fields are not filterable. */
export const OPERATORS: Record<ReportFieldType, string[]> = {
  string: ['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'isEmpty', 'isNotEmpty'],
  date: ['on', 'before', 'after', 'between', 'isEmpty', 'isNotEmpty'],
  boolean: ['isTrue', 'isFalse'],
};

/** Operators that take no value. */
export const VALUELESS_OPERATORS = new Set(['isEmpty', 'isNotEmpty', 'isTrue', 'isFalse']);
