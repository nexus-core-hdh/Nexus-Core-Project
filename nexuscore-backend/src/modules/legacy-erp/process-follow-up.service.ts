import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';

// Process Follow-up Report — the data of the Report Builder's Process Follow-up document source
// (reports/process-follow-up.report.ts lays it out). Read-only. One line per Process × Work Order
// × Color × Factory, grouped by Process, with a total per Process (reference: the legacy
// "Process Follow-up Report").
//
// Source: the Order Manufacturing Entry transactions (order-manufacturing.service.ts owns the
// conventions, this report only reads them):
//   MA_WorkOrderProduction            one entry: Work Order item, Process (ProcessId → MA_Process),
//                                     Factory (CurrentAccountId → FI_Account), InOut, IsRepair,
//                                     Quality (ProductionSubType → MA_QualityType), ProductionDate
//   MA_WorkOrderProductionVariant     its Color × Size quantities (Color = the linked
//                                     MA_WorkOrderItemVariant.Explanation before "‖")
// Only entries the screen writes (ProductionType 1) and that are not deleted, of Work Orders that
// are not deleted — as on the screen, an entry booked on a Work Order item that was later replaced
// still counts for its Work Order. Quantities are the entry's size quantities, summed once per entry
// (no join repeats an entry). Work Order fields: Delivery Date = MA_WorkOrder.DeliveryDate,
// Order No = WorkOrderNo, Customer = CurrentAccountId → FI_Account, Style = StyleCardId →
// StyleCard (styleNumber / title / its first image attachment as the Style Picture).
//
// Columns, with the meaning Order Manufacturing Entry gives each movement:
//   Sent      = Manufacturing OUT                       (InOut 2, IsRepair 0)
//   Received  = Manufacturing IN + Received (Repair)    (InOut 1) — the screen's own Received
//   Return    = Sent (Repair)                           (InOut 2, IsRepair 1) — the screen's own Return
//   Repair    = Received (Repair)                       (InOut 1, IsRepair 1) — already inside Received
//   A Quality / B Quality / Defected / Hole / Others / Rejection
//             = Received split by the entry's quality type (MA_QualityType), each column matched to
//               the quality type of that code / name. A column with no such quality type defined is
//               printed blank (not 0), and the report says so; received quantity without a quality
//               type is "Quality Not Set".
//   Wastage   = no source: Order Manufacturing Entry records no wastage — always blank.
//   Balance   = Sent + Return − Received (Order Manufacturing Entry: a piece sent back for repair is
//               owed again until received again), and — as on the reference report, where every line
//               with nothing received prints Balance 0.00 — 0 while nothing has been received.

export const COLOR_SIZE_SEP = '‖';
export const PRODUCTION_TYPE_MANUFACTURING = 1;
const IN = 1;
const OUT = 2;

/** Most lines one run prints; a run with more says so and asks for narrower filters. */
export const PROCESS_FOLLOW_UP_MAX_LINES = 5000;

/** The reference report's quality columns, each matched to an MA_QualityType by code or name. */
export const QUALITY_COLUMNS = [
  { key: 'aQuality', label: 'A Quality', match: (code: string, name: string) => code === 'a' || /^a\s*quality$/.test(name) },
  { key: 'bQuality', label: 'B Quality', match: (code: string, name: string) => code === 'b' || /^b\s*quality$/.test(name) },
  { key: 'defected', label: 'Defected', match: (code: string, name: string) => /defect/.test(name) || /defect/.test(code) },
  { key: 'hole', label: 'Hole', match: (code: string, name: string) => /\bholes?\b/.test(name) || /\bholes?\b/.test(code) },
  { key: 'others', label: 'Others', match: (code: string, name: string) => /^others?$/.test(name) || /^others?$/.test(code) },
  { key: 'rejection', label: 'Rejection', match: (code: string, name: string) => /reject/.test(name) || /reject/.test(code) },
] as const;
export type QualityKey = (typeof QUALITY_COLUMNS)[number]['key'];

