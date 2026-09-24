import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../../messaging/messaging.service';
import { CuttingEvent } from '../../messaging/events/cutting.events';
import { BpmEvent } from '../../messaging/events/bpm.events';
import { NotificationEvent } from '../../messaging/events/notification.events';
import { CreateCuttingOrderDto } from './dto/create-cutting-order.dto';
import { AddRollDto } from './dto/add-roll.dto';
import { AddLineDto } from './dto/add-line.dto';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateMarkerPlanDto } from './dto/update-marker-plan.dto';
import { UpdateCostDto } from './dto/update-cost.dto';
import { AuditService, AUDIT_ACTIONS, hasRealChanges, enrichDisplayRefs, FkResolver } from '../audit/audit.service';

@Injectable()
export class CuttingService {
  private readonly logger = new Logger('[NexusCore] CuttingService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
  ) {}

  private orderInclude = {
    branch: { select: { id: true, name: true } },
    rolls: { include: { fabricRoll: { include: { fabricType: true } } } },
    lines: true,
    batches: true,
    markerPlan: true,
    cost: true,
    _count: { select: { pieces: true, documents: true, approvalHistory: true } },
  };

  // ── Orders ───────────────────────────────────────────────────────────────────

  async create(dto: CreateCuttingOrderDto, createdBy: string, companyId?: string) {
    const orderNumber = `CUT-${Date.now()}`;
    const order = await this.prisma.cuttingOrder.create({
      data: { ...dto, orderNumber, triggeredBy: dto.triggeredBy || 'manual' },
      include: this.orderInclude,
    });

    await this.recordOrderEvent({ actorId: createdBy, companyId, action: AUDIT_ACTIONS.CREATE, order, after: order });
    await this.messaging.publish(CuttingEvent.ORDER_CREATED, { orderId: order.id, orderNumber });

    // Auto-create BPM task in "Draft" stage
    await this.autoCreateBpmTask(order.id, orderNumber, createdBy);

    return { data: order, message: 'Cutting order created' };
  }

  private async autoCreateBpmTask(orderId: string, orderNumber: string, createdBy: string) {
    try {
      const process = await this.prisma.bpmProcess.findFirst({
        where: { module: 'cutting', isActive: true },
        include: { stages: { orderBy: { sequence: 'asc' } } },
      });
      if (!process || process.stages.length === 0) return;

      const draftStage = process.stages[0];
      await this.prisma.bpmTask.create({
        data: {
          processId: process.id,
          stageId: draftStage.id,
          entityType: 'cutting_order',
          entityId: orderId,
          title: `Cutting Order ${orderNumber}`,
          priority: 'medium',
          createdBy,
        },
      });
      await this.messaging.publish(BpmEvent.TASK_CREATED, { entityId: orderId, entityType: 'cutting_order' });
    } catch (e) {
      this.logger.warn(`BPM auto-task failed for order ${orderId}: ${(e as Error).message}`);
    }
  }

