import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';

interface SatelliteConfig {
  table: string;
  fkColumn: string; // column on the satellite table pointing back to FI_Account.RecId
  columns: string[]; // writable columns besides the FK
}

// One entry per satellite tab. Add here to extend a tab later — no controller/service duplication needed.
// Column value coercion (dates/bits/numerics for the migrated Udt* domain types) is derived
// from pg_catalog per table via legacy-db-types.util, not hand-listed here.
const SATELLITES: Record<string, SatelliteConfig> = {
  'forex-rates': {
    table: 'FI_AccountForexRate', fkColumn: 'CurrentAccountId',
    columns: ['StartDate', 'EndDate', 'ForexId', 'Forex2Id', 'Price', 'InUse'],
  },
  address: {
    table: 'FI_Address', fkColumn: 'CurrentAccountId',
    columns: ['AddressType', 'Explanation', 'Line1', 'Line2', 'Line3', 'Line4', 'DistrictId', 'CityId', 'PostalCode', 'StateId', 'CountryId', 'TownId', 'Phone', 'Fax', 'EMail', 'IsDefault', 'InUse'],
  },
  contacts: {
    table: 'FI_AccountContact', fkColumn: 'CurrentAccountId',
    columns: ['Title', 'Name', 'Surname', 'Position', 'EMailAddress', 'Phone', 'Fax', 'GsmNo', 'BirthDate', 'Gender', 'Explanation', 'IsDefault', 'InUse'],
  },
  explanations: {
    table: 'FI_AccountExplanation', fkColumn: 'CurrentAccountId',
    columns: ['ExplanationType', 'ForexId', 'StartDate', 'EndDate', 'ExplanationText', 'InUse'],
  },
  guarantors: {
    table: 'FI_Guarantor', fkColumn: 'CurrentAccountId',
    columns: ['GuarantorName', 'Explanation', 'IdNo', 'GsmPhone', 'InUse'],
  },
  'bank-accounts': {
    table: 'FI_AccountBank', fkColumn: 'CurrentAccountId',
    columns: ['Explanation', 'ForexId', 'AccountNo', 'IbanNo', 'IsWebCommerce', 'IsDefault', 'InUse'],
  },
  'inventory-attributes': {
    table: 'FI_AccountInventoryAttribute', fkColumn: 'CurrentAccountId',
    columns: ['AttributeSetId', 'InUse'],
  },
};

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);

@Injectable()
export class AccountSatellitesService {
  constructor(private readonly prisma: PrismaService) {}

  private config(tab: string): SatelliteConfig {
    const cfg = SATELLITES[tab];
    if (!cfg) throw new BadRequestException(`Unknown account tab "${tab}"`);
    return cfg;
  }

  private async toDb(table: string) {
    const columnTypes = await getColumnTypeMap(this.prisma, table);
    return buildDbValueCoercer(columnTypes);
  }

  async list(tab: string, accountId: number) {
    const cfg = this.config(tab);
    const select = Prisma.raw(['"RecId" as id', ...cfg.columns.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${select} FROM ${Prisma.raw(`"${cfg.table}"`)}
      WHERE ${Prisma.raw(`"${cfg.fkColumn}"`)} = ${accountId} AND "IsDeleted" = 0
      ORDER BY "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  async create(tab: string, accountId: number, dto: Record<string, any>, userId: number) {
    const cfg = this.config(tab);
    const toDb = await this.toDb(cfg.table);
    const cols = cfg.columns.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    const colList = Prisma.raw([`"${cfg.fkColumn}"`, ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, dto[camel(c)]));
    const select = Prisma.raw(['"RecId" as id', ...cfg.columns.map((c) => `"${c}" as "${camel(c)}"`)].join(', '));
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO ${Prisma.raw(`"${cfg.table}"`)} (${colList})
      VALUES (${accountId}, ${Prisma.join(values)}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${select}
    `);
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

  // Monthly / Forex Balance Breakdowns tabs — read-only aggregate view of FI_AccountTotal
  async totals(accountId: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "FiscalYear" as "fiscalYear", "ForexId" as "forexId",
        "Debit01"::float as "debit01", "Debit02"::float as "debit02", "Debit03"::float as "debit03", "Debit04"::float as "debit04",
        "Debit05"::float as "debit05", "Debit06"::float as "debit06", "Debit07"::float as "debit07", "Debit08"::float as "debit08",
        "Debit09"::float as "debit09", "Debit10"::float as "debit10", "Debit11"::float as "debit11", "Debit12"::float as "debit12",
        "Credit01"::float as "credit01", "Credit02"::float as "credit02", "Credit03"::float as "credit03", "Credit04"::float as "credit04",
        "Credit05"::float as "credit05", "Credit06"::float as "credit06", "Credit07"::float as "credit07", "Credit08"::float as "credit08",
        "Credit09"::float as "credit09", "Credit10"::float as "credit10", "Credit11"::float as "credit11", "Credit12"::float as "credit12"
      FROM "FI_AccountTotal" WHERE "CurrentAccountId" = ${accountId}
      ORDER BY "FiscalYear" DESC, "ForexId"
    `);
    return sanitizeRawRow(rows);
  }
}
