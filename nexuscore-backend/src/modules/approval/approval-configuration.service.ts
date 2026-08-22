import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface UpdateConfigDto {
  approvalRequired?: boolean;
  approvalLevel?: number;
  isActive?: boolean;
  selfApprovalAllowed?: boolean;
}

@Injectable()
export class ApprovalConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  // Merges every Legacy ERP MenuItem row (the existing screen/module registry — already 38
  // real rows, one per Legacy ERP screen) with its ApprovalConfiguration row if one exists.
  // Screens with no row yet default to approvalRequired:false ("existing screens default to No
  // unless an existing DB configuration already says otherwise") — nothing is pre-seeded into
  // ApprovalConfiguration just by listing it here.
  async list() {
    const [screens, configs] = await Promise.all([
      this.prisma.menuItem.findMany({
        // The General Settings screen itself isn't a transactional screen — excluded so it
        // never appears as a configurable target of its own configuration grid.
        where: { group: 'Legacy ERP', href: { not: '/dashboard/legacy-erp/general-settings' } },
        select: { title: true, href: true },
        orderBy: { title: 'asc' },
      }),
      this.prisma.approvalConfiguration.findMany(),
    ]);
    // "Last Updated By" — resolve the real User.name for display, same
    // resolve-updatedBy-against-the-real-Users-table convention already used elsewhere in this
    // app (e.g. Inventory Card List's creator-name join) instead of showing a raw uuid.
    const updaterIds = [...new Set(configs.map((c) => c.updatedBy).filter((v): v is string => !!v))];
    const updaters = updaterIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: updaterIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(updaters.map((u) => [u.id, u.name]));

    const byKey = new Map(configs.map((c) => [c.screenKey, c]));
    return screens.map((s) => {
      const cfg = byKey.get(s.href);
      return {
        screenKey: s.href,
        screenName: s.title,
        approvalRequired: cfg?.approvalRequired ?? false,
        approvalLevel: cfg?.approvalLevel ?? 1,
        isActive: cfg?.isActive ?? true,
        selfApprovalAllowed: cfg?.selfApprovalAllowed ?? false,
        updatedBy: cfg?.updatedBy ? (nameById.get(cfg.updatedBy) ?? cfg.updatedBy) : null,
        updatedAt: cfg?.updatedAt ?? null,
      };
    });
  }

  async update(screenKey: string, dto: UpdateConfigDto, userId: string) {
    const existing = await this.prisma.approvalConfiguration.findUnique({ where: { screenKey } });
    const next = await this.prisma.approvalConfiguration.upsert({
      where: { screenKey },
      create: {
        screenKey,
        approvalRequired: dto.approvalRequired ?? false,
        approvalLevel: dto.approvalLevel ?? 1,
        isActive: dto.isActive ?? true,
        selfApprovalAllowed: dto.selfApprovalAllowed ?? false,
        createdBy: userId,
        updatedBy: userId,
      },
      update: {
        ...(dto.approvalRequired !== undefined ? { approvalRequired: dto.approvalRequired } : {}),
        ...(dto.approvalLevel !== undefined ? { approvalLevel: dto.approvalLevel } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.selfApprovalAllowed !== undefined ? { selfApprovalAllowed: dto.selfApprovalAllowed } : {}),
        updatedBy: userId,
      },
    });
    // Configuration changes are audited via the same existing AuditLog table the approval
    // transactions themselves use — entityType names the config record, not a screen instance.
    await this.prisma.auditLog.create({
      data: {
        entityType: 'ApprovalConfiguration',
        entityId: screenKey,
        action: 'config-changed',
        changedBy: userId,
        oldValues: existing
          ? { approvalRequired: existing.approvalRequired, approvalLevel: existing.approvalLevel, isActive: existing.isActive }
          : Prisma.JsonNull,
        newValues: { approvalRequired: next.approvalRequired, approvalLevel: next.approvalLevel, isActive: next.isActive },
      },
    });
    return next;
  }
}
