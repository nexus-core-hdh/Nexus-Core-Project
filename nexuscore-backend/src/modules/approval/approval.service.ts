import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type ApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'completed';

// Centralized approval policy engine (General Settings -> Approval Configuration). Generic on
// purpose — knows nothing about IM_Receipt/IM_OrderReceipt/etc.; a module that wants approval
// gating calls submit()/approve()/reject() here and, only on success, performs its own existing
// completion side effect (e.g. inventory-receipt.service.ts still owns "SET IsApproved = 1").
// History is never duplicated into a second table — every transition is written to the
// existing generic AuditLog (entityType = screenKey, entityId = transactionId), reused as-is.
@Injectable()
export class ApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  // `tx` (an in-flight Prisma.$transaction client) is optional and additive everywhere below —
  // every call site that omits it keeps writing through `this.prisma` exactly as before. It
  // exists so a caller with its own side-effect write to make alongside a decision (e.g.
  // inventory-receipt.service.ts's approve() also flipping IM_Receipt.IsApproved) can wrap both
  // in ONE atomic transaction: if either write fails, neither is committed, satisfying "approval
  // + stock/business-column update must be atomic" without this generic service knowing anything
  // about the caller's own table.
  private async writeAudit(screenKey: string, transactionId: string, action: string, changedBy: string, oldValues: any, newValues: any, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: { entityType: screenKey, entityId: transactionId, action, changedBy, oldValues, newValues },
    });
  }

  async isApprovalRequired(screenKey: string): Promise<boolean> {
    const cfg = await this.prisma.approvalConfiguration.findUnique({ where: { screenKey } });
    return !!cfg && cfg.isActive && cfg.approvalRequired;
  }

  getConfig(screenKey: string) {
    return this.prisma.approvalConfiguration.findUnique({ where: { screenKey } });
  }

  getStatus(screenKey: string, transactionId: string) {
    return this.prisma.approvalRequest.findUnique({ where: { screenKey_transactionId: { screenKey, transactionId } } });
  }

  // Create/Modify -> Submit -> Pending Approval. Idempotent per (screenKey, transactionId): a
  // fresh submission and a resubmission after rejection both just move the same row back to
  // pending_approval, clearing any prior decision — the full transition trail lives in AuditLog,
  // not in row history here.
  async submit(screenKey: string, transactionId: string, userId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const cfg = await this.getConfig(screenKey);
    const existing = await this.getStatus(screenKey, transactionId);
    const previousStatus = existing?.status ?? 'draft';
    const row = await client.approvalRequest.upsert({
      where: { screenKey_transactionId: { screenKey, transactionId } },
      create: {
        screenKey, transactionId, status: 'pending_approval',
        submittedBy: userId, submittedAt: new Date(),
        approvalLevel: cfg?.approvalLevel ?? 1,
      },
      update: {
        status: 'pending_approval', submittedBy: userId, submittedAt: new Date(),
        decidedBy: null, decidedAt: null, remarks: null,
      },
    });
    await this.writeAudit(screenKey, transactionId, 'submit', userId, { status: previousStatus }, { status: 'pending_approval' }, tx);
    return row;
  }

  approve(screenKey: string, transactionId: string, userId: string, remarks?: string, tx?: Prisma.TransactionClient) {
    return this.decide(screenKey, transactionId, userId, 'approved', remarks, tx);
  }

  reject(screenKey: string, transactionId: string, userId: string, remarks: string, tx?: Prisma.TransactionClient) {
    if (!remarks?.trim()) throw new BadRequestException('A rejection reason is required.');
    return this.decide(screenKey, transactionId, userId, 'rejected', remarks, tx);
  }

  private async decide(screenKey: string, transactionId: string, userId: string, newStatus: 'approved' | 'rejected', remarks?: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const existing = await client.approvalRequest.findUnique({ where: { screenKey_transactionId: { screenKey, transactionId } } });
    if (!existing) throw new NotFoundException('No approval request found for this transaction.');
    if (existing.status !== 'pending_approval') {
      throw new BadRequestException(`This transaction is not pending approval (current status: ${existing.status}).`);
    }
    // Self-approval restriction — data-dependent, so it can't live in the generic RolesGuard
    // permission check; enforced here against the real submittedBy on the row.
    const cfg = await client.approvalConfiguration.findUnique({ where: { screenKey } });
    if (existing.submittedBy === userId && !cfg?.selfApprovalAllowed) {
      throw new ForbiddenException('You cannot approve or reject your own submission.');
    }
    // Conditional UPDATE (WHERE status is STILL pending_approval), not a plain update-by-id —
    // closes a genuine race the read-then-write check above can't: two concurrent approve/reject
    // calls could both pass that check before either writes. Postgres serializes concurrent
    // UPDATEs to the same row; the loser's WHERE re-evaluates after the winner commits and no
    // longer matches "pending_approval", so updateMany reports 0 rows instead of silently
    // deciding an already-decided transaction a second time (an already-Approved row can never
    // be Approved again, and stock/business posting — done only after this succeeds by the
    // caller — can never fire twice for the same transaction).
    const { count } = await client.approvalRequest.updateMany({
      where: { screenKey, transactionId, status: 'pending_approval' },
      data: { status: newStatus, decidedBy: userId, decidedAt: new Date(), remarks: remarks ?? null },
    });
    if (count === 0) {
      throw new BadRequestException('This transaction was already decided by another request.');
    }
    await this.writeAudit(screenKey, transactionId, newStatus, userId, { status: 'pending_approval' }, { status: newStatus, remarks: remarks ?? null }, tx);
    return client.approvalRequest.findUniqueOrThrow({ where: { screenKey_transactionId: { screenKey, transactionId } } });
  }

  getPending(screenKey?: string) {
    return this.prisma.approvalRequest.findMany({
      where: { status: 'pending_approval', ...(screenKey ? { screenKey } : {}) },
      orderBy: { submittedAt: 'asc' },
    });
  }

  // Reuses AuditLog directly — no dedicated approval-history table.
  getHistory(screenKey: string, transactionId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType: screenKey, entityId: transactionId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
