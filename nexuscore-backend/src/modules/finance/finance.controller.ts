import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Finance')
@PermissionModule('finance', 'Finance')
@Controller('finance')
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  // Customers
  @Get('customers') getCustomers(@CurrentUser() u: any) { return this.svc.getCustomers(u.companyId, u.branchId); }
  @Get('customers/:id') getCustomer(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getCustomer(id, u.companyId); }
  @Post('customers') createCustomer(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createCustomer(dto, u.companyId, u.branchId); }
  @Patch('customers/:id') updateCustomer(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.updateCustomer(id, dto, u.companyId); }
  @Delete('customers/:id') deleteCustomer(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deleteCustomer(id, u.companyId); }

  // Orders
  @Get('orders')
  @ApiOperation({ summary: 'Get orders' })
  getOrders(@CurrentUser() u: any, @Query('status') status?: string, @Query('type') type?: string) {
    const filters: any = {};
    if (status) filters.status = status;
    if (type) filters.type = type;
    return this.svc.getOrders(u.companyId, u.branchId, filters);
  }

  @Get('orders/:id') getOrder(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getOrder(id, u.companyId); }
  @Post('orders') createOrder(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createOrder(dto, u.companyId, u.branchId); }
  @Patch('orders/:id') updateOrder(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.updateOrder(id, dto, u.companyId); }
  @Delete('orders/:id') deleteOrder(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deleteOrder(id, u.companyId); }

  // Order Items
  @Post('orders/:orderId/items') addOrderItem(@Param('orderId') orderId: string, @Body() dto: any) { return this.svc.addOrderItem(orderId, dto); }
  @Patch('order-items/:id') updateOrderItem(@Param('id') id: string, @Body() dto: any) { return this.svc.updateOrderItem(id, dto); }
  @Delete('order-items/:id') deleteOrderItem(@Param('id') id: string) { return this.svc.deleteOrderItem(id); }

  // Customer Payments
  @Get('payments')
  getPayments(@CurrentUser() u: any, @Query('customerId') customerId?: string) {
    return this.svc.getPayments(u.companyId, u.branchId, customerId ? { customerId } : {});
  }
  @Post('payments') createPayment(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createPayment(dto, u.companyId, u.branchId); }
  @Patch('payments/:id') updatePayment(@Param('id') id: string, @Body() dto: any) { return this.svc.updatePayment(id, dto); }
  @Delete('payments/:id') deletePayment(@Param('id') id: string) { return this.svc.deletePayment(id); }

  // Suppliers
  @Get('suppliers') getSuppliers(@CurrentUser() u: any) { return this.svc.getSuppliers(u.companyId, u.branchId); }
  @Get('suppliers/:id') getSupplier(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getSupplier(id, u.companyId); }
  @Post('suppliers') createSupplier(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createSupplier(dto, u.companyId, u.branchId); }
  @Patch('suppliers/:id') updateSupplier(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.updateSupplier(id, dto, u.companyId); }
  @Delete('suppliers/:id') deleteSupplier(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deleteSupplier(id, u.companyId); }

  // Supplier Payments
  @Get('supplier-payments')
  getSupplierPayments(@CurrentUser() u: any, @Query('supplierId') supplierId?: string) {
    return this.svc.getSupplierPayments(u.companyId, u.branchId, supplierId);
  }
  @Post('supplier-payments') createSupplierPayment(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createSupplierPayment(dto, u.companyId, u.branchId); }
  @Patch('supplier-payments/:id') updateSupplierPayment(@Param('id') id: string, @Body() dto: any) { return this.svc.updateSupplierPayment(id, dto); }
  @Delete('supplier-payments/:id') deleteSupplierPayment(@Param('id') id: string) { return this.svc.deleteSupplierPayment(id); }

  // Order Returns
  @Get('order-returns')
  getOrderReturns(@CurrentUser() u: any, @Query('orderId') orderId?: string) {
    return this.svc.getOrderReturns(u.companyId, u.branchId, orderId);
  }
  @Post('order-returns') createOrderReturn(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createOrderReturn(dto, u.companyId, u.branchId); }
  @Patch('order-returns/:id') updateOrderReturn(@Param('id') id: string, @Body() dto: any) { return this.svc.updateOrderReturn(id, dto); }
  @Delete('order-returns/:id') deleteOrderReturn(@Param('id') id: string) { return this.svc.deleteOrderReturn(id); }
}
