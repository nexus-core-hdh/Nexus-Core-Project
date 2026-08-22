import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WarehouseService } from './warehouse.service';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Legacy ERP - Warehouses')
@Controller('legacy-erp/warehouses')
export class WarehouseController {
  constructor(private readonly svc: WarehouseService) {}

  @Get() list(@Query('search') search?: string) {
    return this.svc.list(search);
  }

  // Preview only — declared ahead of the generic :id route below so "next-code" is never
  // parsed as an id.
  @Get('next-code') async previewNextCode() {
    return { code: await this.svc.previewNextCode() };
  }

  @Get(':id') get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id);
  }

  @Post() create(@Body() dto: CreateWarehouseDto, @CurrentUser('id') userId: string) {
    return this.svc.create(dto, Number(userId) || 1);
  }

  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWarehouseDto, @CurrentUser('id') userId: string) {
    return this.svc.update(id, dto, Number(userId) || 1);
  }

  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: string) {
    return this.svc.remove(id, Number(userId) || 1);
  }
}
