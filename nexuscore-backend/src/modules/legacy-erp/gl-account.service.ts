import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { currentLegacyCompany } from './legacy-company-scope';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { sanitizeRawRow } from './raw-row.util';
import { CreateGlAccountDto, UpdateGlAccountDto } from './dto/gl-account.dto';
import { DeleteDependencyService } from './delete-dependency.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';

// Chart of Accounts — the existing legacy GL_Account table (no new table, no migration). Backs the
// Finance ERP > General Ledger > Chart of Accounts screen, and is the FK target of
// FI_Account.CustomerGLAccountId/SupplierGLAccountId plus ~30 other legacy columns.
//
// Delete is a soft delete (IsDeleted = 1, like every legacy master), allowed only when NO live record
// references the account — see DeleteDependencyService's GL_Account checks. A referenced account
// can only be deactivated (InUse = 0); its saved references keep resolving.
// Deliberately NOT here:
//  - Hierarchy: GL_Account has no parent column.
//  - AccountType/CDType meanings: undocumented in the schema/code, stored as given.
const TABLE = 'GL_Account';

const ROW_SELECT = Prisma.raw(`
  "RecId" as id, "AccountCode" as "accountCode", "AccountName" as "accountName",
  "Explanation" as "explanation", "AccountType" as "accountType", "CDType" as "cdType",
  "SpecialCode" as "specialCode", "AccessCode" as "accessCode",
  (COALESCE("InUse", 0) = 1) as "inUse"
`);

// DTO field -> GL_Account column. accountCode/accountName are handled separately (required, trimmed).
const OPTIONAL_COLUMNS: Array<[keyof CreateGlAccountDto, string]> = [
  ['explanation', 'Explanation'], ['accountType', 'AccountType'], ['cdType', 'CDType'],
  ['specialCode', 'SpecialCode'], ['accessCode', 'AccessCode'], ['inUse', 'InUse'],
];