type TextMatch = { operator: 'equals' | 'contains' | 'startsWith'; value: string };
export interface ProcessFollowUpSelection {
  /** Inclusive calendar days ("YYYY-MM-DD"), on the entry's Date (ProductionDate). */
  dateFrom?: string;
  dateTo?: string;
  customerIds?: number[];
  workOrderIds?: number[];
  orderNo?: TextMatch;
  styleCode?: TextMatch;
  styleName?: TextMatch;
  color?: TextMatch;
  processIds?: number[];
  factoryIds?: number[];
}

const QTY_KEYS = ['sent', 'received', 'aQuality', 'bQuality', 'defected', 'hole', 'others', 'rejection', 'qualityNotSet', 'returned', 'wastage', 'repair', 'balance'] as const;
export type ProcessQtyKey = (typeof QTY_KEYS)[number];
export type ProcessTotals = Record<ProcessQtyKey, number | null>;

const round = (n: number) => Math.round(n * 10000) / 10000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Balance of one line (see the header comment). */
export function processBalance(sent: number, received: number, returned: number): number {
  return received ? round(sent + returned - received) : 0;
}

/** Sums of lines; a column blank on every line (no source / no quality type) stays blank. */
export function processTotals(lines: Partial<Record<ProcessQtyKey, number | null>>[]): ProcessTotals {
  return Object.fromEntries(QTY_KEYS.map((k) => {
    const values = lines.map((l) => l[k]).filter((v): v is number => typeof v === 'number');
    return [k, values.length || !lines.length ? round(values.reduce((t, v) => t + v, 0)) : null];
  })) as ProcessTotals;
}

/** A text condition, case-insensitive, on a fixed column expression. */
function textCondition(column: Prisma.Sql, m: TextMatch): Prisma.Sql {
  const v = m.value.trim();
  if (m.operator === 'equals') return Prisma.sql`lower(trim(COALESCE(${column}, ''))) = lower(${v})`;
  const escaped = v.replace(/[\\%_]/g, (c) => `\\${c}`);
  return Prisma.sql`COALESCE(${column}, '') ILIKE ${m.operator === 'startsWith' ? `${escaped}%` : `%${escaped}%`}`;
}

@Injectable()
export class ProcessFollowUpService {
  constructor(private readonly prisma: PrismaService) {}

