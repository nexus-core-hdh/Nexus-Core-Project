import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Files')
@PermissionModule('files', 'File manager')
@Controller('files')
export class FilesController {
  constructor(private readonly svc: FilesService) {}

  // Folders
  @Get('folders')
  getFolders(@CurrentUser() u: any, @Query('parentFolderId') parentFolderId?: string) {
    return this.svc.getFolders(u.companyId, u.branchId, parentFolderId === 'null' ? null : parentFolderId);
  }

  @Get('folders/:id')
  getFolder(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getFolder(id, u.companyId); }

  @Post('folders')
  createFolder(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createFolder(dto, u.id, u.companyId, u.branchId); }

  @Patch('folders/:id')
  updateFolder(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.updateFolder(id, dto, u.companyId); }

  @Delete('folders/:id')
  deleteFolder(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deleteFolder(id, u.companyId); }

  // Media Files
  @Get()
  @ApiOperation({ summary: 'Get media files' })
  getFiles(@CurrentUser() u: any, @Query('folderId') folderId?: string, @Query('fileType') fileType?: string) {
    return this.svc.getFiles(u.companyId, u.branchId, folderId, fileType);
  }

  @Get(':id')
  getFile(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getFile(id, u.companyId); }

  @Post()
  createFile(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createFile(dto, u.id, u.companyId, u.branchId); }

  @Patch(':id')
  updateFile(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.updateFile(id, dto, u.companyId); }

  @Delete(':id')
  deleteFile(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deleteFile(id, u.companyId); }

  // Storage Quota
  @Get('storage/quota')
  getStorageQuota(@CurrentUser() u: any) { return this.svc.getStorageQuota(u.companyId); }

  @Patch('storage/quota')
  updateStorageQuota(@Body() dto: any, @CurrentUser() u: any) { return this.svc.upsertStorageQuota(u.companyId, u.branchId, dto); }

  // Rich Documents
  @Get('docs/rich')
  getRichDocs(@CurrentUser() u: any, @Query('type') type?: string) {
    return this.svc.getRichDocuments(u.companyId, u.branchId, type ? { type } : {});
  }

  @Get('docs/rich/:id')
  getRichDoc(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getRichDocument(id, u.companyId); }

  @Post('docs/rich')
  createRichDoc(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createRichDocument(dto, u.id, u.companyId, u.branchId as string | undefined); }

  @Patch('docs/rich/:id')
  updateRichDoc(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) { return this.svc.updateRichDocument(id, dto, u.companyId); }

  @Delete('docs/rich/:id')
  deleteRichDoc(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.deleteRichDocument(id, u.companyId); }
}