  async findAll(branchId?: string, status?: string, page?: number, limit?: number) {
    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (status) where.status = status;

    // `page`/`limit` can arrive as NaN (not just undefined) once they pass through the
    // global ValidationPipe's implicit conversion when the query param is absent, which
    // silently defeats the plain JS default-parameter fallback below — so they're
    // normalized explicitly instead of relying on `page = 1, limit = 20` defaults.
    const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
    const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 20;

    const [orders, total] = await Promise.all([
      this.prisma.cuttingOrder.findMany({
        where,
        include: this.orderInclude,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.cuttingOrder.count({ where }),
    ]);

    return { data: orders, meta: { total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) } };
  }

  async findOne(id: string) {
    const order = await this.prisma.cuttingOrder.findUnique({
      where: { id },
      include: {
        ...this.orderInclude,
        pieces: true,
        approvalHistory: true,
        documents: true,
      },
    });
    if (!order) throw new NotFoundException('Cutting order not found');

    // Fetch BPM tasks separately (polymorphic — no direct FK)
    const bpmTasks = await this.prisma.bpmTask.findMany({
      where: { entityType: 'cutting_order', entityId: id },
      include: { stage: true },
    });

    return { data: { ...order, bpmTasks } };
  }

  async update(id: string, dto: Partial<CreateCuttingOrderDto>, updatedBy: string, companyId?: string) {
    const old = await this.findOne(id);
    const order = await this.prisma.cuttingOrder.update({
      where: { id },
      data: dto,
      include: this.orderInclude,
    });
    await this.recordOrderEvent({ actorId: updatedBy, companyId, action: AUDIT_ACTIONS.UPDATE, order, before: old.data, after: order });
    return { data: order, message: 'Cutting order updated' };
  }

  async remove(id: string, deletedBy: string, companyId?: string) {
    const before = await this.findOne(id);
    await this.prisma.cuttingOrder.delete({ where: { id } });
    await this.recordOrderEvent({ actorId: deletedBy, companyId, action: AUDIT_ACTIONS.DELETE, order: before.data, before: before.data });
    return { message: 'Cutting order deleted' };
  }

  async changeStatus(id: string, status: string, actorId: string, companyId?: string) {
    const before = await this.prisma.cuttingOrder.findUnique({ where: { id } });
    const order = await this.prisma.cuttingOrder.update({
      where: { id },
      data: { status },
      include: this.orderInclude,
    });
    await this.recordOrderEvent({ actorId, companyId, action: `status:${status}`, order, before, after: order });
    await this.messaging.publish(CuttingEvent.ORDER_STATUS_CHANGED, { orderId: id, status, actorId });
    return { data: order, message: `Status changed to ${status}` };
  }

  async submitApproval(id: string, actorId: string, companyId?: string) {
    const before = await this.prisma.cuttingOrder.findUnique({ where: { id } });
    const order = await this.prisma.cuttingOrder.update({
      where: { id },
      data: { approvalStatus: 'pending', status: 'pending_approval' },
      include: this.orderInclude,
    });
    await this.prisma.approvalHistory.create({
      data: { cuttingOrderId: id, action: 'submitted', actionBy: actorId },
    });
    await this.recordOrderEvent({ actorId, companyId, action: 'submit', order, before, after: order });
    await this.messaging.publish(CuttingEvent.ORDER_SUBMITTED, { orderId: id, actorId });
    await this.messaging.publish(NotificationEvent.APPROVAL_NEEDED, { orderId: id, orderNumber: order.orderNumber });
    await this.moveBpmTaskToStage(id, 'Pending Approval', actorId, 'Submitted for approval');
    return { data: order, message: 'Submitted for approval' };
  }

  async approve(id: string, actorId: string, companyId?: string) {
    const before = await this.prisma.cuttingOrder.findUnique({ where: { id } });
    const order = await this.prisma.cuttingOrder.update({
      where: { id },
      data: { approvalStatus: 'approved', approvedBy: actorId, approvedAt: new Date(), status: 'approved' },
      include: this.orderInclude,
    });
    await this.prisma.approvalHistory.create({
      data: { cuttingOrderId: id, action: 'approved', actionBy: actorId },
    });
    await this.recordOrderEvent({ actorId, companyId, action: 'approved', order, before, after: order });
    await this.messaging.publish(CuttingEvent.ORDER_APPROVED, { orderId: id, actorId });
    await this.messaging.publish(NotificationEvent.ORDER_APPROVED, { orderId: id, orderNumber: order.orderNumber });
    await this.moveBpmTaskToStage(id, 'Approved', actorId);
    return { data: order, message: 'Order approved' };
  }

  async reject(id: string, actorId: string, reason: string, companyId?: string) {
    const before = await this.prisma.cuttingOrder.findUnique({ where: { id } });
    const order = await this.prisma.cuttingOrder.update({
      where: { id },
      data: { approvalStatus: 'rejected', rejectionReason: reason, status: 'rejected' },
      include: this.orderInclude,
    });
    await this.prisma.approvalHistory.create({
      data: { cuttingOrderId: id, action: 'rejected', actionBy: actorId, reason },
    });
    await this.recordOrderEvent({ actorId, companyId, action: 'rejected', order, before, after: order });
    await this.messaging.publish(CuttingEvent.ORDER_REJECTED, { orderId: id, actorId, reason });
    await this.messaging.publish(NotificationEvent.ORDER_REJECTED, { orderId: id, reason });
    return { data: order, message: 'Order rejected' };
  }

  async complete(id: string, actorId: string, companyId?: string) {
    return this.changeStatus(id, 'completed', actorId, companyId);
  }

  async getQr(id: string) {
    const order = await this.prisma.cuttingOrder.findUnique({
      where: { id },
      select: { id: true, orderNumber: true, status: true },
    });
    if (!order) throw new NotFoundException('Cutting order not found');
    return { data: { ...order, qrCode: `NC-ORDER-${order.orderNumber}` } };
  }

  async getAuditTrail(id: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          // 'cutting_order' = rows written by the old direct-write path (kept readable, never rewritten)
          { entityId: id, entityType: { in: ['CuttingOrder', 'cutting_order'] } },
          { parentEntityType: 'CuttingOrder', parentEntityId: id },
        ],
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { data: logs };
  }

