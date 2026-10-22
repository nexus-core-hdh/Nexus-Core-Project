// Demo/Trial company registration, Create First Admin, and the trial lifecycle — against the
// throwaway test database (`npm run test:company`). Email is a recording stand-in for MailService
// (no real email is sent); everything else is the real services: provisioning, first admin,
// PasswordResetService (set-password links), AuthService (sign-in) and JwtStrategy (API access).
import { useTestDatabase, assertSafeTestDatabase, DEV_DATABASE_NAME } from '../packing-list/test-db';
useTestDatabase();

import 'reflect-metadata';
import { after, before, beforeEach, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { CompanyProvisioningService, PROVISIONING_PERMISSIONS } from '../../src/modules/company/company-provisioning.service';
import { CompanyFirstAdminService, inviteTtlMs } from '../../src/modules/company/company-first-admin.service';
import { CompaniesController } from '../../src/modules/company/companies.controller';
import { CompanyService } from '../../src/modules/company/company.service';
import { CreateCompanyDto } from '../../src/modules/company/dto/create-company.dto';
import { CreateFirstAdminDto } from '../../src/modules/company/dto/invite-first-admin.dto';
import { UsersService } from '../../src/modules/users/users.service';
import * as bcrypt from 'bcrypt';
import { PasswordResetService } from '../../src/modules/auth/password-reset.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { JwtStrategy } from '../../src/modules/auth/strategies/jwt.strategy';
import { nexuscoreValidationPipe } from '../../src/common/pipes/validation.pipe';
import { resolveRequiredPermissions } from '../../src/common/decorators/permissions.decorator';
import { defaultTrialEnd, isTrialExpired, trialDefaultDays, trialEndOfDay } from '../../src/common/company-trial';

// Recording stand-in for MailService: whether a transport "exists", whether sending succeeds, and
// every message "sent" (to read the set-password link the way the recipient would).
class FakeMail {
  configured = true;
  deliver = true;
  sent: { to: string; subject: string; text: string }[] = [];
  async isConfigured() { return this.configured; }
  async send(to: string, subject: string, text: string) {
    if (!this.deliver) return false;
    this.sent.push({ to, subject, text });
    return true;
  }
}

const CONFIG: Record<string, string> = { 'jwt.secret': 'test-secret', 'jwt.refreshSecret': 'test-refresh', 'jwt.expiresIn': '1h', 'jwt.refreshExpiresIn': '1d', 'jwt.issuer': 'nexuscore' };
const config = { get: (k: string, d?: any) => CONFIG[k] ?? d, getOrThrow: (k: string) => CONFIG[k] } as any;

let prisma: PrismaService;
let mail: FakeMail;
let provisioning: CompanyProvisioningService;
let firstAdmin: CompanyFirstAdminService;
let resets: PasswordResetService;
let auth: AuthService;
let strategy: JwtStrategy;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let seq = 0;
const uniq = (p: string) => `${p}-${RUN}-${++seq}`.toLowerCase();
const savedTrialDays = process.env.COMPANY_TRIAL_DAYS;

before(async () => {
  prisma = new PrismaService();
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  assertSafeTestDatabase(db);
  assert.notEqual(db, DEV_DATABASE_NAME);
  const audit = new AuditService(prisma);
  mail = new FakeMail();
  provisioning = new CompanyProvisioningService(prisma, audit);
  resets = new PasswordResetService(prisma, mail as any);
  firstAdmin = new CompanyFirstAdminService(prisma, audit, mail as any, resets);
  auth = new AuthService(prisma, new JwtService({}), config);
  strategy = new JwtStrategy(config, prisma);
  // The system Admin role every database setup has (prisma/seed.ts); created here if this test DB lacks it.
  if (!(await prisma.role.findFirst({ where: { name: 'Admin', isSystem: true } }))) {
    await prisma.role.create({ data: { name: 'Admin', description: 'Full access', isSystem: true } });
  }
});
beforeEach(() => { mail.configured = true; mail.deliver = true; mail.sent = []; process.env.COMPANY_TRIAL_DAYS = '30'; });
after(async () => {
  if (savedTrialDays === undefined) delete process.env.COMPANY_TRIAL_DAYS; else process.env.COMPANY_TRIAL_DAYS = savedTrialDays;
  await prisma.$disconnect();
});

/** A company (platform owner or not) with one user holding the given companies:* actions. */
async function actor(opts: { owner: boolean; actions?: string[] }) {
  const company = await prisma.company.create({ data: { name: `Co ${uniq('')}`, slug: uniq('co'), isPlatformOwner: opts.owner } });
  const branch = await prisma.branch.create({ data: { name: 'HQ', companyId: company.id } });
  const user = await prisma.user.create({ data: { companyId: company.id, branchId: branch.id, name: 'platform admin', email: `${uniq('pa')}@test.invalid`, password: 'x', mustChangePassword: false } });
  if (opts.actions?.length) {
    const role = await prisma.role.create({ data: { name: uniq('role') } });
    for (const action of opts.actions) {
      const perm = await prisma.permission.upsert({ where: { module_action: { module: 'companies', action } }, create: { module: 'companies', action }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    }
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return { id: user.id, companyId: company.id };
}
const platform = () => actor({ owner: true, actions: ['create', 'read', 'invite-admin'] });
const dto = (over: Partial<CreateCompanyDto> = {}) => Object.assign(new CreateCompanyDto(), { name: 'Acme Demo', slug: uniq('acme'), ...over });
const adminDto = (over: Partial<CreateFirstAdminDto> = {}) => Object.assign(new CreateFirstAdminDto(), { name: 'Ayesha Khan', email: `${uniq('ayesha')}@test.invalid`, password: 'Temp-Pass-123', ...over });
const tokenFrom = (text: string) => decodeURIComponent(/token=([^&\s]+)/.exec(text)![1]);
const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const rejects = (p: Promise<unknown>, status: number, re: RegExp) =>
  assert.rejects(p, (e: any) => { assert.equal(e?.getStatus?.(), status); assert.match(JSON.stringify(e.getResponse?.() ?? e.message), re); return true; });

describe('Trial rules (common/company-trial.ts)', () => {
  test('COMPANY_TRIAL_DAYS must be a whole number of days 1–365, otherwise there is no default', () => {
    assert.equal(trialDefaultDays('30'), 30);
    for (const bad of ['', '  ', '0', '366', '7.5', 'abc', '-3']) assert.equal(trialDefaultDays(bad), null, bad);
    delete process.env.COMPANY_TRIAL_DAYS;
    assert.equal(trialDefaultDays(), null, 'unset');
  });

  test('a chosen end day ends at its last UTC millisecond; impossible dates are rejected', () => {
    assert.equal(trialEndOfDay('2026-11-19')!.toISOString(), '2026-11-19T23:59:59.999Z');
    for (const bad of ['2026-02-30', '2026-13-01', '19-11-2026', '']) assert.equal(trialEndOfDay(bad), null, bad);
    assert.equal(defaultTrialEnd(new Date('2026-10-20T10:00:00Z'), 30).toISOString(), '2026-11-19T23:59:59.999Z');
  });

  test('expired = Trial and end passed; Active, platform-owner and future trials never expire', () => {
    const past = new Date(Date.now() - 1000);
    assert.equal(isTrialExpired({ subscriptionStatus: 'Trial', trialEndDate: past, isPlatformOwner: false }), true);
    assert.equal(isTrialExpired({ subscriptionStatus: 'Trial', trialEndDate: new Date(Date.now() + 60_000), isPlatformOwner: false }), false);
    assert.equal(isTrialExpired({ subscriptionStatus: 'Active', trialEndDate: past, isPlatformOwner: false }), false);
    assert.equal(isTrialExpired({ subscriptionStatus: 'Trial', trialEndDate: past, isPlatformOwner: true }), false);
  });
});

describe('Demo company registration', () => {
  test('a Demo company is created on a Trial (default length), with its Main Branch and no users', async () => {
    const pa = await platform();
    const before = await prisma.user.count();
    const { data: c }: any = await provisioning.create(pa, dto({ accountType: 'Demo' }));
    assert.equal(c.accountType, 'Demo');
    assert.equal(c.subscriptionStatus, 'Trial');
    assert.equal(c.plan, 'Free', 'never a paid plan');
    assert.equal(c.isPlatformOwner, false);
    assert.equal(new Date(c.trialEndDate).toISOString(), defaultTrialEnd(new Date(c.subscriptionStartDate), 30).toISOString());
    assert.ok(new Date(c.trialEndDate) > new Date(c.subscriptionStartDate));
    assert.equal(c.trialExpired, false);
    assert.deepEqual(c.branches.map((b: any) => b.name), ['Main Branch']);
    assert.equal(c._count.users, 0);
    assert.equal(await prisma.user.count(), before, 'no user created anywhere');
    const [ev] = await prisma.auditLog.findMany({ where: { entityType: 'Company', entityId: c.id } });
    assert.equal((ev.newValues as any).Company.subscriptionStatus, 'Trial');
  });

  test('the administrator may choose the trial end; it must be a real day after today', async () => {
    const pa = await platform();
    const { data: c }: any = await provisioning.create(pa, dto({ accountType: 'Demo', trialEndDate: daysFromNow(10) }));
    assert.equal(new Date(c.trialEndDate).toISOString(), `${daysFromNow(10)}T23:59:59.999Z`);
    const before = await prisma.company.count();
    await rejects(provisioning.create(pa, dto({ accountType: 'Demo', trialEndDate: daysFromNow(-1) })), 400, /after today/);
    await rejects(provisioning.create(pa, dto({ accountType: 'Demo', trialEndDate: '2026-02-30' })), 400, /not a valid date/);
    await rejects(provisioning.create(pa, dto({ trialEndDate: daysFromNow(10) })), 400, /only allowed for a Demo/);
    assert.equal(await prisma.company.count(), before);
  });

  test('without a server default the trial end must be chosen — no invented length', async () => {
    delete process.env.COMPANY_TRIAL_DAYS;
    const pa = await platform();
    await rejects(provisioning.create(pa, dto({ accountType: 'Demo' })), 400, /COMPANY_TRIAL_DAYS/);
    assert.equal((await provisioning.access(pa)).data.trialDefaultDays, null);
  });

  test('a Standard registration is unchanged (Active, no trial)', async () => {
    const { data: c }: any = await provisioning.create(await platform(), dto());
    assert.deepEqual([c.accountType, c.subscriptionStatus, c.trialEndDate, c.trialExpired], ['Standard', 'Active', null, false]);
  });

  test('the client can never choose the subscription, plan, platform-owner flag or id', async () => {
    for (const extra of [{ subscriptionStatus: 'Active' }, { plan: 'Enterprise' }, { isPlatformOwner: true }, { id: 'x' }, { trialStartDate: '2026-01-01' }]) {
      await assert.rejects(nexuscoreValidationPipe.transform({ name: 'X', slug: 'x-co', accountType: 'Demo', ...extra }, { type: 'body', metatype: CreateCompanyDto }), (e: any) => e?.getStatus?.() === 400);
    }
    await assert.rejects(nexuscoreValidationPipe.transform({ name: 'X', slug: 'x-co', accountType: 'Paid' }, { type: 'body', metatype: CreateCompanyDto }), (e: any) => e?.getStatus?.() === 400);
  });

  test('existing companies keep their subscription', async () => {
    const pa = await platform();
    const snapshot = await prisma.company.findUnique({ where: { id: pa.companyId } });
    await provisioning.create(pa, dto({ accountType: 'Demo' }));
    assert.deepEqual(await prisma.company.findUnique({ where: { id: pa.companyId } }), snapshot);
  });
});

describe('Create First Admin (the Users screen\'s creation, aimed at a new company)', () => {
  test('routes need companies:read / companies:invite-admin', () => {
    const reflector = new Reflector();
    const need = (name: string, m: string) => {
      const h = (CompaniesController.prototype as any)[name];
      return resolveRequiredPermissions(<T>(k: string) => reflector.getAllAndOverride<T>(k, [h, CompaniesController]), m);
    };
    assert.deepEqual((need('firstAdminStatus', 'GET') as any).permissions, [PROVISIONING_PERMISSIONS.read]);
    assert.deepEqual((need('createFirstAdmin', 'POST') as any).permissions, [PROVISIONING_PERMISSIONS.inviteAdmin]);
    assert.deepEqual((need('sendFirstAdminSetupLink', 'POST') as any).permissions, [PROVISIONING_PERMISSIONS.inviteAdmin]);
  });

  test('the form is the Users screen\'s: same fields and validation; company, branch and role cannot be sent', async () => {
    const v = (body: any) => nexuscoreValidationPipe.transform(body, { type: 'body', metatype: CreateFirstAdminDto });
    const ok: any = await v({ name: 'A', email: ' Ayesha@Acme.TEST ', password: 'Temp-Pass-123' });
    assert.equal(ok.email, 'ayesha@acme.test', 'stored the way sign-in looks it up');
    await assert.rejects(v({ name: 'A', email: 'a@b.co', password: '12345' }), (e: any) => /password must be longer than or equal to 6/.test(JSON.stringify(e.getResponse())), 'CreateUserDto MinLength(6)');
    await assert.rejects(v({ name: '', email: 'a@b.co', password: 'Temp-Pass-123' }), (e: any) => e.getStatus() === 400);
    await assert.rejects(v({ name: 'A', email: 'nope', password: 'Temp-Pass-123' }), (e: any) => e.getStatus() === 400);
    for (const extra of [{ companyId: 'x' }, { branchId: 'x' }, { roleId: 'x' }, { isActive: false }, { mustChangePassword: false }]) {
      await assert.rejects(v({ name: 'A', email: 'a@b.co', password: 'Temp-Pass-123', ...extra }), (e: any) => e.getStatus() === 400, JSON.stringify(extra));
    }
  });

  test('creates one Admin in the target company\'s Main Branch — no email — and they sign in with the temporary password, then must change it', async () => {
    const pa = await platform();
    const { data: company }: any = await provisioning.create(pa, dto({ accountType: 'Demo' }));
    mail.configured = false; // creation never needs SMTP
    const s0 = (await firstAdmin.status(pa, company.id)).data;
    assert.deepEqual([s0.status, s0.mainBranch?.name, s0.emailConfigured], ['not_configured', 'Main Branch', false]);

    const who = adminDto();
    const res: any = await firstAdmin.create(pa, company.id, who);
    assert.ok(!JSON.stringify(res).includes(who.password), 'the password is never returned');
    assert.ok(!('password' in res.data));
    assert.equal(mail.sent.length, 0, 'no email sent');

    const user = await prisma.user.findUniqueOrThrow({ where: { email: who.email }, include: { userRoles: { include: { role: true } }, company: true, branch: true } });
    assert.equal(user.companyId, company.id, 'in the target company, not the platform owner\'s');
    assert.notEqual(user.companyId, pa.companyId);
    assert.deepEqual([user.branchId, user.branch!.name], [company.branches[0].id, 'Main Branch']);
    assert.deepEqual(user.userRoles.map((r) => [r.role.name, r.role.isSystem]), [['Admin', true]]);
    assert.equal(user.company.isPlatformOwner, false);
    assert.deepEqual([user.mustChangePassword, user.isActive], [true, true]);
    assert.match(user.password, /^\$2[aby]\$10\$/, 'bcrypt, cost 10 — the Users screen\'s hashPassword');
    assert.ok(await bcrypt.compare(who.password, user.password));
    const [ev] = await prisma.auditLog.findMany({ where: { entityType: 'User', entityId: user.id } });
    assert.ok(ev && !JSON.stringify(ev).includes(who.password), 'audited without the password');
    assert.equal((await firstAdmin.status(pa, company.id)).data.status, 'awaiting_first_sign_in');

    // the Users screen's rule: the temporary password signs in, and the API demands a change first
    const session: any = await auth.login({ email: who.email, password: who.password } as any);
    assert.equal(session.user.companyId, company.id);
    assert.equal(session.user.company.slug, company.slug);
    assert.equal(session.user.mustChangePassword, true);
    await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } }); // = the user changed their password
    assert.equal((await firstAdmin.status(pa, company.id)).data.status, 'active');

    // Company isolation for the new admin
    const me: any = await strategy.validate({ sub: user.id, email: user.email, companyId: company.id } as any);
    assert.equal((await new CompanyService(prisma).getCompany(me.companyId)).data.id, company.id);
    await rejects(provisioning.list({ id: me.id, companyId: me.companyId }), 403, /platform owner/);
    await rejects(firstAdmin.create({ id: me.id, companyId: me.companyId }, company.id, adminDto()), 403, /platform owner/);
  });

  test('ordinary company administrators — here or in another company — cannot create users elsewhere', async () => {
    const pa = await platform();
    const { data: company }: any = await provisioning.create(pa, dto());
    const otherAdmin = await actor({ owner: false, actions: ['create', 'read', 'invite-admin'] });
    await rejects(firstAdmin.create(otherAdmin, company.id, adminDto()), 403, /platform owner/);
    await rejects(firstAdmin.status(otherAdmin, company.id), 403, /platform owner/);
    // and the Users screen itself keeps every creator inside their own company
    const users = new UsersService(prisma, new AuditService(prisma));
    await rejects(users.create({ ...adminDto(), companyId: company.id } as any, otherAdmin), 403, /your own company/);
    await rejects(users.create({ ...adminDto(), companyId: company.id } as any, pa), 403, /your own company/);
    await rejects(firstAdmin.create(pa, pa.companyId, adminDto()), 403, /manages its own users/);
    await rejects(firstAdmin.create(pa, '00000000-0000-0000-0000-000000000000', adminDto()), 404, /not found/);
    assert.equal(await prisma.user.count({ where: { companyId: company.id } }), 0);
  });

  test('a second creation, two at once, or a taken email never creates a second admin', async () => {
    const pa = await platform();
    const { data: company }: any = await provisioning.create(pa, dto());
    const taken = await prisma.user.findUniqueOrThrow({ where: { id: pa.id } });
    await rejects(firstAdmin.create(pa, company.id, adminDto({ email: taken.email.toUpperCase() })), 409, /Email already registered/);
    const results = await Promise.allSettled([firstAdmin.create(pa, company.id, adminDto()), firstAdmin.create(pa, company.id, adminDto())]);
    assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
    assert.equal(((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).getStatus(), 409);
    await rejects(firstAdmin.create(pa, company.id, adminDto()), 409, /already has users/);
    assert.equal(await prisma.user.count({ where: { companyId: company.id } }), 1);
  });

  test('a failure part-way through leaves no user behind', async () => {
    const pa = await platform();
    const { data: company }: any = await provisioning.create(pa, dto());
    // the audit event (same transaction) fails: its actor does not exist
    await assert.rejects(firstAdmin.create({ ...pa, id: '00000000-0000-0000-0000-000000000000' }, company.id, adminDto()));
    assert.equal(await prisma.user.count({ where: { companyId: company.id } }), 0);
  });

  test('optional set-password email: separate from creation, refused without SMTP, failure reported, link single-use', async () => {
    const pa = await platform();
    const { data: company }: any = await provisioning.create(pa, dto());
    await rejects(firstAdmin.sendSetupLink(pa, company.id), 409, /Create the first administrator first/);
    const who = adminDto();
    await firstAdmin.create(pa, company.id, who);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: who.email } });

    mail.configured = false;
    await rejects(firstAdmin.sendSetupLink(pa, company.id), 503, /EMAIL_NOT_CONFIGURED/);
    assert.equal(await prisma.passwordResetToken.count({ where: { userId: user.id } }), 0, 'nothing issued');

    mail.configured = true; mail.deliver = false;
    const failed: any = await firstAdmin.sendSetupLink(pa, company.id);
    assert.equal(failed.data.sent, false);
    assert.equal(await prisma.passwordResetToken.count({ where: { userId: user.id, used: false } }), 0, 'undelivered link unusable');
    assert.equal((await firstAdmin.status(pa, company.id)).data.setupLink!.status, 'expired');

    mail.deliver = true;
    const sent: any = await firstAdmin.sendSetupLink(pa, company.id);
    assert.equal(sent.data.sent, true);
    assert.equal(mail.sent.length, 1);
    assert.ok(!mail.sent[0].text.includes(who.password), 'no password in the email');
    const s = (await firstAdmin.status(pa, company.id)).data;
    assert.deepEqual([s.status, s.setupLink!.status], ['awaiting_first_sign_in', 'pending']);
    const token = tokenFrom(mail.sent[0].text);
    assert.ok((await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id, used: false } })).expiresAt.getTime() - Date.now() > inviteTtlMs() - 60_000);
    await resets.reset(token, 'Own-Password-9');
    await rejects(resets.reset(token, 'Again-Password-9'), 400, /Invalid or expired/);
    assert.equal((await firstAdmin.status(pa, company.id)).data.status, 'active');
    await rejects(firstAdmin.sendSetupLink(pa, company.id), 409, /already set their own password/);
  });

  test('an expired set-password link is rejected', async () => {
    const pa = await platform();
    const { data: company }: any = await provisioning.create(pa, dto());
    const who = adminDto();
    await firstAdmin.create(pa, company.id, who);
    await firstAdmin.sendSetupLink(pa, company.id);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: who.email } });
    await prisma.passwordResetToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await firstAdmin.status(pa, company.id)).data.setupLink!.status, 'expired');
    await rejects(resets.reset(tokenFrom(mail.sent[0].text), 'Own-Password-9'), 400, /Invalid or expired/);
  });
});

