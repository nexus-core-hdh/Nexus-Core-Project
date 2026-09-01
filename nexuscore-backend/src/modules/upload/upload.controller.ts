import { BadRequestException, Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

// Generic file upload — backs uploadApi.uploadSingle() (frontend/lib/api.ts), which the PLM
// Attachments/Picture Gallery screens (Sample Cards, Style Cards) have always called via a
// plain multipart POST to /upload/single, but no matching backend route existed at all until
// now. Both routes here write the raw Express response directly (@Res()), bypassing the global
// ResponseInterceptor's {success,data,message} envelope — required because uploadApi.uploadSingle
// uses a raw fetch()+response.json() (not the shared apiRequest() helper that unwraps that
// envelope), and callers already destructure the plain {relativePath,url,type,name} shape this
// returns. Same raw-response technique every other binary content() route in this codebase
// already uses (e.g. inventory-receipt.controller.ts's getAttachmentContent).
@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly svc: UploadService) {}

  @Post('single')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSingle(@UploadedFile() file: any, @CurrentUser('id') userId: string, @Res() res: Response) {
    if (!file) throw new BadRequestException('file is required');
    const saved = await this.svc.save(file, userId);
    res.json(saved);
  }

  // Public — a plain <img src="..."> (used by every PLM attachment/picture preview that reads
  // this URL) can't carry an Authorization header, so this route can't sit behind the global JWT
  // guard the way the upload itself does. Relies on the id being an unguessable UUID, the same
  // "public content, private id" trust model most apps use for uploaded-image links. (A more
  // guarded precedent exists — account.controller.ts's getAttachmentContent issues short-lived
  // scoped tokens for exactly this problem — but that needs a matching frontend token fetch
  // first; out of scope here since every PLM caller already expects zero frontend changes.)
  @Public()
  @Get(':id')
  async content(@Param('id') id: string, @Res() res: Response) {
    const { fileName, mimeType, buffer } = await this.svc.content(id);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
    });
    res.send(buffer);
  }
}
