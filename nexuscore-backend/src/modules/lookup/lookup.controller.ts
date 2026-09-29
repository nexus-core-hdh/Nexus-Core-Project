import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LookupService } from './lookup.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Lookup')
@PermissionModule('crm-settings', 'CRM statuses & dropdowns')
@Controller('lookup')
export class LookupController {
  constructor(private readonly svc: LookupService) {}

  private scope(user: any) { return { companyId: user.companyId, branchId: user.branchId }; }

  // Lead Stages
  @Get('lead-stages') getLeadStages(@CurrentUser() u: any) { return this.svc.getLeadStages(this.scope(u)); }
  @Post('lead-stages') createLeadStage(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createLeadStage(dto, this.scope(u)); }
  @Patch('lead-stages/:id') updateLeadStage(@Param('id') id: string, @Body() dto: any) { return this.svc.updateLeadStage(id, dto); }
  @Delete('lead-stages/:id') deleteLeadStage(@Param('id') id: string) { return this.svc.deleteLeadStage(id); }

  // Document Stages
  @Get('document-stages') getDocumentStages(@CurrentUser() u: any) { return this.svc.getDocumentStages(this.scope(u)); }
  @Post('document-stages') createDocumentStage(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createDocumentStage(dto, this.scope(u)); }
  @Patch('document-stages/:id') updateDocumentStage(@Param('id') id: string, @Body() dto: any) { return this.svc.updateDocumentStage(id, dto); }
  @Delete('document-stages/:id') deleteDocumentStage(@Param('id') id: string) { return this.svc.deleteDocumentStage(id); }

  // Invoice Stages
  @Get('invoice-stages') getInvoiceStages(@CurrentUser() u: any) { return this.svc.getInvoiceStages(this.scope(u)); }
  @Post('invoice-stages') createInvoiceStage(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createInvoiceStage(dto, this.scope(u)); }
  @Patch('invoice-stages/:id') updateInvoiceStage(@Param('id') id: string, @Body() dto: any) { return this.svc.updateInvoiceStage(id, dto); }
  @Delete('invoice-stages/:id') deleteInvoiceStage(@Param('id') id: string) { return this.svc.deleteInvoiceStage(id); }

  // Estimate Stages
  @Get('estimate-stages') getEstimateStages(@CurrentUser() u: any) { return this.svc.getEstimateStages(this.scope(u)); }
  @Post('estimate-stages') createEstimateStage(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createEstimateStage(dto, this.scope(u)); }
  @Patch('estimate-stages/:id') updateEstimateStage(@Param('id') id: string, @Body() dto: any) { return this.svc.updateEstimateStage(id, dto); }
  @Delete('estimate-stages/:id') deleteEstimateStage(@Param('id') id: string) { return this.svc.deleteEstimateStage(id); }

  // Sources
  @Get('sources') getSources(@CurrentUser() u: any) { return this.svc.getSources(this.scope(u)); }
  @Post('sources') createSource(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createSource(dto, this.scope(u)); }
  @Patch('sources/:id') updateSource(@Param('id') id: string, @Body() dto: any) { return this.svc.updateSource(id, dto); }
  @Delete('sources/:id') deleteSource(@Param('id') id: string) { return this.svc.deleteSource(id); }

  // Contact Types
  @Get('contact-types') getContactTypes(@CurrentUser() u: any) { return this.svc.getContactTypes(this.scope(u)); }
  @Post('contact-types') createContactType(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createContactType(dto, this.scope(u)); }
  @Patch('contact-types/:id') updateContactType(@Param('id') id: string, @Body() dto: any) { return this.svc.updateContactType(id, dto); }
  @Delete('contact-types/:id') deleteContactType(@Param('id') id: string) { return this.svc.deleteContactType(id); }

  // Salutations
  @Get('salutations') getSalutations(@CurrentUser() u: any) { return this.svc.getSalutations(this.scope(u)); }
  @Post('salutations') createSalutation(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createSalutation(dto, this.scope(u)); }
  @Patch('salutations/:id') updateSalutation(@Param('id') id: string, @Body() dto: any) { return this.svc.updateSalutation(id, dto); }
  @Delete('salutations/:id') deleteSalutation(@Param('id') id: string) { return this.svc.deleteSalutation(id); }

  // Call Statuses
  @Get('call-statuses') getCallStatuses(@CurrentUser() u: any) { return this.svc.getCallStatuses(this.scope(u)); }
  @Post('call-statuses') createCallStatus(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createCallStatus(dto, this.scope(u)); }
  @Patch('call-statuses/:id') updateCallStatus(@Param('id') id: string, @Body() dto: any) { return this.svc.updateCallStatus(id, dto); }
  @Delete('call-statuses/:id') deleteCallStatus(@Param('id') id: string) { return this.svc.deleteCallStatus(id); }

