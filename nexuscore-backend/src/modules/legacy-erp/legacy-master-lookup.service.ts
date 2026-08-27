import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { DeleteDependencyService, isProtectedEntityType } from './delete-dependency.service';

interface TableLookupConfig {
  table: string;
  codeColumn?: string; // present when the table has a real short code, else id-only label
  nameColumn: string;
  searchColumns: string[];
  // Present only for tables that also get a full "Master Lookup" management screen
  // (Fab Type Master today). `activeColumn` is the InUse-style flag search() additionally
  // filters on for FK-picker consumers ("only Active records appear in lookup"); `label` is
  // the management screen's title. Tables without these two stay exactly what they were —
  // simple read-only pickers with no management UI.
  activeColumn?: string;
  label?: string;
}

// Generic "search a real master table" lookup, config-driven the same way
// ParameterLookupService covers MD_Parameter and AccountSatellitesService covers per-tab
// child tables. Every table below already exists in the migrated schema (each is an
// IM_Item foreign key target, confirmed via pg_catalog) — this adds zero new tables, just
// a single reusable read endpoint so lookup fields across legacy-erp screens (Yarn Card
// today, any future Item-based card screen tomorrow) don't need one bespoke service each.
//
// A subset of these (currently just `fabric`) is ALSO a full CRUD "Master Lookup" screen —
// adding one to that subset is "configuration only": set `activeColumn` + `label` on its
// existing entry here (or add a new entry for a table that doesn't have a picker yet) and
// it gets list/create/update/soft-delete for free from the methods below, no new service.
const TABLES: Record<string, TableLookupConfig> = {
  category: { table: 'IM_Category', nameColumn: 'CategoryName', searchColumns: ['CategoryName'] },
  group: {
    table: 'IM_Group', codeColumn: 'GroupCode', nameColumn: 'GroupName', searchColumns: ['GroupCode', 'GroupName'],
    // IM_Group already had InUse — confirmed via pg_catalog — so "Group Code" becomes a
    // manageable master purely by adding these two fields to its existing entry, exactly
    // like Fab Type. No new table.
    activeColumn: 'InUse', label: 'Group Code Master',
  },
  mark: { table: 'IM_Mark', nameColumn: 'MarkName', searchColumns: ['MarkName'] },
  model: { table: 'IM_Model', nameColumn: 'ModelName', searchColumns: ['ModelName'] },
  'variant-type': { table: 'IM_VariantType', nameColumn: 'TypeName', searchColumns: ['TypeName'] },
  // NOTE: there is deliberately no generic "yarn" entry here. MD_Yarn is an empty, unused
  // reference table (confirmed via a live row count) — the real Yarn Card records live in
  // IM_Item (AccessCode = 'YARN') and are already fully served by YarnCardService/
  // yarn-card.controller.ts (list/get/create/update/remove). Fabric Card's Yarn Count 1-4
  // fields search that existing service directly (legacyErpApi.yarnCards.list) instead of
  // going through this generic picker, so Yarn Count never gets its own master table.
  tax: { table: 'FI_Tax', codeColumn: 'TaxCode', nameColumn: 'Explanation', searchColumns: ['TaxCode', 'Explanation'] },
  'withholding-type': { table: 'MD_WithholdingType', codeColumn: 'Code', nameColumn: 'Name', searchColumns: ['Code', 'Name'] },
  warehouse: { table: 'IM_Warehouse', codeColumn: 'WarehouseCode', nameColumn: 'WarehouseName', searchColumns: ['WarehouseCode', 'WarehouseName'] },
  fabric: {
    table: 'MD_Fabric', codeColumn: 'FabricCode', nameColumn: 'FabricName', searchColumns: ['FabricCode', 'FabricName'],
    activeColumn: 'InUse', label: 'Fab Type Master',
  },
  process: { table: 'MA_Process', codeColumn: 'ProcessCode', nameColumn: 'ProcessName', searchColumns: ['ProcessCode', 'ProcessName'] },
  // Finish GSM / Dye Type / Composition — confirmed via a DB-wide search that no existing
  // table/column represented these as a real master (they only existed as free-text columns
  // directly on IM_Item). Three new tables (MD_FinishGSM / MD_DyeType / MD_Composition),
  // each an exact structural mirror of MD_Fabric — own PK, own unique Code index, own
  // IsDeleted/InUse — so their data can never mix with each other or with Fab Type.
  'finish-gsm': {
    table: 'MD_FinishGSM', codeColumn: 'FinishGSMCode', nameColumn: 'FinishGSMName', searchColumns: ['FinishGSMCode', 'FinishGSMName'],
    activeColumn: 'InUse', label: 'Finish GSM Master',
  },
  'dye-type': {
    table: 'MD_DyeType', codeColumn: 'DyeTypeCode', nameColumn: 'DyeTypeName', searchColumns: ['DyeTypeCode', 'DyeTypeName'],
    activeColumn: 'InUse', label: 'Dye Type Master',
  },
  composition: {
    table: 'MD_Composition', codeColumn: 'CompositionCode', nameColumn: 'CompositionName', searchColumns: ['CompositionCode', 'CompositionName'],
    activeColumn: 'InUse', label: 'Composition Master',
  },
  // Currency/Forex — already-existing table (confirmed via pg_catalog, 0 rows, first
  // reader), the same one IM_OrderReceipt.ForexId/IM_OrderReceiptItem.ForexId already FK
  // into. Needed for Purchase Order's per-line Forex column. No new table.
  forex: { table: 'MD_Forex', codeColumn: 'ForexCode', nameColumn: 'ForexName', searchColumns: ['ForexCode', 'ForexName'] },
  // Unit — already-existing table (confirmed live: 12 rows), the same one
  // IM_OrderReceiptItem.UnitId already FKs into. MD_UnitSetItem is normally read through
  // unit-set.service.ts's nested "one set's items" route, but Purchase Order's per-line Unit
  // column needs a flat, cross-set search exactly like every other generic lookup here — no
  // new table, just exposing an existing one through the already-existing generic endpoint.
  unit: { table: 'MD_UnitSetItem', codeColumn: 'UnitCode', nameColumn: 'UnitName', searchColumns: ['UnitCode', 'UnitName'] },
  // Service — already-existing master (confirmed live: 46 columns, IsDeleted+InUse present,
  // 0 rows), the same one IM_OrderReceiptItem.ServiceCardId already FKs into (that FK existed
  // before this change but nothing wrote to it). Needed for Purchase Order's Type=Service
  // Code column. No new table.
  service: { table: 'SM_Service', codeColumn: 'ServiceCode', nameColumn: 'ServiceName', searchColumns: ['ServiceCode', 'ServiceName'] },
  // Manufacturing Order — already-existing master (MA_WorkOrder: RecId + WorkOrderNo, 0 rows).
  // Named distinctly from the grid's separate pre-existing "Work Order No" column (which FKs
  // into the child table MA_WorkOrderItem, not this header table) to avoid conflating the two.
  'manufacturing-order': { table: 'MA_WorkOrder', codeColumn: 'WorkOrderNo', nameColumn: 'WorkOrderNo', searchColumns: ['WorkOrderNo'] },
  // Size Parameter — already-existing flat master (MA_SizeSetParameter: RecId/Code/Name1/Name2/
  // Name3/InUse, 0 rows), already FK'd from IM_ItemPieceSize/MA_InitialCostItem/MA_RecipeItem/
  // MA_WorkOrderQCTestItem. Needed for the Size screen's Detail tab Code picker
  // (size-set.service.ts's MA_SizeSetItem.SizeSetParameterId) — same "expose an existing table
  // through the already-existing generic endpoint" reuse as Unit/Forex above. No new table.
  'size-parameter': { table: 'MA_SizeSetParameter', codeColumn: 'Code', nameColumn: 'Name1', searchColumns: ['Code', 'Name1'] },
  // City/State/Country — already-existing masters (MD_City/MD_State/MD_Country, confirmed via
  // pg_catalog: each has its own Code/Name pair plus InUse/IsDeleted, same shape as every other
  // manageable master here). Needed as three of the "Receipt & Master Data" unified screen's
  // dropdown sources (unified-grid.service.ts's own TABLES config handles their read side;
  // this is their write side). No new table — configuration only, same reuse pattern this
  // file's own comments already describe for Group/Fab Type.
  city: { table: 'MD_City', codeColumn: 'CityCode', nameColumn: 'CityName', searchColumns: ['CityCode', 'CityName'], activeColumn: 'InUse', label: 'City Master' },
  state: { table: 'MD_State', codeColumn: 'StateCode', nameColumn: 'StateName', searchColumns: ['StateCode', 'StateName'], activeColumn: 'InUse', label: 'State Master' },
  country: { table: 'MD_Country', codeColumn: 'CountryCode', nameColumn: 'CountryName', searchColumns: ['CountryCode', 'CountryName'], activeColumn: 'InUse', label: 'Country Master' },
  // Cash / Cost Center — already-existing masters (FI_Cash/FI_CostCenter, confirmed via
  // pg_catalog, 0 rows). Needed for the new Financial Receipt screen's Cash/Cost Center picker
  // fields (fi-receipt.service.ts's CashId/CostCenterId columns). No new table. FI_Cash has no
  // separate Name column — same "use Explanation as the display name" convention as `tax` above.
  cash: { table: 'FI_Cash', codeColumn: 'CashCode', nameColumn: 'Explanation', searchColumns: ['CashCode', 'Explanation'] },
  'cost-center': { table: 'FI_CostCenter', codeColumn: 'CostCenterCode', nameColumn: 'CostCenterName', searchColumns: ['CostCenterCode', 'CostCenterName'] },
};
export type MasterLookupKey = keyof typeof TABLES;