  // ── Rolls ────────────────────────────────────────────────────────────────────

  async addRoll(orderId: string, dto: AddRollDto, actorId?: string, companyId?: string) {
    await this.findOne(orderId);
    const roll = await this.prisma.cuttingOrderRoll.create({
      data: { cuttingOrderId: orderId, ...dto },
      include: { fabricRoll: { include: { fabricType: true } } },
    });
    await this.recordChild({ orderId, entityType: 'CuttingOrderRoll', entityId: roll.id, action: AUDIT_ACTIONS.CREATE, actorId, companyId, section: 'Roll (CuttingOrderRoll)', after: roll });
    return { data: roll, message: 'Roll added' };
  }

  async getRolls(orderId: string) {
    const rolls = await this.prisma.cuttingOrderRoll.findMany({
      where: { cuttingOrderId: orderId },
      include: { fabricRoll: { include: { fabricType: true } } },
    });
    return { data: rolls };
  }

  async removeRoll(orderId: string, rollId: string, actorId?: string, companyId?: string) {
    const before = await this.prisma.cuttingOrderRoll.findUnique({ where: { id: rollId }, include: { fabricRoll: true } });
    await this.prisma.cuttingOrderRoll.delete({ where: { id: rollId } });
    if (before) await this.recordChild({ orderId, entityType: 'CuttingOrderRoll', entityId: rollId, action: AUDIT_ACTIONS.DELETE, actorId, companyId, section: 'Roll (CuttingOrderRoll)', before });
    return { message: 'Roll removed' };
  }

  // ── Lines ────────────────────────────────────────────────────────────────────

  async addLine(orderId: string, dto: AddLineDto, actorId?: string, companyId?: string) {
    await this.findOne(orderId);
    const line = await this.prisma.cuttingOrderLine.create({
      data: { cuttingOrderId: orderId, ...dto },
    });
    await this.recordChild({ orderId, entityType: 'CuttingOrderLine', entityId: line.id, action: AUDIT_ACTIONS.CREATE, actorId, companyId, section: 'Line (CuttingOrderLine)', after: line });
    return { data: line, message: 'Line added' };
  }

  async getLines(orderId: string) {
    const lines = await this.prisma.cuttingOrderLine.findMany({
      where: { cuttingOrderId: orderId },
      orderBy: { sequence: 'asc' },
    });
    return { data: lines };
  }

  async removeLine(orderId: string, lineId: string, actorId?: string, companyId?: string) {
    const before = await this.prisma.cuttingOrderLine.findUnique({ where: { id: lineId } });
    await this.prisma.cuttingOrderLine.delete({ where: { id: lineId } });
    if (before) await this.recordChild({ orderId, entityType: 'CuttingOrderLine', entityId: lineId, action: AUDIT_ACTIONS.DELETE, actorId, companyId, section: 'Line (CuttingOrderLine)', before });
    return { message: 'Line removed' };
  }

  // ── Batches ──────────────────────────────────────────────────────────────────

