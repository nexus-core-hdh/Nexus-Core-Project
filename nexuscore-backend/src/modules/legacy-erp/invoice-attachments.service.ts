import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { assertOwnedRow } from './legacy-company-scope';

// Invoice attachments — the legacy IM_InvoiceAttachment table (InvoiceId -> IM_Invoice; already in
// the migrated schema, 0 rows). Mirrors inventory-receipt-attachments.service.ts exactly (same file
// rules, Type 1 = document / 2 = picture), so the shared AttachmentsTab works unchanged.
const TYPE_DOCUMENT = 1;
const TYPE_PICTURE = 2;
const DOCUMENT_EXTENSIONS: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain',
};
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
const extOf = (fileName: string) => (fileName.split('.').pop() || '').toLowerCase();
const mimeFor = (fileName: string) => {
  const ext = extOf(fileName);
  if (DOCUMENT_EXTENSIONS[ext]) return DOCUMENT_EXTENSIONS[ext];
  if (IMAGE_EXTENSIONS.has(ext)) return ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  return 'application/octet-stream';
};

@Injectable()
export class InvoiceAttachmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(invoiceId: number, kind: 'document' | 'picture') {
    await assertOwnedRow(this.prisma, 'IM_Invoice', invoiceId, 'Invoice'); // company isolation
    const type = kind === 'document' ? TYPE_DOCUMENT : TYPE_PICTURE;
    const thumb = kind === 'picture' ? Prisma.sql`, encode("Thumbnail", 'base64') as "thumbnailBase64"` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "RecId" as id, "FileName" as "fileName", "InsertedAt" as "uploadedAt" ${thumb}
      FROM "IM_InvoiceAttachment" WHERE "InvoiceId" = ${invoiceId} AND "Type" = ${type} AND "IsDeleted" = 0 ORDER BY "InsertedAt" DESC`);
    return sanitizeRawRow(rows).map((r: any) => ({ ...r, fileType: extOf(r.fileName).toUpperCase() }));
  }

  async upload(invoiceId: number, dto: { kind: 'document' | 'picture'; fileName: string; dataUrl: string }, userId: number) {
    await assertOwnedRow(this.prisma, 'IM_Invoice', invoiceId, 'Invoice'); // company isolation
    if (!dto.fileName || !dto.dataUrl) throw new BadRequestException('fileName and dataUrl are required');
    const ext = extOf(dto.fileName);
    if (dto.kind === 'document' ? !DOCUMENT_EXTENSIONS[ext] : !IMAGE_EXTENSIONS.has(ext)) {
      throw new BadRequestException(dto.kind === 'document' ? 'Only PDF, Word, Excel and Text files are allowed.' : 'Only image files are allowed.');
    }
    const match = dto.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new BadRequestException('Invalid file data');
    const buffer = Buffer.from(match[2], 'base64');
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "IM_InvoiceAttachment" ("InvoiceId", "Type", "FileName", "Attachment", "Thumbnail", "InUse", "InsertedAt", "InsertedBy", "IsDeleted", "UUID")
      VALUES (${invoiceId}, ${dto.kind === 'document' ? TYPE_DOCUMENT : TYPE_PICTURE}, ${dto.fileName}, ${buffer}, ${dto.kind === 'picture' ? buffer : null}, 1, now(), ${userId}, 0, gen_random_uuid())
      RETURNING "RecId" as id, "FileName" as "fileName", "InsertedAt" as "uploadedAt"`);
    return sanitizeRawRow({ ...rows[0], fileType: ext.toUpperCase() });
  }

  async content(invoiceId: number, attachmentId: number) {
    await assertOwnedRow(this.prisma, 'IM_Invoice', invoiceId, 'Invoice'); // company isolation
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "FileName" as "fileName", "Attachment" as "attachment" FROM "IM_InvoiceAttachment"
      WHERE "RecId" = ${attachmentId} AND "InvoiceId" = ${invoiceId} AND "IsDeleted" = 0`);
    if (!rows.length) throw new NotFoundException('Attachment not found');
    return { fileName: rows[0].fileName as string, mimeType: mimeFor(rows[0].fileName), buffer: rows[0].attachment as Buffer };
  }

  async remove(invoiceId: number, attachmentId: number, userId: number) {
    await assertOwnedRow(this.prisma, 'IM_Invoice', invoiceId, 'Invoice'); // company isolation
    const result = await this.prisma.$executeRaw`
      UPDATE "IM_InvoiceAttachment" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId}
      WHERE "RecId" = ${attachmentId} AND "InvoiceId" = ${invoiceId}`;
    if (!result) throw new NotFoundException('Attachment not found');
    return { message: 'Deleted' };
  }
}
