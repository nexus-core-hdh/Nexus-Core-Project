import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../../messaging/messaging.service';
import { DeleteDependencyService } from '../legacy-erp/delete-dependency.service';

@Injectable()
export class PlmCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly deleteGuard: DeleteDependencyService,
  ) {}

  private async nextNumber(prefix: string, model: any, field: string): Promise<string> {
    const year = new Date().getFullYear();
    const last = await (this.prisma as any)[model].findFirst({
      where: { [field]: { startsWith: `${prefix}-${year}-` } },
      orderBy: { [field]: 'desc' },
      select: { [field]: true },
    });
    const seq = last ? parseInt(last[field].split('-').pop()!) + 1 : 1;
    return `${prefix}-${year}-${String(seq).padStart(3, '0')}`;
  }

  // ── Mood Boards ───────────────────────────────────────────────────────────────
  async listMoodBoards(branchId: string, q?: Record<string, string>) {
    return this.prisma.moodBoard.findMany({
      where: { branchId, ...(q?.status ? { status: q.status } : {}) },
      include: { _count: { select: { styleCards: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
  async createMoodBoard(dto: any, branchId: string, createdBy: string) {
    return this.prisma.moodBoard.create({ data: { ...dto, branchId, createdBy } });
  }
  async getMoodBoard(id: string) {
    const r = await this.prisma.moodBoard.findUnique({
      where: { id },
      include: { styleCards: { select: { id: true, styleNumber: true, title: true, status: true } } },
    });
    if (!r) throw new NotFoundException('MoodBoard not found');
    return r;
  }
  async updateMoodBoard(id: string, dto: any) {
    await this.getMoodBoard(id);
    return this.prisma.moodBoard.update({ where: { id }, data: dto });
  }
  async deleteMoodBoard(id: string) {
    await this.getMoodBoard(id);
    await this.prisma.moodBoard.delete({ where: { id } });
    return { message: 'Deleted' };
  }
  async addMoodBoardImages(id: string, images: string[]) {
    const board = await this.getMoodBoard(id);
    const existing = (board.images as string[]) || [];
    return this.prisma.moodBoard.update({ where: { id }, data: { images: [...existing, ...images] } });
  }

  // ── Style Cards ───────────────────────────────────────────────────────────────
  async listStyleCards(branchId: string, q?: Record<string, string>) {
    const where: any = { branchId };
    if (q?.status) where.status = q.status;
    if (q?.season) where.season = q.season;
    if (q?.category) where.category = q.category;
    // Searches both Style Code (styleNumber) and Style Name (title) — was Name-only, the one
    // inconsistency with every other master lookup in this codebase (Fabric/Trim/Yarn Card,
    // Current Account, ...), all of which already search by Code or Name. Matters for this
    // becoming a reusable Style lookup for other modules (Work Order, etc. — not wired up in
    // this change), which need to find a style by its Code, not just its free-text Name.
    if (q?.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { styleNumber: { contains: q.search, mode: 'insensitive' } },
      ];
    }

    const page = parseInt(q?.page || '1');
    const limit = parseInt(q?.limit || '20');
    const [data, total] = await Promise.all([
      this.prisma.styleCard.findMany({
        where,
        include: {
          moodBoard: { select: { id: true, title: true } },
          _count: { select: { sampleCards: true, productCards: true, plmOrders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.styleCard.count({ where }),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async createStyleCard(dto: any, branchId: string, createdBy: string) {
    // Sample Card Master screen ("Code must be visible and read-only when creating records and
    // unique per entity") — switched from Math.random() to the same nextNumber() helper already
    // used for SampleCard/ProductCard numbering in this file, so styleNumber is sequential and
    // genuinely collision-safe, and can be previewed server-side before Save (see
    // previewNextStyleNumber() below). Same "SC-YYYY-NNN" format, so no visible change for the
    // existing style-cards screen beyond becoming reliably unique.
    const styleNumber = await this.nextNumber('SC', 'styleCard', 'styleNumber');
    const card = await this.prisma.styleCard.create({
      data: { ...dto, styleNumber, branchId, createdBy },
      include: { moodBoard: { select: { id: true, title: true } } },
    });
    await this.autoCreateDocket('style_card', card.id, `Docket — ${card.styleNumber}`, branchId, createdBy);
    return card;
  }

  // Read-only preview for the Sample Card Master screen's Code field, mirroring
  // yarn-card.service.ts's previewNextCode() convention — generates nothing, just shows what
  // createStyleCard() would assign.
  async previewNextStyleNumber(): Promise<string> {
    return this.nextNumber('SC', 'styleCard', 'styleNumber');
  }

  async getStyleCard(id: string) {
    const r = await this.prisma.styleCard.findUnique({
      where: { id },
      include: {
        moodBoard: true,
        measurementChart: true,
        department: true,
        customer: true,
        productionMerchandiser: true,
        productMerchandiser: true,
        designer: true,
        representative: true,
        washCare: true,
        details: { include: { designDetailType: true } },
        sampleCards: { select: { id: true, sampleNumber: true, title: true, status: true } },
        productCards: { select: { id: true, productNumber: true, title: true, status: true } },
        criticalPath: { include: { tasks: { orderBy: { sequence: 'asc' } } } },
        studyTemplates: { select: { id: true, name: true } },
      },
    });
    if (!r) throw new NotFoundException('StyleCard not found');
    return r;
  }

  async getStyleCardOrders(id: string) {
    return this.prisma.plmOrder.findMany({
      where: { styleCardId: id },
      include: { sampleType: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStyleCard(id: string, dto: any) {
    await this.getStyleCard(id);
    return this.prisma.styleCard.update({
      where: { id },
      data: dto,
      include: { moodBoard: { select: { id: true, title: true } } },
    });
  }

  async deleteStyleCard(id: string) {
    await this.getStyleCard(id);
    await this.deleteGuard.assertDeletable('StyleCard', id);
    await this.prisma.styleCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  async updateStyleCardStatus(id: string, status: string, changedBy: string) {
    await this.getStyleCard(id);
    const updated = await this.prisma.styleCard.update({ where: { id }, data: { status } });
    await this.messaging.publish('nexuscore.plm.style_card.status_changed', { styleCardId: id, status, changedBy });
    await this.prisma.auditLog.create({
      data: { entityType: 'style_card', entityId: id, action: 'status_changed', changedBy, newValues: { status } },
    });
    return updated;
  }

  async getStyleCardDetails(id: string) {
    return this.prisma.styleCardDetail.findMany({
      where: { styleCardId: id },
      include: { designDetailType: true },
    });
  }

  async addStyleCardDetail(id: string, dto: any, changedBy: string) {
    await this.getStyleCard(id);
    return this.prisma.styleCardDetail.create({
      data: { ...dto, styleCardId: id },
      include: { designDetailType: true },
    });
  }

  async upsertStyleCardDetails(id: string, details: any[], changedBy: string) {
    await this.getStyleCard(id);
    await this.prisma.styleCardDetail.deleteMany({ where: { styleCardId: id } });
    return this.prisma.styleCardDetail.createMany({
      data: details.map((d) => ({ ...d, styleCardId: id })),
    });
  }

  async duplicateStyleCard(id: string, createdBy: string) {
    const sc = await this.getStyleCard(id);
    const styleNumber = `SC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    return this.prisma.styleCard.create({
      data: {
        styleNumber,
        title: `${sc.title} (Copy)`,
        season: sc.season,
        year: sc.year,
        gender: sc.gender,
        category: sc.category,
        description: sc.description,
        branchId: sc.branchId,
        createdBy,
        status: 'concept',
      },
    });
  }

  // ── Sample Cards ──────────────────────────────────────────────────────────────
  async listSampleCards(branchId: string, q?: Record<string, string>) {
    const where: any = { branchId };
    if (q?.status) where.status = q.status;
    if (q?.sampleTypeId) where.sampleTypeId = q.sampleTypeId;
    if (q?.season) where.season = q.season;
    if (q?.assignedTo) where.assignedTo = q.assignedTo;
    if (q?.styleCardId) where.styleCardId = q.styleCardId;
    if (q?.search) where.title = { contains: q.search, mode: 'insensitive' };

    const page = parseInt(q?.page || '1');
    const limit = parseInt(q?.limit || '20');
    const [data, total] = await Promise.all([
      this.prisma.sampleCard.findMany({
        where,
        include: {
          sampleType: { select: { id: true, name: true, code: true } },
          styleCard: { select: { id: true, styleNumber: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.sampleCard.count({ where }),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async createSampleCard(dto: any, branchId: string, createdBy: string) {
    const sampleNumber = await this.nextNumber('SC', 'sampleCard', 'sampleNumber');
    const card = await this.prisma.sampleCard.create({
      data: { ...dto, sampleNumber, branchId, createdBy },
      include: {
        sampleType: { select: { id: true, name: true, code: true } },
        styleCard: { select: { id: true, styleNumber: true, title: true } },
      },
    });
    await this.autoCreateDocket('sample_card', card.id, `Docket — ${card.sampleNumber}`, branchId, createdBy);
    return card;
  }

  async getSampleCard(id: string) {
    const r = await this.prisma.sampleCard.findUnique({
      where: { id },
      include: {
        sampleType: true,
        styleCard: { select: { id: true, styleNumber: true, title: true } },
        history: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!r) throw new NotFoundException('SampleCard not found');
    return r;
  }

  async updateSampleCard(id: string, dto: any) {
    await this.getSampleCard(id);
    return this.prisma.sampleCard.update({
      where: { id },
      data: dto,
      include: { sampleType: true, styleCard: { select: { id: true, styleNumber: true, title: true } } },
    });
  }

  async deleteSampleCard(id: string) {
    await this.getSampleCard(id);
    await this.prisma.sampleCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  async updateSampleCardStatus(id: string, status: string, notes: string, changedBy: string) {
    const sc = await this.getSampleCard(id);
    const updated = await this.prisma.sampleCard.update({ where: { id }, data: { status } });
    await this.prisma.sampleCardHistory.create({
      data: { sampleCardId: id, action: 'status_changed', fromStatus: sc.status, toStatus: status, changedBy, notes },
    });
    await this.messaging.publish('nexuscore.plm.sample.status_changed', { sampleCardId: id, status, changedBy });
    await this.prisma.auditLog.create({
      data: { entityType: 'sample_card', entityId: id, action: 'status_changed', changedBy, newValues: { status } },
    });
    return updated;
  }

  async getSampleCardHistory(id: string) {
    return this.prisma.sampleCardHistory.findMany({
      where: { sampleCardId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async duplicateSampleCard(id: string, createdBy: string) {
    const sc = await this.getSampleCard(id);
    const sampleNumber = await this.nextNumber('SC', 'sampleCard', 'sampleNumber');
    return this.prisma.sampleCard.create({
      data: {
        sampleNumber,
        styleCardId: sc.styleCardId,
        sampleTypeId: sc.sampleTypeId,
        title: `${sc.title} (Copy)`,
        description: sc.description,
        season: sc.season,
        year: sc.year,
        fabricTypeId: sc.fabricTypeId,
        colorway: sc.colorway,
        size: sc.size,
        currency: sc.currency,
        branchId: sc.branchId,
        createdBy,
        status: 'draft',
      },
    });
  }

  // "Create Style Card" from a Sample Card — creates a genuinely NEW, independent StyleCard
  // (fresh id, fresh nextNumber()-generated styleNumber — the SAME generator createStyleCard()
  // already uses, never the Sample's own sampleNumber). sampleCard.styleCardId is deliberately
  // never written by this method, so repeated calls always produce another independent new
  // Style Card and the source Sample Card's own fields are provably unchanged afterward.
  //
  // Source is EXCLUSIVELY the Sample Card's OWN columns — confirmed by an exhaustive audit of
  // every Prisma model AND raw legacy table in this database (schema.prisma + a live
  // information_schema search for anything sample-related) that SampleCard has NO bomLines/
  // washCare/expenseLines/measurementChart/marker relations or columns anywhere, on any table.
  // An EARLIER version of this method fell back to reading sample.styleCardId's LINKED
  // StyleCard's own BOM/WashCare/ExpenseLines when present — that was wrong: styleCardId is an
  // existing, preserved field with its own historical/workflow meaning (which pre-existing
  // Style Card this sample happens to reference), but treating its target's data as if it were
  // the Sample's own would silently copy unrelated Style Card data into "the sample's copy" and
  // violates the requested ownership model. Removed; not used as a data source here anymore.
  //
  // Field mapping (only genuine SampleCard-owned columns — nothing invented, nothing borrowed
  // from a linked Style Card):
  //   Sample.title            -> StyleCard.title
  //   Sample.description      -> StyleCard.description
  //   Sample.season           -> StyleCard.season
  //   Sample.year             -> StyleCard.year
  //   Sample.size (1 string)  -> StyleCard.sizes (Json array, best-effort single-element wrap)
  //   Sample.colorway (1 str) -> StyleCard.colorways (Json array, best-effort single-element wrap)
  //   Sample.attachments      -> StyleCard.attachments (same Json shape on both models; a Postgres
  //                              Json column copy is already an independent value, not a shared
  //                              reference, so no separate attachment-ownership model is needed)
  // Categories with NO EXISTING SAMPLE STORAGE anywhere in this database (verified, not
  // assumed) — left unmapped, no schema invented: BOM (Fabric/Trim/Ornament/Process), Marker
  // Length/Width/Weight, Wash & Care, Expenses/Costing, Measurements, Route, Customer,
  // Department, Brand, Master Size, Gender, Category, Access/Special Code, Garment Wash/Dye.
  async createStyleCardFromSample(sampleCardId: string, createdBy: string) {
    const sample = await this.prisma.sampleCard.findUnique({ where: { id: sampleCardId } });
    if (!sample) throw new NotFoundException('SampleCard not found');

    const styleNumber = await this.nextNumber('SC', 'styleCard', 'styleNumber');

    const newStyle = await this.prisma.styleCard.create({
      data: {
        styleNumber,
        title: sample.title,
        description: sample.description ?? undefined,
        season: sample.season ?? undefined,
        year: sample.year ?? undefined,
        sizes: sample.size ? [sample.size] : undefined,
        colorways: sample.colorway ? [{ name: sample.colorway }] : undefined,
        attachments: (sample.attachments as any) ?? undefined,
        branchId: sample.branchId,
        createdBy,
      },
    });

    await this.autoCreateDocket('style_card', newStyle.id, `Docket — ${newStyle.styleNumber}`, sample.branchId, createdBy);
    return this.getStyleCard(newStyle.id);
  }

  // ── Swatch Cards ──────────────────────────────────────────────────────────────
  async listSwatchCards(branchId: string, q?: Record<string, string>) {
    const where: any = { branchId };
    if (q?.status) where.status = q.status;
    if (q?.search) where.colorName = { contains: q.search, mode: 'insensitive' };
    const page = parseInt(q?.page || '1');
    const limit = parseInt(q?.limit || '20');
    const [data, total] = await Promise.all([
      this.prisma.swatchCard.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.swatchCard.count({ where }),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async createSwatchCard(dto: any, branchId: string) {
    const swatchNumber = `SW-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    return this.prisma.swatchCard.create({ data: { ...dto, swatchNumber, branchId } });
  }

  async getSwatchCard(id: string) {
    const r = await this.prisma.swatchCard.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('SwatchCard not found');
    return r;
  }

  async updateSwatchCard(id: string, dto: any) {
    await this.getSwatchCard(id);
    return this.prisma.swatchCard.update({ where: { id }, data: dto });
  }

  async deleteSwatchCard(id: string) {
    await this.getSwatchCard(id);
    await this.prisma.swatchCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  async linkSwatchToProduct(swatchId: string, productCardId: string, isPrimary = false) {
    return this.prisma.productCardSwatch.upsert({
      where: { productCardId_swatchCardId: { productCardId, swatchCardId: swatchId } },
      create: { productCardId, swatchCardId: swatchId, isPrimary },
      update: { isPrimary },
    });
  }

  // ── Product Cards ─────────────────────────────────────────────────────────────
  async listProductCards(branchId: string, q?: Record<string, string>) {
    const where: any = { branchId };
    if (q?.status) where.status = q.status;
    if (q?.styleCardId) where.styleCardId = q.styleCardId;
    if (q?.search) where.title = { contains: q.search, mode: 'insensitive' };
    const page = parseInt(q?.page || '1');
    const limit = parseInt(q?.limit || '20');
    const [data, total] = await Promise.all([
      this.prisma.productCard.findMany({
        where,
        include: { styleCard: { select: { id: true, styleNumber: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productCard.count({ where }),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async createProductCard(dto: any, branchId: string, createdBy: string) {
    const productNumber = await this.nextNumber('PC', 'productCard', 'productNumber');
    const card = await this.prisma.productCard.create({
      data: { ...dto, productNumber, branchId, createdBy },
      include: { styleCard: { select: { id: true, styleNumber: true, title: true } } },
    });
    await this.autoCreateDocket('product_card', card.id, `Docket — ${card.productNumber}`, branchId, createdBy);
    return card;
  }

  async getProductCard(id: string) {
    const r = await this.prisma.productCard.findUnique({
      where: { id },
      include: {
        styleCard: { select: { id: true, styleNumber: true, title: true } },
        swatches: { include: { swatchCard: true } },
        measurements: { include: { measurementDefinition: true } },
      },
    });
    if (!r) throw new NotFoundException('ProductCard not found');
    return r;
  }

  async updateProductCard(id: string, dto: any) {
    await this.getProductCard(id);
    return this.prisma.productCard.update({ where: { id }, data: dto });
  }

  async deleteProductCard(id: string) {
    await this.getProductCard(id);
    await this.prisma.productCard.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  async updateProductCardStatus(id: string, status: string, changedBy: string) {
    await this.getProductCard(id);
    const updated = await this.prisma.productCard.update({ where: { id }, data: { status } });
    await this.messaging.publish('nexuscore.plm.product_card.status_changed', { productCardId: id, status, changedBy });
    return updated;
  }

  async getProductMeasurements(id: string) {
    return this.prisma.productMeasurement.findMany({
      where: { productCardId: id },
      include: { measurementDefinition: true },
    });
  }

  async addProductMeasurement(id: string, dto: any) {
    await this.getProductCard(id);
    const { measurementDefinitionId, size, value } = dto;
    const existing = await this.prisma.productMeasurement.findFirst({ where: { productCardId: id, measurementDefinitionId, size } });
    if (existing) {
      return this.prisma.productMeasurement.update({ where: { id: existing.id }, data: { value: Number(value) } });
    }
    return this.prisma.productMeasurement.create({ data: { productCardId: id, measurementDefinitionId, size, value: Number(value) } });
  }

  async upsertProductMeasurements(id: string, measurements: any[]) {
    await this.getProductCard(id);
    await this.prisma.productMeasurement.deleteMany({ where: { productCardId: id } });
    return this.prisma.productMeasurement.createMany({
      data: measurements.map((m) => ({ ...m, productCardId: id })),
    });
  }

  async getProductSwatches(id: string) {
    return this.prisma.productCardSwatch.findMany({
      where: { productCardId: id },
      include: { swatchCard: true },
    });
  }

  async addProductSwatch(id: string, swatchCardId: string, isPrimary: boolean) {
    return this.prisma.productCardSwatch.upsert({
      where: { productCardId_swatchCardId: { productCardId: id, swatchCardId } },
      create: { productCardId: id, swatchCardId, isPrimary },
      update: { isPrimary },
    });
  }

  async removeProductSwatch(productCardId: string, swatchCardId: string) {
    await this.prisma.productCardSwatch.delete({
      where: { productCardId_swatchCardId: { productCardId, swatchCardId } },
    });
    return { message: 'Swatch removed' };
  }

  async getProductSamples(id: string) {
    return this.prisma.sampleCard.findMany({
      where: { styleCard: { productCards: { some: { id } } } },
      include: { sampleType: { select: { id: true, name: true, code: true } } },
    });
  }

  async duplicateProductCard(id: string, createdBy: string) {
    const pc = await this.getProductCard(id);
    const productNumber = await this.nextNumber('PC', 'productCard', 'productNumber');
    return this.prisma.productCard.create({
      data: {
        productNumber,
        styleCardId: pc.styleCardId,
        title: `${pc.title} (Copy)`,
        category: pc.category,
        subCategory: pc.subCategory,
        gender: pc.gender,
        season: pc.season,
        year: pc.year,
        description: pc.description,
        currency: pc.currency,
        branchId: pc.branchId,
        createdBy,
        status: 'draft',
      },
    });
  }

  private async autoCreateDocket(
    entityType: string,
    entityId: string,
    title: string,
    branchId: string,
    createdBy: string,
    templateCode?: string,
  ) {
    try {
      const template = await (this.prisma as any).docketTemplate.findFirst({
        where: templateCode
          ? { code: templateCode, isActive: true }
          : { entityType, isDefault: true, isActive: true },
        include: { items: { include: { documentTypeCard: true }, orderBy: { sequence: 'asc' } } },
      });

      const year = new Date().getFullYear();
      const last = await (this.prisma as any).docket.findFirst({
        where: { docketNumber: { startsWith: `DCK-${year}-` } },
        orderBy: { docketNumber: 'desc' },
        select: { docketNumber: true },
      });
      const seq = last ? parseInt(last.docketNumber.split('-').pop()!) + 1 : 1;
      const docketNumber = `DCK-${year}-${String(seq).padStart(3, '0')}`;

      const docket = await (this.prisma as any).docket.create({
        data: {
          docketNumber,
          entityType,
          entityId,
          templateId: template?.id ?? null,
          title,
          status: 'incomplete',
          completeness: 0,
          totalItems: 0,
          approvedItems: 0,
          pendingItems: 0,
          missingItems: 0,
          branchId,
          createdBy,
        },
      });

      if (template?.items?.length) {
        for (const item of template.items) {
          await (this.prisma as any).docketItem.create({
            data: {
              docketId: docket.id,
              documentTypeCardId: item.documentTypeCardId,
              title: item.documentTypeCard.name,
              isRequired: item.isRequired,
              sequence: item.sequence,
              status: 'missing',
            },
          });
        }
        const totalItems = template.items.length;
        await (this.prisma as any).docket.update({
          where: { id: docket.id },
          data: { totalItems, missingItems: totalItems },
        });
      }

      await (this.prisma as any).docketAuditLog.create({
        data: { docketId: docket.id, action: 'docket_created', changedBy: createdBy, newValues: { entityType, entityId, auto: true } },
      });
    } catch (err) {
      console.error(`[PLM] Failed to auto-create docket for ${entityType}/${entityId}:`, err);
    }
  }
}
