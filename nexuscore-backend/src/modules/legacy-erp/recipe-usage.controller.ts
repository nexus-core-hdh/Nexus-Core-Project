import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RecipeUsageService, RecipeUsageType } from './recipe-usage.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

// Recipe Usage ("Where Used") — one shared endpoint for Fabric Cards / Yarn Cards / Trim Cards /
// Inventory Cards' own "Recipe Usage Information" right-click action (see recipe-usage.service.ts's
// own header comment for why one generic resolver covers all four). `branchId` scopes the
// Style/Sample Card results to the caller's own tenant (Section 10) — never client-controlled.
@ApiTags('Legacy ERP - Recipe Usage')
@Controller('legacy-erp/recipe-usage')
export class RecipeUsageController {
  constructor(private readonly svc: RecipeUsageService) {}

  @Get() list(
    @Query('inventoryId', ParseIntPipe) inventoryId: number,
    @CurrentUser('branchId') branchId: string | undefined,
    @Query('search') search?: string,
    @Query('type') type?: RecipeUsageType,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.svc.list({
      inventoryId, branchId, search, type,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }
}
