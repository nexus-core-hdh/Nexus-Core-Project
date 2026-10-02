import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PurchaseOrderService } from '../legacy-erp/purchase-order.service';
import { FiReceiptService } from '../legacy-erp/fi-receipt.service';
import { InventoryReceiptService } from '../legacy-erp/inventory-receipt.service';
import { getReceiptTypeConfig, RECEIPT_TYPES } from '../legacy-erp/receipt-types.config';

// Dashboard "Recent Activity" — a read-only merge of records that already exist; no activity
// table of its own and nothing is ever written here.
//
//  - AuditLog: the project-wide audit trail (AuditService) every audited ERP screen already writes
//    to — Purchase Orders, Inventory Receipts, Fabric/Yarn/Trim cards, Work Orders, Contracts,
//    Cutting, PLM cards, ... — with the real acting user, document no. and screen title.
//  - CustomerPayment / SupplierPayment and Order (type SALE): the Finance module's own records,
//    which are not audited, so they are read from their tables directly (real amount + party).
//
// Scoping matches the screens those records come from: AuditLog by the caller's own companyId
// (as Log Tracking does), Finance records by companyId + branchId (as FinanceService.scope does).
// Each source is one query limited to `take` rows (relations joined, no N+1); the merge keeps
// the newest `take` overall.

export type ActivityKind = 'sale' | 'purchase' | 'payment' | 'receipt' | 'item' | 'stock' | 'other';

export interface RecentActivityItem {
  id: string;
  kind: ActivityKind;
  label: string; // document type, e.g. "Purchase Order", "Customer Payment"
  documentNo: string | null;
  action: string; // e.g. "created", "received", "paid"
  amount: number | null;
  currency: string | null;
  party: string | null; // customer / supplier name
  partyPrefix: 'from' | 'to' | null;
  userName: string | null; // who did it, only when the record captured it
  occurredAt: Date;
}

// Past-tense wording for the AuditLog action vocabulary (AUDIT_ACTIONS plus the legacy
// 'submit'/'approved'/'status_changed' values already in use); anything else is shown as stored.
const ACTION_WORDS: Record<string, string> = {
  create: 'created', update: 'updated', delete: 'deleted', restore: 'restored', post: 'posted',
  approve: 'approved', approved: 'approved', reject: 'rejected', rejected: 'rejected', cancel: 'cancelled',
  lock: 'locked', unlock: 'unlocked', submit: 'submitted', status_changed: 'status changed',
};

// Icon category from the audited entity type / screen title — display only.
function kindFor(entityType: string, title: string): ActivityKind {
  const s = `${entityType} ${title}`.toLowerCase();
  if (/purchase|\bpo\b/.test(s)) return 'purchase';
  if (/receipt/.test(s)) return 'receipt';
  if (/sale|contract|order_?manufactur/.test(s)) return 'sale';
  if (/card|item|inventory/.test(s)) return 'item';
  if (/stock|allocation|adjust/.test(s)) return 'stock';
  return 'other';
}

