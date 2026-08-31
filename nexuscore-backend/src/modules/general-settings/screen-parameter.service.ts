import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const SCREEN_PARAMETER_TYPES = ['boolean', 'text', 'number', 'select'] as const;
export type ScreenParameterType = (typeof SCREEN_PARAMETER_TYPES)[number];

interface UpsertScreenParameterDto {
  screenKey?: string;
  paramKey?: string;
  name?: string;
  description?: string | null;
  type?: string;
  value?: string | null;
  options?: unknown;
  isActive?: boolean;
}

// Centralized Screen Parameters — one generic table/service for every screen's admin-configured
// parameters (see ScreenParameter in schema.prisma for the isolation-boundary rationale). Mirrors
// approval-configuration.service.ts's own shape (screenKey-keyed, createdBy/updatedBy audit
// fields) rather than inventing a new convention.
@Injectable()
export class ScreenParameterService {
  constructor(private readonly prisma: PrismaService) {}

  private assertValidType(type: string | undefined): asserts type is ScreenParameterType {
    if (!type || !(SCREEN_PARAMETER_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(`type must be one of: ${SCREEN_PARAMETER_TYPES.join(', ')}`);
    }
  }

  // Generic, type-agnostic value hardening — applies to every ScreenParameter regardless of
  // which screen/feature owns it (Decimal Parameters included, which additionally validates its
  // own domain rules — non-negative integer precision, a known rounding mode — client-side,
  // since those are specific to that one feature rather than universal to "type: number"/
  // "type: select"). An empty value is always allowed (a parameter with no value configured yet).
  private assertValidValue(type: string, value: string | null | undefined, options: unknown) {
    if (value === null || value === undefined || value === '') return;
    if (type === 'number' && !Number.isFinite(Number(value))) {
      throw new BadRequestException('value must be a finite number for type "number".');
    }
    if (type === 'select' && Array.isArray(options) && options.length > 0 && !options.includes(value)) {
      throw new BadRequestException('value must be one of the configured options for type "select".');
    }
  }

  // Admin management list — every parameter for one screen, active or not. Distinct from
  // listActive() below: this is what the Settings UI itself renders.
  list(screenKey: string) {
    if (!screenKey) throw new BadRequestException('screenKey is required');
    return this.prisma.screenParameter.findMany({ where: { screenKey }, orderBy: { name: 'asc' } });
  }

  // The dynamic API every OTHER screen actually calls: screenKey -> its own active parameter
  // configuration, nothing else. A screen with zero rows (the common case — most screens have no
  // configuration at all) simply gets an empty array, which is why "existing behavior is
  // preserved when no parameters are configured" holds with zero extra code on the caller side.
  listActive(screenKey: string) {
    if (!screenKey) throw new BadRequestException('screenKey is required');
    return this.prisma.screenParameter.findMany({
      where: { screenKey, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: UpsertScreenParameterDto, userId: string) {
    const screenKey = dto.screenKey?.trim();
    const paramKey = dto.paramKey?.trim();
    const name = dto.name?.trim();
    if (!screenKey) throw new BadRequestException('screenKey is required');
    if (!paramKey) throw new BadRequestException('paramKey is required');
    if (!name) throw new BadRequestException('name is required');
    this.assertValidType(dto.type);
    this.assertValidValue(dto.type, dto.value, dto.type === 'select' ? (dto.options ?? []) : undefined);

    try {
      return await this.prisma.screenParameter.create({
        data: {
          screenKey,
          paramKey,
          name,
          description: dto.description || null,
          type: dto.type,
          value: dto.value ?? null,
          options: dto.type === 'select' ? ((dto.options ?? []) as any) : undefined,
          isActive: dto.isActive ?? true,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    } catch (err: any) {
      // Prisma's typed client error for a unique-constraint violation (schema-level create, not
      // $queryRaw) is P2002 — the raw Postgres "23505" code never appears in this message shape,
      // unlike the $queryRaw-based services elsewhere in this app that string-match it directly.
      if (err?.code === 'P2002') {
        throw new ConflictException('A parameter with this key already exists for this screen.');
      }
      throw err;
    }
  }

  // screenKey/paramKey are immutable once created (same "stable key" convention already
  // established for Code fields elsewhere in this app) — silently ignored here rather than
  // erroring, since the frontend form never sends them on edit.
  async update(id: string, dto: UpsertScreenParameterDto, userId: string) {
    const existing = await this.prisma.screenParameter.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Screen parameter not found');
    if (dto.type !== undefined) this.assertValidType(dto.type);

    const effectiveType = dto.type ?? existing.type;
    const effectiveValue = dto.value !== undefined ? dto.value : existing.value;
    const effectiveOptions = dto.options !== undefined ? dto.options : existing.options;
    this.assertValidValue(effectiveType, effectiveValue, effectiveType === 'select' ? effectiveOptions : undefined);

    return this.prisma.screenParameter.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description || null } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.options !== undefined ? { options: dto.options as any } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedBy: userId,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.screenParameter.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Screen parameter not found');
    return this.prisma.screenParameter.delete({ where: { id } });
  }
}