@Injectable()
export class LegacyMasterLookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deleteGuard: DeleteDependencyService,
  ) {}

  private config(key: string): TableLookupConfig {
    const cfg = TABLES[key];
    if (!cfg) throw new BadRequestException(`Unknown lookup table "${key}"`);
    return cfg;
  }

  // Purchase Order -> per-line Unit dropdown, scoped to the selected Item. Item-specific units
  // live in "IM_ItemUnitItemSize" — the exact same table Fabric/Trim/Yarn Card's own Unit tab
  // (unit-tab.tsx) already reads/writes via each card's listTab(id, "unit"), keyed by
  // InventoryId regardless of the owning IM_Item's AccessCode (confirmed live: inventory-card
  // .service.ts's own stock/unit lookups already join this same table the same way). No new
  // table, no per-item-type branching — one query serves Fabric/Trim/Yarn/Fixed Asset PO lines
  // alike, unlike the flat cross-set `unit` lookup above which returns every MD_UnitSetItem in
  // the database regardless of item.
  // unitFactor/unitDivisor/isMainUnit are additive (Base Unit + Unit Conversion) — every existing
  // consumer of this method only ever reads id/code/name, so widening the SELECT can't change
  // their behavior. Lets the PO/Receipt line grids show a "1 Bag = 25 KG" conversion hint and lets
  // unit-conversion.util.ts's own resolveLineUnitId/assertValidItemUnit reuse this exact same join
  // instead of a second copy of it.
  async listItemUnits(inventoryId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT usi."RecId" as id, usi."UnitCode" as code, usi."UnitName" as name,
        iuis."UnitFactor" as "unitFactor", iuis."UnitDivisor" as "unitDivisor", iuis."IsMainUnit" as "isMainUnit"
      FROM "IM_ItemUnitItemSize" iuis
      JOIN "MD_UnitSetItem" usi ON usi."RecId" = iuis."UnitItemId"
      WHERE iuis."InventoryId" = ${inventoryId} AND iuis."IsDeleted" = 0
      ORDER BY iuis."IsMainUnit" DESC NULLS LAST, usi."UnitName" ASC
    `);
    return sanitizeRawRow(rows);
  }

  private manageable(key: string): Required<Pick<TableLookupConfig, 'activeColumn' | 'label' | 'codeColumn'>> & TableLookupConfig {
    const cfg = this.config(key);
    if (!cfg.activeColumn || !cfg.label || !cfg.codeColumn) {
      throw new BadRequestException(`"${key}" is not a manageable master (no activeColumn/label/codeColumn configured)`);
    }
    return cfg as any;
  }

  // Existing FK-picker search, used by every LookupField across legacy-erp screens.
  // Unchanged in shape — the only behavior change is additive: when a table has an
  // `activeColumn` configured (i.e. it's also a manageable master), only Active rows are
  // offered here, so a deactivated Fab Type (say) can no longer be picked on new records
  // while still existing for audit/history on records that already reference it.
  async search(key: string, search?: string) {
    const cfg = this.config(key);

    const select = Prisma.raw(
      ['"RecId" as id', cfg.codeColumn ? `"${cfg.codeColumn}" as "code"` : `NULL as "code"`, `"${cfg.nameColumn}" as "name"`].join(', '),
    );
    const table = Prisma.raw(`"${cfg.table}"`);
    const activeFilter = cfg.activeColumn ? Prisma.sql`AND "${Prisma.raw(cfg.activeColumn)}" = 1` : Prisma.sql``;

    if (!search) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT ${select} FROM ${table} WHERE "IsDeleted" = 0 ${activeFilter} ORDER BY "${Prisma.raw(cfg.nameColumn)}" LIMIT 50
      `);
      return sanitizeRawRow(rows);
    }

    const term = `%${search}%`;
    const whereSearch = Prisma.join(
      cfg.searchColumns.map((c) => Prisma.sql`"${Prisma.raw(c)}" ILIKE ${term}`),
      ' OR ',
    );
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${select} FROM ${table} WHERE "IsDeleted" = 0 ${activeFilter} AND (${whereSearch}) ORDER BY "${Prisma.raw(cfg.nameColumn)}" LIMIT 50
    `);
    return sanitizeRawRow(rows);
  }

  // Single-record fetch by RecId — reused by fabric-card.service.ts's required-field
  // validation (Fab Type / Finish GSM / Dye Type / Composition) so a submitted master id is
  // confirmed to be a real record before Save, without a second copy of this table's
  // config/query. Same IsDeleted-filtered shape as search() above, narrowed to one row by id
  // instead of a name/code search. Active-only by default (a NEW selection, or a CHANGED
  // identity field, must be active); `includeInactive` lets a caller resolve an EXISTING,
  // unchanged reference whose master was deactivated since it was saved — same query/config,
  // just without the active clause, rather than a second lookup method.
  async getById(key: string, id: number, opts?: { includeInactive?: boolean }) {
    const cfg = this.config(key);
    const select = Prisma.raw(
      ['"RecId" as id', cfg.codeColumn ? `"${cfg.codeColumn}" as "code"` : `NULL as "code"`, `"${cfg.nameColumn}" as "name"`].join(', '),
    );
    const table = Prisma.raw(`"${cfg.table}"`);
    const activeFilter = cfg.activeColumn && !opts?.includeInactive ? Prisma.sql`AND "${Prisma.raw(cfg.activeColumn)}" = 1` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${select} FROM ${table} WHERE "RecId" = ${id} AND "IsDeleted" = 0 ${activeFilter} LIMIT 1
    `);
    return rows.length ? sanitizeRawRow(rows[0]) : null;
  }

  // --- Master Lookup management screen (Fab Type Master today) ---------------------------

  meta(key: string) {
    const cfg = this.manageable(key);
    return { key, label: cfg.label };
  }

  // Full management grid — every non-deleted row (active AND inactive), unlike search()
  // above which is active-only. An admin reviewing the master list should still see a
  // deactivated row; only IsDeleted rows (removed via the grid's own Delete action) vanish.
  async listManaged(key: string, search?: string) {
    const cfg = this.manageable(key);
    const select = Prisma.raw([
      '"RecId" as id',
      `"${cfg.codeColumn}" as "code"`,
      `"${cfg.nameColumn}" as "name"`,
      `"${cfg.activeColumn}" as "active"`,
    ].join(', '));
    const table = Prisma.raw(`"${cfg.table}"`);
    const whereSearch = search
      ? Prisma.sql`AND ("${Prisma.raw(cfg.codeColumn)}" ILIKE ${`%${search}%`} OR "${Prisma.raw(cfg.nameColumn)}" ILIKE ${`%${search}%`})`
      : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${select} FROM ${table} WHERE "IsDeleted" = 0 ${whereSearch} ORDER BY "${Prisma.raw(cfg.nameColumn)}"
    `);
    return sanitizeRawRow(rows);
  }

  // Case-insensitive Code/Name uniqueness — mirrors the exact pattern already established
  // for Yarn Card (yarn-card.service.ts's assertUnique), same message convention.
  private async assertUnique(cfg: TableLookupConfig, code: string, name: string, excludeId?: number) {
    const table = Prisma.raw(`"${cfg.table}"`);
    const exclude = excludeId ? Prisma.sql`AND "RecId" != ${excludeId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "${Prisma.raw(cfg.codeColumn!)}" as code, "${Prisma.raw(cfg.nameColumn)}" as name FROM ${table}
      WHERE "IsDeleted" = 0
        AND (LOWER("${Prisma.raw(cfg.codeColumn!)}") = LOWER(${code}) OR LOWER("${Prisma.raw(cfg.nameColumn)}") = LOWER(${name}))
        ${exclude}
    `);
    const codeDup = rows.some((r) => String(r.code).toLowerCase() === code.toLowerCase());
    const nameDup = rows.some((r) => String(r.name).toLowerCase() === name.toLowerCase());
    if (codeDup && nameDup) throw new ConflictException('A record already exists with this Code and Name.');
    if (codeDup) throw new ConflictException('This Code already exists.');
    if (nameDup) throw new ConflictException('This Name already exists.');
  }

  async create(key: string, dto: { code?: string; name?: string }, userId: number) {
    const cfg = this.manageable(key);
    const code = String(dto.code ?? '').trim();
    const name = String(dto.name ?? '').trim();
    if (!code) throw new BadRequestException('Code is required');
    if (!name) throw new BadRequestException('Name is required');
    await this.assertUnique(cfg, code, name);

    const table = Prisma.raw(`"${cfg.table}"`);
    const select = Prisma.raw([
      '"RecId" as id', `"${cfg.codeColumn}" as "code"`, `"${cfg.nameColumn}" as "name"`, `"${cfg.activeColumn}" as "active"`,
    ].join(', '));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO ${table} ("${Prisma.raw(cfg.codeColumn!)}", "${Prisma.raw(cfg.nameColumn)}", "${Prisma.raw(cfg.activeColumn!)}", "InsertedAt", "InsertedBy", "IsDeleted", "UUID")
      VALUES (${code}, ${name}, 1, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${select}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async update(key: string, id: number, dto: { code?: string; name?: string }, userId: number) {
    const cfg = this.manageable(key);
    const code = String(dto.code ?? '').trim();
    const name = String(dto.name ?? '').trim();
    if (!code) throw new BadRequestException('Code is required');
    if (!name) throw new BadRequestException('Name is required');
    await this.assertUnique(cfg, code, name, id);

    const table = Prisma.raw(`"${cfg.table}"`);
    const select = Prisma.raw([
      '"RecId" as id', `"${cfg.codeColumn}" as "code"`, `"${cfg.nameColumn}" as "name"`, `"${cfg.activeColumn}" as "active"`,
    ].join(', '));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE ${table} SET "${Prisma.raw(cfg.codeColumn!)}" = ${code}, "${Prisma.raw(cfg.nameColumn)}" = ${name}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id} AND "IsDeleted" = 0
      RETURNING ${select}
    `);
    if (!rows.length) throw new NotFoundException('Record not found');
    return sanitizeRawRow(rows[0]);
  }

  // Config-driven, so this can reach ANY table in TABLES above once it's made manageable —
  // including one DeleteDependencyService already protects (e.g. IM_Warehouse, currently inert
  // here since `warehouse` has no activeColumn/label/codeColumn set, see `manageable()`). Rather
  // than special-casing "warehouse", every call checks the table name against the same protected
  // list DeleteDependencyService itself defines, so this generic path can never become a bypass
  // for whichever protected table gets a management screen next.
  async remove(key: string, id: number, userId: number) {
    const cfg = this.manageable(key);
    const table = Prisma.raw(`"${cfg.table}"`);
    const result = await this.prisma.$transaction(async (tx) => {
      if (isProtectedEntityType(cfg.table)) {
        await this.deleteGuard.assertDeletable(cfg.table, id, tx);
      }
      return tx.$executeRaw`
        UPDATE ${table} SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id} AND "IsDeleted" = 0
      `;
    });
    if (!result) throw new NotFoundException('Record not found');
    return { message: 'Deleted' };
  }
}