  async createBatch(orderId: string, dto: CreateBatchDto, actorId?: string, companyId?: string) {
    await this.findOne(orderId);
    const batch = await this.prisma.cuttingBatch.create({
      data: { cuttingOrderId: orderId, ...dto },
      include: { cutter: { select: { id: true, name: true } } },
    });
    await this.recordChild({ orderId, entityType: 'CuttingBatch', entityId: batch.id, action: AUDIT_ACTIONS.CREATE, actorId, companyId, section: 'Batch (CuttingBatch)', after: batch });
    return { data: batch, message: 'Batch created' };
  }

  async getBatches(orderId: string) {
    const batches = await this.prisma.cuttingBatch.findMany({
      where: { cuttingOrderId: orderId },
      include: { cutter: { select: { id: true, name: true } } },
    });
    return { data: batches };
  }

  async startBatch(orderId: string, batchId: string, actorId?: string, companyId?: string) {
    const before = await this.prisma.cuttingBatch.findUnique({ where: { id: batchId } });
    const batch = await this.prisma.cuttingBatch.update({
      where: { id: batchId },
      data: { status: 'in_progress', startTime: new Date() },
    });
    await this.recordChild({ orderId, entityType: 'CuttingBatch', entityId: batchId, action: 'started', actorId, companyId, section: 'Batch (CuttingBatch)', before, after: batch });
    await this.messaging.publish(CuttingEvent.BATCH_STARTED, { orderId, batchId });
    await this.moveBpmTaskToStage(orderId, 'In Progress', batch.cutterId, 'Batch started');
    return { data: batch, message: 'Batch started' };
  }

  async completeBatch(
    orderId: string,
    batchId: string,
    actualPieces: number,
    defectPieces: number,
    notes?: string,
    actorId?: string,
    companyId?: string,
  ) {
    const before = await this.prisma.cuttingBatch.findUnique({ where: { id: batchId } });
    const batch = await this.prisma.cuttingBatch.update({
      where: { id: batchId },
      data: { status: 'completed', endTime: new Date(), actualPieces, defectPieces, notes },
    });
    await this.recordChild({ orderId, entityType: 'CuttingBatch', entityId: batchId, action: 'completed', actorId, companyId, section: 'Batch (CuttingBatch)', before, after: batch });

    if (defectPieces > 0) {
      const pct = (defectPieces / actualPieces) * 100;
      if (pct > 10) {
        await this.messaging.publish(NotificationEvent.DEFECT_THRESHOLD, { orderId, batchId, defectPct: pct });
      }
    }

    await this.messaging.publish(CuttingEvent.BATCH_COMPLETED, { orderId, batchId });
    return { data: batch, message: 'Batch completed' };
  }

  // ── Marker Plan ──────────────────────────────────────────────────────────────

  async getMarkerPlan(orderId: string) {
    const plan = await this.prisma.markerPlan.findUnique({ where: { cuttingOrderId: orderId } });
    return { data: plan };
  }

  async upsertMarkerPlan(orderId: string, dto: UpdateMarkerPlanDto, createdBy?: string, companyId?: string) {
    const before = await this.prisma.markerPlan.findUnique({ where: { cuttingOrderId: orderId } });
    const plan = await this.prisma.markerPlan.upsert({
      where: { cuttingOrderId: orderId },
      create: { cuttingOrderId: orderId, ...dto, createdBy },
      update: dto,
    });
    await this.recordChild({ orderId, entityType: 'MarkerPlan', entityId: plan.id, action: before ? AUDIT_ACTIONS.UPDATE : AUDIT_ACTIONS.CREATE, actorId: createdBy, companyId, section: 'Marker Plan (MarkerPlan)', before, after: plan });
    return { data: plan, message: 'Marker plan saved' };
  }

  // ── Cost ─────────────────────────────────────────────────────────────────────

  async getCost(orderId: string) {
    const cost = await this.prisma.cuttingOrderCost.findUnique({ where: { cuttingOrderId: orderId } });
    return { data: cost };
  }

