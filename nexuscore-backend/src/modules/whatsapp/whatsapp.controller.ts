import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { PermissionModule } from '../../common/decorators/permissions.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { WhatsappService } from './whatsapp.service';
import { SendWhatsappMessageDto } from './dto/send-message.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('WhatsApp')
@PermissionModule('whatsapp', 'WhatsApp')
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('company-config')
  @ApiOperation({ summary: 'Set WhatsApp Meta App ID & Secret for company' })
  setConfig(
    @CurrentUser('companyId') companyId: string,
    @Body() body: { metaAppId: string; metaAppSecret: string },
  ) {
    return this.whatsappService.setCompanyConfig(companyId, body.metaAppId, body.metaAppSecret);
  }

  @Public()
  @Get('callback')
  @ApiOperation({ summary: 'WhatsApp webhook verification (Meta callback)' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const result = this.whatsappService.verifyWebhook(mode, token, challenge);
    res.status(200).send(result);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send WhatsApp message via Meta Graph API' })
  send(@Body() dto: SendWhatsappMessageDto, @CurrentUser('id') actorId: string) {
    return this.whatsappService.sendMessage(dto, actorId);
  }
}
