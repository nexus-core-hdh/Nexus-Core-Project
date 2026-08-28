import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ItemStatementFilters, ItemStatementService } from './item-statement.service';

@ApiTags('Legacy ERP - Item Statement')
@Controller('legacy-erp/inventory-items')
export class ItemStatementController {
  constructor(private readonly svc: ItemStatementService) {}

  private parseFilters(q: {
    dateFrom?: string; dateTo?: string; receiptType?: string; documentOrReceiptNo?: string;
    colorCardId?: string; lotBatch?: string; warehouseId?: string; currentAccountId?: string;
    itemCode?: string; itemName?: string;
  }): ItemStatementFilters {
    return {
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      receiptType: q.receiptType != null ? Number(q.receiptType) : undefined,
      documentOrReceiptNo: q.documentOrReceiptNo,
      colorCardId: q.colorCardId,
      lotBatch: q.lotBatch,
      warehouseId: q.warehouseId != null ? Number(q.warehouseId) : undefined,
      currentAccountId: q.currentAccountId != null ? Number(q.currentAccountId) : undefined,
      itemCode: q.itemCode,
      itemName: q.itemName,
    };
  }

  private parseDimensions(q: { dimColor?: string; dimLot?: string; dimWarehouse?: string }) {
    return { color: q.dimColor === 'true', lot: q.dimLot === 'true', warehouse: q.dimWarehouse === 'true' };
  }

  // Reachable from Trim/Fabric/Yarn/Inventory Card List's "View Statement" row action — itemId
  // is always the row's real IM_Item.RecId (never a Code/Name lookup), validated against a real,
  // non-deleted, card-backed item inside the service (404s otherwise). Unchanged entry point —
  // every existing caller keeps working exactly as before; only the query params it accepts grew.
  @Get(':itemId/statement')
  getStatement(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Query() query: any,
  ) {
    return this.svc.getStatement(itemId, this.parseFilters(query));
  }

  // Detailed View for a single item — dimension-wise balances (Color/Lot/Batch/Warehouse, per
  // ?dimColor=true&dimLot=true&dimWarehouse=true), same filters as the Overall view above.
  @Get(':itemId/statement/detailed')
  getDetailedStatement(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Query() query: any,
  ) {
    return this.svc.getDetailedStatement(itemId, this.parseFilters(query), this.parseDimensions(query));
  }

  // Stock Control / Inventory Ledger — the same statement, without a pre-selected item: filterable
  // by Item Code/Item Name (in addition to every filter the per-item route already supports).
  // Same service, same tables, same direction rules — never a second stock engine.
  @Get('ledger')
  getLedger(@Query() query: any) {
    return this.svc.getStatement(null, this.parseFilters(query));
  }

  @Get('ledger/detailed')
  getLedgerDetailed(@Query() query: any) {
    return this.svc.getDetailedStatement(null, this.parseFilters(query), this.parseDimensions(query));
  }
}
