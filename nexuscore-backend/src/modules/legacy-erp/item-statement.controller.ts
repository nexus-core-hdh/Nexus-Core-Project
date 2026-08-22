import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ItemStatementService } from './item-statement.service';

@ApiTags('Legacy ERP - Item Statement')
@Controller('legacy-erp/inventory-items')
export class ItemStatementController {
  constructor(private readonly svc: ItemStatementService) {}

  // Reachable from Trim/Fabric/Yarn/Inventory Card List's "View Statement" row action — itemId
  // is always the row's real IM_Item.RecId (never a Code/Name lookup), validated against a real,
  // non-deleted, card-backed item inside the service (404s otherwise).
  @Get(':itemId/statement')
  getStatement(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('receiptType') receiptType?: string,
    @Query('receiptNo') receiptNo?: string,
  ) {
    return this.svc.getStatement(itemId, {
      dateFrom,
      dateTo,
      receiptType: receiptType != null ? Number(receiptType) : undefined,
      receiptNo,
    });
  }
}
