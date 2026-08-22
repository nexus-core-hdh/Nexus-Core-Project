import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';

const TABLE = 'FI_Account';

// Columns writable from the card form, grouped by the tab they belong to.
// All live on FI_Account — General/Detail/Financial Info/Personal/Manufacturing are one row.
// Exported for worklist-fields.service.ts (Customize Worklist field-metadata source) — raw
// column names as-is, matching exactly what unified-grid.service.ts's own `SELECT *` returns.
export const HEADER_COLUMNS = [
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

// FI_Account.CurrentAccountType — see current-accounts/page.tsx's own CURRENT_ACCOUNT_TYPE_OPTIONS
// for the same "0/1/2" convention this reuses (not duplicated here: kept in sync manually since
// the enum isn't shared between frontend/backend anywhere else in this module either).
const CODE_PREFIX_BY_TYPE: Record<string, string> = { '0': 'CS', '1': 'C', '2': 'S' };
const CODE_ENTITY = 'FI_Account';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  private async toDb() {
    const columnTypes = await getColumnTypeMap(this.prisma, TABLE);
    return buildDbValueCoercer(columnTypes);
  }

  prefixForType(currentAccountType: unknown): string {
    const prefix = CODE_PREFIX_BY_TYPE[String(currentAccountType)];
    if (!prefix) throw new NotFoundException('A valid Current Account Type is required to generate a code');
    return prefix;
  }

  // Atomic, monotonic, never-reused sequence per prefix — a single INSERT ... ON CONFLICT DO
  // UPDATE ... RETURNING is one row-level-locked statement, so two concurrent callers can never
  // observe/return the same LastSeq (Postgres serializes the second writer behind the first's
  // row lock instead of both reading-then-writing the same stale value, which is what a plain
  // "SELECT MAX(...) + 1" would allow under load). The first time a given prefix is used, the
  // inserted seed comes from the highest existing "{prefix}-NNN" code already in FI_Account
  // (this table was migrated from a live legacy system, so C-001..C-00N etc. may already exist)
  // — every call after that increments the persisted counter itself, never re-deriving from the
  // live table again, which is what makes a deleted code's number impossible to reissue.
  private async nextSeq(prefix: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ LastSeq: number }[]>(Prisma.sql`
      INSERT INTO "LegacyCodeSequence" ("Entity", "Prefix", "LastSeq", "UpdatedAt")
      VALUES (
        ${CODE_ENTITY}, ${prefix},
        COALESCE((
          SELECT MAX((regexp_match("CurrentAccountCode", '^' || ${prefix} || '-(\d+)$'))[1]::int)
          FROM "FI_Account" WHERE "CurrentAccountCode" LIKE ${prefix + '-%'}
        ), 0) + 1,
        now()
      )
      ON CONFLICT ("Entity", "Prefix") DO UPDATE SET "LastSeq" = "LegacyCodeSequence"."LastSeq" + 1, "UpdatedAt" = now()
      RETURNING "LastSeq"
    `);
    return rows[0].LastSeq;
  }

  private async generateCode(currentAccountType: unknown): Promise<string> {
    const prefix = this.prefixForType(currentAccountType);
    const seq = await this.nextSeq(prefix);
    return `${prefix}-${String(seq).padStart(3, '0')}`;
  }

  // Preview only, for the Create form to display before Save — does NOT consume a sequence
  // slot (a plain SELECT, not the atomic INSERT above), so opening the form twice or leaving it
  // idle never burns numbers. The authoritative code is always (re)generated inside create()
  // itself at the moment of insert, which is what actually guarantees uniqueness under
  // concurrency; this is UX only.
  async previewNextCode(currentAccountType: unknown): Promise<string> {
    const prefix = this.prefixForType(currentAccountType);
    const rows = await this.prisma.$queryRaw<{ LastSeq: number }[]>(Prisma.sql`
      SELECT COALESCE(
        (SELECT "LastSeq" FROM "LegacyCodeSequence" WHERE "Entity" = ${CODE_ENTITY} AND "Prefix" = ${prefix}),
        (SELECT MAX((regexp_match("CurrentAccountCode", '^' || ${prefix} || '-(\d+)$'))[1]::int)
         FROM "FI_Account" WHERE "CurrentAccountCode" LIKE ${prefix + '-%'}),
        0
      ) as "LastSeq"
    `);
    const next = (rows[0]?.LastSeq ?? 0) + 1;
    return `${prefix}-${String(next).padStart(3, '0')}`;
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
    if (!dto.currentAccountName) {
      throw new NotFoundException('currentAccountName is required');
    }
    // Current Account Code is never accepted from the client — see prefixForType/generateCode
    // above. Whatever the caller sent in currentAccountCode (e.g. the earlier preview value,
    // now possibly stale) is discarded and replaced with a freshly, atomically generated one
    // at the actual moment of insert.
    const toDb = await this.toDb();
    // Retried (not looped indefinitely — 5 attempts is generous slack for a genuine collision,
    // anything beyond that means something else is wrong) purely as defense-in-depth: the
    // atomic counter in generateCode() already makes a collision between two concurrent
    // requests impossible on its own, so this only matters if FI_Account's existing
    // "CompanyId","CurrentAccountCode" unique index (FI_Account_IX0 — already present from the
    // legacy migration, reused as-is) ever rejects a generated code for a reason the counter
    // couldn't foresee (e.g. a legacy-imported code that doesn't match the "PREFIX-NNN" pattern
    // the seed-scan regex expects).
    const MAX_CODE_RETRIES = 5;
    for (let attempt = 1; attempt <= MAX_CODE_RETRIES; attempt++) {
      const currentAccountCode = await this.generateCode(dto.currentAccountType);
      const cols = HEADER_COLUMNS.filter((c) => c === 'CurrentAccountCode' || toDb(c, dto[camel(c)]) !== undefined);
      const colList = Prisma.raw(['"CompanyId"', '"WorkplaceId"', ...cols.map((c) => `"${c}"`), '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
      const values = cols.map((c) => (c === 'CurrentAccountCode' ? currentAccountCode : toDb(c, dto[camel(c)])));
      const valuesSql = Prisma.join([1, 1, ...values]);
      try {
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          INSERT INTO "FI_Account" (${colList})
          VALUES (${valuesSql}, now(), ${userId}, 0, gen_random_uuid())
          RETURNING ${HEADER_SELECT}
        `);
        return sanitizeRawRow(rows[0]);
      } catch (err: any) {
        // Same convention as YarnCardService.create()/PurchaseOrderService — the DB's real
        // (CompanyId, CurrentAccountCode) unique index (FI_Account_IX0) is the actual source of
        // truth; a collision against it just regenerates the next code and retries instead of
        // surfacing the raw Postgres error.
        const msg = String(err?.message ?? '');
        const isCodeCollision = msg.includes('23505') && msg.includes('CurrentAccountCode');
        if (isCodeCollision && attempt < MAX_CODE_RETRIES) continue;
        throw err;
      }
    }
    throw new ConflictException('Could not generate a unique Current Account code — please try again.');
  }

  async update(id: number, dto: Record<string, any>, userId: number) {
    await this.get(id);
    const toDb = await this.toDb();
    // CurrentAccountCode is immutable after creation — never editable via update, regardless
    // of what the client sends (the frontend's own Code field is already disabled, but this
    // closes the same gap at the actual source of truth, matching every other auto-generated
    // Code field in this module).
    const cols = HEADER_COLUMNS.filter((c) => c !== 'CurrentAccountCode' && toDb(c, dto[camel(c)]) !== undefined);
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
