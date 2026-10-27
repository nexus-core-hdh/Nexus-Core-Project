import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getReceiptTypeConfig } from './receipt-types.config';

// Dyeing Follow-up Report — the data of the Report Builder's Dyeing Follow-up document source
// (reports/dyeing-follow-up.report.ts lays it out). Read-only. Every subcontract (outside process)
// receipt line, grouped by subcontractor (the receipt's account, legacy "Fasoncu") and, within it,
// by Party No, with Party / Subcontractor totals, Kalan and Fire%.
//
// Source: IM_Receipt + IM_ReceiptItem (the Subcontract Receipts screens), of three receipt types —
//   134 Outside Process Sent Receipt        → Sent           = line Quantity
//   11  Outside Process Receive Receipt     → Gross Received = line GrossQuantity (blank/0 → Quantity,
//                                             the receipt grid's own effective-quantity rule)
//                                             Net Received   = line Quantity
//   133 Outside Process Sent Return Receipt → Return         = line Quantity (sent goods coming back)
// Amount = line ItemTotal (Quantity × Price as the receipt grid computes it), on every type.
// Type 12 (Outside Process Return — received goods returned to the subcontractor) has no column in
// the reference report and is not included.
//
// Other fields: Receipt No / Date / Document No = IM_Receipt ReceiptNo / ReceiptDate / DocumentNo;
// Subcontractor = CurrentAccountId → FI_Account; Party No = IM_ReceiptItem.PartyNo ("Party (Lot
// No)"); Inventory = InventoryId → IM_Item; Process = SubcontractTypeId → MD_SubcontractType;
// Work Order = WorkOrderReceiptItemId → MA_WorkOrderItem → MA_WorkOrder (every join is to one row,
// so no line is ever counted twice).
//
// Kalan and Fire% have no existing calculation in this ERP; they reproduce the reference report's
// own figures (checked against every group of dying.pdf):
//   Kalan = Sent − Gross Received − Return
//   Fire% = 100 − (Net Received + Return) ÷ Gross Received × 100   (the ratio counts as 0 when Gross is 0)

export const DYEING_SENT_TYPE = 134;
export const DYEING_RECEIVE_TYPE = 11;
export const DYEING_RETURN_TYPE = 133;
export const DYEING_RECEIPT_TYPES = [DYEING_SENT_TYPE, DYEING_RECEIVE_TYPE, DYEING_RETURN_TYPE] as const;

/** Most lines one run prints; a run with more says so and asks for narrower filters. */
export const DYEING_MAX_LINES = 10000;

type TextMatch = { operator: 'equals' | 'contains' | 'startsWith'; value: string };
export interface DyeingFollowUpSelection {
  /** Inclusive calendar days ("YYYY-MM-DD"), on the receipt date as the receipt screen shows it. */
  dateFrom?: string;
  dateTo?: string;
  subcontractorIds?: number[];
  partyNo?: TextMatch;
  receiptNo?: TextMatch;
  documentNo?: TextMatch;
  inventoryIds?: number[];
  inventoryName?: TextMatch;
  process?: TextMatch;
  workOrderIds?: number[];
}

export interface DyeingTotals { sent: number; grossReceived: number; netReceived: number; returned: number; amount: number; kalan: number; firePercent: number }

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Sums of a list of lines, with Kalan and Fire% (see the header comment). */
export function dyeingTotals(lines: { sent: number; grossReceived: number; netReceived: number; returned: number; amount: number }[]): DyeingTotals {
  const sum = (k: 'sent' | 'grossReceived' | 'netReceived' | 'returned' | 'amount') => round(lines.reduce((t, l) => t + (l[k] || 0), 0));
  const sent = sum('sent'), grossReceived = sum('grossReceived'), netReceived = sum('netReceived'), returned = sum('returned'), amount = sum('amount');
  const ratio = grossReceived ? (netReceived + returned) / grossReceived : 0;
  return { sent, grossReceived, netReceived, returned, amount, kalan: round(sent - grossReceived - returned, 2), firePercent: round(100 - ratio * 100, 2) };
}

/** A text condition, case-insensitive, on a fixed column expression. */
function textCondition(column: Prisma.Sql, m: TextMatch): Prisma.Sql {
  const v = m.value.trim();
  if (m.operator === 'equals') return Prisma.sql`lower(trim(COALESCE(${column}, ''))) = lower(${v})`;
  const escaped = v.replace(/[\\%_]/g, (c) => `\\${c}`);
  return Prisma.sql`COALESCE(${column}, '') ILIKE ${m.operator === 'startsWith' ? `${escaped}%` : `%${escaped}%`}`;
}

