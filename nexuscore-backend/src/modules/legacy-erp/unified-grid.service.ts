import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';

export interface UnifiedGridConfig {
  table: string;
  label: string;
  extraWhere?: Prisma.Sql;
  searchColumns: string[];
  orderBy: string;
  orderDir?: 'ASC' | 'DESC';
}

// Read-only data source for the "Receipt & Master Data" unified screen — one generic
// `SELECT *` per already-existing legacy table, config-driven the exact same way
// legacy-master-lookup.service.ts's own TABLES map is. This file never writes: every
// New/Update/Delete/Approval action from that screen calls straight back into the real
// owning module's existing service/route (InventoryReceiptService, AccountService,
// WarehouseService, AccountSatellitesService, LegacyMasterLookupService for City/State/
// Country) — this only widens the READ side so the grid can show every real column instead
// of each module's own curated list()/get() subset, without touching any of those existing
// selects or their business logic. No new table, no new column, no new write path.
// Exported for worklist-rows.service.ts (Customize Worklist relational resolution) — reuses
// this exact same table/search/order config for the primary source's base query, so a custom
// worklist's search/sort semantics never drift from Standard's.
export const TABLES: Record<string, UnifiedGridConfig> = {
  'purchase-receipt': {
    table: 'IM_Receipt', label: 'Purchase Receipt',
    extraWhere: Prisma.sql`AND "ReceiptType" = 2`,
    searchColumns: ['ReceiptNo', 'DocumentNo'], orderBy: 'ReceiptNo', orderDir: 'DESC',
  },
  // Same physical rows as 'purchase-receipt' above (IM_Receipt.ReceiptType = 2) — see
  // inventory-receipt.service.ts's own header comment: Inventory Receipt IS the Purchase
  // Receipt module (its UI label was renamed, there was never a second table). Kept as its
  // own dropdown entry only because the spec lists both by name; both resolve to the one
  // real IM_Receipt module and its one existing list/detail/create/update/delete workflow.
  'inventory-receipt': {
    table: 'IM_Receipt', label: 'Inventory Receipt',
    extraWhere: Prisma.sql`AND "ReceiptType" = 2`,
    searchColumns: ['ReceiptNo', 'DocumentNo'], orderBy: 'ReceiptNo', orderDir: 'DESC',
  },
  'current-account': {
    table: 'FI_Account', label: 'Current Account',
    searchColumns: ['CurrentAccountCode', 'CurrentAccountName'], orderBy: 'CurrentAccountCode',
  },
  // Financial Receipt & Master Data screen's own primary — FI_Receipt, a genuinely separate
  // table from IM_Receipt above (see fi-receipt.service.ts's own header comment). Same
  // ReceiptType=1 single-voucher-type convention.
  'financial-receipt': {
    table: 'FI_Receipt', label: 'Financial Receipt',
    extraWhere: Prisma.sql`AND "ReceiptType" = 1`,
    searchColumns: ['ReceiptNo', 'DocumentNo'], orderBy: 'ReceiptNo', orderDir: 'DESC',
  },
  // FI_Address rows are normally read scoped to one CurrentAccountId (account-satellites.
  // service.ts's own "address" tab). This is the same real table, just unscoped/flat for the
  // unified grid's read side — writes still go through that existing satellite service.
  address: {
    table: 'FI_Address', label: 'Address',
    searchColumns: ['Explanation', 'Line1', 'Line2', 'PostalCode'], orderBy: 'RecId', orderDir: 'DESC',
  },
  warehouse: {
    table: 'IM_Warehouse', label: 'Warehouse',
    searchColumns: ['WarehouseCode', 'WarehouseName'], orderBy: 'WarehouseCode',
  },
  city: { table: 'MD_City', label: 'City', searchColumns: ['CityCode', 'CityName'], orderBy: 'CityName' },
  state: { table: 'MD_State', label: 'State', searchColumns: ['StateCode', 'StateName'], orderBy: 'StateName' },
  country: { table: 'MD_Country', label: 'Country', searchColumns: ['CountryCode', 'CountryName'], orderBy: 'CountryName' },
};
export type UnifiedGridKey = keyof typeof TABLES;

@Injectable()
export class UnifiedGridService {
  constructor(private readonly prisma: PrismaService) {}

  private config(key: string): UnifiedGridConfig {
    const cfg = TABLES[key];
    if (!cfg) throw new BadRequestException(`Unknown Receipt & Master Data source "${key}"`);
    return cfg;
  }

  meta() {
    return Object.entries(TABLES).map(([key, cfg]) => ({ key, label: cfg.label }));
  }

  async list(key: string, search?: string) {
    const cfg = this.config(key);
    const table = Prisma.raw(`"${cfg.table}"`);
    const extraWhere = cfg.extraWhere ?? Prisma.sql``;
    const orderDir = Prisma.raw(cfg.orderDir === 'DESC' ? 'DESC' : 'ASC');
    const whereSearch = search
      ? Prisma.sql`AND (${Prisma.join(cfg.searchColumns.map((c) => Prisma.sql`"${Prisma.raw(c)}" ILIKE ${`%${search}%`}`), ' OR ')})`
      : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM ${table}
      WHERE "IsDeleted" = 0 ${extraWhere} ${whereSearch}
      ORDER BY "${Prisma.raw(cfg.orderBy)}" ${orderDir}
      LIMIT 200
    `);
    return sanitizeRawRow(rows);
  }
}