describe('Trial lifecycle', () => {
  test('after the trial ends its users cannot sign in, refresh or call the API — and nothing is deleted', async () => {
    const pa = await platform();
    const { data: company }: any = await provisioning.create(pa, dto({ accountType: 'Demo' }));
    const who = adminDto();
    await firstAdmin.create(pa, company.id, who);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: who.email } });
    const session: any = await auth.login({ email: who.email, password: who.password } as any);

    await prisma.company.update({ where: { id: company.id }, data: { trialEndDate: new Date(Date.now() - 1000) } }); // the trial ends
    const counts = async () => Promise.all([prisma.company.count({ where: { id: company.id } }), prisma.branch.count({ where: { companyId: company.id } }), prisma.user.count({ where: { companyId: company.id } })]);
    const before = await counts();
    await rejects(auth.login({ email: who.email, password: who.password } as any), 403, /TRIAL_EXPIRED/);
    await rejects(auth.refresh(session.refreshToken), 403, /TRIAL_EXPIRED/);
    await rejects(strategy.validate({ sub: user.id, email: user.email, companyId: company.id } as any), 403, /trial ended on/);
    assert.deepEqual(await counts(), before, 'company, branch and user are kept');

    const { data: shown }: any = await provisioning.get(pa, company.id);
    assert.deepEqual([shown.subscriptionStatus, shown.trialExpired, shown.plan], ['Trial', true, 'Free'], 'still Trial — never silently converted');
    const paUser = await prisma.user.findUniqueOrThrow({ where: { id: pa.id } });
    assert.equal(((await strategy.validate({ sub: paUser.id, email: paUser.email, companyId: pa.companyId } as any)) as any).id, pa.id, 'the platform administrator is unaffected');
  });
});

describe('No password leaves the server', () => {
  test('neither the temporary password nor its hash appears in any read of the company or its users', async () => {
    const pa = await platform();
    const { data: company }: any = await provisioning.create(pa, dto());
    const who = adminDto({ password: 'Unique-Temp-Pw-77' });
    const created: any = await firstAdmin.create(pa, company.id, who);
    const hash = (await prisma.user.findUniqueOrThrow({ where: { email: who.email } })).password;
    const users = new UsersService(prisma, new AuditService(prisma));
    const reads = [
      created,
      await firstAdmin.status(pa, company.id),
      await provisioning.get(pa, company.id),
      await provisioning.list(pa),
      await new CompanyService(prisma).getCompany(company.id),
      await users.findAll(company.id),
    ];
    for (const r of reads) {
      const text = JSON.stringify(r);
      assert.ok(!text.includes(who.password), 'temporary password');
      assert.ok(!text.includes(hash), 'password hash');
      assert.ok(!/"password"\s*:/.test(text), 'no password field');
    }
    assert.equal(mail.sent.length, 0, 'no email sent');
  });
});
