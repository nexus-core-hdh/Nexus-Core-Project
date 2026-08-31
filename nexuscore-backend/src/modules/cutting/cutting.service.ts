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

@Injectable()
export class CuttingService {
  private readonly logger = new Logger('[NexusCore] CuttingService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
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

  async create(dto: CreateCuttingOrderDto, createdBy: string) {
    const orderNumber = `CUT-${Date.now()}`;
    const order = await this.prisma.cuttingOrder.create({
      data: { ...dto, orderNumber, triggeredBy: dto.triggeredBy || 'manual' },
      include: this.orderInclude,
    });

    await this.createAuditLog(order.id, 'cutting_order', 'created', createdBy, null, order);
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

  async update(id: string, dto: Partial<CreateCuttingOrderDto>, updatedBy: string) {
    const old = await this.findOne(id);
    const order = await this.prisma.cuttingOrder.update({
      where: { id },
      data: dto,
      include: this.orderInclude,
    });
    await this.createAuditLog(id, 'cutting_order', 'updated', updatedBy, old.data, order);
    return { data: order, message: 'Cutting order updated' };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.cuttingOrder.delete({ where: { id } });
    return { message: 'Cutting order deleted' };
  }

  async changeStatus(id: string, status: string, actorId: string) {
    const order = await this.prisma.cuttingOrder.update({
      where: { id },
      data: { status },
      include: this.orderInclude,
    });
    await this.createAuditLog(id, 'cutting_order', `status:${status}`, actorId, null, { status });
    await this.messaging.publish(CuttingEvent.ORDER_STATUS_CHANGED, { orderId: id, status, actorId });
    return { data: order, message: `Status changed to ${status}` };
  }

  async submitApproval(id: string, actorId: string) {
    const order = await this.prisma.cuttingOrder.update({
      where: { id },
      data: { approvalStatus: 'pending', status: 'pending_approval' },
      include: this.orderInclude,
    });
    await this.prisma.approvalHistory.create({
      data: { cuttingOrderId: id, action: 'submitted', actionBy: actorId },
    });
    await this.messaging.publish(CuttingEvent.ORDER_SUBMITTED, { orderId: id, actorId });
    await this.messaging.publish(NotificationEvent.APPROVAL_NEEDED, { orderId: id, orderNumber: order.orderNumber });
    await this.moveBpmTaskToStage(id, 'Pending Approval', actorId, 'Submitted for approval');
    return { data: order, message: 'Submitted for approval' };
  }

  async approve(id: string, actorId: string) {
    const order = await this.prisma.cuttingOrder.update({
      where: { id },
      data: { approvalStatus: 'approved', approvedBy: actorId, approvedAt: new Date(), status: 'approved' },
      include: this.orderInclude,
    });
    await this.prisma.approvalHistory.create({
      data: { cuttingOrderId: id, action: 'approved', actionBy: actorId },
    });
    await this.messaging.publish(CuttingEvent.ORDER_APPROVED, { orderId: id, actorId });
    await this.messaging.publish(NotificationEvent.ORDER_APPROVED, { orderId: id, orderNumber: order.orderNumber });
    await this.moveBpmTaskToStage(id, 'Approved', actorId);
    return { data: order, message: 'Order approved' };
  }

  async reject(id: string, actorId: string, reason: string) {
    const order = await this.prisma.cuttingOrder.update({
      where: { id },
      data: { approvalStatus: 'rejected', rejectionReason: reason, status: 'rejected' },
      include: this.orderInclude,
    });
    await this.prisma.approvalHistory.create({
      data: { cuttingOrderId: id, action: 'rejected', actionBy: actorId, reason },
    });
    await this.messaging.publish(CuttingEvent.ORDER_REJECTED, { orderId: id, actorId, reason });
    await this.messaging.publish(NotificationEvent.ORDER_REJECTED, { orderId: id, reason });
    return { data: order, message: 'Order rejected' };
  }

  async complete(id: string, actorId: string) {
    return this.changeStatus(id, 'completed', actorId);
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
      where: { entityId: id, entityType: 'cutting_order' },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { data: logs };
  }

  // ── Rolls ────────────────────────────────────────────────────────────────────

  async addRoll(orderId: string, dto: AddRollDto) {
    await this.findOne(orderId);
    const roll = await this.prisma.cuttingOrderRoll.create({
      data: { cuttingOrderId: orderId, ...dto },
      include: { fabricRoll: { include: { fabricType: true } } },
    });
    return { data: roll, message: 'Roll added' };
  }

  async getRolls(orderId: string) {
    const rolls = await this.prisma.cuttingOrderRoll.findMany({
      where: { cuttingOrderId: orderId },
      include: { fabricRoll: { include: { fabricType: true } } },
    });
    return { data: rolls };
  }

  async removeRoll(orderId: string, rollId: string) {
    await this.prisma.cuttingOrderRoll.delete({ where: { id: rollId } });
    return { message: 'Roll removed' };
  }

  // ── Lines ────────────────────────────────────────────────────────────────────

  async addLine(orderId: string, dto: AddLineDto) {
    await this.findOne(orderId);
    const line = await this.prisma.cuttingOrderLine.create({
      data: { cuttingOrderId: orderId, ...dto },
    });
    return { data: line, message: 'Line added' };
  }

  async getLines(orderId: string) {
    const lines = await this.prisma.cuttingOrderLine.findMany({
      where: { cuttingOrderId: orderId },
      orderBy: { sequence: 'asc' },
    });
    return { data: lines };
  }

  async removeLine(orderId: string, lineId: string) {
    await this.prisma.cuttingOrderLine.delete({ where: { id: lineId } });
    return { message: 'Line removed' };
  }

  // ── Batches ──────────────────────────────────────────────────────────────────

  async createBatch(orderId: string, dto: CreateBatchDto) {
    await this.findOne(orderId);
    const batch = await this.prisma.cuttingBatch.create({
      data: { cuttingOrderId: orderId, ...dto },
      include: { cutter: { select: { id: true, name: true } } },
    });
    return { data: batch, message: 'Batch created' };
  }

  async getBatches(orderId: string) {
    const batches = await this.prisma.cuttingBatch.findMany({
      where: { cuttingOrderId: orderId },
      include: { cutter: { select: { id: true, name: true } } },
    });
    return { data: batches };
  }

  async startBatch(orderId: string, batchId: string) {
    const batch = await this.prisma.cuttingBatch.update({
      where: { id: batchId },
      data: { status: 'in_progress', startTime: new Date() },
    });
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
  ) {
    const batch = await this.prisma.cuttingBatch.update({
      where: { id: batchId },
      data: { status: 'completed', endTime: new Date(), actualPieces, defectPieces, notes },
    });

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

  async upsertMarkerPlan(orderId: string, dto: UpdateMarkerPlanDto, createdBy?: string) {
    const plan = await this.prisma.markerPlan.upsert({
      where: { cuttingOrderId: orderId },
      create: { cuttingOrderId: orderId, ...dto, createdBy },
      update: dto,
    });
    return { data: plan, message: 'Marker plan saved' };
  }

  // ── Cost ─────────────────────────────────────────────────────────────────────

  async getCost(orderId: string) {
    const cost = await this.prisma.cuttingOrderCost.findUnique({ where: { cuttingOrderId: orderId } });
    return { data: cost };
  }

  async upsertCost(orderId: string, dto: UpdateCostDto) {
    const { fabricCost = 0, laborCost = 0, machineCost = 0, wastageCost = 0, overheadPct = 0 } = dto;
    const subtotal = fabricCost + laborCost + machineCost + wastageCost;
    const totalCost = subtotal * (1 + overheadPct / 100);

    const order = await this.prisma.cuttingOrder.findUnique({
      where: { id: orderId },
      include: { _count: { select: { pieces: true } } },
    });
    const pieceCount = order?._count?.pieces || 1;

    const cost = await this.prisma.cuttingOrderCost.upsert({
      where: { cuttingOrderId: orderId },
      create: { cuttingOrderId: orderId, ...dto, totalCost, costPerPiece: totalCost / pieceCount },
      update: { ...dto, totalCost, costPerPiece: totalCost / pieceCount },
    });
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

  async addDocument(orderId: string, doc: { fileName: string; fileType: string; fileUrl: string; fileSize?: number; description?: string }, uploadedBy?: string) {
    const document = await this.prisma.cuttingDocument.create({
      data: { cuttingOrderId: orderId, ...doc, uploadedBy },
    });
    return { data: document, message: 'Document added' };
  }

  async removeDocument(orderId: string, docId: string) {
    await this.prisma.cuttingDocument.delete({ where: { id: docId } });
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

  private async createAuditLog(
    entityId: string,
    entityType: string,
    action: string,
    changedBy: string,
    oldValues: any,
    newValues: any,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: { entityId, entityType, action, changedBy, oldValues, newValues },
      });
    } catch (e) {
      this.logger.warn(`Audit log failed: ${(e as Error).message}`);
    }
  }
}
