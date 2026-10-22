import { ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { MailService } from '../auth/mail.service';
import { PasswordResetService } from '../auth/password-reset.service';
import { hashPassword } from '../users/users.service';
import { ProvisioningActor } from './company-provisioning.service';
import { CreateFirstAdminDto } from './dto/invite-first-admin.dto';

// Create First Admin — the first user of a newly registered company, created only when a platform
// administrator explicitly asks (POST /companies/:id/first-admin; route permission
// companies:invite-admin, and here the caller's OWN company must be the platform owner).
//
// It is the Users screen's own account creation (UsersService.create) aimed at another company:
//  * same fields and validation (CreateUserDto via CreateFirstAdminDto), same password storage
//    (hashPassword — bcrypt, cost 10) and the same rule that the account must change its initial
//    password at first sign-in (mustChangePassword, enforced server-side). The initial password is
//    the temporary one the Users dialog generates and shows its creator once; it is never logged,
//    audited or returned.
//  * no email is needed. Emailing a single-use set-password link is a separate, optional step
//    (sendSetupLink) that needs a mail transport.
//  * only a company that is not the platform owner and has no users yet is eligible; a per-company
//    transaction lock plus that re-check means two concurrent requests can never create two admins.
//  * the user belongs to the target company and its Main Branch (its first branch, chosen here),
//    gets the existing system "Admin" role, and is never a platform owner.
//
// Status: not_configured (no users) | awaiting_first_sign_in (created; initial password not yet
// changed) | active | not_eligible. setupLink: the optional emailed link — none | pending | expired.
export type FirstAdminStatus = 'not_configured' | 'awaiting_first_sign_in' | 'active' | 'not_eligible';

const DEFAULT_INVITE_TTL_HOURS = 72;
const MAX_INVITE_TTL_HOURS = 168;

/** Set-password link validity: FIRST_ADMIN_INVITE_TTL_HOURS (whole hours, 1–168), else 72 hours. */
export function inviteTtlMs(raw: string | undefined = process.env.FIRST_ADMIN_INVITE_TTL_HOURS): number {
  const n = Number((raw ?? '').trim());
  const hours = raw && Number.isInteger(n) && n >= 1 && n <= MAX_INVITE_TTL_HOURS ? n : DEFAULT_INVITE_TTL_HOURS;
  return hours * 3_600_000;
}

const USER_SAFE_SELECT = {
  id: true, name: true, email: true, companyId: true, branchId: true, isActive: true, mustChangePassword: true, createdAt: true,
  company: { select: { id: true, name: true, slug: true } },
  branch: { select: { id: true, name: true } },
  userRoles: { select: { role: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

@Injectable()
export class CompanyFirstAdminService {
  private readonly logger = new Logger('[NexusCore] FirstAdmin');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly setupLinks: PasswordResetService,
  ) {}

  private async assertPlatformOwner(actor: ProvisioningActor) {
    const c = actor?.companyId ? await this.prisma.company.findUnique({ where: { id: actor.companyId }, select: { isPlatformOwner: true } }) : null;
    if (!c?.isPlatformOwner) throw new ForbiddenException('Only the platform owner company can set up another company\'s administrator.');
  }

  private async target(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, slug: true, isPlatformOwner: true, branches: { select: { id: true, name: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  private async adminRole(): Promise<{ id: string; name: string }> {
    const role = await this.prisma.role.findFirst({ where: { name: 'Admin', isSystem: true }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
    if (!role) throw new InternalServerErrorException('The system Admin role does not exist — run the database setup (npm run db:setup).');
    return role;
  }

  /** The company's first administrator (its earliest user holding the system Admin role), if any. */
  private async firstAdmin(companyId: string) {
    return this.prisma.user.findFirst({
      where: { companyId, userRoles: { some: { role: { name: 'Admin', isSystem: true } } } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, mustChangePassword: true, createdAt: true },
    });
  }

  private async describe(company: { id: string; isPlatformOwner: boolean; branches: { id: string; name: string }[] }) {
    const mainBranch = company.branches[0] ?? null;
    if (company.isPlatformOwner) return { status: 'not_eligible' as FirstAdminStatus, reason: 'The platform owner company manages its own users.', mainBranch };
    const users = await this.prisma.user.count({ where: { companyId: company.id } });
    if (!users) return { status: 'not_configured' as FirstAdminStatus, mainBranch };
    const admin = await this.firstAdmin(company.id);
    if (!admin) return { status: 'not_eligible' as FirstAdminStatus, reason: 'The company already has users.', mainBranch };
    const link = await this.prisma.passwordResetToken.findFirst({
      where: { userId: admin.id }, select: { used: true, expiresAt: true }, orderBy: { createdAt: 'desc' },
    });
    const setupLink = !link ? { status: 'none' as const }
      : !link.used && link.expiresAt > new Date() ? { status: 'pending' as const, expiresAt: link.expiresAt } : { status: 'expired' as const };
    return {
      status: (admin.mustChangePassword ? 'awaiting_first_sign_in' : 'active') as FirstAdminStatus,
      name: admin.name, email: admin.email, createdAt: admin.createdAt, mainBranch, setupLink,
    };
  }

  async status(actor: ProvisioningActor, companyId: string) {
    await this.assertPlatformOwner(actor);
    const company = await this.target(companyId);
    // Whether the optional set-password email could be sent at all — informational only.
    const emailConfigured = await this.mail.isConfigured(actor.companyId);
    return { data: { ...(await this.describe(company)), emailConfigured } };
  }

  async create(actor: ProvisioningActor, companyId: string, dto: CreateFirstAdminDto) {
    await this.assertPlatformOwner(actor);
    const company = await this.target(companyId);
    if (company.isPlatformOwner || company.id === actor.companyId) {
      throw new ForbiddenException('The platform owner company manages its own users from its Users screen.');
    }
    const mainBranch = company.branches[0];
    if (!mainBranch) throw new ConflictException('This company has no branch — it cannot receive users yet.');
    if (await this.prisma.user.count({ where: { companyId } })) {
      throw new ConflictException({ message: 'This company already has users — its first administrator is already set up. Further users are added from that company\'s own Users screen.', errors: { code: 'ALREADY_CONFIGURED' } });
    }
    const role = await this.adminRole();
    const password = await hashPassword(dto.password);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        // One first-admin creation per company at a time; the user count is re-checked under the lock.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`first-admin:${companyId}`}))`;
        if (await tx.user.count({ where: { companyId } })) {
          throw new ConflictException({ message: 'This company already has users — its first administrator is already set up.', errors: { code: 'ALREADY_CONFIGURED' } });
        }
        if (await tx.user.findFirst({ where: { email: { equals: dto.email, mode: 'insensitive' } }, select: { id: true } })) {
          throw new ConflictException({ message: 'Email already registered', errors: { email: 'taken' } });
        }
        const created = await tx.user.create({
          data: {
            companyId, branchId: mainBranch.id, name: dto.name, email: dto.email, password,
            phone: dto.phone || null, department: dto.department || null,
            isActive: true, userStatus: 'active', mustChangePassword: true,
          },
          select: { id: true },
        });
        await tx.userRole.create({ data: { userId: created.id, roleId: role.id, assignedBy: actor.id } });
        await this.audit.record({
          userId: actor.id, companyId: actor.companyId, screenKey: '/pages/companies',
          entityType: 'User', entityId: created.id, action: AUDIT_ACTIONS.CREATE, documentNo: dto.email,
          parentEntityType: 'Company', parentEntityId: company.id, parentDocumentNo: company.slug,
          after: { User: { id: created.id, name: dto.name, email: dto.email, companyId, branchId: mainBranch.id, role: role.name, firstAdmin: true } },
        }, tx);
        return tx.user.findUniqueOrThrow({ where: { id: created.id }, select: USER_SAFE_SELECT });
      });
      return { data: user, message: `${user.name} is the first administrator of ${company.name}. Share the temporary password securely; it must be changed at first sign-in.` };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ message: 'Email already registered', errors: { email: 'taken' } });
      }
      throw e;
    }
  }

  /**
   * Optional: emails the first administrator a single-use, time-limited set-password link (the
   * existing /reset-password flow) — only while they have not yet changed their initial password,
   * and only when a mail transport exists. A failed send invalidates the link and says so.
   */
  async sendSetupLink(actor: ProvisioningActor, companyId: string) {
    await this.assertPlatformOwner(actor);
    const company = await this.target(companyId);
    if (company.isPlatformOwner) throw new ForbiddenException('The platform owner company manages its own users from its Users screen.');
    const admin = await this.firstAdmin(company.id);
    if (!admin) throw new ConflictException({ message: 'Create the first administrator first.', errors: { code: 'not_configured' } });
    if (!admin.mustChangePassword) throw new ConflictException({ message: 'The administrator has already set their own password.', errors: { code: 'active' } });
    if (!(await this.mail.isConfigured(actor.companyId))) {
      throw new ServiceUnavailableException({
        message: 'Email delivery is not configured, so no set-password email can be sent. The administrator can still sign in with the temporary password. To enable emails, set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS and SMTP_FROM in nexuscore-backend/.env and restart the backend.',
        errors: { code: 'EMAIL_NOT_CONFIGURED' },
      });
    }
    const ttl = inviteTtlMs();
    const { link, expiresAt } = await this.setupLinks.issueSetupLink(admin.id, ttl);
    const base = (process.env.APP_PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const hours = ttl / 3_600_000;
    const sent = await this.mail.send(
      admin.email,
      `Set your password for ${company.name}`,
      `Hello ${admin.name},\n\nYou are the administrator of ${company.name}. Use this link to choose your password (valid for ${hours} hours, single use):\n${link}\n\nThen sign in at ${base}/login — your company's address is ${base}/${company.slug ?? ''}.\n\nIf you were not expecting this, you can ignore this email.`,
      `<p>Hello ${esc(admin.name)},</p><p>You are the administrator of <b>${esc(company.name)}</b>. Use the link below to choose your password. It is valid for ${hours} hours and can be used once.</p><p><a href="${esc(link)}">Set your password</a></p><p>Then sign in at <a href="${esc(base)}/login">${esc(base)}/login</a> — your company's address is ${esc(base)}/${esc(company.slug ?? '')}.</p><p>If you were not expecting this, you can ignore this email.</p>`,
      actor.companyId,
    );
    if (!sent) {
      await this.setupLinks.invalidateTokens(admin.id);
      this.logger.warn(`Set-password email for user ${admin.id} could not be sent; its link was invalidated.`);
      return { data: { sent: false, message: 'The set-password email could not be sent (see the server log); its link was invalidated. The temporary password still works.' } };
    }
    return { data: { sent: true, expiresAt, message: `Set-password email sent to ${admin.email}.` } };
  }
}

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
