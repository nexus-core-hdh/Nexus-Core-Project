import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Catalog')
@PermissionModule('catalog', 'Product catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly svc: CatalogService) {}

  // Product Categories
  @Get('categories')
  getCategories(@CurrentUser() u: any) { return this.svc.getCategories(u.companyId, u.branchId); }

  @Post('categories')
  createCategory(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createCategory(dto, u.companyId, u.branchId); }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: any) { return this.svc.updateCategory(id, dto); }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) { return this.svc.deleteCategory(id); }

  // Product Subcategories
  @Get('subcategories')
  getSubcategories(@CurrentUser() u: any, @Query('categoryId') categoryId?: string) {
    return this.svc.getSubcategories(u.companyId, u.branchId, categoryId);
  }

  @Post('subcategories')
  createSubcategory(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createSubcategory(dto, u.companyId, u.branchId); }

  @Patch('subcategories/:id')
  updateSubcategory(@Param('id') id: string, @Body() dto: any) { return this.svc.updateSubcategory(id, dto); }

  @Delete('subcategories/:id')
  deleteSubcategory(@Param('id') id: string) { return this.svc.deleteSubcategory(id); }

  // Products
  @Get('products')
  @ApiOperation({ summary: 'Get products' })
  getProducts(@CurrentUser() u: any, @Query('categoryId') categoryId?: string, @Query('type') type?: string) {
    const filters: any = {};
    if (categoryId) filters.categoryId = categoryId;
    if (type) filters.type = type;
    return this.svc.getProducts(u.companyId, u.branchId, filters);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get product by ID' })
  getProduct(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getProduct(id, u.companyId);
  }

  @Post('products')
  @ApiOperation({ summary: 'Create product' })
  createProduct(@Body() dto: any, @CurrentUser() u: any) {
    return this.svc.createProduct(dto, u.companyId, u.branchId);
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Update product' })
  updateProduct(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) {
    return this.svc.updateProduct(id, dto, u.companyId);
  }

  @Delete('products/:id')
  @ApiOperation({ summary: 'Delete product' })
  deleteProduct(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.deleteProduct(id, u.companyId);
  }
}
