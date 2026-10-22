import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ResolvedUdfRecord, UdfActor, resolveUdfRecord } from './custom-field-records';

// Grid-level User Defined Fields — the logical detail grids whose rows can carry UDF values.
//
// A grid is keyed by what its rows ARE, not by the page showing them: "OrderLine" is every
// IM_OrderReceiptItem row, whether the Purchase Order or the Subcontract Order screen renders it,
// so one definition applies to every usage of the grid while each value stays on its own row
// (CustomFieldValue.entity = grid key, entityId = the row's id).
//
// Ownership is resolved server-side and never taken from the client: the parent document is
// looked up through its screen entity's own resolver (custom-field-records.ts — same permission
// module, same reach), and a row id is only accepted if it is a live row of THAT document.
//
// Only rows with an id that survives the owning screen's Save are registered:
//  - the legacy line tables are written row by row (create / update / soft-delete by RecId);
//  - StyleBomLine / SampleBomLine are replaced on every save, but style-extras.service.ts keeps
//    each row's id across the replace (a row id the card already had is reused, see keepRowIds),
//    and the BOM grid shows one row per material with its colour siblings collapsed under the
//    first row's id — that id is the row's UDF key; the colour siblings never carry values.
// Work Order BOM (MA_RecipeItem) is deliberately not a source yet — see UNSUPPORTED_USAGES.

export interface UdfGridSource {
  /** Screen entity of the parent document (custom-field-records.ts resolves and authorizes it). */
  entity: string;
  /** Where the grid appears, for administration. */
  usage: string;
  /** Ids of the parent's live rows — one query, never one per row. */
  rowIds: (prisma: PrismaService, parentId: string) => Promise<string[]>;
}

export interface UdfGridDef {
  label: string;
  sources: UdfGridSource[];
  /** Usages of the same logical grid whose rows cannot hold values yet, and why. */
  unsupported?: { usage: string; reason: string }[];
}

/** Live rows of a legacy line table. Table/column names are constants from this file, never request data. */
const legacyLines = (table: string, parentColumn: string) => async (prisma: PrismaService, parentId: string) => {
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "RecId"::text AS id FROM ${Prisma.raw(`"${table}"`)}
    WHERE ${Prisma.raw(`"${parentColumn}"`)} = ${BigInt(parentId)} AND "IsDeleted" = 0`);
  return rows.map((r) => r.id);
};

export const UDF_GRIDS: Record<string, UdfGridDef> = {
  InventoryReceiptLine: {
    label: 'Inventory Receipt Lines',
    sources: [{ entity: 'InventoryReceipt', usage: 'Inventory Receipts (every receipt type)', rowIds: legacyLines('IM_ReceiptItem', 'InventoryReceiptId') }],
  },
  OrderLine: {
    label: 'Order Lines',
    sources: [
      { entity: 'PurchaseOrder', usage: 'Purchase Orders', rowIds: legacyLines('IM_OrderReceiptItem', 'OrderReceiptId') },
      { entity: 'SubcontractOrder', usage: 'Subcontract Orders', rowIds: legacyLines('IM_OrderReceiptItem', 'OrderReceiptId') },
    ],
  },
  ContractLine: {
    label: 'Contract Lines',
    sources: [{ entity: 'Contract', usage: 'Purchase Contracts, Sale Contracts', rowIds: legacyLines('SM_ContractItem', 'ReceiptId') }],
  },
  FiReceiptLine: {
    label: 'Financial Receipt Lines',
    sources: [{ entity: 'FiReceipt', usage: 'Financial Receipts', rowIds: legacyLines('FI_ReceiptItem', 'CurrentAccountReceiptId') }],
  },
  BomLine: {
    label: 'BOM Lines',
    sources: [
      {
        entity: 'StyleCard', usage: 'Style Cards',
        rowIds: async (prisma, parentId) => (await prisma.styleBomLine.findMany({ where: { styleCardId: parentId }, select: { id: true } })).map((r) => r.id),
      },
      {
        entity: 'SampleCard', usage: 'Sample Cards',
        rowIds: async (prisma, parentId) => (await prisma.sampleBomLine.findMany({ where: { sampleCardId: parentId }, select: { id: true } })).map((r) => r.id),
      },
    ],
    unsupported: [{
      usage: 'Work Orders',
      reason: 'Work Order BOM rows (MA_RecipeItem) are rewritten with new ids by every BOM write path (BOM tab, C/S Details, Transfer, Requirements, Copy Order), and the grid also shows Style Card rows the Work Order has not stored — no stable row key exists yet.',
    }],
  },
};

export const isUdfGrid = (key: unknown): key is string =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(UDF_GRIDS, key);

export interface ResolvedUdfGrid {
  grid: string;
  def: UdfGridDef;
  source: UdfGridSource;
  parent: ResolvedUdfRecord;
}

/** The grid and its parent document, if the grid exists and the document is within the caller's reach. */
export async function resolveUdfGrid(prisma: PrismaService, grid: unknown, parentId: unknown, user: UdfActor): Promise<ResolvedUdfGrid | null> {
  if (!isUdfGrid(grid)) return null;
  const def = UDF_GRIDS[grid];
  for (const source of def.sources) {
    const parent = await resolveUdfRecord(prisma, source.entity, parentId, user);
    if (parent) return { grid, def, source, parent };
  }
  return null;
}

/** Ids of the live rows of one resolved parent document — one query. */
export function liveGridRowIds(prisma: PrismaService, resolved: ResolvedUdfGrid): Promise<string[]> {
  return resolved.source.rowIds(prisma, resolved.parent.entityId);
}
