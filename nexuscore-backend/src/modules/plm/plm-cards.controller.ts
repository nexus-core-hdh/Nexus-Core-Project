import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlmCardsService } from './plm-cards.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('PLM Cards')
@Controller('plm')
export class PlmCardsController {
  constructor(private readonly svc: PlmCardsService) {}

  // Mood Boards
  @Get('mood-boards') listMoodBoards(@CurrentUser() u: any, @Query() q: any) { return this.svc.listMoodBoards(u.branchId, q); }
  @Post('mood-boards') createMoodBoard(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createMoodBoard(dto, u.branchId, u.id); }
  @Get('mood-boards/:id') getMoodBoard(@Param('id') id: string) { return this.svc.getMoodBoard(id); }
  @Put('mood-boards/:id') updateMoodBoard(@Param('id') id: string, @Body() dto: any) { return this.svc.updateMoodBoard(id, dto); }
  @Delete('mood-boards/:id') deleteMoodBoard(@Param('id') id: string) { return this.svc.deleteMoodBoard(id); }
  @Post('mood-boards/:id/images') addImages(@Param('id') id: string, @Body('images') images: string[]) { return this.svc.addMoodBoardImages(id, images); }

  // Style Cards
  // Sample Card Master screen — Code preview, declared before 'style-cards/:id' so it's never
  // shadowed by that dynamic route (same defensive ordering as the other static routes here).
  @Get('style-cards/next-code') async previewNextStyleNumber() { return { code: await this.svc.previewNextStyleNumber() }; }
  @Get('style-cards') @ApiOperation({ summary: 'List style cards' }) listStyleCards(@CurrentUser() u: any, @Query() q: any) { return this.svc.listStyleCards(u.branchId, q); }
  @Post('style-cards') createStyleCard(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createStyleCard(dto, u.branchId, u.id); }
  @Get('style-cards/:id') getStyleCard(@Param('id') id: string) { return this.svc.getStyleCard(id); }
  @Put('style-cards/:id') updateStyleCard(@Param('id') id: string, @Body() dto: any) { return this.svc.updateStyleCard(id, dto); }
  @Delete('style-cards/:id') deleteStyleCard(@Param('id') id: string) { return this.svc.deleteStyleCard(id); }
  @Patch('style-cards/:id/status') updateStyleCardStatus(@Param('id') id: string, @Body() body: any, @CurrentUser() u: any) { return this.svc.updateStyleCardStatus(id, body.status, u.id); }
  @Get('style-cards/:id/details') getStyleCardDetails(@Param('id') id: string) { return this.svc.getStyleCardDetails(id); }
  @Post('style-cards/:id/details') addStyleCardDetail(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.addStyleCardDetail(id, dto, u.id); }
  @Put('style-cards/:id/details') upsertStyleCardDetails(@Param('id') id: string, @Body() details: any[], @CurrentUser() u: any) { return this.svc.upsertStyleCardDetails(id, details, u.id); }
  @Get('style-cards/:id/samples') getStyleCardSamples(@Param('id') id: string) { return this.svc['prisma'].sampleCard.findMany({ where: { styleCardId: id }, include: { sampleType: true } }); }
  @Get('style-cards/:id/products') getStyleCardProducts(@Param('id') id: string) { return this.svc['prisma'].productCard.findMany({ where: { styleCardId: id } }); }
  @Get('style-cards/:id/orders') getStyleCardOrders(@Param('id') id: string) { return this.svc.getStyleCardOrders(id); }
  @Post('style-cards/:id/duplicate') duplicateStyleCard(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.duplicateStyleCard(id, u.id); }

