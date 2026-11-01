import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { ListPaging, runLegacyList } from './list-paging.util';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { nextLegacySeqCode, previewLegacySeqCode } from './legacy-code-sequence.util';
import { getReceiptTypeConfig, invoiceSourceReceiptTypes } from './receipt-types.config';
import { assertSameCompany, currentLegacyCompany } from './legacy-company-scope';

// Invoice — the legacy IM_Invoice table (168 columns, already in the migrated schema, 0 rows and no
// previous reader/writer: this is its first). The legacy design, verified against the live schema:
// an invoice header (IM_Invoice) is linked to ONE Inventory Receipt (IM_Invoice.InventoryReceiptId ->
// IM_Receipt, and back via IM_Receipt.InvoiceId). IM_Invoice has no line table and no Shipment Date
// or order column — its detail lines, Shipment Date, Receipt Document and Order (the receipt's
// Subcontract Order, IM_Receipt.ScriptId) are the linked receipt's, read and written through the
// Inventory Receipt's own APIs and rules (inventory-receipt.service.ts). No new table or column.
//
// Invoice type = IM_Invoice.ReceiptType, numbered like the receipt type it invoices (2 = Purchase
// Receipt invoices, ...) — the database has no invoice-type list. One invoice per receipt; the
// receipt must be of the same type. Totals (SubTotal / VatAmount / GrandTotal) are the linked
// receipt's line amounts summed the way Purchase Order's header totals are (Subtotal = Σ ItemTotal,
// Grand Total = Σ NetItemTotal, VAT = the difference), stored on every save / approve.
//
// Approve / Unapprove: IsApproved / ApprovedAt / ApprovedBy, behind approval:approve (controller),
// same as the Packing List and Inventory Receipts. An approved invoice is locked (header, receipt
// link, attachments, delete) and also locks its receipt's lines (inventory-receipt.service.ts
// assertUnlocked). Nothing here posts stock or accounting: stock stays the receipt's.
// Company isolation: every invoice belongs to the request's legacy company (IM_Invoice.CompanyId /
// WorkplaceId, from legacy-company-scope.ts — never client input); lists, reads, writes and the
// receipt it links to are all limited to that company. Another company's invoice is "not found".

const TABLE = 'IM_Invoice';
const WRITABLE = [
  'ReceiptDate', 'DocumentNo', 'CurrentAccountId', 'InWarehouseId', 'InventoryReceiptId',
  'Explanation', 'SpecialCode', 'CustomerOrderNo', 'EximInvoiceNo', 'IsEximReceipt',
] as const;
const SELECT_COLUMNS = ['ReceiptType', 'ReceiptNo', ...WRITABLE, 'SubTotal', 'VatAmount', 'GrandTotal', 'IsApproved', 'ApprovedAt', 'ApprovedBy'] as const;
/** The invoice list's own header columns — every list() row carries each of them (camelCase), so the
 *  invoice lists' Customize Worklist (worklist-fields.service.ts 'invoice') projects them client-side. */
export const INVOICE_WORKLIST_COLUMNS = SELECT_COLUMNS.filter((c) => c !== 'ReceiptType');
// Create Invoice from a receipt (createFromReceipt): every business header column IM_Receipt and
// IM_Invoice share, copied from the receipt's SAVED row. Not copied: identity / numbering
// (RecId, ReceiptNo, ReceiptType — the invoice's own), CompanyId (the request's company, which is the
// receipt's), totals (computed from the receipt's lines, see totalsFor), links to other documents
// (WorkOrderReceiptId, GLReceiptId, CurrentAccountReceiptId, CustomerTransactionId, SourceReceiptId),
// GPS, print / check / copy counters and every status / audit column. Receipt-only fields with no
// IM_Invoice column — Shipment Date/Time, Vehicle No (PlateNumber), Driver Name (DriverName), the
// Order (ScriptId), the UD_* LC / FI fields, e-Despatch, Subcontract Type — and the detail lines stay
// the receipt's and are shown on the invoice through its link (LABELS, the receipt's line grid).
const RECEIPT_HEADER_COPY = [
  'WorkplaceId', 'ReceiptSubType', 'ReceiptDate', 'ReceiptTime', 'DocumentNo', 'CurrentAccountId', 'AddressId',
  'ShipToCurrentAccountId', 'ShipToAddressId', 'InWarehouseId', 'OutWarehouseId', 'CostCenterId', 'DealerId', 'CustomerId',
  'CustomerAddressId', 'PaymentPlanId', 'CustomerOrderNo', 'SpecialCode', 'AccessCode', 'EximInvoiceNo', 'ProjectId',
  'EmployeeId', 'ContactId', 'CashId', 'TransporterId', 'VehicleId', 'HasNegativeEffect', 'Explanation', 'IsTaxExempted',
  'WithholdingTypeId', 'WithholdingFactor', 'WithholdingDivisor', 'Rate1', 'Rate2', 'Rate3', 'Rate4', 'Rate5',
  'ForexId', 'ForexRate', 'IsEximReceipt', 'TypeOfShipment',
] as const;
const camel = (c: string) => c[0].toLowerCase() + c.slice(1);
const SELECT = Prisma.raw(['v."RecId" as id', ...SELECT_COLUMNS.map((c) => `v."${c}" as "${camel(c)}"`)].join(', '));
// Consolidated invoices: one invoice may cover several receipts of its type and Current Account. The
// legacy schema already models that — IM_Receipt.InvoiceId -> IM_Invoice is a plain, non-unique FK
// (many receipts, one invoice) — so no schema change: every included receipt carries the invoice in
// IM_Receipt.InvoiceId, and IM_Invoice.InventoryReceiptId stays its FIRST receipt (the header source,
// and what single-receipt invoices always had). A receipt's invoice is therefore either link.
/** The live invoice receipt `alias` is on (either link), `except` an invoice being edited. */
const liveInvoiceOf = (alias: string, except?: number) => Prisma.sql`
  SELECT v."RecId", v."ReceiptNo" FROM "IM_Invoice" v
  WHERE COALESCE(v."IsDeleted", 0) = 0 AND (v."RecId" = ${Prisma.raw(`${alias}."InvoiceId"`)} OR v."InventoryReceiptId" = ${Prisma.raw(`${alias}."RecId"`)})
    ${except ? Prisma.sql`AND v."RecId" <> ${except}` : Prisma.empty}
  ORDER BY v."RecId" LIMIT 1`;
