import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeRawRow } from './raw-row.util';
import { ContractService } from './contract.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';

// Mirrors purchase-order-attachments.service.ts exactly, against the pre-existing
// SM_ContractAttachment table (ContractReceiptId FK, confirmed 0 rows, first writer). Not
// receiptType-scoped — attachments are keyed by header RecId only, same as every other
// attachments table in this module; RecId is globally unique across both contract types so
// there's no cross-type leakage risk.
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
export class ContractAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contracts: ContractService,
    private readonly audit: AuditService,
  ) {}

  // Attachment events are audited as child events of the owning contract. Only file METADATA
  // (id/name/type/kind) is ever snapshotted — never the stored bytes/thumbnail.
  private async auditAttachment(
    action: string, snapshot: Record<string, any>, contractReceiptId: number, receiptType: number,
    currentUserId?: string, companyId?: string,
  ) {
    if (!currentUserId || !companyId) return;
    const label = this.contracts.entityTypeFor(receiptType);
    const header = await this.contracts.get(contractReceiptId, receiptType).catch(() => null);
    const key = { [`${label} Attachment (SM_ContractAttachment)`]: snapshot };
    await this.audit.recordSafe({
      userId: currentUserId, companyId, screenKey: this.contracts.screenKeyFor(receiptType),
      entityType: `${label}Attachment`, entityId: String(snapshot.id), action,
      parentEntityType: label, parentEntityId: String(contractReceiptId), parentDocumentNo: (header as any)?.receiptNo ?? null,
      ...(action === AUDIT_ACTIONS.DELETE ? { before: key } : { after: key }),
    });
  }

  async list(contractReceiptId: number, kind: 'document' | 'picture') {
    const type = kind === 'document' ? TYPE_DOCUMENT : TYPE_PICTURE;
    const rows = kind === 'picture'
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT "RecId" as id, "FileName" as "fileName", "InsertedAt" as "uploadedAt", encode("Thumbnail", 'base64') as "thumbnailBase64"
          FROM "SM_ContractAttachment"
          WHERE "ContractReceiptId" = ${contractReceiptId} AND "Type" = ${type} AND "IsDeleted" = 0
          ORDER BY "InsertedAt" DESC
        `)
      : await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT "RecId" as id, "FileName" as "fileName", "InsertedAt" as "uploadedAt"
          FROM "SM_ContractAttachment"
          WHERE "ContractReceiptId" = ${contractReceiptId} AND "Type" = ${type} AND "IsDeleted" = 0
          ORDER BY "InsertedAt" DESC
        `);
    return sanitizeRawRow(rows).map((r: any) => ({ ...r, fileType: extOf(r.fileName).toUpperCase() }));
  }

  async upload(contractReceiptId: number, dto: UploadDto, userId: number, receiptType?: number, currentUserId?: string, companyId?: string) {
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
      INSERT INTO "SM_ContractAttachment" ("ContractReceiptId", "Type", "FileName", "Attachment", "Thumbnail", "InUse", "InsertedAt", "InsertedBy", "IsDeleted", "UUID")
      VALUES (${contractReceiptId}, ${type}, ${dto.fileName}, ${buffer}, ${thumbnail}, 1, now(), ${userId}, 0, gen_random_uuid())
      RETURNING "RecId" as id, "FileName" as "fileName", "InsertedAt" as "uploadedAt"
    `);
    const created = sanitizeRawRow({ ...rows[0], fileType: ext.toUpperCase() });
    if (receiptType !== undefined) {
      await this.auditAttachment(AUDIT_ACTIONS.CREATE, { id: created.id, fileName: created.fileName, fileType: created.fileType, kind: dto.kind }, contractReceiptId, receiptType, currentUserId, companyId);
    }
    return created;
  }

  async content(contractReceiptId: number, attachmentId: number): Promise<{ fileName: string; mimeType: string; buffer: Buffer }> {
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "FileName" as "fileName", "Attachment" as "attachment"
      FROM "SM_ContractAttachment" WHERE "RecId" = ${attachmentId} AND "ContractReceiptId" = ${contractReceiptId} AND "IsDeleted" = 0
    `);
    if (!rows.length) throw new NotFoundException('Attachment not found');
    return { fileName: rows[0].fileName, mimeType: mimeFor(rows[0].fileName), buffer: rows[0].attachment };
  }

  async remove(contractReceiptId: number, attachmentId: number, userId: number, receiptType?: number, currentUserId?: string, companyId?: string) {
    const beforeRows = receiptType !== undefined && currentUserId && companyId
      ? await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT "RecId" as id, "FileName" as "fileName", "Type" as "type" FROM "SM_ContractAttachment"
          WHERE "RecId" = ${attachmentId} AND "ContractReceiptId" = ${contractReceiptId} AND "IsDeleted" = 0
        `)
      : [];
    const result = await this.prisma.$executeRaw`
      UPDATE "SM_ContractAttachment" SET "IsDeleted" = 1, "DeletedAt" = now(), "DeletedBy" = ${userId}
      WHERE "RecId" = ${attachmentId} AND "ContractReceiptId" = ${contractReceiptId}
    `;
    if (!result) throw new NotFoundException('Attachment not found');
    if (receiptType !== undefined && beforeRows.length) {
      const b = sanitizeRawRow(beforeRows[0]);
      await this.auditAttachment(AUDIT_ACTIONS.DELETE, { id: b.id, fileName: b.fileName, fileType: extOf(b.fileName).toUpperCase(), kind: Number(b.type) === TYPE_DOCUMENT ? 'document' : 'picture' }, contractReceiptId, receiptType, currentUserId, companyId);
    }
    return { message: 'Deleted' };
  }
}
