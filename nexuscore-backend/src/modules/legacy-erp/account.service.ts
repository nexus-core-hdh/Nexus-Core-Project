import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';

const TABLE = 'FI_Account';

// Columns writable from the card form, grouped by the tab they belong to.
// All live on FI_Account — General/Detail/Financial Info/Personal/Manufacturing are one row.
const HEADER_COLUMNS = [
  // General
  'CurrentAccountCode', 'CurrentAccountName', 'AccessCode', 'SpecialCode', 'GroupId', 'SectorId',
  'TradingGroupId', 'CurrentAccountType', 'CurrentAccountKind', 'TradeName', 'EmployeeId', 'SellerId',
  'ChannelId', 'BrokerId', 'IsPotential', 'IsDealer', 'IsFactoring', 'CustomerGLAccountId',
  'SupplierGLAccountId', 'TermDay', 'PaymentPlanId', 'DiscountGroupCode', 'PriceGroupCode',
  'SalesDiscountId', 'PurchaseDiscountId', 'TaxOfficeId', 'TaxNo', 'ForexId', 'ForexRateId', 'InUse',
  // Detail
  'ParentId', 'StatusId', 'IsBlackList', 'IsVip', 'IsFrequent', 'IsAgent', 'IsSubSupplier', 'CardNo',
  'IsCardActive', 'WarehouseId', 'CostCenterId', 'ShipmentType', 'IsPartialShipment', 'MinShipmentRate',
  'TransporterId', 'Countries', 'ControlCode',
  // Financial Info
  'RiskLimit', 'ChequeRiskLimit', 'EndorsmentChequeRiskLimit', 'NoteRiskLimit', 'EndorsmentNoteRiskLimit',
  'ChequeRiskFactor', 'NoteRiskFactor', 'RiskTypeCheque', 'RiskTypeEndorsmentCheque', 'RiskType',
  'RiskOver', 'OrderRiskOver', 'DispatchRiskOver', 'ChequeRiskOver', 'InterestRate', 'PaymentType',
  'InvoicePaymentType', 'EvaluateChequeForex', 'NotForPaymentPlan', 'PaymentPlanDebit',
  'FactoringCompanyId', 'CorrespondingFactoringCompany', 'FactoringLimit', 'FactoringLimit2',
  'FactoringLimit3', 'FactoringPeriodStart', 'FactoringPeriodEnd', 'FundingLimit', 'IsReconciled',
  'ReconciliationDate',
  // Personal
  'EducationType', 'MaritalStatus', 'IdType', 'IdCardNo', 'IdNo', 'IdFathersName', 'IdMothersName',
  'SocialSecurityNo', 'Gender', 'BirthDate', 'BirthPlace', 'JobTitle', 'Profession', 'GsmPhone',
  'SpouseName', 'SpouseBirthDate', 'SpouseCompany', 'SpouseJobTitle', 'SpouseProfession',
  // Manufacturing
  'CuttingExtra', 'ProductionCertificates', 'CertificatesEndDate', 'CertificationId', 'AqlLevel',
  'EGovernmentUsageType', 'OrderShipmentControlType',
] as const;

const camel = (col: string) => col[0].toLowerCase() + col.slice(1);