@Injectable()
export class DyeingFollowUpService {
  constructor(private readonly prisma: PrismaService) {}

  async build(sel: DyeingFollowUpSelection) {
    for (const [label, d] of [['Date From', sel.dateFrom], ['Date To', sel.dateTo]] as const) {
      if (d !== undefined && (!DATE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)))) throw new BadRequestException(`${label} is not a valid date`);
    }
    if (sel.dateFrom && sel.dateTo && sel.dateFrom > sel.dateTo) throw new BadRequestException('Date From must be on or before Date To');

    // Every filter given is required (AND); a filter left out restricts nothing.
    const where: Prisma.Sql[] = [
      Prisma.sql`r."IsDeleted" = 0`, Prisma.sql`i."IsDeleted" = 0`,
      Prisma.sql`r."ReceiptType" IN (${Prisma.join([...DYEING_RECEIPT_TYPES])})`,
    ];
    // The calendar day of the stored timestamp — what the receipt screen shows as the Receipt Date.
    if (sel.dateFrom) where.push(Prisma.sql`r."ReceiptDate"::date >= ${sel.dateFrom}::date`);
    if (sel.dateTo) where.push(Prisma.sql`r."ReceiptDate"::date <= ${sel.dateTo}::date`);
    if (sel.subcontractorIds?.length) where.push(Prisma.sql`r."CurrentAccountId" IN (${Prisma.join(sel.subcontractorIds)})`);
    if (sel.partyNo) where.push(textCondition(Prisma.sql`i."PartyNo"`, sel.partyNo));
    if (sel.receiptNo) where.push(textCondition(Prisma.sql`r."ReceiptNo"`, sel.receiptNo));
    if (sel.documentNo) where.push(textCondition(Prisma.sql`r."DocumentNo"`, sel.documentNo));
    if (sel.inventoryIds?.length) where.push(Prisma.sql`i."InventoryId" IN (${Prisma.join(sel.inventoryIds)})`);
    if (sel.inventoryName) where.push(textCondition(Prisma.sql`it."InventoryName"`, sel.inventoryName));
    // By the process NAME (or code): the master has several rows of the same process (e.g. "Dyeing").
    if (sel.process) where.push(Prisma.sql`(${textCondition(Prisma.sql`st."SubcontractTypeName"`, sel.process)} OR ${textCondition(Prisma.sql`st."SubcontractTypeCode"`, sel.process)})`);
    if (sel.workOrderIds?.length) where.push(Prisma.sql`wi."WorkOrderId" IN (${Prisma.join(sel.workOrderIds)})`);

    const raw = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT r."RecId" as "receiptId", r."ReceiptType" as "receiptType", r."ReceiptNo" as "receiptNo",
        to_char(r."ReceiptDate", 'YYYY-MM-DD') as "receiptDate", r."DocumentNo" as "documentNo",
        r."CurrentAccountId" as "accountId", a."CurrentAccountCode" as "accountCode", a."CurrentAccountName" as "accountName",
        st."SubcontractTypeName" as "process",
        i."RecId" as "lineId", i."InventoryId" as "inventoryId", it."InventoryCode" as "inventoryCode", it."InventoryName" as "inventoryName",
        i."PartyNo" as "partyNo", i."Quantity" as "quantity", i."GrossQuantity" as "grossQuantity", i."UnitPrice" as "unitPrice",
        i."ItemTotal" as "itemTotal", u."UnitCode" as "unit", i."Explanation" as "explanation",
        wo."WorkOrderNo" as "workOrderNo", i."ManufacturingOrderNo" as "manufacturingOrderNo"
      FROM "IM_ReceiptItem" i
      JOIN "IM_Receipt" r ON r."RecId" = i."InventoryReceiptId"
      LEFT JOIN "FI_Account" a ON a."RecId" = r."CurrentAccountId"
      LEFT JOIN "IM_Item" it ON it."RecId" = i."InventoryId"
      LEFT JOIN "MD_SubcontractType" st ON st."RecId" = r."SubcontractTypeId"
      LEFT JOIN "MD_UnitSetItem" u ON u."RecId" = i."UnitId"
      LEFT JOIN "MA_WorkOrderItem" wi ON wi."RecId" = i."WorkOrderReceiptItemId"
      LEFT JOIN "MA_WorkOrder" wo ON wo."RecId" = wi."WorkOrderId"
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY a."CurrentAccountCode" NULLS LAST, r."CurrentAccountId", COALESCE(trim(i."PartyNo"), ''),
        r."ReceiptDate", r."ReceiptNo", i."ItemOrderNo" NULLS LAST, i."RecId"
      LIMIT ${DYEING_MAX_LINES + 1}
    `);
    const truncated = raw.length > DYEING_MAX_LINES;
    const num = (v: any) => (v == null || v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v));
    const text = (v: any) => (v == null || String(v).trim() === '' ? null : String(v).trim());

    const lines = sanitizeRawRow(raw.slice(0, DYEING_MAX_LINES)).map((r: any) => {
      const type = Number(r.receiptType);
      const quantity = num(r.quantity);
      return {
        receiptId: Number(r.receiptId),
        receiptType: type,
        receiptTypeLabel: getReceiptTypeConfig(type)?.label ?? `Receipt type ${type}`,
        receiptNo: text(r.receiptNo),
        receiptDate: text(r.receiptDate),
        documentNo: text(r.documentNo),
        accountId: r.accountId == null ? null : Number(r.accountId),
        subcontractorCode: text(r.accountCode),
        subcontractorName: text(r.accountName),
        partyNo: text(r.partyNo),
        inventoryId: r.inventoryId == null ? null : Number(r.inventoryId),
        inventoryCode: text(r.inventoryCode),
        inventoryName: text(r.inventoryName),
        process: text(r.process),
        unit: text(r.unit),
        workOrderNo: text(r.workOrderNo) ?? text(r.manufacturingOrderNo),
        explanation: text(r.explanation),
        unitPrice: r.unitPrice == null ? null : num(r.unitPrice),
        sent: type === DYEING_SENT_TYPE ? quantity : 0,
        grossReceived: type === DYEING_RECEIVE_TYPE ? (num(r.grossQuantity) > 0 ? num(r.grossQuantity) : quantity) : 0,
        netReceived: type === DYEING_RECEIVE_TYPE ? quantity : 0,
        returned: type === DYEING_RETURN_TYPE ? quantity : 0,
        amount: num(r.itemTotal),
      };
    });
    type Line = (typeof lines)[number];

    // Subcontractor → Party No groups, in the query's order.
    const subcontractors: { accountId: number | null; code: string | null; name: string | null; parties: { partyNo: string | null; lines: Line[]; totals: DyeingTotals }[]; totals: DyeingTotals }[] = [];
    for (const l of lines) {
      let s = subcontractors[subcontractors.length - 1];
      if (!s || s.accountId !== l.accountId) {
        s = { accountId: l.accountId, code: l.subcontractorCode, name: l.subcontractorName, parties: [], totals: dyeingTotals([]) };
        subcontractors.push(s);
      }
      let p = s.parties[s.parties.length - 1];
      if (!p || p.partyNo !== l.partyNo) {
        p = { partyNo: l.partyNo, lines: [], totals: dyeingTotals([]) };
        s.parties.push(p);
      }
      p.lines.push(l);
    }
    for (const s of subcontractors) {
      for (const p of s.parties) p.totals = dyeingTotals(p.lines);
      s.totals = dyeingTotals(s.parties.flatMap((p) => p.lines));
    }
    return { generatedAt: new Date().toISOString(), truncated, lineCount: lines.length, subcontractors };
  }

  /** Display names for the chosen subcontractors / items / Work Orders (for the applied-filter line). */
  async names(table: 'account' | 'item' | 'workOrder', ids: number[]): Promise<string[]> {
    if (!ids.length) return [];
    const q = {
      account: Prisma.sql`SELECT "RecId" as id, concat_ws(' ', "CurrentAccountCode", "CurrentAccountName") as name FROM "FI_Account"`,
      item: Prisma.sql`SELECT "RecId" as id, "InventoryCode" as name FROM "IM_Item"`,
      workOrder: Prisma.sql`SELECT "RecId" as id, "WorkOrderNo" as name FROM "MA_WorkOrder"`,
    }[table];
    const rows = sanitizeRawRow(await this.prisma.$queryRaw<any[]>(Prisma.sql`${q} WHERE "RecId" IN (${Prisma.join(ids)})`));
    const byId = new Map(rows.map((r: any) => [Number(r.id), String(r.name ?? '')]));
    return ids.map((id) => byId.get(id) || `#${id}`);
  }
}

export type DyeingFollowUpReport = Awaited<ReturnType<DyeingFollowUpService['build']>>;