  // Company Types
  @Get('company-types') getCompanyTypes(@CurrentUser() u: any) { return this.svc.getCompanyTypes(this.scope(u)); }
  @Post('company-types') createCompanyType(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createCompanyType(dto, this.scope(u)); }
  @Patch('company-types/:id') updateCompanyType(@Param('id') id: string, @Body() dto: any) { return this.svc.updateCompanyType(id, dto); }
  @Delete('company-types/:id') deleteCompanyType(@Param('id') id: string) { return this.svc.deleteCompanyType(id); }

  // Employees
  @Get('employees') getEmployees(@CurrentUser() u: any) { return this.svc.getEmployees(this.scope(u)); }
  @Post('employees') createEmployee(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createEmployee(dto, this.scope(u)); }
  @Patch('employees/:id') updateEmployee(@Param('id') id: string, @Body() dto: any) { return this.svc.updateEmployee(id, dto); }
  @Delete('employees/:id') deleteEmployee(@Param('id') id: string) { return this.svc.deleteEmployee(id); }

  // Industries
  @Get('industries') getIndustries(@CurrentUser() u: any) { return this.svc.getIndustries(this.scope(u)); }
  @Post('industries') createIndustry(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createIndustry(dto, this.scope(u)); }
  @Patch('industries/:id') updateIndustry(@Param('id') id: string, @Body() dto: any) { return this.svc.updateIndustry(id, dto); }
  @Delete('industries/:id') deleteIndustry(@Param('id') id: string) { return this.svc.deleteIndustry(id); }

  // Deal Types
  @Get('deal-types') getDealTypes(@CurrentUser() u: any) { return this.svc.getDealTypes(this.scope(u)); }
  @Post('deal-types') createDealType(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createDealType(dto, this.scope(u)); }
  @Patch('deal-types/:id') updateDealType(@Param('id') id: string, @Body() dto: any) { return this.svc.updateDealType(id, dto); }
  @Delete('deal-types/:id') deleteDealType(@Param('id') id: string) { return this.svc.deleteDealType(id); }

  // Currencies
  @Get('currencies') getCurrencies(@CurrentUser() u: any) { return this.svc.getCurrencies(this.scope(u)); }
  @Post('currencies') createCurrency(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createCurrency(dto, this.scope(u)); }
  @Patch('currencies/:id') updateCurrency(@Param('id') id: string, @Body() dto: any) { return this.svc.updateCurrency(id, dto); }
  @Delete('currencies/:id') deleteCurrency(@Param('id') id: string) { return this.svc.deleteCurrency(id); }

  // Locations
  @Get('locations') getLocations(@CurrentUser() u: any) { return this.svc.getLocations(this.scope(u)); }
  @Post('locations') createLocation(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createLocation(dto, this.scope(u)); }
  @Patch('locations/:id') updateLocation(@Param('id') id: string, @Body() dto: any) { return this.svc.updateLocation(id, dto); }
  @Delete('locations/:id') deleteLocation(@Param('id') id: string) { return this.svc.deleteLocation(id); }

  // Taxes
  @Get('taxes') getTaxes(@CurrentUser() u: any) { return this.svc.getTaxes(this.scope(u)); }
  @Post('taxes') createTax(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createTax(dto, this.scope(u)); }
  @Patch('taxes/:id') updateTax(@Param('id') id: string, @Body() dto: any) { return this.svc.updateTax(id, dto); }
  @Delete('taxes/:id') deleteTax(@Param('id') id: string) { return this.svc.deleteTax(id); }

  // Units of Measurement
  @Get('units') getUnits(@CurrentUser() u: any) { return this.svc.getUnits(this.scope(u)); }
  @Post('units') createUnit(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createUnit(dto, this.scope(u)); }
  @Patch('units/:id') updateUnit(@Param('id') id: string, @Body() dto: any) { return this.svc.updateUnit(id, dto); }
  @Delete('units/:id') deleteUnit(@Param('id') id: string) { return this.svc.deleteUnit(id); }

  // Product Properties
  @Get('product-properties') getProductProperties(@CurrentUser() u: any) { return this.svc.getProductProperties(this.scope(u)); }
  @Post('product-properties') createProductProperty(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createProductProperty(dto, this.scope(u)); }
  @Patch('product-properties/:id') updateProductProperty(@Param('id') id: string, @Body() dto: any) { return this.svc.updateProductProperty(id, dto); }
  @Delete('product-properties/:id') deleteProductProperty(@Param('id') id: string) { return this.svc.deleteProductProperty(id); }
}
