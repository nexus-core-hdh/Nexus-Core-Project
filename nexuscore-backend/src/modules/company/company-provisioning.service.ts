import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { RESERVED_COMPANY_SLUGS } from '../../common/company-slug';
import { CreateCompanyDto } from './dto/create-company.dto';
import { defaultTrialEnd, isTrialExpired, trialDefaultDays, trialEndOfDay } from '../../common/company-trial';

// Company provisioning — the platform-level side of Companies: registering new companies and
// viewing companies other than your own. Allowed only when BOTH hold, checked on every request:
//  1. the user holds the permission the route requires (companies:create / companies:read —
//     RolesGuard, via the route's @Permissions), and
//  2. the user's OWN company (loaded here by the token's companyId, never a client value) is the
//     platform owner (Company.isPlatformOwner — the company that manages the other companies).
// Roles are shared across companies, so (1) alone would let any company's Admin act on every
// company; (2) cannot be granted from the app: isPlatformOwner is set only by server-side setup
// (prisma/seed.ts, run by `npm run db:setup`), and no API accepts it.
export const PROVISIONING_PERMISSIONS = {
  create: { module: 'companies', action: 'create' },
  read: { module: 'companies', action: 'read' },
  // Set Up First Admin (CompanyFirstAdminService) — creates a user in ANOTHER company.
  inviteAdmin: { module: 'companies', action: 'invite-admin' },
} as const;

export interface ProvisioningActor { id: string; companyId: string }

// What a platform user sees of another company: no secrets (metaAppSecret / WhatsApp tokens).
export const COMPANY_PUBLIC_SELECT = {
  id: true, name: true, email: true, phone: true, address: true, website: true, industry: true, slug: true,
  accountType: true, plan: true, subscriptionStatus: true, subscriptionStartDate: true, subscriptionEndDate: true, trialEndDate: true,
  billingCycle: true, isPlatformOwner: true, createdAt: true, updatedAt: true,
  branches: { select: { id: true, name: true }, orderBy: { createdAt: 'asc' } },
  _count: { select: { users: true } },
} satisfies Prisma.CompanySelect;

/** A company as returned to platform users: plus whether its trial has ended (computed, never stored). */
export function withTrialState<T extends { subscriptionStatus: string; trialEndDate: Date | null; isPlatformOwner: boolean }>(c: T, now = new Date()) {
  return { ...c, trialExpired: isTrialExpired(c, now) };
}

const DEFAULT_BRANCH_NAME = 'Main Branch';

