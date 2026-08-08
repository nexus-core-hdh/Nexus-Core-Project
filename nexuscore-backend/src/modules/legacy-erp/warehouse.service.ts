import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';
import { getColumnTypeMap, buildDbValueCoercer } from './legacy-db-types.util';
import { sanitizeRawRow } from './raw-row.util';

const TABLE = 'IM_Warehouse';

const ROW_SELECT = `
  "RecId" as id, "CompanyId" as "companyId", "WorkplaceId" as "workplaceId",
  "WarehouseCode" as "warehouseCode", "WarehouseName" as "warehouseName",
  "AccessCode" as "accessCode", "SpecialCode" as "specialCode",
  "StartDate" as "startDate", "EndDate" as "endDate",
  "ControlType" as "controlType", "MControlType" as "mControlType",
  "IsDefaultMain" as "isDefaultMain", "IsDefaultShipment" as "isDefaultShipment",
  "IsVirtual" as "isVirtual", "IsWarehouseDeclaration" as "isWarehouseDeclaration",
  "IsShowRoom" as "isShowRoom", "IsSwatchCard" as "isSwatchCard", "InUse" as "inUse"
`;

@Injectable()
export class WarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  // Same shared coercer used by AccountService — IM_Warehouse uses the identical
  // migrated Udt* domain types (confirmed via pg_catalog), so it needs the same handling.
  private async toDb() {
    const columnTypes = await getColumnTypeMap(this.prisma, TABLE);
    return buildDbValueCoercer(columnTypes);
  }

  async list(search?: string) {
    const rows = search
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${Prisma.raw(ROW_SELECT)} FROM "IM_Warehouse"
          WHERE "IsDeleted" = 0 AND ("WarehouseCode" ILIKE ${`%${search}%`} OR "WarehouseName" ILIKE ${`%${search}%`})
          ORDER BY "WarehouseCode"
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT ${Prisma.raw(ROW_SELECT)} FROM "IM_Warehouse" WHERE "IsDeleted" = 0 ORDER BY "WarehouseCode"
        `);
    return sanitizeRawRow(rows);
  }

  async get(id: number) {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT ${Prisma.raw(ROW_SELECT)} FROM "IM_Warehouse" WHERE "RecId" = ${id} AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Warehouse not found');
    return sanitizeRawRow(rows[0]);
  }

  async create(dto: CreateWarehouseDto, userId: number) {
    const toDb = await this.toDb();
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "IM_Warehouse" (
        "CompanyId", "WorkplaceId", "WarehouseCode", "WarehouseName", "AccessCode", "SpecialCode",
        "StartDate", "EndDate", "ControlType", "MControlType",
        "IsDefaultMain", "IsDefaultShipment", "IsVirtual", "IsWarehouseDeclaration", "IsShowRoom", "IsSwatchCard",
        "InUse", "InsertedAt", "InsertedBy", "IsDeleted", "UUID"
      ) VALUES (
        1, ${toDb('WorkplaceId', dto.workplaceId) ?? 1}, ${dto.warehouseCode}, ${dto.warehouseName},
        ${toDb('AccessCode', dto.accessCode) ?? null}, ${toDb('SpecialCode', dto.specialCode) ?? null},
        ${toDb('StartDate', dto.startDate) ?? null}, ${toDb('EndDate', dto.endDate) ?? null},
        ${toDb('ControlType', dto.controlType) ?? 0}, ${toDb('MControlType', dto.mControlType) ?? 0},
        ${toDb('IsDefaultMain', dto.isDefaultMain) ?? 0}, ${toDb('IsDefaultShipment', dto.isDefaultShipment) ?? 0}, ${toDb('IsVirtual', dto.isVirtual) ?? 0},
        ${toDb('IsWarehouseDeclaration', dto.isWarehouseDeclaration) ?? 0}, ${toDb('IsShowRoom', dto.isShowRoom) ?? 0}, ${toDb('IsSwatchCard', dto.isSwatchCard) ?? 0},
        ${toDb('InUse', dto.inUse) ?? 1}, now(), ${userId}, 0, gen_random_uuid()
      )
      RETURNING ${Prisma.raw(ROW_SELECT)}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async update(id: number, dto: UpdateWarehouseDto, userId: number) {
    await this.get(id);
    const toDb = await this.toDb();
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "IM_Warehouse" SET
        "WorkplaceId" = COALESCE(${toDb('WorkplaceId', dto.workplaceId) ?? null}, "WorkplaceId"),
        "WarehouseCode" = COALESCE(${dto.warehouseCode ?? null}, "WarehouseCode"),
        "WarehouseName" = COALESCE(${dto.warehouseName ?? null}, "WarehouseName"),
        "AccessCode" = COALESCE(${toDb('AccessCode', dto.accessCode) ?? null}, "AccessCode"),
        "SpecialCode" = COALESCE(${toDb('SpecialCode', dto.specialCode) ?? null}, "SpecialCode"),
        "StartDate" = COALESCE(${toDb('StartDate', dto.startDate) ?? null}, "StartDate"),
        "EndDate" = COALESCE(${toDb('EndDate', dto.endDate) ?? null}, "EndDate"),
        "ControlType" = COALESCE(${toDb('ControlType', dto.controlType) ?? null}, "ControlType"),
        "MControlType" = COALESCE(${toDb('MControlType', dto.mControlType) ?? null}, "MControlType"),
        "IsDefaultMain" = COALESCE(${toDb('IsDefaultMain', dto.isDefaultMain) ?? null}, "IsDefaultMain"),
        "IsDefaultShipment" = COALESCE(${toDb('IsDefaultShipment', dto.isDefaultShipment) ?? null}, "IsDefaultShipment"),
        "IsVirtual" = COALESCE(${toDb('IsVirtual', dto.isVirtual) ?? null}, "IsVirtual"),
        "IsWarehouseDeclaration" = COALESCE(${toDb('IsWarehouseDeclaration', dto.isWarehouseDeclaration) ?? null}, "IsWarehouseDeclaration"),
        "IsShowRoom" = COALESCE(${toDb('IsShowRoom', dto.isShowRoom) ?? null}, "IsShowRoom"),
        "IsSwatchCard" = COALESCE(${toDb('IsSwatchCard', dto.isSwatchCard) ?? null}, "IsSwatchCard"),
        "InUse" = COALESCE(${toDb('InUse', dto.inUse) ?? null}, "InUse"),
        "UpdatedAt" = now(), "UpdatedBy" = ${userId}
      WHERE "RecId" = ${id}
      RETURNING ${Prisma.raw(ROW_SELECT)}
    `);
    return sanitizeRawRow(rows[0]);
  }

  async remove(id: number, userId: number) {
    await this.get(id);
    await this.prisma.$executeRaw`
      UPDATE "IM_Warehouse" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId} WHERE "RecId" = ${id}
    `;
    return { message: 'Deleted' };
  }
}
