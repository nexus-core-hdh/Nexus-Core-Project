import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Company isolation for the legacy ERP — phase 1 (mapping foundation). The ONE place that turns the
// authenticated user's NexusCore company (the JWT's companyId, the same tenant key every NexusCore
// module filters on) into the legacy ERP company its records live under:
//   Company.legacyCompanyId -> MD_Company.RecId (prisma migration 20261031000000), plus that legacy
//   company's workplace (MD_Workplace — legacy rows carry both CompanyId and WorkplaceId).
//
// Rules:
//  - Input is the authenticated user only. There is deliberately no parameter for a legacy company
//    id: a client can never choose it (a request body/query value is never consulted).
//  - Fail closed: no company on the token, an unknown company, no mapping, a mapping to a missing /
//    deleted / unused legacy company, or a legacy company without a live workplace -> 403. No
//    fallback to company 1 (which is what the legacy services hard-code today).
//  - Workplace: the legacy company's live workplace with the lowest RecId (MD_Workplace has no
//    "default" flag; today every legacy company has exactly one).
//
// Not wired into any legacy module yet: phase 2 stamps writes with it, phase 3 filters reads with it.

export interface LegacyCompanyContext {
  /** NexusCore Company.id (from the token). */
  companyId: string;
  /** MD_Company.RecId — the value legacy rows store in "CompanyId". */
  legacyCompanyId: number;
  /** MD_Workplace.RecId — the value legacy rows store in "WorkplaceId". */
  workplaceId: number;
}

/** What the resolver reads from the request: the authenticated user (JwtStrategy's req.user). */
export interface AuthenticatedCompanyUser {
  companyId?: string | null;
}

export const LEGACY_COMPANY_NOT_LINKED = 'This company is not linked to a legacy ERP company. Ask an administrator to set the mapping.';
export const LEGACY_COMPANY_INVALID = 'This company\'s legacy ERP company mapping is invalid. Ask an administrator to check it.';

@Injectable()
export class LegacyCompanyContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(user: AuthenticatedCompanyUser | null | undefined): Promise<LegacyCompanyContext> {
    const companyId = typeof user?.companyId === 'string' ? user.companyId.trim() : '';
    if (!companyId) throw new ForbiddenException('No company on the signed-in user.');

    // Raw SQL (like the rest of the legacy module), so this does not depend on a regenerated client.
    const rows = await this.prisma.$queryRaw<{ legacyCompanyId: number | null }[]>(Prisma.sql`
      SELECT "legacyCompanyId" FROM "Company" WHERE "id" = ${companyId}`);
    if (!rows.length) throw new ForbiddenException('Unknown company on the signed-in user.');
    const legacyCompanyId = rows[0].legacyCompanyId;
    if (legacyCompanyId === null || legacyCompanyId === undefined) throw new ForbiddenException(LEGACY_COMPANY_NOT_LINKED);

    const [legacy] = await this.prisma.$queryRaw<{ ok: number; workplaceId: number | null }[]>(Prisma.sql`
      SELECT 1 AS ok,
        (SELECT w."RecId" FROM "MD_Workplace" w
          WHERE w."CompanyId" = c."RecId" AND COALESCE(w."IsDeleted", 0) = 0 AND COALESCE(w."InUse", 1) <> 0
          ORDER BY w."RecId" LIMIT 1) AS "workplaceId"
      FROM "MD_Company" c
      WHERE c."RecId" = ${legacyCompanyId} AND COALESCE(c."IsDeleted", 0) = 0 AND COALESCE(c."InUse", 1) <> 0`);
    if (!legacy || legacy.workplaceId === null || legacy.workplaceId === undefined) throw new ForbiddenException(LEGACY_COMPANY_INVALID);

    return { companyId, legacyCompanyId: Number(legacyCompanyId), workplaceId: Number(legacy.workplaceId) };
  }
}
