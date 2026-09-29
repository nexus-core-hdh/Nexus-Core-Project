import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionModule, Permissions } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommunicationService } from './communication.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const MANAGE_SMTP = { module: 'communication', action: 'manage-smtp' };
const SMTP_PASSWORD_MASK = '********';

@ApiTags('Communication')
@PermissionModule('communication', 'Communication')
@Controller('communication')
export class CommunicationController {
  constructor(private readonly svc: CommunicationService) {}

  // Chats
  @Get('chats')
  @ApiOperation({ summary: 'Get user chats' })
  getChats(@CurrentUser() u: any) { return this.svc.getChats(u.id, u.companyId); }

  @Get('chats/:id')
  getChat(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getChat(id, u.companyId); }

  @Post('chats')
  @ApiOperation({ summary: 'Create chat' })
  createChat(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createChat(dto, u.id, u.companyId, u.branchId); }

  @Get('chats/:id/messages')
  getChatMessages(@Param('id') id: string, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.svc.getChatMessages(id, skip ? +skip : 0, take ? +take : 50);
  }

  @Post('chats/:id/messages')
  sendMessage(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any) {
    return this.svc.sendMessage(id, dto, u.id);
  }

  @Delete('messages/:id')
  deleteMessage(@Param('id') id: string) { return this.svc.deleteMessage(id); }

  // Mail
  @Get('mails')
  getMails(@CurrentUser() u: any, @Query('folder') folder?: string) {
    return this.svc.getMails(u.id, u.companyId, folder);
  }

  @Get('mails/:id')
  getMail(@Param('id') id: string, @CurrentUser() u: any) { return this.svc.getMail(id, u.id); }

  @Post('mails')
  createMail(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createMail(dto, u.id, u.companyId); }

  @Patch('mails/:id')
  updateMail(@Param('id') id: string, @Body() dto: any) { return this.svc.updateMail(id, dto); }

  @Delete('mails/:id')
  deleteMail(@Param('id') id: string) { return this.svc.deleteMail(id); }

  // SMTP Settings — mail server credentials: a separate permission, and the stored password is
  // never returned (a masked value sent back unchanged keeps the existing password).
  @Permissions(MANAGE_SMTP)
  @Get('smtp')
  async getSmtp(@CurrentUser() u: any) {
    const rows = await this.svc.getSmtpSettings(u.companyId);
    return rows.map((r) => ({ ...r, password: r.password ? SMTP_PASSWORD_MASK : '' }));
  }

  @Permissions(MANAGE_SMTP)
  @Post('smtp')
  createSmtp(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createSmtpSetting(dto, u.companyId); }

  @Permissions(MANAGE_SMTP)
  @Patch('smtp/:id')
  updateSmtp(@Param('id') id: string, @Body() dto: any) {
    if (dto?.password === SMTP_PASSWORD_MASK) delete dto.password;
    return this.svc.updateSmtpSetting(id, dto);
  }

  @Permissions(MANAGE_SMTP)
  @Delete('smtp/:id')
  deleteSmtp(@Param('id') id: string) { return this.svc.deleteSmtpSetting(id); }

  // Email Templates
  @Get('email-templates')
  getEmailTemplates(@CurrentUser() u: any, @Query('category') category?: string) {
    return this.svc.getEmailTemplates(u.companyId, u.branchId, category);
  }

  @Post('email-templates')
  createEmailTemplate(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createEmailTemplate(dto, u.companyId, u.branchId); }

  @Patch('email-templates/:id')
  updateEmailTemplate(@Param('id') id: string, @Body() dto: any) { return this.svc.updateEmailTemplate(id, dto); }

  @Delete('email-templates/:id')
  deleteEmailTemplate(@Param('id') id: string) { return this.svc.deleteEmailTemplate(id); }

  // Email Notifications
  @Get('email-notifications')
  getEmailNotifications(@CurrentUser() u: any) { return this.svc.getEmailNotifications(u.companyId); }

  @Post('email-notifications')
  createEmailNotification(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createEmailNotification(dto, u.companyId); }

  @Patch('email-notifications/:id')
  updateEmailNotification(@Param('id') id: string, @Body() dto: any) { return this.svc.updateEmailNotification(id, dto); }

  // Email Signatures
  @Get('email-signatures')
  getEmailSignatures(@CurrentUser() u: any) { return this.svc.getEmailSignatures(u.id, u.companyId); }

  @Post('email-signatures')
  createEmailSignature(@Body() dto: any, @CurrentUser() u: any) { return this.svc.createEmailSignature(dto, u.id, u.companyId); }

  @Patch('email-signatures/:id')
  updateEmailSignature(@Param('id') id: string, @Body() dto: any) { return this.svc.updateEmailSignature(id, dto); }

  @Delete('email-signatures/:id')
  deleteEmailSignature(@Param('id') id: string) { return this.svc.deleteEmailSignature(id); }
}