@Injectable()
export class CompanyProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async hasPermission(userId: string, perm: { module: string; action: string }) {
    const n = await this.prisma.rolePermission.count({
      where: { role: { userRoles: { some: { userId } } }, permission: { module: perm.module, action: perm.action } },
    });
    return n > 0;
  }

  private async isPlatformOwner(companyId: string) {
    const c = await this.prisma.company.findUnique({ where: { id: companyId }, select: { isPlatformOwner: true } });
    return !!c?.isPlatformOwner;
  }

  private async assertPlatformOwner(actor: ProvisioningActor) {
    if (!actor?.companyId || !(await this.isPlatformOwner(actor.companyId))) {
      throw new ForbiddenException('Only the platform owner company can manage other companies.');
    }
  }

  // What the Companies screen may offer this user — computed server-side, used only for display;
  // every action is still authorized again by its own route.
  async access(actor: ProvisioningActor) {
    const owner = await this.isPlatformOwner(actor.companyId);
    const [canCreate, canViewAll, canInviteAdmin] = owner
      ? await Promise.all([
        this.hasPermission(actor.id, PROVISIONING_PERMISSIONS.create),
        this.hasPermission(actor.id, PROVISIONING_PERMISSIONS.read),
        this.hasPermission(actor.id, PROVISIONING_PERMISSIONS.inviteAdmin),
      ])
      : [false, false, false];
    // The registration form's default trial end (null: no server default — the admin picks one).
    return { data: { isPlatformOwner: owner, canCreate, canViewAll, canInviteAdmin, trialDefaultDays: canCreate ? trialDefaultDays() : null } };
  }

  async list(actor: ProvisioningActor) {
    await this.assertPlatformOwner(actor);
    const rows = await this.prisma.company.findMany({ select: COMPANY_PUBLIC_SELECT, orderBy: { createdAt: 'asc' } });
    const now = new Date();
    return { data: rows.map((r) => withTrialState(r, now)) };
  }

  async get(actor: ProvisioningActor, id: string) {
    await this.assertPlatformOwner(actor);
    const company = await this.prisma.company.findUnique({ where: { id }, select: COMPANY_PUBLIC_SELECT });
    if (!company) throw new NotFoundException('Company not found');
    return { data: withTrialState(company) };
  }

  // The subscription a registration gets — decided here, never by the client. Standard: the schema
  // defaults (as before). Demo: a Trial from now until the chosen day (or COMPANY_TRIAL_DAYS) —
  // the end must be a real date after the start; with neither a date nor a server default the
  // registration is refused rather than guessing a length.
  private trialFor(dto: CreateCompanyDto, start: Date): { accountType: 'Standard' | 'Demo'; subscriptionStatus?: 'Trial'; trialEndDate?: Date } {
    if (dto.accountType !== 'Demo') {
      if (dto.trialEndDate) throw new BadRequestException({ message: 'A trial end date is only allowed for a Demo company.', errors: { trialEndDate: 'not-allowed' } });
      return { accountType: 'Standard' };
    }
    let end: Date | null;
    if (dto.trialEndDate) {
      end = trialEndOfDay(dto.trialEndDate);
      if (!end) throw new BadRequestException({ message: `Trial end date "${dto.trialEndDate}" is not a valid date.`, errors: { trialEndDate: 'invalid' } });
    } else {
      const days = trialDefaultDays();
      if (!days) {
        throw new BadRequestException({
          message: 'Choose the trial end date — no default trial length is configured on the server (COMPANY_TRIAL_DAYS).',
          errors: { trialEndDate: 'required' },
        });
      }
      end = defaultTrialEnd(start, days);
    }
    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException({ message: 'The trial end date must be after today.', errors: { trialEndDate: 'not-after-start' } });
    }
    return { accountType: 'Demo', subscriptionStatus: 'Trial', trialEndDate: end };
  }

  // Registers one company: the Company row and its default branch (a user, costing sheets and
  // other branch-scoped records need a branch), all or nothing, with its Created audit event. No
  // users are created or moved, and nothing is copied from any other company. The new company is
  // never a platform owner. Standard keeps the schema's plan/subscription defaults; Demo is on a
  // Trial (trialFor) — plan stays the schema default (Free), never a paid plan.
  async create(actor: ProvisioningActor, dto: CreateCompanyDto) {
    await this.assertPlatformOwner(actor);
    const start = new Date();
    const subscription = this.trialFor(dto, start);
    if (RESERVED_COMPANY_SLUGS.has(dto.slug)) {
      throw new BadRequestException({ message: `"${dto.slug}" is reserved — choose another Company URL.`, errors: { slug: 'reserved' } });
    }
    if (await this.prisma.company.findFirst({ where: { slug: dto.slug }, select: { id: true } })) {
      throw new ConflictException({ message: `The Company URL "${dto.slug}" is already in use.`, errors: { slug: 'taken' } });
    }
    if (dto.email && (await this.prisma.company.findFirst({ where: { email: dto.email }, select: { id: true } }))) {
      throw new ConflictException({ message: `A company with the email ${dto.email} already exists.`, errors: { email: 'taken' } });
    }
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: dto.name, slug: dto.slug, email: dto.email ?? null, phone: dto.phone ?? null, address: dto.address ?? null,
            industry: dto.industry ?? null, website: dto.website ?? null,
            isPlatformOwner: false, subscriptionStartDate: start, ...subscription,
          },
        });
        const branch = await tx.branch.create({ data: { companyId: company.id, name: DEFAULT_BRANCH_NAME } });
        await this.audit.record({
          userId: actor.id, companyId: actor.companyId, screenKey: '/pages/companies',
          entityType: 'Company', entityId: company.id, action: AUDIT_ACTIONS.CREATE, documentNo: company.slug,
          after: {
            Company: {
              id: company.id, name: company.name, slug: company.slug, email: company.email, phone: company.phone, address: company.address,
              industry: company.industry, website: company.website, accountType: company.accountType, plan: company.plan,
              subscriptionStatus: company.subscriptionStatus, subscriptionStartDate: company.subscriptionStartDate, trialEndDate: company.trialEndDate,
            },
            Branch: { id: branch.id, name: branch.name },
          },
        }, tx);
        return company.id;
      });
      const created = await this.prisma.company.findUniqueOrThrow({ where: { id }, select: COMPANY_PUBLIC_SELECT });
      return { data: withTrialState(created), message: 'Company created' };
    } catch (e) {
      // Another registration took the slug/email between the checks above and the insert.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const field = String((e.meta as any)?.target ?? '');
        throw new ConflictException(field.includes('email')
          ? { message: `A company with the email ${dto.email} already exists.`, errors: { email: 'taken' } }
          : { message: `The Company URL "${dto.slug}" is already in use.`, errors: { slug: 'taken' } });
      }
      throw e;
    }
  }
}