// "MA_WorkOrder" / "cutting_order" / "FabricCard" -> "Work Order" / "Cutting Order" / "Fabric Card"
function humanize(entityType: string): string {
  return entityType
    .replace(/^[A-Z]{2}_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Dashboard "Recent Transactions" — the latest real documents of each type, read through the
// modules that own them (nothing is stored or computed here beyond picking display fields):
//  - Sale     → Finance Order (type SALE): orderNumber, customer, orderDate, totalAmount/currency, status.
//  - Purchase → legacy Purchase Order (IM_OrderReceipt, ReceiptType 1) via PurchaseOrderService.list()
//               — ReceiptNo, supplier = FI_Account (CurrentAccountId), ReceiptDate, GrandTotal/Forex,
//               and the same approval status the Purchase Orders list shows.
//  - Payment  → Payment module (Payment → Customer / Supplier Payments): CustomerPayment and
//               SupplierPayment — paymentNumber, customer/supplier, paymentDate, amount, status.
//  - Receipt  → both receipt documents the ERP has:
//               · Financial Receipt (FI_Receipt) via FiReceiptService.list() — ReceiptNo, the
//                 account(s) on its lines (FI_ReceiptItem → FI_Account), ReceiptDate, header
//                 amount, Approved/Unapproved.
//               · Inventory receipts (IM_Receipt, every type in RECEIPT_TYPES — Purchase Receipt,
//                 Purchase Return, the Subcontract/Outside Process receipts, ...) via
//                 InventoryReceiptService.list(), the same query their list screens use —
//                 ReceiptNo, Current Account, ReceiptDate, the list's own Receipt Total,
//                 Approved/Unapproved; subtype = the receipt type's configured label. Outside
//                 Process Sent (134) is outbound (DIRECTION_CLASS: OUT, "<Type> Send") yet is a
//                 receipt document in this ERP — it is listed on the Subcontract Receipts screen
//                 with 11/12/133, just as outbound Purchase Return sits with Purchase Receipt — so
//                 it stays here and is told apart by its own type label, not moved to a category.
// Every source is limited to `take` rows server-side, newest first; lookups are batched. Sources
// are merged and sorted by date before the final `take`, so no source can crowd out another.
export type TransactionType = 'sale' | 'purchase' | 'payment' | 'receipt';
export const TRANSACTION_TYPES: TransactionType[] = ['sale', 'purchase', 'payment', 'receipt'];

export interface RecentTransaction {
  id: string;
  type: TransactionType;
  subtype: string | null; // e.g. "Customer Payment" / "Supplier Payment"
  recordId: string; // the source record's own id (for the existing View screen)
  reference: string | null;
  party: string | null;
  date: Date | null;
  amount: number | null;
  currency: string | null; // null = the record carries no currency (base currency)
  status: string | null;
  // IM_Receipt rows only: the receipt type (picks its own View screen and display label) and, for
  // the Subcontract / Outside Process types, the MD_SubcontractType name the receipt references.
  receiptType?: number;
  subcontractType?: string | null;
}

// Dashboard order KPIs — Work Orders (MA_WorkOrder, the real orders the Work Orders screen lists:
// same "IsDeleted" = 0 rule) counted in SQL for the dashboard's selected date range, by their own
// business date "WorkOrderDate". Status buckets follow the Work Order screen's STATUS_OPTIONS for
// that smallint (no lookup table exists): 0 Open → pending, 1 Planned / 2 In Production → running,
// 3 Completed, 4 Cancelled; a row with no Status counts toward total only. The comparison period
// is the same-length span immediately before `from`; the sparkline splits the selected range into
// equal slices. Delayed stays a live snapshot (DeliveryDate already past, not Completed/Cancelled,
// any WorkOrderDate) — an order overdue since before the range is still overdue today.
export interface OrderKpiCounts { total: number; running: number; completed: number; pending: number; cancelled: number }
export interface OrderKpis {
  from: Date; to: Date; previousFrom: Date; previousTo: Date;
  current: OrderKpiCounts;
  previous: OrderKpiCounts;
  delayed: number;
  spark: Record<keyof OrderKpiCounts, number[]>; // oldest → newest slice of the selected range
}
const SPARK_SLICES = 6;
const emptyCounts = (): OrderKpiCounts => ({ total: 0, running: 0, completed: 0, pending: 0, cancelled: 0 });
const bucketOf = (status: number | null): Exclude<keyof OrderKpiCounts, 'total'> | null =>
  status === 0 ? 'pending' : status === 1 || status === 2 ? 'running' : status === 3 ? 'completed' : status === 4 ? 'cancelled' : null;
// Legacy timestamp-without-time-zone columns hold UTC wall-clock values (how Prisma reads and
// writes them), so an instant is compared as its UTC wall-clock — independent of the DB session's
// TimeZone setting.
const utc = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

const toNum = (v: any): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const toDate = (v: any): Date | null => (v ? new Date(v) : null);
const titleCase = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchaseOrders: PurchaseOrderService,
    private readonly fiReceipts: FiReceiptService,
    private readonly inventoryReceipts: InventoryReceiptService,
  ) {}

  async orderKpis(from: Date, to: Date): Promise<OrderKpis> {
    const span = to.getTime() - from.getTime() + 1; // inclusive of `to`
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(from.getTime() - span);
    const sliceMs = span / SPARK_SLICES;
    const [inRange, inPrevious, delayedRows] = await Promise.all([
      this.prisma.$queryRaw<{ slice: number; status: number | null; n: number }[]>(Prisma.sql`
        SELECT LEAST(FLOOR(EXTRACT(EPOCH FROM ("WorkOrderDate" - ${utc(from)})) * 1000 / ${sliceMs}), ${SPARK_SLICES - 1})::int AS slice,
               "Status"::int AS status, COUNT(*)::int AS n
        FROM "MA_WorkOrder"
        WHERE "IsDeleted" = 0 AND "WorkOrderDate" >= ${utc(from)} AND "WorkOrderDate" <= ${utc(to)}
        GROUP BY 1, 2`),
      this.prisma.$queryRaw<{ status: number | null; n: number }[]>(Prisma.sql`
        SELECT "Status"::int AS status, COUNT(*)::int AS n
        FROM "MA_WorkOrder"
        WHERE "IsDeleted" = 0 AND "WorkOrderDate" >= ${utc(previousFrom)} AND "WorkOrderDate" <= ${utc(previousTo)}
        GROUP BY 1`),
      this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS n
        FROM "MA_WorkOrder"
        WHERE "IsDeleted" = 0 AND "DeliveryDate" < ${utc(new Date())} AND ("Status" IS NULL OR "Status" NOT IN (3, 4))`),
    ]);

    const current = emptyCounts();
    const spark = Object.fromEntries(Object.keys(current).map((k) => [k, Array(SPARK_SLICES).fill(0)])) as OrderKpis['spark'];
    for (const r of inRange) {
      const b = bucketOf(r.status);
      current.total += r.n;
      spark.total[r.slice] += r.n;
      if (b) (current[b] += r.n), (spark[b][r.slice] += r.n);
    }
    const previous = emptyCounts();
    for (const r of inPrevious) {
      const b = bucketOf(r.status);
      previous.total += r.n;
      if (b) previous[b] += r.n;
    }
    return { from, to, previousFrom, previousTo, current, previous, delayed: delayedRows[0]?.n ?? 0, spark };
  }

  async recentTransactions(companyId: string, branchId: string | undefined, type: TransactionType | 'all', take: number): Promise<RecentTransaction[]> {
    const types = type === 'all' ? TRANSACTION_TYPES : [type];
    const financeScope = { companyId, ...(branchId ? { branchId } : {}) };
    const lists = await Promise.all(types.map((t) => {
      switch (t) {
        case 'sale': return companyId ? this.sales(financeScope, take) : [];
        case 'purchase': return this.purchases(take);
        case 'payment': return companyId ? this.payments(financeScope, take) : [];
        case 'receipt': return Promise.all([this.receipts(take), this.imReceipts(take)]).then((r) => r.flat());
      }
    }));
    return lists
      .flat()
      .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
      .slice(0, take);
  }

  private async sales(scope: { companyId: string; branchId?: string }, take: number): Promise<RecentTransaction[]> {
    const rows = await this.prisma.order.findMany({
      where: { ...scope, type: 'SALE' },
      select: { id: true, orderNumber: true, orderDate: true, totalAmount: true, currency: true, status: true, customer: { select: { name: true } } },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
      take,
    });
    return rows.map((o) => ({
      id: `sale:${o.id}`, type: 'sale', subtype: null, recordId: o.id, reference: o.orderNumber, party: o.customer?.name ?? null,
      date: o.orderDate, amount: o.totalAmount, currency: o.currency ?? null, status: titleCase(o.status),
    }));
  }

  private async payments(scope: { companyId: string; branchId?: string }, take: number): Promise<RecentTransaction[]> {
    const [customer, supplier] = await Promise.all([
      this.prisma.customerPayment.findMany({
        where: scope,
        select: { id: true, paymentNumber: true, paymentDate: true, amount: true, status: true, customer: { select: { name: true } } },
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        take,
      }),
      this.prisma.supplierPayment.findMany({
        where: scope,
        select: { id: true, paymentNumber: true, paymentDate: true, amount: true, status: true, supplier: { select: { name: true } } },
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        take,
      }),
    ]);
    return [
      ...customer.map((p) => ({
        id: `customer-payment:${p.id}`, type: 'payment' as const, subtype: 'Customer Payment', recordId: p.id, reference: p.paymentNumber,
        party: p.customer?.name ?? null, date: p.paymentDate, amount: p.amount, currency: null, status: titleCase(p.status),
      })),
      ...supplier.map((p) => ({
        id: `supplier-payment:${p.id}`, type: 'payment' as const, subtype: 'Supplier Payment', recordId: p.id, reference: p.paymentNumber,
        party: p.supplier?.name ?? null, date: p.paymentDate, amount: p.amount, currency: null, status: titleCase(p.status),
      })),
    ];
  }

  private async purchases(take: number): Promise<RecentTransaction[]> {
    const page: any = await this.purchaseOrders.list(undefined, 'all', 1, { page: 1, pageSize: take, sortBy: 'receiptDate', sortDir: 'desc' });
    const rows: any[] = page?.rows ?? [];
    const [accounts, forex] = await Promise.all([
      this.accountNames(rows.map((r) => r.currentAccountId)),
      this.forexCodes(rows.map((r) => r.forexId)),
    ]);
    const STATUS: Record<string, string> = { approved: 'Approved', rejected: 'Rejected', unapproved: 'Unapproved' };
    return rows.map((r) => ({
      id: `purchase:${r.id}`, type: 'purchase', subtype: null, recordId: String(r.id), reference: r.receiptNo ?? null,
      party: r.currentAccountId != null ? accounts.get(Number(r.currentAccountId)) ?? null : null,
      date: toDate(r.receiptDate), amount: toNum(r.grandTotal),
      currency: r.forexId != null ? forex.get(Number(r.forexId)) ?? null : null,
      status: STATUS[r.approvalStatus] ?? r.approvalStatus ?? null,
    }));
  }

  private async receipts(take: number): Promise<RecentTransaction[]> {
    const page: any = await this.fiReceipts.list(undefined, { page: 1, pageSize: take, sortBy: 'receiptDate', sortDir: 'desc' });
    const rows: any[] = page?.rows ?? [];
    const ids = rows.map((r) => Number(r.id));
    const [lines, forex] = await Promise.all([
      ids.length
        ? this.prisma.$queryRaw<{ receiptId: number; name: string | null }[]>(Prisma.sql`
            SELECT DISTINCT ri."CurrentAccountReceiptId"::int AS "receiptId", a."CurrentAccountName" AS name
            FROM "FI_ReceiptItem" ri JOIN "FI_Account" a ON a."RecId" = ri."CurrentAccountId"
            WHERE ri."CurrentAccountReceiptId" IN (${Prisma.join(ids)}) AND ri."IsDeleted" = 0`)
        : Promise.resolve([]),
      this.forexCodes(rows.map((r) => r.forexId)),
    ]);
    const partiesByReceipt = new Map<number, string[]>();
    for (const l of lines) if (l.name) partiesByReceipt.set(l.receiptId, [...(partiesByReceipt.get(l.receiptId) ?? []), l.name]);
    return rows.map((r) => {
      const parties = partiesByReceipt.get(Number(r.id)) ?? [];
      // The voucher header's own amount: Debit (cash in), else Credit — whichever the user entered.
      const debit = toNum(r.debit);
      return {
        id: `receipt:${r.id}`, type: 'receipt' as const, subtype: null, recordId: String(r.id), reference: r.receiptNo ?? null,
        party: parties.length === 0 ? null : parties.length === 1 ? parties[0] : `${parties[0]} +${parties.length - 1} more`,
        date: toDate(r.receiptDate), amount: debit ? debit : toNum(r.credit),
        currency: r.forexId != null ? forex.get(Number(r.forexId)) ?? null : null,
        status: r.isApproved == null ? null : Number(r.isApproved) === 1 || r.isApproved === true ? 'Approved' : 'Unapproved',
      };
    });
  }

  private async imReceipts(take: number): Promise<RecentTransaction[]> {
    const types = RECEIPT_TYPES.map((t) => t.receiptType);
    const page: any = await this.inventoryReceipts.list(undefined, types, undefined, { page: 1, pageSize: take, sortBy: 'receiptDate', sortDir: 'desc' });
    const rows: any[] = page?.rows ?? [];
    return rows.map((r) => {
      const receiptType = Number(r.receiptType);
      const label = getReceiptTypeConfig(receiptType)?.label ?? 'Inventory Receipt';
      return {
        id: `inventory-receipt:${r.id}`, type: 'receipt' as const,
        subtype: r.subcontractTypeName ? `${label} (${r.subcontractTypeName})` : label,
        recordId: String(r.id), reference: r.receiptNo ?? null, party: r.currentAccountName ?? null,
        // Receipt Total has no header currency (ForexId is per line), so it is the base currency.
        date: toDate(r.receiptDate), amount: toNum(r.receiptTotal), currency: null,
        status: r.isApproved == null ? null : Number(r.isApproved) === 1 || r.isApproved === true ? 'Approved' : 'Unapproved',
        receiptType, subcontractType: r.subcontractTypeName ?? null,
      };
    });
  }

  private async accountNames(ids: any[]): Promise<Map<number, string>> {
    const unique = Array.from(new Set(ids.filter((v) => v != null).map(Number)));
    if (!unique.length) return new Map();
    const rows = await this.prisma.$queryRaw<{ id: number; name: string | null }[]>(Prisma.sql`
      SELECT "RecId"::int AS id, "CurrentAccountName" AS name FROM "FI_Account" WHERE "RecId" IN (${Prisma.join(unique)})`);
    return new Map(rows.filter((r) => r.name).map((r) => [Number(r.id), r.name as string]));
  }

  private async forexCodes(ids: any[]): Promise<Map<number, string>> {
    const unique = Array.from(new Set(ids.filter((v) => v != null).map(Number)));
    if (!unique.length) return new Map();
    const rows = await this.prisma.$queryRaw<{ id: number; code: string | null }[]>(Prisma.sql`
      SELECT "RecId"::int AS id, "ForexCode" AS code FROM "MD_Forex" WHERE "RecId" IN (${Prisma.join(unique)})`);
    return new Map(rows.filter((r) => r.code).map((r) => [Number(r.id), r.code as string]));
  }

  async recentActivity(companyId: string, branchId: string | undefined, take: number): Promise<RecentActivityItem[]> {
    if (!companyId) return [];
    const financeScope = { companyId, ...(branchId ? { branchId } : {}) };
    const [audit, customerPayments, supplierPayments, salesOrders] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { companyId, action: { not: 'read' } },
        select: {
          id: true, entityType: true, action: true, documentNo: true, menuTitle: true, createdAt: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.customerPayment.findMany({
        where: financeScope,
        select: { id: true, paymentNumber: true, amount: true, status: true, createdAt: true, customer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.supplierPayment.findMany({
        where: financeScope,
        select: { id: true, paymentNumber: true, amount: true, status: true, createdAt: true, supplier: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.order.findMany({
        where: { ...financeScope, type: 'SALE' },
        select: { id: true, orderNumber: true, totalAmount: true, currency: true, createdAt: true, customer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    ]);

    const items: RecentActivityItem[] = [
      ...audit.map((a) => {
        const label = a.menuTitle?.trim() || humanize(a.entityType);
        return {
          id: `audit:${a.id}`, kind: kindFor(a.entityType, label), label, documentNo: a.documentNo ?? null,
          action: ACTION_WORDS[a.action] ?? a.action.replace(/_/g, ' '),
          amount: null, currency: null, party: null, partyPrefix: null,
          userName: a.user?.name ?? null, occurredAt: a.createdAt,
        };
      }),
      // Received from a customer; status is the record's own (a PENDING payment is not "received").
      ...customerPayments.map((p) => ({
        id: `customer-payment:${p.id}`, kind: 'payment' as const, label: 'Customer Payment', documentNo: p.paymentNumber,
        action: p.status === 'COMPLETED' ? 'received' : p.status.toLowerCase(),
        amount: p.amount, currency: null, party: p.customer?.name ?? null, partyPrefix: 'from' as const,
        userName: null, occurredAt: p.createdAt,
      })),
      ...supplierPayments.map((p) => ({
        id: `supplier-payment:${p.id}`, kind: 'payment' as const, label: 'Supplier Payment', documentNo: p.paymentNumber,
        action: p.status === 'COMPLETED' ? 'paid' : p.status.toLowerCase(),
        amount: p.amount, currency: null, party: p.supplier?.name ?? null, partyPrefix: 'to' as const,
        userName: null, occurredAt: p.createdAt,
      })),
      ...salesOrders.map((o) => ({
        id: `order:${o.id}`, kind: 'sale' as const, label: 'Sales Order', documentNo: o.orderNumber, action: 'created',
        amount: o.totalAmount, currency: o.currency ?? null, party: o.customer?.name ?? null, partyPrefix: 'from' as const,
        userName: null, occurredAt: o.createdAt,
      })),
    ];
    return items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, take);
  }
}
