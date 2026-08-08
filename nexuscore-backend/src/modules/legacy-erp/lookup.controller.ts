import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ParameterLookupService, PARAMETER_GROUPS, ParameterGroupKey } from './parameter-lookup.service';

@ApiTags('Legacy ERP - Lookups')
@Controller('legacy-erp/lookup/parameters')
export class LookupController {
  constructor(private readonly svc: ParameterLookupService) {}

  @Get(':group') search(@Param('group') group: string, @Query('search') search?: string) {
    if (!(group in PARAMETER_GROUPS)) throw new BadRequestException(`Unknown parameter group "${group}"`);
    return this.svc.search(group as ParameterGroupKey, search);
  }
}