@Injectable()
export class GlAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deleteGuard: DeleteDependencyService,
    private readonly audit: AuditService,
  ) {}

  private async toDb() {
    return buildDbValueCoercer(await getColumnTypeMap(this.prisma, TABLE));
  }

  private async companyId() {
    return (await currentLegacyCompany(this.prisma)).legacyCompanyId; // company isolation
  }

  async list(search?: string) {
    const cid = await this.companyId();
    const term = search?.trim();
    const where = term
      ? Prisma.sql`AND ("AccountCode" ILIKE ${`%${term}%`} OR "AccountName" ILIKE ${`%${term}%`})`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ROW_SELECT} FROM "GL_Account"
      WHERE "IsDeleted" = 0 AND "CompanyId" = ${cid} ${where}
      ORDER BY "AccountCode", "RecId"
    `);
    return sanitizeRawRow(rows);
  }

  async get(id: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${ROW_SELECT} FROM "GL_Account" WHERE "RecId" = ${id} AND "IsDeleted" = 0 AND "CompanyId" = ${await this.companyId()}
    `);
    if (!rows.length) throw new NotFoundException('Account not found');
    return sanitizeRawRow(rows[0]);
  }

  // GL_Account has no unique index on AccountCode; the code is what users and the Current Account
  // pickers identify an account by, so it must be unique within the company (case-insensitive,
  // deleted rows ignored).
  private async assertCodeFree(code: string, excludeId?: number) {
    const exclude = excludeId ? Prisma.sql`AND "RecId" <> ${excludeId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT 1 FROM "GL_Account"
      WHERE "IsDeleted" = 0 AND "CompanyId" = ${await this.companyId()} AND LOWER("AccountCode") = LOWER(${code}) ${exclude}
      LIMIT 1
    `);
    if (rows.length) throw new ConflictException(`Account code "${code}" already exists.`);
  }

  private required(value: unknown, label: string): string {
    const v = String(value ?? '').trim();
    if (!v) throw new BadRequestException(`${label} is required`);
    return v;
  }

  async create(dto: CreateGlAccountDto, userId: number) {
    const code = this.required(dto.accountCode, 'Account Code');
    const name = this.required(dto.accountName, 'Account Name');
    await this.assertCodeFree(code);
    const toDb = await this.toDb();
    const ctx = await currentLegacyCompany(this.prisma);
    const optional = OPTIONAL_COLUMNS.filter(([k, col]) => toDb(col, dto[k]) !== undefined && k !== 'inUse');
    const cols = Prisma.raw(['"CompanyId"', '"WorkplaceId"', '"AccountCode"', '"AccountName"', ...optional.map(([, c]) => `"${c}"`),
      '"InUse"', '"InsertedAt"', '"InsertedBy"', '"IsDeleted"', '"UUID"'].join(', '));
    const values = Prisma.join([
      ctx.legacyCompanyId, ctx.workplaceId, code, name, ...optional.map(([k, c]) => toDb(c, dto[k])),
      toDb('InUse', dto.inUse) ?? 1,
    ]);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "GL_Account" (${cols}) VALUES (${values}, now(), ${userId}, 0, gen_random_uuid())
      RETURNING ${ROW_SELECT}
    `);
    return sanitizeRawRow(rows[0]);
  }

  // Only fields present in the request change; an optional field sent as "" / null is cleared.
  async update(id: number, dto: UpdateGlAccountDto, userId: number) {
    await this.get(id);
    const toDb = await this.toDb();
    const sets: Prisma.Sql[] = [];
    if (dto.accountCode !== undefined) {
      const code = this.required(dto.accountCode, 'Account Code');
      await this.assertCodeFree(code, id);
      sets.push(Prisma.sql`"AccountCode" = ${code}`);
    }
    if (dto.accountName !== undefined) sets.push(Prisma.sql`"AccountName" = ${this.required(dto.accountName, 'Account Name')}`);
    for (const [k, col] of OPTIONAL_COLUMNS) {
      const v = toDb(col, dto[k]);
      if (v === undefined) continue;
      if (k === 'inUse' && v === null) continue; // status is never left NULL
      sets.push(Prisma.sql`"${Prisma.raw(col)}" = ${v}`);
    }
    if (!sets.length) return this.get(id);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "GL_Account" SET ${Prisma.join(sets)}, "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id} AND "IsDeleted" = 0 AND "CompanyId" = ${await this.companyId()}
      RETURNING ${ROW_SELECT}
    `);
    if (!rows.length) throw new NotFoundException('Account not found');
    return sanitizeRawRow(rows[0]);
  }

  // One transaction: lock the account row (FOR UPDATE also conflicts with the FOR KEY SHARE lock a
  // concurrent INSERT/UPDATE referencing it takes through its FK, so such a write either finishes
  // first and is seen by the check, or waits until this delete commits), check every reference,
  // then soft-delete. Nothing else is touched — no cascade.
  async remove(id: number, userId: number, currentUserId?: string, companyId?: string) {
    const cid = await this.companyId();
    const before = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT ${ROW_SELECT} FROM "GL_Account" WHERE "RecId" = ${id} AND "IsDeleted" = 0 AND "CompanyId" = ${cid} FOR UPDATE
      `);
      if (!rows.length) throw new NotFoundException('Account not found');
      const account = sanitizeRawRow(rows[0]);
      const result = await this.deleteGuard.checkDependencies('GL_Account', id, tx);
      if (result.blocked) {
        const usedBy = result.dependencies.filter((d) => d.blocked).map((d) => d.label).join(', ');
        throw new ConflictException(
          `Account ${account.accountCode} — ${account.accountName} is in use (${usedBy}) and cannot be deleted. Deactivate it instead.`,
        );
      }
      await tx.$executeRaw`
        UPDATE "GL_Account" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id} AND "CompanyId" = ${cid}
      `;
      return account;
    });
    if (currentUserId && companyId) {
      this.audit.recordSafe({
        userId: currentUserId, companyId, screenKey: '/finance-erp/general-ledger/chart-of-accounts',
        entityType: 'GLAccount', entityId: String(id), action: AUDIT_ACTIONS.DELETE,
        documentNo: before.accountCode, before: { 'Account (GL_Account)': before },
      });
    }
    return { message: 'Deleted' };
  }
}
