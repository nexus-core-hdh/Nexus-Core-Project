import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Coarse category only — used to build a display-ish "type" in the upload response (the
// PLM attachment record itself stores the browser's own File.type, not this), and to keep
// the response shape parity with what uploadApi.uploadSingle()'s callers already destructure.
const categoryFor = (mimeType: string) => (mimeType.startsWith('image/') ? 'image' : 'document');

@Injectable()
export class UploadService {
  constructor(private readonly prisma: PrismaService) {}

  async save(file: { originalname: string; mimetype: string; buffer: Buffer }, userId?: string) {
    const saved = await this.prisma.uploadedFile.create({
      data: {
        fileName: file.originalname,
        mimeType: file.mimetype,
        data: file.buffer,
        createdBy: userId ?? undefined,
      },
      select: { id: true, fileName: true, mimeType: true },
    });
    // relativePath/url — the exact fields general-tab.tsx/attachments-tab.tsx/
    // picture-gallery-tab.tsx already read off this response (see their own uploadFile()),
    // resolved back to the raw bytes via GET /upload/:id (content() below).
    return {
      relativePath: `upload/${saved.id}`,
      url: `upload/${saved.id}`,
      type: categoryFor(saved.mimeType),
      name: saved.fileName,
    };
  }

  async content(id: string) {
    const row = await this.prisma.uploadedFile.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('File not found');
    return { fileName: row.fileName, mimeType: row.mimeType, buffer: row.data as Buffer };
  }
}
