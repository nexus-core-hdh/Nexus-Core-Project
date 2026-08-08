import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';

interface SatelliteConfig {
  table: string;
  fkColumn: string; // column on the satellite table pointing back to IM_Item.RecId
  columns: string[];
}

// One entry per satellite tab, same config-driven approach as AccountSatellitesService —
// every one of these tables already exists in the migrated schema as IM_Item's real child
// tables (confirmed via pg_catalog FK inspection), so this is reuse, not new tables.
// "Warehouse Status" is deliberately NOT its own entry: the legacy screen's two warehouse
// tabs (Status + Parameters) both read/write the same per-warehouse row for a given item —
// there is no separate quantity-tracking table. Giving them independent CRUD would let a
// warehouse row be created twice for the same item. Warehouse Status is read-only on the
// frontend, reusing this same 'warehouse-parameters' key.
const SATELLITES: Record<string, SatelliteConfig> = {
  prices: {
    table: 'IM_ItemPriceList', fkColumn: 'InventoryId',
    columns: ['PriceType', 'PriceCode', 'Price', 'Discount', 'VatIncluded', 'ForexId', 'StartDate', 'EndDate', 'InUse'],
  },
  'warehouse-parameters': {
    table: 'IM_ItemWarehouse', fkColumn: 'InventoryId',
    columns: ['WarehouseId', 'MinimumQuantity', 'OptimumQuantity', 'ControlType', 'MControlType', 'IsAction'],
  },
  barcode: {
    table: 'IM_ItemBarcode', fkColumn: 'InventoryId',
    columns: ['Barcode', 'BarcodeType', 'PluCode', 'UnitSetItemId', 'Quantity', 'InUse'],
  },
  unit: {
    table: 'IM_ItemUnitItemSize', fkColumn: 'InventoryId',
    // Dimensions (UnitWidth.../UnitWeightUnitId) and UseForRecipe were already real columns
    // on this existing table (confirmed via pg_catalog) but not previously exposed here —
    // Fabric Card's Unit tab now copies a Unit Set item's full detail (matching the Unit Set
    // screen's own Identity/Conversion/Options/Dimensions grid), so every already-existing
    // column that grid touches needs to round-trip through this same generic satellite CRUD.
    columns: [
      'UnitItemId', 'UnitFactor', 'UnitDivisor', 'IsMainUnit', 'IsDivisible',
      'UseForCommon', 'UseForPurchase', 'UseForSale', 'UseForRecipe',
      'UnitWidth', 'UnitWidthUnitId', 'UnitLength', 'UnitLengthUnitId',
      'UnitHeight', 'UnitHeightUnitId', 'UnitArea', 'UnitAreaUnitId',
      'UnitVolume', 'UnitVolumeUnitId', 'UnitWeight', 'UnitWeightUnitId',
      'InUse',
    ],
  },
  explanation: {
    table: 'IM_ItemExplanation', fkColumn: 'InventoryId',
    columns: ['ExplanationType', 'ExplanationText', 'InUse'],
  },
  attributes: {
    table: 'IM_ItemAttribute', fkColumn: 'InventoryId',
    columns: ['AttributeSetId', 'AttributeSetItemId', 'InUse'],
  },
};

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);

@Injectable()
export class YarnCardSatellitesService {
  constructor(private readonly prisma: PrismaService) {}

  private config(tab: string): SatelliteConfig {
    const cfg = SATELLITES[tab];
    if (!cfg) throw new BadRequestException(`Unknown yarn card tab "${tab}"`);
    return cfg;
  }

  private async toDb(table: string) {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, table));
  }

  async list(tab: string, itemId: number) {
    const cfg = this.config(tab);
    const select = Prisma.raw(['"RecId" as id', ...cfg.columns.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${select} FROM ${Prisma.raw(`"${cfg.table}"`)}
      WHERE ${Prisma.raw(`"${cfg.fkColumn}"`)} = ${itemId} AND "IsDeleted" = 0
      ORDER BY "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  async create(tab: string, itemId: number, dto: Record<string, any>, userId: number) {
    const cfg = this.config(tab);
    const toDb = await this.toDb(cfg.table);
    const cols = cfg.columns.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    const colList = Prisma.raw([`"${cfg.fkColumn}"`, ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, dto[camel(c)]));
    const select = Prisma.raw(['"RecId" as id', ...cfg.columns.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO ${Prisma.raw(`"${cfg.table}"`)} (${colList})
      VALUES (${itemId}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${select}
    `);
    return sanitizeRawRow(rows[0]);
  }

  // Symmetric with create()/remove() — needed by Fabric Card's Unit tab, which (unlike the
  // other satellite tabs) lets the user edit a row's values in place after copying them in
  // from a Unit Set item, rather than only ever adding/removing whole rows.
  async update(tab: string, lineId: number, dto: Record<string, any>, userId: number) {
    const cfg = this.config(tab);
    const toDb = await this.toDb(cfg.table);
    const cols = cfg.columns.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    const select = Prisma.raw(['"RecId" as id', ...cfg.columns.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
    if (!cols.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${select} FROM ${Prisma.raw(`"${cfg.table}"`)} WHERE "RecId" = ${lineId} AND "IsDeleted" = 0
      `);
      if (!rows.length) throw new NotFoundException('Row not found');
      return sanitizeRawRow(rows[0]);
    }
    const assignments = Prisma.join(cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE ${Prisma.raw(`"${cfg.table}"`)} SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${lineId} AND "IsDeleted" = 0
      RETURNING ${select}
    `);
    if (!rows.length) throw new NotFoundException('Row not found');
    return sanitizeRawRow(rows[0]);
  }

  async remove(tab: string, lineId: number, userId: number) {
    const cfg = this.config(tab);
    const result = await this.prisma.$executeRaw`
      UPDATE ${Prisma.raw(`"${cfg.table}"`)} SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId}
      WHERE "RecId" = ${lineId}
    `;
    if (!result) throw new NotFoundException('Row not found');
    return { message: 'Deleted' };
  }
}
