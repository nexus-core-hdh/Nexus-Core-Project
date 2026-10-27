import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { InventoryReceiptService } from './inventory-receipt.service';
import { directionClassOf, getReceiptTypeConfig } from './receipt-types.config';

// Inward Gate Pass — the data of the Report Builder's Inward Gate Pass document source
// (reports/inward-gate-pass.report.ts lays it out; Inventory Receipt → right-click / ⋮ → Print →
// Inward Gate Pass runs it). Read-only, for ONE inventory receipt (IM_Receipt) of an inward type —
// DIRECTION_CLASS 'IN' (receipt-types.config.ts: Purchase Receipt, Outside Process Receive, Outside
// Process Sent Return) — so goods leaving the company never print as an inward pass.
//
// Header (IM_Receipt, as the receipt screen labels it): IGP # = ReceiptNo, Date = ReceiptDate,
// Party OGP = DocumentNo ("Document"), Driver Name = DriverName, Vehicle # = PlateNumber ("Vehicle
// No"), Supplier = CurrentAccountId → FI_Account, Ware House = InWarehouseId → IM_Warehouse.
// Lines (IM_ReceiptItem via InventoryReceiptService.listItems, which also resolves each line's Work
// Order): Name = InventoryId → IM_Item, GROSS = GrossQuantity, Quantity, UOM = UnitId →
// MD_UnitSetItem, W/O = the line's Work Order link (else the legacy ManufacturingOrderNo text),
// Shade = ColorCardId → ColorCard, Lot # = PartyNo ("Party (Lot No)"), Rolls/Bags = PackageQuantity
// ("Package (Roll) Quantity"), Remarks = Explanation. Nothing is stored for the legacy form's
// "Wastage %" or "Returnable / Non Returnable" — they are not printed rather than invented.

@Injectable()
export class InventoryReceiptGatePassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: InventoryReceiptService,
  ) {}

  async build(receiptId: number, companyId?: string | null) {
    const headerRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT r."RecId" as id, r."ReceiptNo" as "receiptNo", r."ReceiptType" as "receiptType", r."ReceiptDate" as "receiptDate",
        r."ShipmentDate" as "shipmentDate", r."DocumentNo" as "documentNo", r."DriverName" as "driverName", r."PlateNumber" as "plateNumber",
        a."CurrentAccountCode" as "supplierCode", a."CurrentAccountName" as "supplierName",
        w."WarehouseCode" as "warehouseCode", w."WarehouseName" as "warehouseName"
      FROM "IM_Receipt" r
      LEFT JOIN "FI_Account" a ON a."RecId" = r."CurrentAccountId"
      LEFT JOIN "IM_Warehouse" w ON w."RecId" = r."InWarehouseId"
      WHERE r."RecId" = ${receiptId} AND r."IsDeleted" = 0
    `);
    const header = sanitizeRawRow(headerRows)[0];
    if (!header) throw new NotFoundException('Inventory receipt not found');
    const receiptType = Number(header.receiptType);
    const typeLabel = getReceiptTypeConfig(receiptType)?.label ?? `Receipt type ${receiptType}`;
    if (directionClassOf(receiptType) !== 'IN') {
      throw new BadRequestException(`${header.receiptNo} is a ${typeLabel} — the Inward Gate Pass prints inward receipts only.`);
    }

    const items: any[] = await this.receipts.listItems(receiptId);
    const [names, units, colors, company] = await Promise.all([
      this.lookup(Prisma.sql`SELECT "RecId" as id, "InventoryCode" as code, "InventoryName" as name FROM "IM_Item"`, items.map((i) => i.inventoryId)),
      this.lookup(Prisma.sql`SELECT "RecId" as id, "UnitCode" as code, "UnitName" as name FROM "MD_UnitSetItem"`, items.map((i) => i.unitId)),
      this.colorCards(items.map((i) => i.colorCardId)),
      companyId ? this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true, address: true } }) : null,
    ]);
    const num = (v: any) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const text = (v: any) => (v == null || String(v).trim() === '' ? null : String(v).trim());

    const lines = items.map((i, idx) => {
      const item = i.inventoryId != null ? names.get(Number(i.inventoryId)) : undefined;
      const color = i.colorCardId ? colors.get(String(i.colorCardId)) : undefined;
      return {
        srNo: idx + 1,
        name: item?.name ?? null,
        itemCode: item?.code ?? null,
        gross: num(i.grossQuantity),
        quantity: num(i.quantity),
        unit: i.unitId != null ? units.get(Number(i.unitId))?.code ?? null : null,
        workOrder: text(i.workOrderNo) ?? text(i.manufacturingOrderNo),
        shade: color ? [color.name, color.code].filter(Boolean).filter((v, k, a) => a.indexOf(v) === k).join(' - ') : null,
        shadeCode: color?.code ?? null,
        lot: text(i.partyNo),
        rollsBags: num(i.packageQuantity),
        remarks: text(i.explanation),
        packageNo: num(i.packageNo),
        lotQuantity: num(i.lotQuantity),
        specialCode: text(i.specialCode),
        customerOrderNo: text(i.customerOrderNo),
        orderReceiptNo: text(i.orderReceiptNo),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      company: { name: company?.name ?? null, address: text(company?.address) },
      header: {
        receiptId,
        receiptNo: header.receiptNo,
        receiptType,
        receiptTypeLabel: typeLabel,
        receiptDate: header.receiptDate ?? null,
        shipmentDate: header.shipmentDate ?? null,
        partyOgp: text(header.documentNo),
        driverName: text(header.driverName),
        vehicleNo: text(header.plateNumber),
        supplier: text(header.supplierName),
        supplierCode: text(header.supplierCode),
        warehouse: text(header.warehouseName),
        warehouseCode: text(header.warehouseCode),
      },
      lines,
    };
  }

  /** id → {code, name} for one master table (only the ids this receipt uses). */
  private async lookup(select: Prisma.Sql, ids: any[]) {
    const distinct = [...new Set(ids.filter((id) => id != null).map(Number))];
    if (!distinct.length) return new Map<number, { code: string; name: string }>();
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`${select} WHERE "RecId" IN (${Prisma.join(distinct)})`);
    return new Map(sanitizeRawRow(rows).map((r: any) => [Number(r.id), { code: r.code, name: r.name }]));
  }

  private async colorCards(ids: any[]) {
    const distinct = [...new Set(ids.filter(Boolean).map(String))];
    if (!distinct.length) return new Map<string, { code: string; name: string }>();
    const rows = await this.prisma.colorCard.findMany({ where: { id: { in: distinct } }, select: { id: true, code: true, name: true } });
    return new Map(rows.map((c) => [c.id, { code: c.code, name: c.name }]));
  }
}

export type InwardGatePass = Awaited<ReturnType<InventoryReceiptGatePassService['build']>>;