  // Sample Cards
  @Get('sample-cards') listSampleCards(@CurrentUser() u: any, @Query() q: any) { return this.svc.listSampleCards(u.branchId, q); }
  @Post('sample-cards') createSampleCard(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createSampleCard(dto, u.branchId, u.id); }
  @Get('sample-cards/:id') getSampleCard(@Param('id') id: string) { return this.svc.getSampleCard(id); }
  @Put('sample-cards/:id') updateSampleCard(@Param('id') id: string, @Body() dto: any) { return this.svc.updateSampleCard(id, dto); }
  @Delete('sample-cards/:id') deleteSampleCard(@Param('id') id: string) { return this.svc.deleteSampleCard(id); }
  @Patch('sample-cards/:id/status') updateSampleCardStatus(@Param('id') id: string, @Body() body: any, @CurrentUser() u: any) { return this.svc.updateSampleCardStatus(id, body.status, body.notes, u.id); }
  @Get('sample-cards/:id/history') getSampleCardHistory(@Param('id') id: string) { return this.svc.getSampleCardHistory(id); }
  @Post('sample-cards/:id/duplicate') duplicateSampleCard(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.duplicateSampleCard(id, u.id); }
  @Post('sample-cards/:id/create-style-card') createStyleCardFromSample(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.createStyleCardFromSample(id, u.id); }
  @Get('sample-cards/:id/details') getSampleCardDetails(@Param('id') id: string) { return this.svc.getSampleCardDetails(id); }
  @Put('sample-cards/:id/details') upsertSampleCardDetails(@Param('id') id: string, @Body() details: any[]) { return this.svc.upsertSampleCardDetails(id, details); }
  @Get('sample-cards/:id/orders') getSampleCardOrders(@Param('id') id: string) { return this.svc.getSampleCardOrders(id); }

  // Swatch Cards
  @Get('swatch-cards') listSwatchCards(@CurrentUser() u: any, @Query() q: any) { return this.svc.listSwatchCards(u.branchId, q); }
  @Post('swatch-cards') createSwatchCard(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createSwatchCard(dto, u.branchId); }
  @Get('swatch-cards/:id') getSwatchCard(@Param('id') id: string) { return this.svc.getSwatchCard(id); }
  @Put('swatch-cards/:id') updateSwatchCard(@Param('id') id: string, @Body() dto: any) { return this.svc.updateSwatchCard(id, dto); }
  @Delete('swatch-cards/:id') deleteSwatchCard(@Param('id') id: string) { return this.svc.deleteSwatchCard(id); }
  @Post('swatch-cards/:id/link-product') linkToProduct(@Param('id') id: string, @Body() body: any) { return this.svc.linkSwatchToProduct(id, body.productCardId, body.isPrimary); }

  // Product Cards
  @Get('product-cards') listProductCards(@CurrentUser() u: any, @Query() q: any) { return this.svc.listProductCards(u.branchId, q); }
  @Post('product-cards') createProductCard(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createProductCard(dto, u.branchId, u.id); }
  @Get('product-cards/:id') getProductCard(@Param('id') id: string) { return this.svc.getProductCard(id); }
  @Put('product-cards/:id') updateProductCard(@Param('id') id: string, @Body() dto: any) { return this.svc.updateProductCard(id, dto); }
  @Delete('product-cards/:id') deleteProductCard(@Param('id') id: string) { return this.svc.deleteProductCard(id); }
  @Patch('product-cards/:id/status') updateProductCardStatus(@Param('id') id: string, @Body() body: any, @CurrentUser() u: any) { return this.svc.updateProductCardStatus(id, body.status, u.id); }
  @Get('product-cards/:id/measurements') getProductMeasurements(@Param('id') id: string) { return this.svc.getProductMeasurements(id); }
  @Post('product-cards/:id/measurements') addProductMeasurement(@Param('id') id: string, @Body() body: any) { return this.svc.addProductMeasurement(id, body); }
  @Put('product-cards/:id/measurements') upsertProductMeasurements(@Param('id') id: string, @Body() body: any[]) { return this.svc.upsertProductMeasurements(id, body); }
  @Get('product-cards/:id/swatches') getProductSwatches(@Param('id') id: string) { return this.svc.getProductSwatches(id); }
  @Post('product-cards/:id/swatches') addProductSwatch(@Param('id') id: string, @Body() body: any) { return this.svc.addProductSwatch(id, body.swatchCardId ?? body.swatchCard?.id, body.isPrimary); }
  @Delete('product-cards/:id/swatches/:swatchId') removeProductSwatch(@Param('id') id: string, @Param('swatchId') swId: string) { return this.svc.removeProductSwatch(id, swId); }
  @Get('product-cards/:id/samples') getProductSamples(@Param('id') id: string) { return this.svc.getProductSamples(id); }
  @Post('product-cards/:id/duplicate') duplicateProductCard(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.duplicateProductCard(id, u.id); }
}