/** Receipts of invoice `v` (alias x): its first receipt and every receipt pointing at it. */
const RECEIPTS_OF_V = Prisma.sql`COALESCE(x."IsDeleted", 0) = 0 AND (x."InvoiceId" = v."RecId" OR x."RecId" = v."InventoryReceiptId")`;
// Display labels: account, warehouse, the receipt numbers (first receipt first) and the first
// receipt's own fields the invoice shows; "receiptApproved" when ANY included receipt is approved.
const JOINS = Prisma.sql`
  LEFT JOIN "FI_Account" acc ON acc."RecId" = v."CurrentAccountId"
  LEFT JOIN "IM_Warehouse" wh ON wh."RecId" = v."InWarehouseId"
  LEFT JOIN "IM_Receipt" r ON r."RecId" = v."InventoryReceiptId" AND COALESCE(r."IsDeleted", 0) = 0
  LEFT JOIN "IM_OrderReceipt" so ON so."RecId" = r."ScriptId"
  LEFT JOIN LATERAL (SELECT string_agg(x."ReceiptNo", ', ' ORDER BY (x."RecId" = v."InventoryReceiptId") DESC, x."RecId") AS nos,
    count(*)::int AS n, MAX(COALESCE(x."IsApproved", 0))::int AS approved FROM "IM_Receipt" x WHERE ${RECEIPTS_OF_V}) rs ON true`;
const LABELS = Prisma.sql`
  acc."CurrentAccountCode" as "currentAccountCode", acc."CurrentAccountName" as "currentAccountName",
  wh."WarehouseCode" as "warehouseCode", wh."WarehouseName" as "warehouseName",
  rs.nos as "inventoryReceiptNo", COALESCE(rs.n, 0) as "receiptCount", r."ShipmentDate" as "shipmentDate", r."DocumentNo" as "receiptDocumentNo",
  r."PlateNumber" as "vehicleNo", r."DriverName" as "driverName",
  COALESCE(rs.approved, 0)::int as "receiptApproved", r."ScriptId" as "orderId", so."ReceiptNo" as "orderNo"`;