  async upsertCost(orderId: string, dto: UpdateCostDto, actorId?: string, companyId?: string) {
    const { fabricCost = 0, laborCost = 0, machineCost = 0, wastageCost = 0, overheadPct = 0 } = dto;
    const subtotal = fabricCost + laborCost + machineCost + wastageCost;
    const totalCost = subtotal * (1 + overheadPct / 100);

    const order = await this.prisma.cuttingOrder.findUnique({
      where: { id: orderId },
      include: { _count: { select: { pieces: true } } },
    });
    const pieceCount = order?._count?.pieces || 1;

    const beforeCost = await this.prisma.cuttingOrderCost.findUnique({ where: { cuttingOrderId: orderId } });
    const cost = await this.prisma.cuttingOrderCost.upsert({
      where: { cuttingOrderId: orderId },
      create: { cuttingOrderId: orderId, ...dto, totalCost, costPerPiece: totalCost / pieceCount },
      update: { ...dto, totalCost, costPerPiece: totalCost / pieceCount },
    });
    await this.recordChild({ orderId, entityType: 'CuttingOrderCost', entityId: cost.id, action: beforeCost ? AUDIT_ACTIONS.UPDATE : AUDIT_ACTIONS.CREATE, actorId, companyId, section: 'Cost (CuttingOrderCost)', before: beforeCost, after: cost });
    return { data: cost, message: 'Cost updated' };
  }

  // ── Documents ────────────────────────────────────────────────────────────────

