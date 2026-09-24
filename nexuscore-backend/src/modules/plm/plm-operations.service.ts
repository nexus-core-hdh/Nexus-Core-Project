import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../../messaging/messaging.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';

@Injectable()
export class PlmOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
  ) {}

  private async nextNumber(prefix: string, model: string, field: string): Promise<string> {
    const year = new Date().getFullYear();
    const last = await (this.prisma as any)[model].findFirst({
      where: { [field]: { startsWith: `${prefix}-${year}-` } },
      orderBy: { [field]: 'desc' },
      select: { [field]: true },
    });
    const seq = last ? parseInt(last[field].split('-').pop()!) + 1 : 1;
    return `${prefix}-${year}-${String(seq).padStart(3, '0')}`;
  }

  // ── PLM Orders ────────────────────────────────────────────────────────────────
  async listOrders(branchId: string, q?: Record<string, string>) {
    const where: any = { branchId };
    if (q?.status) where.status = q.status;
    if (q?.buyerName) where.buyerName = { contains: q.buyerName, mode: 'insensitive' };
    if (q?.styleCardId) where.styleCardId = q.styleCardId;
    if (q?.dateFrom || q?.dateTo) {
      where.createdAt = {};
      if (q.dateFrom) where.createdAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.createdAt.lte = new Date(q.dateTo);
    }
    const page = parseInt(q?.page || '1');
    const limit = parseInt(q?.limit || '20');
    const [data, total] = await Promise.all([
      this.prisma.plmOrder.findMany({
        where,
        include: {
          styleCard: { select: { id: true, styleNumber: true, title: true } },
          _count: { select: { tasks: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.plmOrder.count({ where }),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async createOrder(dto: any, branchId: string, createdBy: string) {
    const orderNumber = await this.nextNumber('PLM-ORD', 'plmOrder', 'orderNumber');
    const order = await this.prisma.plmOrder.create({
      data: { ...dto, orderNumber, branchId, createdBy },
      include: { styleCard: { select: { id: true, styleNumber: true, title: true } } },
    });
    const templateCode = dto.orderType === 'export' ? 'ORDER_EXPORT' : 'ORDER_LOCAL';
    await this.autoCreateDocket('plm_order', order.id, `Docket — ${order.orderNumber}`, branchId, createdBy, templateCode);
    return order;
  }

  async getOrder(id: string) {
    const r = await this.prisma.plmOrder.findUnique({
      where: { id },
      include: {
        styleCard: { select: { id: true, styleNumber: true, title: true } },
        tasks: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!r) throw new NotFoundException('PLM Order not found');
    return r;
  }

  async updateOrder(id: string, dto: any) {
    await this.getOrder(id);
    return this.prisma.plmOrder.update({ where: { id }, data: dto });
  }

  async deleteOrder(id: string) {
    await this.getOrder(id);
    await this.prisma.plmOrder.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  async updateOrderStatus(id: string, status: string, notes: string, changedBy: string, companyId?: string) {
    const order = await this.getOrder(id);
    const updated = await this.prisma.plmOrder.update({ where: { id }, data: { status } });
    await this.messaging.publish('nexuscore.plm.order.status_changed', { orderId: id, status, changedBy });
    if (companyId) {
      await this.audit.recordSafe({
        userId: changedBy,
        companyId,
        screenKey: '/dashboard/plm/orders',
        entityType: 'PlmOrder',
        entityId: id,
        action: AUDIT_ACTIONS.UPDATE,
        documentNo: order.orderNumber,
        before: { status: order.status },
        after: { status, notes },
      });
    }
    await this.messaging.publish('nexuscore.notifications', {
      type: 'order_updated',
      title: 'Order Status Changed',
      message: `Order ${order.orderNumber} moved to ${status}`,
      referenceId: id,
      referenceType: 'plm_order',
      userId: order.createdBy,
    });
    return updated;
  }

  async getOrderTasks(orderId: string) {
    return this.prisma.plmTask.findMany({ where: { plmOrderId: orderId }, orderBy: { createdAt: 'asc' } });
  }

  async createOrderTask(orderId: string, dto: any, branchId: string, createdBy: string) {
    const order = await this.getOrder(orderId);
    const taskNumber = await this.nextNumber('TSK', 'plmTask', 'taskNumber');
    return this.prisma.plmTask.create({
      data: { ...dto, taskNumber, plmOrderId: orderId, branchId, createdBy },
    });
  }

  // ── PLM Tasks ─────────────────────────────────────────────────────────────────
  async listTasks(branchId: string, q?: Record<string, string>) {
    const where: any = { branchId };
    if (q?.status) where.status = q.status;
    if (q?.taskType) where.taskType = q.taskType;
    if (q?.departmentId) where.departmentId = q.departmentId;
    if (q?.assignedTo) where.assignedTo = q.assignedTo;
    if (q?.plmOrderId) where.plmOrderId = q.plmOrderId;
    if (q?.priority) where.priority = q.priority;
    if (q?.isOverdue === 'true') {
      where.plannedEnd = { lt: new Date() };
      where.status = { notIn: ['completed', 'cancelled'] };
    }
    if (q?.dateFrom || q?.dateTo) {
      where.plannedEnd = {};
      if (q.dateFrom) where.plannedEnd.gte = new Date(q.dateFrom);
      if (q.dateTo) where.plannedEnd.lte = new Date(q.dateTo);
    }
    const page = parseInt(q?.page || '1');
    const limit = parseInt(q?.limit || '20');
    const [data, total] = await Promise.all([
      this.prisma.plmTask.findMany({
        where,
        include: {
          plmOrder: { select: { id: true, orderNumber: true } },
          styleCard: { select: { id: true, styleNumber: true, title: true } },
        },
        orderBy: [{ priority: 'desc' }, { plannedEnd: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.plmTask.count({ where }),
    ]);
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async createTask(dto: any, branchId: string, createdBy: string) {
    const taskNumber = await this.nextNumber('TSK', 'plmTask', 'taskNumber');
    return this.prisma.plmTask.create({ data: { ...dto, taskNumber, branchId, createdBy } });
  }

  async getTask(id: string) {
    const r = await this.prisma.plmTask.findUnique({
      where: { id },
      include: {
        plmOrder: { select: { id: true, orderNumber: true } },
        styleCard: { select: { id: true, styleNumber: true, title: true } },
      },
    });
    if (!r) throw new NotFoundException('PLM Task not found');
    return r;
  }

  async updateTask(id: string, dto: any) {
    await this.getTask(id);
    return this.prisma.plmTask.update({ where: { id }, data: dto });
  }

  async deleteTask(id: string) {
    await this.getTask(id);
    await this.prisma.plmTask.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  async updateTaskStatus(id: string, status: string, actualHrs: number | undefined, notes: string, changedBy: string) {
    const task = await this.getTask(id);
    const data: any = { status };
    if (status === 'in_progress' && !task.actualStart) data.actualStart = new Date();
    if (status === 'completed') {
      data.actualEnd = new Date();
      if (actualHrs !== undefined) data.actualHrs = actualHrs;
    }
    const isOverdue =
      task.plannedEnd &&
      new Date() > new Date(task.plannedEnd) &&
      !['completed', 'cancelled'].includes(status);
    if (isOverdue) {
      const days = Math.floor((Date.now() - new Date(task.plannedEnd!).getTime()) / 86400000);
      await this.messaging.publish('nexuscore.notifications', {
        type: 'plm_task_delayed',
        title: 'Task Delayed',
        message: `Task "${task.title}" is ${days} day(s) overdue`,
        referenceId: id,
        referenceType: 'plm_task',
        userId: task.assignedTo || task.createdBy,
      });
    }
    const updated = await this.prisma.plmTask.update({ where: { id }, data });
    await this.messaging.publish('nexuscore.plm.task.updated', { taskId: id, status, changedBy });
    return updated;
  }

  async getMyTasks(userId: string, branchId: string) {
    return this.prisma.plmTask.findMany({
      where: { assignedTo: userId, branchId, status: { notIn: ['completed', 'cancelled'] } },
      orderBy: [{ priority: 'desc' }, { plannedEnd: 'asc' }],
    });
  }

  async getOverdueTasks(branchId: string) {
    return this.prisma.plmTask.findMany({
      where: {
        branchId,
        plannedEnd: { lt: new Date() },
        status: { notIn: ['completed', 'cancelled'] },
      },
      orderBy: { plannedEnd: 'asc' },
    });
  }

  // ── Critical Path ─────────────────────────────────────────────────────────────
  async listCriticalPaths(branchId: string, q: any = {}) {
    const { page = 1, limit = 50 } = q;
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.criticalPath.findMany({
        skip, take: Number(limit),
        include: { styleCard: { select: { id: true, title: true, styleNumber: true } }, tasks: { select: { id: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.criticalPath.count(),
    ]);
    return { data, meta: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) } };
  }

  async getCriticalPath(styleCardId: string) {
    const cp = await this.prisma.criticalPath.findUnique({
      where: { styleCardId },
      include: {
        tasks: {
          include: { processCard: { select: { id: true, name: true } } },
          orderBy: { sequence: 'asc' },
        },
      },
    });
    if (!cp) throw new NotFoundException('Critical path not found for this style card');
    return cp;
  }

  async createCriticalPath(styleCardId: string, dto: any) {
    return this.prisma.criticalPath.create({
      data: {
        ...dto,
        styleCardId,
        tasks: dto.tasks ? { create: dto.tasks } : undefined,
      },
      include: { tasks: { orderBy: { sequence: 'asc' } } },
    });
  }

  async addCriticalPathTask(cpId: string, dto: any) {
    const lastTask = await this.prisma.criticalPathTask.findFirst({ where: { criticalPathId: cpId }, orderBy: { sequence: 'desc' } });
    const sequence = (lastTask?.sequence ?? 0) + 1;
    return this.prisma.criticalPathTask.create({
      data: { ...dto, criticalPathId: cpId, sequence, plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : undefined, plannedEnd: dto.plannedEnd ? new Date(dto.plannedEnd) : undefined },
    });
  }

  async updateCriticalPathTask(cpId: string, taskId: string, dto: any) {
    return this.prisma.criticalPathTask.update({ where: { id: taskId }, data: dto });
  }

  async updateCriticalPathTaskStatus(cpId: string, taskId: string, status: string) {
    const task = await this.prisma.criticalPathTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('CriticalPathTask not found');
    const data: any = { status };
    if (status === 'in_progress' && !task.actualStart) data.actualStart = new Date();
    if (status === 'completed') data.actualEnd = new Date();
    if (task.plannedEnd && new Date() > new Date(task.plannedEnd)) {
      data.delayDays = Math.floor((Date.now() - new Date(task.plannedEnd).getTime()) / 86400000);
    }
    return this.prisma.criticalPathTask.update({ where: { id: taskId }, data });
  }

  async deleteCriticalPathTask(cpId: string, taskId: string) {
    await this.prisma.criticalPathTask.delete({ where: { id: taskId } });
    return { message: 'Task deleted' };
  }

  async getGanttData(cpId: string) {
    const cp = await this.prisma.criticalPath.findUnique({
      where: { id: cpId },
      include: { tasks: { orderBy: { sequence: 'asc' } } },
    });
    if (!cp) throw new NotFoundException('Critical path not found');

    const start = new Date(cp.startDate);
    const end = new Date(cp.endDate);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);

    const gantt = cp.tasks.map((t) => {
      const taskStart = new Date(t.plannedStart);
      const taskEnd = new Date(t.plannedEnd);
      const offsetDays = Math.floor((taskStart.getTime() - start.getTime()) / 86400000);
      const durationDays = Math.ceil((taskEnd.getTime() - taskStart.getTime()) / 86400000);
      const actualStart = t.actualStart ? new Date(t.actualStart) : null;
      const actualEnd = t.actualEnd ? new Date(t.actualEnd) : null;
      return {
        ...t,
        offsetDays,
        durationDays,
        actualOffsetDays: actualStart ? Math.floor((actualStart.getTime() - start.getTime()) / 86400000) : null,
        actualDurationDays: actualStart && actualEnd
          ? Math.ceil((actualEnd.getTime() - actualStart.getTime()) / 86400000)
          : null,
        isDelayed: t.delayDays ? t.delayDays > 0 : false,
      };
    });

    return { criticalPath: cp, gantt, totalDays, startDate: cp.startDate, endDate: cp.endDate };
  }

  // ── Documents ─────────────────────────────────────────────────────────────────
  async listDocuments(branchId: string, q?: Record<string, string>) {
    const where: any = { branchId, isLatest: true };
    if (q?.entityType) where.entityType = q.entityType;
    if (q?.entityId) where.entityId = q.entityId;
    if (q?.category) where.category = q.category;
    if (q?.uploadedBy) where.uploadedBy = q.uploadedBy;
    return this.prisma.plmDocument.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async createDocument(dto: any, branchId: string, uploadedBy: string) {
    const documentNumber = await this.nextNumber('DOC', 'plmDocument', 'documentNumber');
    return this.prisma.plmDocument.create({
      data: { ...dto, documentNumber, branchId, uploadedBy, isLatest: true },
    });
  }

  async getDocument(id: string) {
    const r = await this.prisma.plmDocument.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Document not found');
    return r;
  }

  async deleteDocument(id: string) {
    await this.getDocument(id);
    await this.prisma.plmDocument.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  async createDocumentVersion(id: string, dto: any, uploadedBy: string) {
    const existing = await this.getDocument(id);
    await this.prisma.plmDocument.update({ where: { id }, data: { isLatest: false } });
    const parts = existing.version.split('.');
    const newVersion = `${parts[0]}.${parseInt(parts[1] || '0') + 1}`;
    const documentNumber = await this.nextNumber('DOC', 'plmDocument', 'documentNumber');
    return this.prisma.plmDocument.create({
      data: {
        ...dto,
        documentNumber,
        entityType: existing.entityType,
        entityId: existing.entityId,
        category: existing.category,
        title: existing.title,
        branchId: existing.branchId,
        uploadedBy,
        version: newVersion,
        isLatest: true,
      },
    });
  }

  async getDocumentVersions(id: string) {
    const doc = await this.getDocument(id);
    return this.prisma.plmDocument.findMany({
      where: { entityType: doc.entityType, entityId: doc.entityId, category: doc.category, title: doc.title },
      orderBy: { createdAt: 'desc' },
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
          docketNumber, entityType, entityId,
          templateId: template?.id ?? null,
          title, status: 'incomplete', completeness: 0,
          totalItems: 0, approvedItems: 0, pendingItems: 0, missingItems: 0,
          branchId, createdBy,
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
        await (this.prisma as any).docket.update({
          where: { id: docket.id },
          data: { totalItems: template.items.length, missingItems: template.items.length },
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
