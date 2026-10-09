import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MenuItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMenuItems(companyId?: string, branchId?: string) {
    const items = await this.prisma.menuItem.findMany({
      where: {
        isActive: true,
        OR: [
          ...(companyId || branchId
            ? [{ companyId: companyId ?? null, branchId: branchId ?? null }]
            : []),
          // Company-wide items (no branch) — e.g. user-defined reports — for every branch of it.
          ...(companyId && branchId ? [{ companyId, branchId: null }] : []),
          { companyId: null, branchId: null },
        ],
      },
      orderBy: [{ order: 'asc' }],
    });

    if (items.length === 0) return [];

    // Build id → children map
    const childMap = new Map<string, typeof items>();
    for (const item of items) {
      if (item.parentId) {
        if (!childMap.has(item.parentId)) childMap.set(item.parentId, []);
        childMap.get(item.parentId)!.push(item);
      }
    }

    const buildNode = (item: (typeof items)[0]): any => {
      const children = (childMap.get(item.id) ?? [])
        .sort((a, b) => a.order - b.order)
        .map(buildNode);
      return {
        id: item.id,
        title: item.title,
        href: item.href,
        icon: item.icon ?? undefined,
        isComing: item.isComing,
        isNew: item.isNew,
        isDataBadge: item.isDataBadge ?? undefined,
        newTab: item.newTab,
        ...(children.length ? { items: children } : {}),
      };
    };

    // Root items have no parentId — group them by the `group` field
    const roots = items
      .filter((i) => !i.parentId)
      .sort((a, b) => a.order - b.order);

    // Preserve group order via insertion-order Map
    const groupMap = new Map<string, any[]>();
    for (const root of roots) {
      const g = root.group ?? 'Other';
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push(buildNode(root));
    }

    return Array.from(groupMap.entries()).map(([title, items]) => ({ title, items }));
  }

  async createMenuItem(dto: any) {
    return this.prisma.menuItem.create({ data: dto });
  }

  async updateMenuItem(id: string, dto: any) {
    return this.prisma.menuItem.update({ where: { id }, data: dto });
  }

  async deleteMenuItem(id: string) {
    return this.prisma.menuItem.delete({ where: { id } });
  }

  async reorderMenuItems(
    items: Array<{ id: string; order: number; title?: string; href?: string; icon?: string; group?: string; parentId?: string | null }>,
    companyId?: string,
    branchId?: string,
  ) {
    const validItems = items.filter((item) => typeof item.id === 'string' && item.id.length > 0);
    if (validItems.length === 0) return this.getMenuItems(companyId, branchId);
    await this.prisma.$transaction(
      validItems.map((item) =>
        this.prisma.menuItem.updateMany({
          where: { id: item.id },
          data: {
            order: item.order,
            ...(item.title !== undefined ? { title: item.title } : {}),
            ...(item.href !== undefined ? { href: item.href } : {}),
            ...(item.icon !== undefined ? { icon: item.icon } : {}),
            ...(item.group !== undefined ? { group: item.group } : {}),
            ...(item.parentId !== undefined ? { parentId: item.parentId } : {}),
          },
        }),
      ),
    );
    return this.getMenuItems(companyId, branchId);
  }
}
