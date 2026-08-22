import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';

// Mirrors inventory-receipt-attachments.service.ts exactly, against FI_ReceiptAttachment
// ("ReceiptId" FK, confirmed via pg_constraint — FK_FI_ReceiptAttachment_FI_Receipt) instead of
// IM_ReceiptAttachment. Same purpose-built attachment table already present in the migrated
// schema (confirmed 0 rows, first writer). Same Type=1(document)/Type=2(picture) convention as
// every other attachments table in this module.
const TYPE_DOCUMENT = 1;
const TYPE_PICTURE = 2;

const DOCUMENT_EXTENSIONS: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
};
const DOCUMENT_VALIDATION_MESSAGE = 'Only PDF, Word, Excel and Text files are allowed.';
const PICTURE_VALIDATION_MESSAGE = 'Only image files are allowed.';
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

const extOf = (fileName: string) => (fileName.split('.').pop() || '').toLowerCase();

function mimeFor(fileName: string): string {
  const ext = extOf(fileName);
  if (DOCUMENT_EXTENSIONS[ext]) return DOCUMENT_EXTENSIONS[ext];
  if (IMAGE_EXTENSIONS.has(ext)) return ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  return 'application/octet-stream';
}

interface UploadDto {
  kind: 'document' | 'picture';
  fileName: string;
  dataUrl: string;
}

@Injectable()
export class FiReceiptAttachmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(fiReceiptId: number, kind: 'document' | 'picture') {
    const type = kind === 'document' ? TYPE_DOCUMENT : TYPE_PICTURE;
    const rows = kind === 'picture'
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT "RecId" as id, "FileName" as "fileName", "InsertedAt" as "uploadedAt", encode("Thumbnail", 'base64') as "thumbnailBase64"
          FROM "FI_ReceiptAttachment"
          WHERE "ReceiptId" = ${fiReceiptId} AND "Type" = ${type} AND "IsDeleted" = 0
          ORDER BY "InsertedAt" DESC
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT "RecId" as id, "FileName" as "fileName", "InsertedAt" as "uploadedAt"
          FROM "FI_ReceiptAttachment"
          WHERE "ReceiptId" = ${fiReceiptId} AND "Type" = ${type} AND "IsDeleted" = 0
          ORDER BY "InsertedAt" DESC
        `);
    return sanitizeRawRow(rows).map((r: any) => ({ ...r, fileType: extOf(r.fileName).toUpperCase() }));
  }

  async upload(fiReceiptId: number, dto: UploadDto, userId: number) {
    if (!dto.fileName || !dto.dataUrl) throw new BadRequestException('fileName and dataUrl are required');
    const ext = extOf(dto.fileName);

    if (dto.kind === 'document') {
      if (!DOCUMENT_EXTENSIONS[ext]) throw new BadRequestException(DOCUMENT_VALIDATION_MESSAGE);
    } else {
      if (!IMAGE_EXTENSIONS.has(ext)) throw new BadRequestException(PICTURE_VALIDATION_MESSAGE);
    }

    const match = dto.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new BadRequestException('Invalid file data');
    const buffer = Buffer.from(match[2], 'base64');
    const type = dto.kind === 'document' ? TYPE_DOCUMENT : TYPE_PICTURE;
    const thumbnail = dto.kind === 'picture' ? buffer : null;

    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "FI_ReceiptAttachment" ("ReceiptId", "Type", "FileName", "Attachment", "Thumbnail", "InUse", "InsertedAt", "InsertedBy", "IsDeleted", "UUID")
      VALUES (${fiReceiptId}, ${type}, ${dto.fileName}, ${buffer}, ${thumbnail}, 1, now(), ${userId}, 0, gen_random_uuid())
      RETURNING "RecId" as id, "FileName" as "fileName", "InsertedAt" as "uploadedAt"
    `);
    return sanitizeRawRow({ ...rows[0], fileType: ext.toUpperCase() });
  }

  async content(fiReceiptId: number, attachmentId: number): Promise<{ fileName: string; mimeType: string; buffer: Buffer }> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "FileName" as "fileName", "Attachment" as "attachment"
      FROM "FI_ReceiptAttachment" WHERE "RecId" = ${attachmentId} AND "ReceiptId" = ${fiReceiptId} AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Attachment not found');
    return { fileName: rows[0].fileName, mimeType: mimeFor(rows[0].fileName), buffer: rows[0].attachment };
  }

  async remove(fiReceiptId: number, attachmentId: number, userId: number) {
    const result = await this.prisma.$executeRaw`
      UPDATE "FI_ReceiptAttachment" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId}
      WHERE "RecId" = ${attachmentId} AND "ReceiptId" = ${fiReceiptId}
    `;
    if (!result) throw new NotFoundException('Attachment not found');
    return { message: 'Deleted' };
  }
}