  async getDocuments(orderId: string) {
    const docs = await this.prisma.cuttingDocument.findMany({
      where: { cuttingOrderId: orderId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: docs };
  }

  async addDocument(orderId: string, doc: { fileName: string; fileType: string; fileUrl: string; fileSize?: number; description?: string }, uploadedBy?: string, companyId?: string) {
    const document = await this.prisma.cuttingDocument.create({
      data: { cuttingOrderId: orderId, ...doc, uploadedBy },
    });
    await this.recordChild({ orderId, entityType: 'CuttingDocument', entityId: document.id, action: AUDIT_ACTIONS.CREATE, actorId: uploadedBy, companyId, section: 'Document (CuttingDocument)', after: document });
    return { data: document, message: 'Document added' };
  }

  async removeDocument(orderId: string, docId: string, actorId?: string, companyId?: string) {
    const before = await this.prisma.cuttingDocument.findUnique({ where: { id: docId } });
    await this.prisma.cuttingDocument.delete({ where: { id: docId } });
    if (before) await this.recordChild({ orderId, entityType: 'CuttingDocument', entityId: docId, action: AUDIT_ACTIONS.DELETE, actorId, companyId, section: 'Document (CuttingDocument)', before });
    return { message: 'Document removed' };
  }

  // ── Approval History ─────────────────────────────────────────────────────────

  async getApprovalHistory(orderId: string) {
    const history = await this.prisma.approvalHistory.findMany({
      where: { cuttingOrderId: orderId },
      orderBy: { createdAt: 'asc' },
    });
    return { data: history };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async moveBpmTaskToStage(
    orderId: string,
    stageName: string,
    changedBy: string,
    comment?: string,
  ) {
    try {
      const task = await this.prisma.bpmTask.findFirst({
        where: { entityType: 'cutting_order', entityId: orderId },
        include: { process: { include: { stages: true } } },
      });
      if (!task) return;

      const targetStage = task.process.stages.find((s) => s.name === stageName);
      if (!targetStage || task.stageId === targetStage.id) return;

      await this.prisma.bpmTask.update({
        where: { id: task.id },
        data: { stageId: targetStage.id },
      });
      await this.prisma.bpmTaskHistory.create({
        data: {
          taskId: task.id,
          fromStageId: task.stageId,
          toStageId: targetStage.id,
          changedBy,
          comment,
        },
      });
      await this.messaging.publish(BpmEvent.TASK_STAGE_MOVED, {
        taskId: task.id,
        toStageId: targetStage.id,
        assignedTo: task.assignedTo,
      });
    } catch (e) {
      this.logger.warn(`BPM stage move failed for order ${orderId}: ${(e as Error).message}`);
    }
  }

  // ── Audit (central AuditService) ─────────────────────────────────────────────────────────────
  // Every event goes through AuditService.recordSafe (the old direct prisma.auditLog.create()
  // bypass is gone): company-scoped, Date/Decimal-safe, Module/Menu resolved from the real
  // MenuItem tree. No MenuItem exists for a Cutting Order screen (confirmed live), so screenKey is
  // left undefined and Module/Menu stay empty rather than being fabricated (metadata limitation).
  // Snapshots are the persisted scalar row (relations stripped); FK ids that have a real display
  // (Branch, User, Fabric Roll) carry { id, code, name } captured at write time. ApprovalHistory /
  // BpmTaskHistory are separate, purpose-built tables feeding Cutting's own approval/Kanban UI and
  // are intentionally left as they are — the approval action is ALSO recorded here.
  private displayResolvers(): Record<string, FkResolver> {
    const user: FkResolver = async (id) => {
      const u = await this.prisma.user.findUnique({ where: { id: String(id) }, select: { name: true, email: true } });
      return u ? { code: u.email ?? null, name: u.name ?? null } : null;
    };
    return {
      branchId: async (id) => {
        const b = await this.prisma.branch.findUnique({ where: { id: String(id) }, select: { name: true } });
        return b ? { code: null, name: b.name } : null;
      },
      approvedBy: user,
      cutBy: user,
      cutterId: user,
      fabricRollId: async (id) => {
        const r = await this.prisma.fabricRoll.findUnique({ where: { id: String(id) }, select: { rollNumber: true, color: true } });
        return r ? { code: r.rollNumber, name: r.color ?? null } : null;
      },
    };
  }

  // Scalar columns only (drops nested relation objects/arrays such as rolls/lines/branch/_count).
  private scalars(row: any): Record<string, any> | null {
    if (!row) return null;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      const isDecimal = v && typeof v === 'object' && typeof (v as any).toNumber === 'function';
      if (v === null || typeof v !== 'object' || v instanceof Date || isDecimal) out[k] = v;
    }
    return out;
  }

  private async snapshot(row: any) {
    const s = this.scalars(row);
    return s ? enrichDisplayRefs(s, this.displayResolvers()) : null;
  }

  private async recordOrderEvent(p: { actorId?: string; companyId?: string; action: string; order: any; before?: any; after?: any }) {
    if (!p.actorId || !p.companyId || !p.order?.id) return;
    const [before, after] = await Promise.all([this.snapshot(p.before), this.snapshot(p.after)]);
    // A pure update/workflow event with nothing actually changed is not an event.
    if (before && after && !hasRealChanges(before, after, ['updatedAt'])) return;
    const section = 'Cutting Order (CuttingOrder)';
    await this.audit.recordSafe({
      userId: p.actorId, companyId: p.companyId,
      entityType: 'CuttingOrder', entityId: p.order.id, action: p.action, documentNo: p.order.orderNumber,
      ...(before ? { before: { [section]: before } } : {}), ...(after ? { after: { [section]: after } } : {}),
    });
  }

  private async recordChild(p: {
    orderId: string; entityType: string; entityId: string; action: string; actorId?: string; companyId?: string;
    section: string; before?: any; after?: any;
  }) {
    if (!p.actorId || !p.companyId) return;
    const [before, after] = await Promise.all([this.snapshot(p.before), this.snapshot(p.after)]);
    if (before && after && !hasRealChanges(before, after, ['updatedAt'])) return;
    const order = await this.prisma.cuttingOrder.findUnique({ where: { id: p.orderId }, select: { orderNumber: true } });
    await this.audit.recordSafe({
      userId: p.actorId, companyId: p.companyId,
      entityType: p.entityType, entityId: p.entityId, action: p.action, documentNo: order?.orderNumber,
      parentEntityType: 'CuttingOrder', parentEntityId: p.orderId, parentDocumentNo: order?.orderNumber,
      ...(before ? { before: { [p.section]: before } } : {}), ...(after ? { after: { [p.section]: after } } : {}),
    });
  }
}
