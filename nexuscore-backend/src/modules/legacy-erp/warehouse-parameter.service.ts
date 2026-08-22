import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';

// Module + Warehouse scoped configuration — Negative Stock / Critical Stock behavior, whether
// transactions are allowed at all, and Minimum/Maximum Stock Level. Backed by the new
// LegacyWarehouseModuleParameter table (Module, WarehouseId) composite PK — see the table's own
// migration comment for why no existing table (IM_ItemWarehouse is per-item, not per module
// category; MD_Parameter has no Module/Warehouse scoping at all) could be reused instead.
export const WAREHOUSE_PARAMETER_MODULES = ['FABRIC', 'YARN', 'TRIM'] as const;
export type WarehouseParameterModule = (typeof WAREHOUSE_PARAMETER_MODULES)[number];
const STOCK_OPTIONS = ['continue', 'warn', 'not_allow'] as const;

const ROW_SELECT = `
  "Module" as module, "WarehouseId" as "warehouseId", "NegativeStock" as "negativeStock",
  "CriticalStock" as "criticalStock", "AllowTransaction" as "allowTransaction",
  "MinimumStockLevel" as "minimumStockLevel", "MaximumStockLevel" as "maximumStockLevel"
`;

const DEFAULTS = {
  negativeStock: 'warn' as const,
  criticalStock: 'warn' as const,
  allowTransaction: true,
  minimumStockLevel: null as number | null,
  maximumStockLevel: null as number | null,
};

@Injectable()
export class WarehouseParameterService {
  constructor(private readonly prisma: PrismaService) {}

  private assertModule(mod: string): asserts mod is WarehouseParameterModule {
    if (!WAREHOUSE_PARAMETER_MODULES.includes(mod as WarehouseParameterModule)) {
      throw new BadRequestException(`module must be one of ${WAREHOUSE_PARAMETER_MODULES.join(', ')}`);
    }
  }

  // Returns saved values if this module+warehouse has ever been configured, otherwise the
  // defaults (never persisted as a row until Save is actually pressed — an unconfigured
  // warehouse simply behaves like "warn"/"warn"/allowed/no limits until someone opts in).
  async get(module: string, warehouseId: number) {
    this.assertModule(module);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${Prisma.raw(ROW_SELECT)} FROM "LegacyWarehouseModuleParameter"
      WHERE "Module" = ${module} AND "WarehouseId" = ${warehouseId}
    `);
    if (!rows.length) return { module, warehouseId, ...DEFAULTS };
    return sanitizeRawRow(rows)[0];
  }

  async upsert(dto: {
    module: string; warehouseId: number; negativeStock: string; criticalStock: string;
    allowTransaction: boolean; minimumStockLevel: number | null; maximumStockLevel: null | number;
  }, userId: number) {
    const { module, warehouseId } = dto;
    this.assertModule(module);
    if (!warehouseId) throw new BadRequestException('warehouseId is required');
    if (!STOCK_OPTIONS.includes(dto.negativeStock as any)) throw new BadRequestException('negativeStock must be one of continue, warn, not_allow');
    if (!STOCK_OPTIONS.includes(dto.criticalStock as any)) throw new BadRequestException('criticalStock must be one of continue, warn, not_allow');
    const min = dto.minimumStockLevel === undefined || dto.minimumStockLevel === null || (dto.minimumStockLevel as any) === '' ? null : Number(dto.minimumStockLevel);
    const max = dto.maximumStockLevel === undefined || dto.maximumStockLevel === null || (dto.maximumStockLevel as any) === '' ? null : Number(dto.maximumStockLevel);
    if (min !== null && (!Number.isFinite(min) || min < 0)) throw new BadRequestException('Minimum Stock Level must be a non-negative number');
    if (max !== null && (!Number.isFinite(max) || max < 0)) throw new BadRequestException('Maximum Stock Level must be a non-negative number');
    if (min !== null && max !== null && min > max) throw new BadRequestException('Minimum Stock Level must not exceed Maximum Stock Level');

    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "LegacyWarehouseModuleParameter"
        ("Module", "WarehouseId", "NegativeStock", "CriticalStock", "AllowTransaction", "MinimumStockLevel", "MaximumStockLevel", "UpdatedAt", "UpdatedBy")
      VALUES (${module}, ${warehouseId}, ${dto.negativeStock}, ${dto.criticalStock}, ${dto.allowTransaction}, ${min}, ${max}, now(), ${userId})
      ON CONFLICT ("Module", "WarehouseId") DO UPDATE SET
        "NegativeStock" = EXCLUDED."NegativeStock",
        "CriticalStock" = EXCLUDED."CriticalStock",
        "AllowTransaction" = EXCLUDED."AllowTransaction",
        "MinimumStockLevel" = EXCLUDED."MinimumStockLevel",
        "MaximumStockLevel" = EXCLUDED."MaximumStockLevel",
        "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      RETURNING ${Prisma.raw(ROW_SELECT)}
    `);
    return sanitizeRawRow(rows)[0];
  }
}
