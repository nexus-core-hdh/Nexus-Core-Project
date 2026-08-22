import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UnitSetService } from './unit-set.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Legacy ERP - Unit Sets')
@Controller('legacy-erp/unit-sets')
export class UnitSetController {
  constructor(private readonly svc: UnitSetService) {}

  @Get() list(@Query('search') search?: string) {
    return this.svc.list(search);
  }

  @Get('by-code/:code') getByCode(@Param('code') code: string) {
    return this.svc.getByCode(code);
  }

  // Preview only — declared ahead of the generic :id route below so "next-code" is never
  // parsed as an id.
  @Get('next-code') async previewNextCode() {
    return { code: await this.svc.previewNextCode() };
  }

  @Get(':id') get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id);
  }

  @Post() create(@Body() dto: Record<string, any>, @CurrentUser('id') userId: string) {
    return this.svc.create(dto, Number(userId) || 1);
  }

  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: Record<string, any>, @CurrentUser('id') userId: string) {
    return this.svc.update(id, dto, Number(userId) || 1);
  }

  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.svc.remove(id, Number(userId) || 1);
  }

  @Get(':id/items') listItems(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listItems(id);
  }

  @Post(':id/items') createItem(@Param('id', ParseIntPipe) id: number, @Body() dto: Record<string, any>, @CurrentUser('id') userId: string) {
    return this.svc.createItem(id, dto, Number(userId) || 1);
  }

  @Put(':id/items/:itemId') updateItem(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: Record<string, any>,
    @CurrentUser('id') userId: string,
  ) {
    return this.svc.updateItem(itemId, dto, Number(userId) || 1);
  }

  @Delete(':id/items/:itemId') removeItem(@Param('itemId', ParseIntPipe) itemId: number, @CurrentUser('id') userId: string) {
    return this.svc.removeItem(itemId, Number(userId) || 1);
  }
}