const HEADER_SELECT = Prisma.raw(
  ['"RecId" as id', ...HEADER_COLUMNS.map((c) => `"${c}" as "${camel(c)}"`)].join(', '),
);

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  private async toDb() {
    const columnTypes = await getColumnTypeMap(this.prisma, TABLE);
    return buildDbValueCoercer(columnTypes);
  }

  async list(search?: string) {
    // Also returns Debit/Credit/Balance summed from the existing FI_AccountTotal (no new
    // table) for the account list screen's grid. "Balance Trial (BT)" has no documented
    // definition anywhere in the migrated schema/procedures (same situation as
    // CurrentAccountType earlier) — shown as the same Debit-minus-Credit balance until a real
    // definition is supplied.
    const rows = search
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT a."RecId" as id, a."CurrentAccountCode" as "code", a."CurrentAccountName" as "name",
            a."SpecialCode" as "specialCode",
            COALESCE(SUM(t."Debit01"+t."Debit02"+t."Debit03"+t."Debit04"+t."Debit05"+t."Debit06"+t."Debit07"+t."Debit08"+t."Debit09"+t."Debit10"+t."Debit11"+t."Debit12"), 0)::float as "debit",
            COALESCE(SUM(t."Credit01"+t."Credit02"+t."Credit03"+t."Credit04"+t."Credit05"+t."Credit06"+t."Credit07"+t."Credit08"+t."Credit09"+t."Credit10"+t."Credit11"+t."Credit12"), 0)::float as "credit"
          FROM "FI_Account" a
          LEFT JOIN "FI_AccountTotal" t ON t."CurrentAccountId" = a."RecId"
          WHERE a."IsDeleted" = 0 AND (a."CurrentAccountCode" ILIKE ${`%${search}%`} OR a."CurrentAccountName" ILIKE ${`%${search}%`})
          GROUP BY a."RecId", a."CurrentAccountCode", a."CurrentAccountName", a."SpecialCode"
          ORDER BY a."CurrentAccountCode" LIMIT 100
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT a."RecId" as id, a."CurrentAccountCode" as "code", a."CurrentAccountName" as "name",
            a."SpecialCode" as "specialCode",
            COALESCE(SUM(t."Debit01"+t."Debit02"+t."Debit03"+t."Debit04"+t."Debit05"+t."Debit06"+t."Debit07"+t."Debit08"+t."Debit09"+t."Debit10"+t."Debit11"+t."Debit12"), 0)::float as "debit",
            COALESCE(SUM(t."Credit01"+t."Credit02"+t."Credit03"+t."Credit04"+t."Credit05"+t."Credit06"+t."Credit07"+t."Credit08"+t."Credit09"+t."Credit10"+t."Credit11"+t."Credit12"), 0)::float as "credit"
          FROM "FI_Account" a
          LEFT JOIN "FI_AccountTotal" t ON t."CurrentAccountId" = a."RecId"
          WHERE a."IsDeleted" = 0
          GROUP BY a."RecId", a."CurrentAccountCode", a."CurrentAccountName", a."SpecialCode"
          ORDER BY a."CurrentAccountCode" LIMIT 100
        `);
    return sanitizeRawRow(rows).map((r: any) => ({
      ...r,
      balance: r.debit - r.credit,
      balanceTrial: r.debit - r.credit,
    }));
  }

  async get(id: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "FI_Account" WHERE "RecId" = ${id} AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Current account not found');
    return sanitizeRawRow(rows[0]);
  }

  async getByCode(code: string) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${HEADER_SELECT} FROM "FI_Account" WHERE "CurrentAccountCode" = ${code} AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Current account not found');
    return sanitizeRawRow(rows[0]);
  }

  async create(dto: Record<string, any>, userId: number) {
    if (!dto.currentAccountCode || !dto.currentAccountName) {
      throw new NotFoundException('currentAccountCode and currentAccountName are required');
    }
    const toDb = await this.toDb();
    const cols = HEADER_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = cols.map((c) => toDb(c, dto[camel(c)]));
    const valuesSql = Prisma.join([1, 1, ...values]);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "FI_Account" (${colList})
      VALUES (${valuesSql}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async update(id: number, dto: Record<string, any>, userId: number) {
    await this.get(id);
    const toDb = await this.toDb();
    const cols = HEADER_COLUMNS.filter((c) => toDb(c, dto[camel(c)]) !== undefined);
    if (!cols.length) return this.get(id);
    const assignments = Prisma.join(
      cols.map((c) => Prisma.sql`"${Prisma.raw(c)}" = ${toDb(c, dto[camel(c)])}`),
    );
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "FI_Account" SET ${assignments}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${HEADER_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async remove(id: number, userId: number) {
    await this.get(id);
    await this.prisma.$executeRaw`
      UPDATE "FI_Account" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
    `;
    return { message: 'Deleted' };
  }
}