export const invoiceScreenKey = (receiptType: number) => `/legacy-erp/receipt-invoices?receiptType=${receiptType}`;
const codePrefix = (receiptType: number) => `INV${receiptType}`;

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private type(receiptType: number) {
    const cfg = getReceiptTypeConfig(Number(receiptType));
    if (!cfg) throw new NotFoundException(`Unknown receipt type "${receiptType}"`);
    return cfg;
  }
  private async toDb() { return buildDbValueCoercer(await getColumnTypeMap(this.prisma, TABLE)); }

  async list(receiptType: number, search?: string, paging: ListPaging | null = null) {
    this.type(receiptType);
    const cid = (await currentLegacyCompany(this.prisma)).legacyCompanyId;
    const like = search ? `%${search}%` : null;
    const filter = like ? Prisma.sql`AND (v."ReceiptNo" ILIKE ${like} OR rs.nos ILIKE ${like} OR acc."CurrentAccountName" ILIKE ${like} OR v."DocumentNo" ILIKE ${like})` : Prisma.empty;
    return runLegacyList(this.prisma, {
      select: Prisma.sql`${SELECT}, ${LABELS}`,
      from: Prisma.sql`FROM "IM_Invoice" v ${JOINS} WHERE COALESCE(v."IsDeleted", 0) = 0 AND v."ReceiptType" = ${receiptType} AND v."CompanyId" = ${cid} ${filter}`,
      sortable: {
        receiptNo: Prisma.sql`v."ReceiptNo"`, receiptDate: Prisma.sql`v."ReceiptDate"`, currentAccountName: Prisma.sql`acc."CurrentAccountName"`, inventoryReceiptNo: Prisma.sql`rs.nos`,
        documentNo: Prisma.sql`v."DocumentNo"`, grandTotal: Prisma.sql`v."GrandTotal"`, isApproved: Prisma.sql`COALESCE(v."IsApproved", 0)`,
      },
      defaultSortBy: 'receiptNo', defaultSortDir: 'desc', tiebreak: Prisma.sql`v."RecId"`, legacyLimit: 50,
    }, paging, sanitizeRawRow);
  }

  async get(id: number, receiptType: number) {
    const cid = (await currentLegacyCompany(this.prisma)).legacyCompanyId;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${SELECT}, ${LABELS} FROM "IM_Invoice" v ${JOINS}
      WHERE v."RecId" = ${id} AND COALESCE(v."IsDeleted", 0) = 0 AND v."ReceiptType" = ${receiptType} AND v."CompanyId" = ${cid}`);
    if (!rows.length) throw new NotFoundException('Invoice not found');
    const row = sanitizeRawRow(rows[0]);
    const receipts = await this.receiptsOf(id);
    return { ...row, isApproved: Number(row.isApproved) ? 1 : 0, receipts, inventoryReceiptIds: receipts.map((r: any) => Number(r.id)) };
  }

  /** The receipts an invoice covers (first receipt first): number, date, document, account, lines and
   *  their amounts — the invoice screen shows each one's lines under its number. */
  private async receiptsOf(invoiceId: number, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const rows = await client.$queryRaw<any[]>(Prisma.sql`
      SELECT x."RecId" as id, x."ReceiptNo" as "receiptNo", x."ReceiptDate" as "receiptDate", x."DocumentNo" as "documentNo",
        x."CurrentAccountId" as "currentAccountId", COALESCE(x."IsApproved", 0)::int as "isApproved",
        li.lines, li.sub::float as "subTotal", li.grand::float as "grandTotal"
      FROM "IM_Invoice" v JOIN "IM_Receipt" x ON ${RECEIPTS_OF_V}
      CROSS JOIN LATERAL (SELECT count(*)::int AS lines, COALESCE(SUM(i."ItemTotal"), 0) AS sub, COALESCE(SUM(i."NetItemTotal"), 0) AS grand
        FROM "IM_ReceiptItem" i WHERE i."InventoryReceiptId" = x."RecId" AND COALESCE(i."IsDeleted", 0) = 0) li
      WHERE v."RecId" = ${invoiceId}
      ORDER BY (x."RecId" = v."InventoryReceiptId") DESC, x."RecId"`);
    return rows.map(sanitizeRawRow);
  }

  previewNextCode(receiptType: number) {
    this.type(receiptType);
    return previewLegacySeqCode(this.prisma, `${TABLE}_${receiptType}`, codePrefix(receiptType), TABLE, 'ReceiptNo', 8);
  }

  /** Receipts of this type that can be invoiced: not deleted, not on another live invoice — and, given
   *  a Current Account, only that account's (by FI_Account id). */
  async receiptCandidates(receiptType: number, search?: string, invoiceId?: number, paging: ListPaging | null = null, currentAccountId?: number) {
    this.type(receiptType);
    const cid = (await currentLegacyCompany(this.prisma)).legacyCompanyId;
    const like = search ? `%${search}%` : null;
    const filter = Prisma.sql`${like ? Prisma.sql`AND (r."ReceiptNo" ILIKE ${like} OR r."DocumentNo" ILIKE ${like} OR acc."CurrentAccountName" ILIKE ${like})` : Prisma.empty}
      ${currentAccountId ? Prisma.sql`AND r."CurrentAccountId" = ${currentAccountId}` : Prisma.empty}`;
    return runLegacyList(this.prisma, {
      select: Prisma.sql`r."RecId" as id, r."ReceiptNo" as "receiptNo", r."ReceiptDate" as "receiptDate", r."DocumentNo" as "documentNo",
        r."CurrentAccountId" as "currentAccountId", r."InWarehouseId" as "inWarehouseId", acc."CurrentAccountName" as "currentAccountName",
        COALESCE(r."IsApproved", 0)::int as "isApproved"`,
      from: Prisma.sql`FROM "IM_Receipt" r LEFT JOIN "FI_Account" acc ON acc."RecId" = r."CurrentAccountId"
        WHERE COALESCE(r."IsDeleted", 0) = 0 AND r."ReceiptType" = ${receiptType} AND r."CompanyId" = ${cid} ${filter}
        AND NOT EXISTS (${liveInvoiceOf('r', invoiceId)})`,
      sortable: { receiptNo: Prisma.sql`r."ReceiptNo"`, receiptDate: Prisma.sql`r."ReceiptDate"`, currentAccountName: Prisma.sql`acc."CurrentAccountName"` },
      defaultSortBy: 'receiptNo', defaultSortDir: 'desc', tiebreak: Prisma.sql`r."RecId"`, legacyLimit: 50,
    }, paging, sanitizeRawRow);
  }

  private isSourceType(invoiceType: number, receiptType: unknown) {
    return invoiceSourceReceiptTypes(invoiceType).includes(Number(receiptType));
  }

  /** Create New's Source Receipt picker: the receipt types this invoice type invoices
   *  (receipt-types.config.ts invoiceSourceReceiptTypes — one for every type today). */
  sourceReceiptTypes(invoiceType: number) {
    this.type(invoiceType);
    return invoiceSourceReceiptTypes(invoiceType).map((t) => ({ receiptType: t, label: getReceiptTypeConfig(t)!.label }));
  }

  /**
   * Create New's receipt list: the company's saved receipts of `sourceType` (one of this invoice
   * type's source types, else 400) that have at least one line — what an invoice's totals need —
   * and, given a Current Account, only that account's (matched by FI_Account id). Receipts already
   * on a live invoice (either link) are listed with that invoice (invoiceId / invoiceNo): the screen
   * never selects them, it offers to open that invoice. Searchable by receipt no, document, current
   * account code / name.
   */
  async sourceReceipts(invoiceType: number, sourceType: number, search?: string, paging: ListPaging | null = null, currentAccountId?: number) {
    this.type(invoiceType);
    if (!this.isSourceType(invoiceType, sourceType)) throw new BadRequestException(`Receipt type ${sourceType} cannot be invoiced as a ${this.type(invoiceType).label} invoice`);
    const cid = (await currentLegacyCompany(this.prisma)).legacyCompanyId;
    const like = search ? `%${search}%` : null;
    const filter = Prisma.sql`${like ? Prisma.sql`AND (r."ReceiptNo" ILIKE ${like} OR r."DocumentNo" ILIKE ${like} OR acc."CurrentAccountCode" ILIKE ${like} OR acc."CurrentAccountName" ILIKE ${like})` : Prisma.empty}
      ${currentAccountId ? Prisma.sql`AND r."CurrentAccountId" = ${currentAccountId}` : Prisma.empty}`;
    return runLegacyList(this.prisma, {
      select: Prisma.sql`r."RecId" as id, r."ReceiptType"::int as "receiptType", r."ReceiptNo" as "receiptNo", r."ReceiptDate" as "receiptDate", r."DocumentNo" as "documentNo",
        r."CurrentAccountId" as "currentAccountId", acc."CurrentAccountCode" as "currentAccountCode", acc."CurrentAccountName" as "currentAccountName", COALESCE(r."IsApproved", 0)::int as "isApproved",
        li.lines, li.total::float as "grandTotal", inv."RecId" as "invoiceId", inv."ReceiptNo" as "invoiceNo"`,
      from: Prisma.sql`FROM "IM_Receipt" r
        LEFT JOIN "FI_Account" acc ON acc."RecId" = r."CurrentAccountId"
        CROSS JOIN LATERAL (SELECT count(*)::int AS lines, COALESCE(SUM(i."NetItemTotal"), 0) AS total FROM "IM_ReceiptItem" i
          WHERE i."InventoryReceiptId" = r."RecId" AND COALESCE(i."IsDeleted", 0) = 0) li
        LEFT JOIN LATERAL (${liveInvoiceOf('r')}) inv ON true
        WHERE COALESCE(r."IsDeleted", 0) = 0 AND r."ReceiptType" = ${sourceType} AND r."CompanyId" = ${cid} AND li.lines > 0 ${filter}`,
      sortable: { receiptNo: Prisma.sql`r."ReceiptNo"`, receiptDate: Prisma.sql`r."ReceiptDate"`, currentAccountName: Prisma.sql`acc."CurrentAccountName"` },
      defaultSortBy: 'receiptNo', defaultSortDir: 'desc', tiebreak: Prisma.sql`r."RecId"`, legacyLimit: 50,
    }, paging, sanitizeRawRow);
  }

  /**
   * A picked source receipt as a new invoice's header: its SAVED header fields (the invoice form's
   * own fields) with display labels, and the receipt-only fields the invoice shows (Shipment Date,
   * Receipt Document, Vehicle No, Driver Name, Order). Its lines are not copied — the invoice shows
   * the receipt's own. `invoiceId` / `invoiceNo` when it is already invoiced. Another company's
   * receipt is 404; a receipt of a type this invoice type does not invoice is 400.
   */
  async sourceReceipt(invoiceType: number, receiptId: number) {
    this.type(invoiceType);
    const cid = (await currentLegacyCompany(this.prisma)).legacyCompanyId;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT r."RecId" as id, r."ReceiptType"::int as "receiptType", r."ReceiptNo" as "receiptNo",
        ${Prisma.raw(WRITABLE.filter((c) => c !== 'InventoryReceiptId').map((c) => `r."${c}" as "${camel(c)}"`).join(', '))},
        acc."CurrentAccountCode" as "currentAccountCode", acc."CurrentAccountName" as "currentAccountName",
        wh."WarehouseCode" as "warehouseCode", wh."WarehouseName" as "warehouseName",
        r."ShipmentDate" as "shipmentDate", r."PlateNumber" as "vehicleNo", r."DriverName" as "driverName",
        COALESCE(r."IsApproved", 0)::int as "isApproved", r."ScriptId" as "orderId", so."ReceiptNo" as "orderNo",
        (SELECT count(*)::int FROM "IM_ReceiptItem" i WHERE i."InventoryReceiptId" = r."RecId" AND COALESCE(i."IsDeleted", 0) = 0) as lines,
        inv."RecId" as "invoiceId", inv."ReceiptNo" as "invoiceNo"
      FROM "IM_Receipt" r
      LEFT JOIN "FI_Account" acc ON acc."RecId" = r."CurrentAccountId"
      LEFT JOIN "IM_Warehouse" wh ON wh."RecId" = r."InWarehouseId"
      LEFT JOIN "IM_OrderReceipt" so ON so."RecId" = r."ScriptId"
      LEFT JOIN LATERAL (${liveInvoiceOf('r')}) inv ON true
      WHERE r."RecId" = ${receiptId} AND COALESCE(r."IsDeleted", 0) = 0 AND r."CompanyId" = ${cid}`);
    const r = rows[0] && sanitizeRawRow(rows[0]);
    if (!r) throw new NotFoundException('Inventory Receipt not found');
    if (!this.isSourceType(invoiceType, r.receiptType)) throw new BadRequestException(`Receipt ${r.receiptNo} is not a ${this.type(invoiceType).label}`);
    return r;
  }

  /** The linked receipt must exist, be of the invoice's type and not be on another live invoice.
   *  Called again inside the write transaction with `lock`: the receipt row is locked first (FOR
   *  UPDATE, its own statement), so a simultaneous save waits for the other to commit; the check
   *  below is then a NEW statement, which under READ COMMITTED sees that commit. (A sub-select in
   *  the locking statement itself would still use the pre-lock snapshot and miss it.) */
  private async assertReceipt(receiptId: number, receiptType: number, invoiceId?: number, client: Prisma.TransactionClient | PrismaService = this.prisma, lock = false) {
    const cid = (await currentLegacyCompany(this.prisma)).legacyCompanyId;
    if (lock) await client.$queryRaw(Prisma.sql`SELECT 1 FROM "IM_Receipt" WHERE "RecId" = ${receiptId} FOR UPDATE`);
    const rows = await client.$queryRaw<any[]>(Prisma.sql`
      SELECT r."RecId" as id, r."ReceiptNo" as "receiptNo", r."ReceiptType" as "receiptType", r."CurrentAccountId" as "currentAccountId", r."InWarehouseId" as "inWarehouseId",
        (SELECT count(*)::int FROM "IM_ReceiptItem" i WHERE i."InventoryReceiptId" = r."RecId" AND COALESCE(i."IsDeleted", 0) = 0) as lines,
        (SELECT o."ReceiptNo" FROM (${liveInvoiceOf('r', invoiceId)}) o) as "otherInvoice"
      FROM "IM_Receipt" r WHERE r."RecId" = ${receiptId} AND COALESCE(r."IsDeleted", 0) = 0 AND r."CompanyId" = ${cid}`);
    const r = rows[0] && sanitizeRawRow(rows[0]);
    if (!r) throw new BadRequestException(`Inventory Receipt ${receiptId} does not exist`);
    if (!this.isSourceType(receiptType, r.receiptType)) throw new BadRequestException(`Inventory Receipt ${receiptId} is not a ${this.type(receiptType).label}`);
    if (r.otherInvoice) throw new ConflictException(`Inventory Receipt ${r.receiptNo ?? receiptId} is already on invoice ${r.otherInvoice}`);
    return r;
  }

  /** assertReceipt for every receipt of an invoice. With `lock`, all of them are locked first in one
   *  statement, in RecId order (two overlapping saves can't deadlock), then each is re-checked. */
  private async assertReceipts(ids: number[], receiptType: number, invoiceId?: number, client: Prisma.TransactionClient | PrismaService = this.prisma, lock = false) {
    if (lock) await client.$queryRaw(Prisma.sql`SELECT 1 FROM "IM_Receipt" WHERE "RecId" IN (${Prisma.join(ids)}) ORDER BY "RecId" FOR UPDATE`);
    const out: any[] = [];
    for (const id of ids) out.push(await this.assertReceipt(id, receiptType, invoiceId, client, false));
    return out;
  }

  /** A consolidated invoice (2+ receipts): every receipt has lines and the SAME Current Account (by
   *  FI_Account id), which is also the invoice's. (Type, company and one-invoice-per-receipt are
   *  assertReceipt's.) A single-receipt invoice keeps its existing rules. */
  private assertConsolidable(rs: any[], invoiceAccountId: unknown) {
    if (rs.length < 2) return;
    for (const r of rs) if (!Number(r.lines)) throw new BadRequestException(`Receipt ${r.receiptNo} has no lines — it can't be added to an invoice.`);
    const account = Number(rs[0].currentAccountId) || null;
    if (!account) throw new BadRequestException(`Receipt ${rs[0].receiptNo} has no Current Account — receipts can only be combined for one Current Account.`);
    const other = rs.find((r) => Number(r.currentAccountId) !== account);
    if (other) throw new BadRequestException(`Receipts of different Current Accounts can't be on one invoice (${rs[0].receiptNo} and ${other.receiptNo}).`);
    if (invoiceAccountId !== undefined && invoiceAccountId !== null && invoiceAccountId !== '' && Number(invoiceAccountId) !== account) {
      throw new BadRequestException("The invoice's Current Account must be its receipts' Current Account.");
    }
  }

  /** The receipt ids a create / update asks for: `inventoryReceiptIds` (first = the header source) or
   *  the single `inventoryReceiptId`; unique, in order. */
  private requestedReceiptIds(dto: Record<string, any>): number[] {
    const raw = Array.isArray(dto.inventoryReceiptIds) && dto.inventoryReceiptIds.length ? dto.inventoryReceiptIds : dto.inventoryReceiptId ? [dto.inventoryReceiptId] : [];
    const ids = raw.map((v: unknown) => Number(v));
    if (ids.some((v: number) => !Number.isInteger(v) || v <= 0)) throw new BadRequestException('Invalid Inventory Receipt id');
    return [...new Set<number>(ids)];
  }

  private async assertMasters(dto: Record<string, any>) {
    const ctx = await currentLegacyCompany(this.prisma);
    for (const [value, table, label] of [[dto.currentAccountId, 'FI_Account', 'Current Account'], [dto.inWarehouseId, 'IM_Warehouse', 'Warehouse']] as const) {
      if (value === undefined || value === null || value === '') continue;
      const found = await this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT 1 FROM ${Prisma.raw(`"${table}"`)} WHERE "RecId" = ${Number(value)} AND COALESCE("IsDeleted", 0) = 0`);
      if (!found.length) throw new BadRequestException(`${label} ${value} does not exist`);
      await assertSameCompany(this.prisma, ctx, table, [value], label, { badRequest: true });
    }
  }

  /** Header totals from the included receipts' lines (see the file comment) — a consolidated
   *  invoice's are the same sums over all its receipts' lines. */
  private async totalsFor(receiptIds: number[], client: Prisma.TransactionClient | PrismaService = this.prisma) {
    if (!receiptIds.length) return { subTotal: 0, vatAmount: 0, grandTotal: 0, lines: 0 };
    const [t] = await client.$queryRaw<any[]>(Prisma.sql`
      SELECT COALESCE(SUM("ItemTotal"), 0)::float AS sub, COALESCE(SUM("NetItemTotal"), 0)::float AS grand, count(*)::int AS lines
      FROM "IM_ReceiptItem" WHERE "InventoryReceiptId" IN (${Prisma.join(receiptIds)}) AND COALESCE("IsDeleted", 0) = 0`);
    return { subTotal: t.sub, vatAmount: t.grand - t.sub, grandTotal: t.grand, lines: t.lines };
  }

  private assertEditable(inv: { isApproved?: unknown; receiptNo?: string }) {
    if (Number(inv.isApproved)) throw new ConflictException(`Invoice ${inv.receiptNo ?? ''} is approved — unapprove it before changing it.`);
  }
  private refuseServerFields(dto: Record<string, any>) {
    for (const k of ['isApproved', 'approvedAt', 'approvedBy', 'receiptNo', 'receiptType', 'subTotal', 'vatAmount', 'grandTotal']) {
      if (dto[k] !== undefined) throw new ForbiddenException(`${k} is set by the server — it cannot be written directly.`);
    }
  }

  /**
   * Create Invoice (Inventory Receipt right-click): the invoice of this receipt — the existing live one
   * (created: false; never a second), else a new one linked to it whose header is the receipt's saved
   * header (RECEIPT_HEADER_COPY), through create() and its receipt lock / one-invoice-per-receipt rule.
   * The receipt must be the caller's company's (else 404), of this screen's type, and have lines.
   */
  async createFromReceipt(receiptType: number, receiptId: number, userId: number, user?: { id: string; companyId: string }) {
    this.type(receiptType);
    const cid = (await currentLegacyCompany(this.prisma)).legacyCompanyId;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT r."ReceiptType"::int as "receiptType", r."ReceiptNo" as "receiptNo",
        (SELECT count(*)::int FROM "IM_ReceiptItem" i WHERE i."InventoryReceiptId" = r."RecId" AND COALESCE(i."IsDeleted", 0) = 0) as lines,
        (SELECT o."RecId" FROM (${liveInvoiceOf('r')}) o) as "invoiceId"
      FROM "IM_Receipt" r WHERE r."RecId" = ${receiptId} AND COALESCE(r."IsDeleted", 0) = 0 AND r."CompanyId" = ${cid}`);
    const r = rows[0] && sanitizeRawRow(rows[0]);
    if (!r) throw new NotFoundException('Inventory Receipt not found');
    if (!this.isSourceType(receiptType, r.receiptType)) throw new BadRequestException(`Receipt ${r.receiptNo} is not a ${this.type(receiptType).label}`);
    const existing = async (invoiceId: number) => ({ created: false, receiptType, invoice: await this.get(invoiceId, receiptType) });
    if (r.invoiceId) return existing(Number(r.invoiceId));
    if (!Number(r.lines)) throw new BadRequestException(`Receipt ${r.receiptNo} has no lines — add at least one line before creating its invoice.`);
    try {
      return { created: true, receiptType, invoice: await this.create(receiptType, { inventoryReceiptId: receiptId }, userId, user, { copyReceiptHeader: true }) };
    } catch (e) {
      // A simultaneous Create Invoice won the receipt lock: open the invoice it created.
      if (!(e instanceof ConflictException)) throw e;
      const [v] = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT o."RecId" as id FROM "IM_Receipt" r CROSS JOIN LATERAL (${liveInvoiceOf('r')}) o WHERE r."RecId" = ${receiptId} AND r."CompanyId" = ${cid}`);
      if (!v) throw e;
      return existing(Number(v.id));
    }
  }

  async create(receiptType: number, dto: Record<string, any>, userId: number, user?: { id: string; companyId: string }, opts: { copyReceiptHeader?: boolean } = {}) {
    this.type(receiptType);
    this.refuseServerFields(dto);
    // One receipt, or several (a consolidated invoice): the first is the header source and
    // IM_Invoice.InventoryReceiptId; every one gets IM_Receipt.InvoiceId.
    const { inventoryReceiptIds: _ids, ...fields } = dto;
    const ids = this.requestedReceiptIds(dto);
    if (!ids.length) throw new BadRequestException('Select the Inventory Receipt this invoice is for');
    const primary = ids[0];
    const rs = await this.assertReceipts(ids, receiptType);
    // Current Account / Warehouse default from the (first) receipt.
    const effective: Record<string, any> = { currentAccountId: rs[0].currentAccountId, inWarehouseId: rs[0].inWarehouseId, ...fields, inventoryReceiptId: primary };
    this.assertConsolidable(rs, effective.currentAccountId);
    await this.assertMasters(effective);
    const ctx = await currentLegacyCompany(this.prisma);
    const toDb = await this.toDb();
    const id = await this.prisma.$transaction(async (tx) => {
      // Every receipt locked and re-checked here: none may have joined another invoice meanwhile.
      this.assertConsolidable(await this.assertReceipts(ids, receiptType, undefined, tx, true), effective.currentAccountId);
      const totals = await this.totalsFor(ids, tx);
      const receiptNo = await nextLegacySeqCode(tx as any, `${TABLE}_${receiptType}`, codePrefix(receiptType), TABLE, 'ReceiptNo', 8);
      const values: Record<string, any> = { ...effective, receiptType, receiptNo, subTotal: totals.subTotal, vatAmount: totals.vatAmount, grandTotal: totals.grandTotal, isApproved: 0 };
      const cols = [...WRITABLE, 'ReceiptType', 'ReceiptNo', 'SubTotal', 'VatAmount', 'GrandTotal', 'IsApproved'].filter((c) => toDb(c, values[camel(c)]) !== undefined);
      const rows = await tx.$queryRaw<any[]>(Prisma.sql`
        INSERT INTO "IM_Invoice" ("CompanyId", "WorkplaceId", ${Prisma.raw(cols.map((c) => `"${c}"`).join(', '))}, "InsertedAt", "InsertedBy", "IsDeleted", "UUID")
        VALUES (${ctx.legacyCompanyId}, ${ctx.workplaceId}, ${Prisma.join(cols.map((c) => toDb(c, values[camel(c)])))}, now(), ${userId}, 0, gen_random_uuid())
        RETURNING "RecId" as id`);
      const newId = Number(rows[0].id);
      if (opts.copyReceiptHeader) {
        // The receipt's saved header, in the same transaction (the receipt row is locked above) —
        // except the fields this request sets (Create New's reviewed form keeps its own values).
        await tx.$executeRaw(Prisma.sql`
          UPDATE "IM_Invoice" v SET ${Prisma.raw(RECEIPT_HEADER_COPY.filter((c) => fields[camel(c)] === undefined).map((c) => `"${c}" = r."${c}"`).join(', '))}
          FROM "IM_Receipt" r WHERE v."RecId" = ${newId} AND r."RecId" = ${primary} AND r."CompanyId" = ${ctx.legacyCompanyId}`);
      }
      await tx.$executeRaw`UPDATE "IM_Receipt" SET "InvoiceId" = ${newId} WHERE "RecId" IN (${Prisma.join(ids)})`;
      return newId;
    });
    const created = await this.get(id, receiptType);
    if (user) await this.audit.recordSafe({ userId: user.id, companyId: user.companyId, screenKey: invoiceScreenKey(receiptType), entityType: TABLE, entityId: String(id), action: AUDIT_ACTIONS.CREATE, documentNo: created.receiptNo, after: { 'Invoice (IM_Invoice)': created } });
    return created;
  }

  async update(id: number, receiptType: number, dto: Record<string, any>, userId: number, user?: { id: string; companyId: string }) {
    const before = await this.get(id, receiptType);
    this.assertEditable(before);
    this.refuseServerFields(dto);
    const { inventoryReceiptIds: askedIds, ...fields } = dto;
    dto = fields;
    const beforeIds: number[] = before.inventoryReceiptIds;
    const newReceiptId = dto.inventoryReceiptId !== undefined ? Number(dto.inventoryReceiptId) || null : Number(before.inventoryReceiptId) || null;
    if (!newReceiptId) throw new BadRequestException('Select the Inventory Receipt this invoice is for');
    // A consolidated invoice's receipts are fixed (delete it to regroup them); its header must keep
    // their Current Account. A single-receipt invoice may still be relinked as before.
    if (beforeIds.length > 1) {
      const asked = Array.isArray(askedIds) && askedIds.length ? askedIds.map(Number) : null;
      if (newReceiptId !== Number(before.inventoryReceiptId) || (asked && (asked.length !== beforeIds.length || asked.some((x) => !beforeIds.includes(x))))) {
        throw new ConflictException(`Invoice ${before.receiptNo} combines ${beforeIds.length} receipts — its receipts can't be changed. Delete it and create it again to regroup them.`);
      }
      this.assertConsolidable(before.receipts, dto.currentAccountId ?? before.currentAccountId);
    } else if (Array.isArray(askedIds) && askedIds.length > 1) {
      throw new BadRequestException('Receipts are combined when the invoice is created — create a new invoice for these receipts.');
    }
    if (newReceiptId !== Number(before.inventoryReceiptId)) await this.assertReceipt(newReceiptId, receiptType, id);
    await this.assertMasters(dto);
    const toDb = await this.toDb();
    const totals = await this.totalsFor(newReceiptId !== Number(before.inventoryReceiptId) ? [newReceiptId] : beforeIds);
    const values: Record<string, any> = { ...dto, inventoryReceiptId: newReceiptId, subTotal: totals.subTotal, vatAmount: totals.vatAmount, grandTotal: totals.grandTotal };
    const cols = [...WRITABLE, 'SubTotal', 'VatAmount', 'GrandTotal'].filter((c) => toDb(c, values[camel(c)]) !== undefined);
    await this.prisma.$transaction(async (tx) => {
      if (newReceiptId !== Number(before.inventoryReceiptId)) await this.assertReceipt(newReceiptId, receiptType, id, tx, true);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "IM_Invoice" SET ${Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, values[camel(c)])}`))}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
        WHERE "RecId" = ${id}`);
      if (newReceiptId !== Number(before.inventoryReceiptId)) {
        await tx.$executeRaw`UPDATE "IM_Receipt" SET "InvoiceId" = NULL WHERE "RecId" = ${Number(before.inventoryReceiptId)} AND "InvoiceId" = ${id}`;
        await tx.$executeRaw`UPDATE "IM_Receipt" SET "InvoiceId" = ${id} WHERE "RecId" = ${newReceiptId}`;
      }
    });
    const after = await this.get(id, receiptType);
    if (user) await this.audit.recordSafe({ userId: user.id, companyId: user.companyId, screenKey: invoiceScreenKey(receiptType), entityType: TABLE, entityId: String(id), action: AUDIT_ACTIONS.UPDATE, documentNo: after.receiptNo, before: { 'Invoice (IM_Invoice)': before }, after: { 'Invoice (IM_Invoice)': after } });
    return after;
  }

  async remove(id: number, receiptType: number, userId: number, user?: { id: string; companyId: string }) {
    const inv = await this.get(id, receiptType);
    this.assertEditable(inv);
    await this.prisma.$transaction([
      this.prisma.$executeRaw`UPDATE "IM_Invoice" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}`,
      this.prisma.$executeRaw`UPDATE "IM_Receipt" SET "InvoiceId" = NULL WHERE "InvoiceId" = ${id}`,
    ]);
    if (user) await this.audit.recordSafe({ userId: user.id, companyId: user.companyId, screenKey: invoiceScreenKey(receiptType), entityType: TABLE, entityId: String(id), action: AUDIT_ACTIONS.DELETE, documentNo: inv.receiptNo, before: { 'Invoice (IM_Invoice)': inv } });
    return { message: 'Deleted' };
  }

  /** Approve: needs at least one line on its receipt(s); stores the current totals over all of them. */
  async approve(id: number, receiptType: number, userId: string, user?: { id: string; companyId: string }) {
    const inv = await this.get(id, receiptType);
    if (inv.isApproved) return inv;
    const totals = await this.totalsFor(inv.inventoryReceiptIds);
    if (!totals.lines) throw new BadRequestException('The linked Inventory Receipt has no lines — add at least one line before approving.');
    await this.prisma.$executeRaw`
      UPDATE "IM_Invoice" SET "IsApproved" = 1, "ApprovedAt" = now(), "ApprovedBy" = ${Number(userId) || 1},
        "SubTotal" = ${totals.subTotal}, "VatAmount" = ${totals.vatAmount}, "GrandTotal" = ${totals.grandTotal}, "UpdatedAt" = now(), "UpdatedBy" = ${Number(userId) || 1}
      WHERE "RecId" = ${id}`;
    if (user) await this.audit.recordSafe({ userId: user.id, companyId: user.companyId, screenKey: invoiceScreenKey(receiptType), entityType: TABLE, entityId: String(id), action: AUDIT_ACTIONS.APPROVE, documentNo: inv.receiptNo, before: { Status: 'Unapproved' }, after: { Status: 'Approved' } });
    return this.get(id, receiptType);
  }

  async unapprove(id: number, receiptType: number, userId: string, user?: { id: string; companyId: string }) {
    const inv = await this.get(id, receiptType);
    if (!inv.isApproved) return inv;
    await this.prisma.$executeRaw`
      UPDATE "IM_Invoice" SET "IsApproved" = 0, "ApprovedAt" = NULL, "ApprovedBy" = NULL, "UpdatedAt" = now(), "UpdatedBy" = ${Number(userId) || 1}
      WHERE "RecId" = ${id}`;
    if (user) await this.audit.recordSafe({ userId: user.id, companyId: user.companyId, screenKey: invoiceScreenKey(receiptType), entityType: TABLE, entityId: String(id), action: 'unapprove', documentNo: inv.receiptNo, before: { Status: 'Approved' }, after: { Status: 'Unapproved' } });
    return this.get(id, receiptType);
  }

  /** For the attachments routes: the invoice exists, is of this type and (for writes) unlocked. */
  async assertAttachable(id: number, receiptType: number, write: boolean) {
    const inv = await this.get(id, receiptType);
    if (write) this.assertEditable(inv);
  }
}