  /** Live quality types → which report column each one fills (unmatched ones count as "Quality Not Set"). */
  private async qualityColumnsById() {
    const rows = sanitizeRawRow(await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "QualityCode" as code, "QualityName" as name FROM "MA_QualityType" WHERE COALESCE("IsDeleted", 0) = 0 ORDER BY "RecId"`));
    const byId = new Map<number, QualityKey>();
    for (const r of rows) {
      const code = String(r.code ?? '').trim().toLowerCase();
      const name = String(r.name ?? '').trim().toLowerCase();
      const col = QUALITY_COLUMNS.find((c) => c.match(code, name));
      if (col) byId.set(Number(r.id), col.key);
    }
    return { byId, defined: new Set(byId.values()) };
  }

  /**
   * The Process master exactly as Order Manufacturing Entry's Process dropdown offers it
   * (LegacyMasterLookupService 'process': MA_Process, not deleted, by ProcessName) — RecId breaks a
   * tie between two processes of the same name, which stay two separate processes.
   */
  async processMaster(): Promise<{ id: number; code: string | null; name: string | null }[]> {
    const rows = sanitizeRawRow(await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "ProcessCode" as code, "ProcessName" as name FROM "MA_Process" WHERE "IsDeleted" = 0 ORDER BY "ProcessName", "RecId"`));
    return rows.map((r: any) => ({ id: Number(r.id), code: r.code ?? null, name: r.name ?? null }));
  }

  /**
   * `includeEmptyProcesses`: also give every master process without matching entries its (empty)
   * section. Off by default — the reference report prints only processes that have entries (its
   * first section is Embroidery, though the legacy master's "05 Cutting" sorts before it).
   */
  async build(sel: ProcessFollowUpSelection, opts: { includeEmptyProcesses?: boolean } = {}) {
    for (const [label, d] of [['Date From', sel.dateFrom], ['Date To', sel.dateTo]] as const) {
      if (d !== undefined && (!DATE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)))) throw new BadRequestException(`${label} is not a valid date`);
    }
    if (sel.dateFrom && sel.dateTo && sel.dateFrom > sel.dateTo) throw new BadRequestException('Date From must be on or before Date To');

    // Every filter given is required (AND); a filter left out restricts nothing.
    // Like Order Manufacturing Entry's own totals: an entry counts while it and its Work Order are not
    // deleted — also when the Work Order item it was booked on has since been replaced (deleted).
    const where: Prisma.Sql[] = [
      Prisma.sql`p."IsDeleted" = 0`, Prisma.sql`COALESCE(wo."IsDeleted", 0) = 0`,
      Prisma.sql`p."ProductionType" = ${PRODUCTION_TYPE_MANUFACTURING}`,
    ];
    if (sel.dateFrom) where.push(Prisma.sql`p."ProductionDate"::date >= ${sel.dateFrom}::date`);
    if (sel.dateTo) where.push(Prisma.sql`p."ProductionDate"::date <= ${sel.dateTo}::date`);
    if (sel.customerIds?.length) where.push(Prisma.sql`wo."CurrentAccountId" IN (${Prisma.join(sel.customerIds)})`);
    if (sel.workOrderIds?.length) where.push(Prisma.sql`wo."RecId" IN (${Prisma.join(sel.workOrderIds)})`);
    if (sel.orderNo) where.push(textCondition(Prisma.sql`wo."WorkOrderNo"`, sel.orderNo));
    if (sel.styleCode) where.push(textCondition(Prisma.sql`sc."styleNumber"`, sel.styleCode));
    if (sel.styleName) where.push(textCondition(Prisma.sql`sc."title"`, sel.styleName));
    if (sel.color) where.push(textCondition(Prisma.sql`pv.color`, sel.color));
    if (sel.processIds?.length) where.push(Prisma.sql`p."ProcessId" IN (${Prisma.join(sel.processIds)})`);
    if (sel.factoryIds?.length) where.push(Prisma.sql`p."CurrentAccountId" IN (${Prisma.join(sel.factoryIds)})`);

    // One row per (Process, Work Order, Color, Factory, movement kind, quality type); each entry's
    // size quantities are summed in the lateral subquery first, so an entry is counted exactly once.
    const raw = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      WITH lines AS (
        SELECT p."ProcessId" as "processId", wo."RecId" as "workOrderId", pv.color, p."CurrentAccountId" as "factoryId",
          p."InOut" as "inOut", COALESCE(p."IsRepair", 0) as "isRepair", p."ProductionSubType" as "qualityTypeId", pv.qty,
          p."ProductionDate" as "productionDate"
        FROM "MA_WorkOrderProduction" p
        JOIN "MA_WorkOrderItem" it ON it."RecId" = p."WorkOrderItemId"
        JOIN "MA_WorkOrder" wo ON wo."RecId" = it."WorkOrderId"
        LEFT JOIN "StyleCard" sc ON sc."id" = wo."StyleCardId"
        JOIN LATERAL (
          SELECT SUM(v."Quantity") as qty, MIN(trim(split_part(iv."Explanation", ${COLOR_SIZE_SEP}, 1))) as color
          FROM "MA_WorkOrderProductionVariant" v
          JOIN "MA_WorkOrderItemVariant" iv ON iv."RecId" = v."WorkOrderItemVariantId"
          WHERE v."WorkOrderProductionId" = p."RecId" AND COALESCE(v."IsDeleted", 0) = 0
        ) pv ON pv.qty IS NOT NULL
        WHERE ${Prisma.join(where, ' AND ')}
      )
      SELECT l."processId", pr."ProcessCode" as "processCode", pr."ProcessName" as "processName",
        wo."RecId" as "workOrderId", wo."WorkOrderNo" as "orderNo", to_char(wo."DeliveryDate", 'YYYY-MM-DD') as "deliveryDate",
        wo."CustomerOrderNo" as "customerOrderNo", wo."CurrentAccountId" as "customerId", c."CurrentAccountCode" as "customerCode", c."CurrentAccountName" as "customerName",
        sc."styleNumber" as "styleCode", sc."title" as "styleName", sc."attachments" as "styleAttachments",
        l.color, l."factoryId", f."CurrentAccountCode" as "factoryCode", f."CurrentAccountName" as "factoryName",
        l."inOut", l."isRepair", l."qualityTypeId", SUM(l.qty) as qty,
        to_char(MIN(l."productionDate"), 'YYYY-MM-DD') as "firstDate", to_char(MAX(l."productionDate"), 'YYYY-MM-DD') as "lastDate"
      FROM lines l
      JOIN "MA_WorkOrder" wo ON wo."RecId" = l."workOrderId"
      LEFT JOIN "StyleCard" sc ON sc."id" = wo."StyleCardId"
      LEFT JOIN "MA_Process" pr ON pr."RecId" = l."processId"
      LEFT JOIN "FI_Account" c ON c."RecId" = wo."CurrentAccountId"
      LEFT JOIN "FI_Account" f ON f."RecId" = l."factoryId"
      GROUP BY l."processId", pr."ProcessCode", pr."ProcessName", wo."RecId", wo."WorkOrderNo", wo."DeliveryDate",
        wo."CustomerOrderNo", wo."CurrentAccountId", c."CurrentAccountCode", c."CurrentAccountName", sc."styleNumber", sc."title", sc."attachments",
        l.color, l."factoryId", f."CurrentAccountCode", f."CurrentAccountName", l."inOut", l."isRepair", l."qualityTypeId"
      ORDER BY pr."ProcessName" NULLS LAST, l."processId", wo."WorkOrderNo" COLLATE "C", wo."RecId", l.color COLLATE "C", f."CurrentAccountName" NULLS LAST, l."factoryId"
    `);
    const quality = await this.qualityColumnsById();
    const num = (v: any) => (v == null || v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v));
    const text = (v: any) => (v == null || String(v).trim() === '' ? null : String(v).trim());
    const picture = (att: unknown) => {
      const list = Array.isArray(att) ? att : [];
      const img = list.find((a: any) => typeof a?.type === 'string' && a.type.startsWith('image/') && a.url);
      return img ? String((img as any).url) : null;
    };

    type Line = Record<string, any>;
    const byKey = new Map<string, Line>();
    for (const r of sanitizeRawRow(raw) as any[]) {
      const key = [r.processId, r.workOrderId, (r.color ?? '').toLowerCase(), r.factoryId].join('|');
      let l = byKey.get(key);
      if (!l) {
        l = {
          processId: r.processId == null ? null : Number(r.processId), processCode: text(r.processCode), process: text(r.processName),
          workOrderId: Number(r.workOrderId), orderNo: text(r.orderNo), deliveryDate: text(r.deliveryDate), customerOrderNo: text(r.customerOrderNo),
          customerCode: text(r.customerCode), customer: text(r.customerName),
          styleCode: text(r.styleCode), style: text(r.styleName), stylePicture: picture(r.styleAttachments),
          color: text(r.color), factoryCode: text(r.factoryCode), factory: text(r.factoryName),
          firstDate: text(r.firstDate), lastDate: text(r.lastDate),
          sent: 0, received: 0, returned: 0, repair: 0, qualityNotSet: 0, wastage: null,
          ...Object.fromEntries(QUALITY_COLUMNS.map((c) => [c.key, quality.defined.has(c.key) ? 0 : null])),
        };
        byKey.set(key, l);
      }
      const q = num(r.qty);
      const inOut = Number(r.inOut);
      const repair = Number(r.isRepair) === 1;
      if (r.firstDate && (!l.firstDate || r.firstDate < l.firstDate)) l.firstDate = r.firstDate;
      if (r.lastDate && (!l.lastDate || r.lastDate > l.lastDate)) l.lastDate = r.lastDate;
      if (inOut === OUT && !repair) l.sent += q;
      else if (inOut === OUT && repair) l.returned += q;
      else if (inOut === IN) {
        l.received += q;
        if (repair) l.repair += q;
        const col = r.qualityTypeId == null ? undefined : quality.byId.get(Number(r.qualityTypeId));
        if (col) l[col] += q;
        else l.qualityNotSet += q;
      }
    }
    const all = [...byKey.values()].map((l): Line => {
      for (const k of QTY_KEYS) if (typeof l[k] === 'number') l[k] = round(l[k]);
      return { ...l, balance: processBalance(l.sent, l.received, l.returned) };
    });
    const truncated = all.length > PROCESS_FOLLOW_UP_MAX_LINES;
    const lines = all.slice(0, PROCESS_FOLLOW_UP_MAX_LINES);

    const processes: { processId: number | null; code: string | null; name: string | null; lines: Line[]; totals: ProcessTotals }[] = [];
    for (const l of lines) {
      let p = processes[processes.length - 1];
      if (!p || p.processId !== l.processId) {
        p = { processId: l.processId, code: l.processCode, name: l.process, lines: [], totals: processTotals([]) };
        processes.push(p);
      }
      p.lines.push(l);
    }
    for (const p of processes) p.totals = processTotals(p.lines);
    // Sections in the Process dropdown's order (the master's); entries of a process no longer in the
    // master (deleted) still print, after the master's processes.
    const master = await this.processMaster();
    if (opts.includeEmptyProcesses) {
      const wanted = sel.processIds?.length ? new Set(sel.processIds) : null;
      for (const m of master) {
        if ((!wanted || wanted.has(m.id)) && !processes.some((p) => p.processId === m.id)) {
          processes.push({ processId: m.id, code: m.code, name: m.name, lines: [], totals: processTotals([]) });
        }
      }
    }
    const rank = new Map(master.map((m, i) => [m.id, i]));
    processes.sort((a, b) => (rank.get(a.processId ?? -1) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.processId ?? -1) ?? Number.MAX_SAFE_INTEGER));
    const missingQuality: string[] = QUALITY_COLUMNS.filter((c) => !quality.defined.has(c.key)).map((c) => c.key);
    return { generatedAt: new Date().toISOString(), truncated, lineCount: lines.length, missingQuality, processes };
  }

  /** Display names for the chosen accounts / Work Orders / processes (for the applied-filter line). */
  async names(table: 'account' | 'workOrder' | 'process', ids: number[]): Promise<string[]> {
    if (!ids.length) return [];
    const q = {
      account: Prisma.sql`SELECT "RecId" as id, concat_ws(' ', "CurrentAccountCode", "CurrentAccountName") as name FROM "FI_Account"`,
      workOrder: Prisma.sql`SELECT "RecId" as id, "WorkOrderNo" as name FROM "MA_WorkOrder"`,
      process: Prisma.sql`SELECT "RecId" as id, "ProcessName" as name FROM "MA_Process"`,
    }[table];
    const rows = sanitizeRawRow(await this.prisma.$queryRaw<any[]>(Prisma.sql`${q} WHERE "RecId" IN (${Prisma.join(ids)})`));
    const byId = new Map(rows.map((r: any) => [Number(r.id), String(r.name ?? '')]));
    return ids.map((id) => byId.get(id) || `#${id}`);
  }
}

export type ProcessFollowUpReport = Awaited<ReturnType<ProcessFollowUpService['build']>>;
