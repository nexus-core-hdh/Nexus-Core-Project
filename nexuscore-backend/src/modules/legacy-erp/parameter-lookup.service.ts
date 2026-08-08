import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';

// MD_Parameter is a generic (PrmGroup, PrmId, PrmValue) lookup table already in the migrated
// schema, reused here instead of adding dedicated Style Group / Brand / Style Department
// tables (none exist anywhere in the schema — verified earlier this session). PrmGroup has no
// documented convention anywhere (empty table, no comment, no CHECK constraint), so these
// codes are a minimal convention, same footing as the CurrentAccountType mapping already
// agreed on Current Account Card.
export const PARAMETER_GROUPS = {
  'style-group': 101,
  brand: 102,
  'style-department': 103,
} as const;
export type ParameterGroupKey = keyof typeof PARAMETER_GROUPS;

@Injectable()
export class ParameterLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async search(group: ParameterGroupKey, search?: string) {
    const prmGroup = PARAMETER_GROUPS[group];
    const rows = search
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT "RecId" as id, "PrmId" as "prmId", "PrmValue" as "value"
          FROM "MD_Parameter" WHERE "PrmGroup" = ${prmGroup} AND "IsDeleted" = 0 AND "PrmValue" ILIKE ${`%${search}%`}
          ORDER BY "PrmValue" LIMIT 50
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT "RecId" as id, "PrmId" as "prmId", "PrmValue" as "value"
          FROM "MD_Parameter" WHERE "PrmGroup" = ${prmGroup} AND "IsDeleted" = 0
          ORDER BY "PrmValue" LIMIT 50
        `);
    return sanitizeRawRow(rows);
  }
}
