import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AllowAuthenticated } from '../../common/decorators/permissions.decorator';
import { FileAccessGuard } from '../../common/security/file-access.guard';
import { sendStoredFile, uploadMaxBytes } from '../../common/security/file-safety';

// Generic file upload — backs uploadApi.uploadSingle() (frontend/lib/api.ts), which the PLM
// Attachments/Picture Gallery screens (Sample Cards, Style Cards) call via a plain multipart POST
// to /upload/single. Both routes write the raw Express response directly (@Res()), bypassing the
// global ResponseInterceptor's {success,data,message} envelope — required because
// uploadApi.uploadSingle uses a raw fetch()+response.json() and callers destructure the plain
// {relativePath,url,type,name} shape this returns.
@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly svc: UploadService) {}

  // Attaching a file is part of editing whichever record it belongs to; the record's own save
  // route carries that screen's permission, so any signed-in user may upload here. The size limit
  // is enforced while streaming (multer stops reading at the limit instead of buffering it all),
  // and the type is validated against the file content in UploadService.save().
  @AllowAuthenticated()
  @Post('single')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: uploadMaxBytes(), files: 1 } }))
  async uploadSingle(@UploadedFile() file: any, @CurrentUser('id') userId: string, @Res() res: Response) {
    if (!file) throw new BadRequestException('file is required');
    const saved = await this.svc.save(file, userId);
    res.json(saved);
  }

  // Loaded by plain <img src="..."> previews, which cannot send an Authorization header, so the
  // global JWT guard is bypassed (@Public) and FileAccessGuard authenticates the request instead
  // (header, the frontend's auth_token cookie, or ?token=). Anonymous requests get 401.
  @Public()
  @UseGuards(FileAccessGuard)
  @Get(':id')
  async content(@Param('id', new ParseUUIDPipe()) id: string, @Res() res: Response) {
    const { fileName, buffer } = await this.svc.content(id);
    sendStoredFile(res, { fileName, buffer });
  }
}
