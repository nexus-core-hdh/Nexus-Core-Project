import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { uniqueCompanySlug } from '../src/common/company-slug';

const prisma = new PrismaClient();

// Initial administrator. There is no built-in default password: SEED_ADMIN_PASSWORD is used when
// set, otherwise a random one is generated and printed once. Either way the account must change
// its password at first sign-in (mustChangePassword, enforced server-side). An existing admin
// account is never modified by re-running the seed.
const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || 'admin@nexuscore.io').trim().toLowerCase();
const MIN_ADMIN_PASSWORD = 12;

function initialAdminPassword(): { password: string; generated: boolean } {
  const fromEnv = process.env.SEED_ADMIN_PASSWORD;
  if (fromEnv) {
    if (fromEnv.length < MIN_ADMIN_PASSWORD) {
      throw new Error(`SEED_ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD} characters`);
    }
    return { password: fromEnv, generated: false };
  }
  return { password: randomBytes(18).toString('base64url'), generated: true };
}

async function main() {
  console.log('🌱 Seeding NexusCore database...');

  // ── Company ───────────────────────────────────────────────────────────────────
  // The platform owner (Nexus Core): it manages the other companies and their billing, so it is
  // never on a trial or subscription limit itself — Enterprise, Active, no trial/subscription end
  // and no billing cycle. Those fields are enforced on every run (not only on create), so the
  // owner can never drift back to the Free/trial defaults; its name is left as-is once created.
  const platformOwner = {
    isPlatformOwner: true,
    plan: 'Enterprise' as const,
    subscriptionStatus: 'Active' as const,
    trialEndDate: null,
    subscriptionEndDate: null,
    billingCycle: null,
  };
  const company = await prisma.company.upsert({
    where: { id: 'seed-company-id-001' },
    create: {
      id: 'seed-company-id-001',
      name: process.env.SEED_COMPANY_NAME || 'Nexus Core',
      subscriptionStartDate: new Date(),
      ...platformOwner,
    },
    update: platformOwner,
  });
  // Every company has a URL slug (`/nexus-core/default`); set once, kept stable afterwards.
  if (!company.slug) {
    company.slug = await uniqueCompanySlug(
      process.env.SEED_COMPANY_SLUG || company.name,
      async (slug) => !!(await prisma.company.findFirst({ where: { slug, id: { not: company.id } }, select: { id: true } })),
    );
    await prisma.company.update({ where: { id: company.id }, data: { slug: company.slug } });
  }
  console.log(`✓ Company: ${company.name} (/${company.slug})`);

  // ── Branch ────────────────────────────────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch-id-001' },
    create: { id: 'seed-branch-id-001', companyId: company.id, name: process.env.SEED_BRANCH_NAME || 'Main Branch' },
    update: {},
  });
  console.log(`✓ Branch: ${branch.name}`);

  // ── Admin User ────────────────────────────────────────────────────────────────
  let generatedAdminPassword: string | null = null;
  let admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (admin) {
    console.log(`✓ Admin user: ${admin.email} (already exists — password unchanged)`);
  } else {
    const initial = initialAdminPassword();
    admin = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        name: 'Admin',
        password: await bcrypt.hash(initial.password, 10),
        mustChangePassword: true,
        companyId: company.id,
        branchId: branch.id,
      },
    });
    if (initial.generated) generatedAdminPassword = initial.password;
    console.log(`✓ Admin user: ${admin.email} (created — must change password at first sign-in)`);
  }

  // ── Permissions ───────────────────────────────────────────────────────────────
  const permissionDefs = [
    // Cutting
    { module: 'cutting', action: 'read', description: 'View cutting orders' },
    { module: 'cutting', action: 'create', description: 'Create cutting orders' },
    { module: 'cutting', action: 'update', description: 'Update cutting orders' },
    { module: 'cutting', action: 'delete', description: 'Delete cutting orders' },
    { module: 'cutting', action: 'approve', description: 'Approve/reject cutting orders' },
    // Fabric
    { module: 'fabric', action: 'read', description: 'View fabric inventory' },
    { module: 'fabric', action: 'create', description: 'Add fabric types/rolls' },
    { module: 'fabric', action: 'update', description: 'Update fabric data' },
    { module: 'fabric', action: 'delete', description: 'Delete fabric records' },
    // BPM
    { module: 'bpm', action: 'read', description: 'View BPM tasks' },
    { module: 'bpm', action: 'update', description: 'Move/update BPM tasks' },
    { module: 'bpm', action: 'manage', description: 'Manage BPM processes' },
    // Users
    { module: 'users', action: 'read', description: 'View users' },
    { module: 'users', action: 'create', description: 'Create users' },
    { module: 'users', action: 'update', description: 'Update users' },
    { module: 'users', action: 'delete', description: 'Delete users' },
    // Roles
    { module: 'roles', action: 'read', description: 'View roles' },
    { module: 'roles', action: 'manage', description: 'Manage roles and permissions' },
    // Reports
    { module: 'reports', action: 'read', description: 'View reports' },
    { module: 'reports', action: 'export', description: 'Export reports' },
    // WhatsApp
    { module: 'whatsapp', action: 'send', description: 'Send WhatsApp messages' },
    { module: 'whatsapp', action: 'configure', description: 'Configure WhatsApp' },
    // General Settings -> Screen Parameters
    { module: 'general-settings', action: 'manage-screen-parameters', description: 'Manage Screen Parameters configuration' },
  ];

  for (const p of permissionDefs) {
    await prisma.permission.upsert({
      where: { module_action: { module: p.module, action: p.action } },
      create: p,
      update: { description: p.description },
    });
  }
  console.log(`✓ Seeded ${permissionDefs.length} permissions`);

  // ── Admin Role ────────────────────────────────────────────────────────────────
  const allPermissions = await prisma.permission.findMany();

  const adminRole = await prisma.role.upsert({
    where: { id: 'seed-admin-role-001' },
    create: {
      id: 'seed-admin-role-001',
      name: 'Admin',
      description: 'Full access',
      isSystem: true,
      permissions: {
        create: allPermissions.map((p) => ({ permissionId: p.id })),
      },
    },
    update: {},
  });
  // Keep Admin's permission set in sync with `permissionDefs` above on every seed run, not just
  // on first creation — the `update: {}` on the upsert above intentionally leaves an EXISTING
  // Admin role's other fields untouched, but that also meant a permission added to permissionDefs
  // after Admin already existed (e.g. general-settings:manage-screen-parameters) never actually
  // reached the Admin role: re-seeding created the new Permission row but had no code path that
  // granted it to Admin. `createMany ... skipDuplicates` only adds what's missing, so this is
  // safe to run every time and never touches non-Admin roles' own grants.
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  console.log(`✓ Role: ${adminRole.name} (${allPermissions.length} permissions synced)`);

  // Assign admin role to admin user
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    create: { userId: admin.id, roleId: adminRole.id },
    update: {},
  });
  console.log(`✓ Admin role assigned to ${admin.email}`);

  // ── Legacy ERP company / workplace ────────────────────────────────────────────
  // Every legacy-erp INSERT writes CompanyId = 1, WorkplaceId = 1 (e.g. work-order.service.ts
  // `VALUES (1, 1, ...)`), and 166 / 138 legacy foreign keys point at MD_Company / MD_Workplace, so
  // a fresh database needs exactly these two rows before any legacy screen can save. Inserted only
  // when missing; the RecId sequences are then moved past the highest id.
  await prisma.$executeRawUnsafe(`
    INSERT INTO "MD_Company" ("RecId", "CompanyCode", "CompanyName", "InUse", "InsertedAt", "IsDeleted", "UUID")
    SELECT 1, 'C001', $1, 1, now(), 0, gen_random_uuid()
    WHERE NOT EXISTS (SELECT 1 FROM "MD_Company" WHERE "RecId" = 1)`, company.name);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "MD_Workplace" ("RecId", "CompanyId", "WorkplaceCode", "WorkplaceName", "InUse", "InsertedAt", "IsDeleted", "UUID")
    SELECT 1, 1, 'W001', $1, 1, now(), 0, gen_random_uuid()
    WHERE NOT EXISTS (SELECT 1 FROM "MD_Workplace" WHERE "RecId" = 1)`, process.env.SEED_WORKPLACE_NAME || 'Main Workplace');
  for (const table of ['MD_Company', 'MD_Workplace']) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'RecId'), GREATEST((SELECT MAX("RecId") FROM "${table}"), 1))`,
    );
  }
  console.log('✓ Legacy ERP company/workplace (RecId 1)');

  // ── BPM Processes ─────────────────────────────────────────────────────────────
  const processes = [
    {
      id: 'seed-bpm-process-cutting',
      name: 'Cutting Order Flow',
      module: 'cutting',
      stages: [
        { name: 'Draft', sequence: 1, color: '#94a3b8' },
        { name: 'Pending Approval', sequence: 2, color: '#f59e0b' },
        { name: 'Approved', sequence: 3, color: '#3b82f6' },
        { name: 'In Progress', sequence: 4, color: '#8b5cf6' },
        { name: 'Quality Check', sequence: 5, color: '#ec4899' },
        { name: 'Completed', sequence: 6, color: '#22c55e', isTerminal: true },
        { name: 'Cancelled', sequence: 7, color: '#ef4444', isTerminal: true },
      ],
    },
    {
      id: 'seed-bpm-process-fabric',
      name: 'Fabric Request Flow',
      module: 'fabric',
      stages: [
        { name: 'Requested', sequence: 1, color: '#94a3b8' },
        { name: 'Sourcing', sequence: 2, color: '#f59e0b' },
        { name: 'Received', sequence: 3, color: '#3b82f6' },
        { name: 'Quality Check', sequence: 4, color: '#ec4899' },
        { name: 'Available', sequence: 5, color: '#22c55e', isTerminal: true },
      ],
    },
    {
      id: 'seed-bpm-process-wa',
      name: 'WhatsApp Config Flow',
      module: 'whatsapp',
      stages: [
        { name: 'Pending Setup', sequence: 1, color: '#94a3b8' },
        { name: 'Meta Auth', sequence: 2, color: '#f59e0b' },
        { name: 'Verified', sequence: 3, color: '#3b82f6' },
        { name: 'Active', sequence: 4, color: '#22c55e', isTerminal: true },
      ],
    },
  ];

  for (const p of processes) {
    const exists = await prisma.bpmProcess.findFirst({ where: { name: p.name } });
    if (!exists) {
      await prisma.bpmProcess.create({
        data: {
          name: p.name,
          module: p.module,
          stages: { create: p.stages },
        },
      });
      console.log(`✓ BPM process seeded: ${p.name}`);
    }
  }

  // ── Fabric Types ─────────────────────────────────────────────────────────────
  const fabricTypes = [
    { name: 'Cotton', weightGsm: 180, waterPerMeter: 2.5, carbonFactor: 0.003 },
    { name: 'Polyester', weightGsm: 120, waterPerMeter: 0.5, carbonFactor: 0.005 },
    { name: 'Denim', weightGsm: 350, waterPerMeter: 4.0, carbonFactor: 0.008 },
    { name: 'Linen', weightGsm: 200, waterPerMeter: 1.8, carbonFactor: 0.002 },
  ];

  for (const ft of fabricTypes) {
    await prisma.fabricType.upsert({
      where: { id: `seed-ft-${ft.name.toLowerCase()}` },
      create: { id: `seed-ft-${ft.name.toLowerCase()}`, ...ft },
      update: {},
    });
  }
  console.log(`✓ Seeded ${fabricTypes.length} fabric types`);

  // ── Shifts ────────────────────────────────────────────────────────────────────
  const shifts = [
    { id: 'seed-shift-morning', name: 'Morning', startTime: '06:00', endTime: '14:00' },
    { id: 'seed-shift-afternoon', name: 'Afternoon', startTime: '14:00', endTime: '22:00' },
    { id: 'seed-shift-night', name: 'Night', startTime: '22:00', endTime: '06:00' },
  ];
  for (const s of shifts) {
    await prisma.shift.upsert({ where: { id: s.id }, create: s, update: {} });
  }
  console.log(`✓ Seeded ${shifts.length} shifts`);

  // ── PLM BPM Processes ─────────────────────────────────────────────────────────
  const plmProcesses = [
    {
      name: 'Style Card Lifecycle',
      module: 'plm_style_cards',
      stages: [
        { name: 'Concept', sequence: 1, color: '#94a3b8' },
        { name: 'Design', sequence: 2, color: '#6366f1' },
        { name: 'Mood Board Review', sequence: 3, color: '#8b5cf6' },
        { name: 'Tech Pack', sequence: 4, color: '#3b82f6' },
        { name: 'Sampling', sequence: 5, color: '#f59e0b' },
        { name: 'Sample Review', sequence: 6, color: '#ec4899' },
        { name: 'Approved', sequence: 7, color: '#22c55e' },
        { name: 'Production', sequence: 8, color: '#10b981' },
        { name: 'Discontinued', sequence: 9, color: '#ef4444', isTerminal: true },
      ],
    },
    {
      name: 'Sample Card Flow',
      module: 'plm_sample_cards',
      stages: [
        { name: 'Draft', sequence: 1, color: '#94a3b8' },
        { name: 'Submitted', sequence: 2, color: '#6366f1' },
        { name: 'In Review', sequence: 3, color: '#f59e0b' },
        { name: 'Fit Trial', sequence: 4, color: '#8b5cf6' },
        { name: 'Revision', sequence: 5, color: '#3b82f6' },
        { name: 'Approved', sequence: 6, color: '#22c55e' },
        { name: 'Rejected', sequence: 7, color: '#ef4444', isTerminal: true },
        { name: 'Cancelled', sequence: 8, color: '#6b7280', isTerminal: true },
      ],
    },
    {
      name: 'PLM Order Flow',
      module: 'plm_orders',
      stages: [
        { name: 'Pending', sequence: 1, color: '#94a3b8' },
        { name: 'Confirmed', sequence: 2, color: '#6366f1' },
        { name: 'Cutting', sequence: 3, color: '#f59e0b' },
        { name: 'Sewing', sequence: 4, color: '#8b5cf6' },
        { name: 'Finishing', sequence: 5, color: '#3b82f6' },
        { name: 'QC', sequence: 6, color: '#ec4899' },
        { name: 'Shipped', sequence: 7, color: '#10b981' },
        { name: 'Delivered', sequence: 8, color: '#22c55e', isTerminal: true },
        { name: 'Cancelled', sequence: 9, color: '#ef4444', isTerminal: true },
      ],
    },
    {
      name: 'PLM Task Flow',
      module: 'plm_tasks',
      stages: [
        { name: 'Pending', sequence: 1, color: '#94a3b8' },
        { name: 'In Progress', sequence: 2, color: '#3b82f6' },
        { name: 'Review', sequence: 3, color: '#f59e0b' },
        { name: 'Completed', sequence: 4, color: '#22c55e', isTerminal: true },
        { name: 'Delayed', sequence: 5, color: '#ef4444' },
        { name: 'Cancelled', sequence: 6, color: '#6b7280', isTerminal: true },
      ],
    },
  ];

  for (const p of plmProcesses) {
    const exists = await prisma.bpmProcess.findFirst({ where: { name: p.name } });
    if (!exists) {
      await prisma.bpmProcess.create({ data: { name: p.name, module: p.module, stages: { create: p.stages } } });
      console.log(`✓ PLM BPM process: ${p.name}`);
    }
  }

  // ── PLM Style Sample Types ────────────────────────────────────────────────────
  const sampleTypes = [
    { name: 'Proto', code: 'PROTO', sequence: 1 },
    { name: 'Fit', code: 'FIT', sequence: 2 },
    { name: 'Salesman', code: 'SMS', sequence: 3 },
    { name: 'Pre-Production', code: 'PP', sequence: 4 },
    { name: 'Top of Production', code: 'TOP', sequence: 5 },
    { name: 'Sealed', code: 'SLD', sequence: 6 },
  ];
  for (const st of sampleTypes) {
    await prisma.styleSampleType.upsert({ where: { code: st.code }, create: st, update: {} });
  }
  console.log(`✓ Seeded ${sampleTypes.length} style sample types`);

  // ── PLM Design Detail Types ───────────────────────────────────────────────────
  const designDetailTypes = [
    'Collar', 'Pocket', 'Sleeve', 'Hem', 'Cuff',
    'Button', 'Zipper', 'Lining', 'Embroidery', 'Print',
  ];
  for (const name of designDetailTypes) {
    const existing = await prisma.designDetailType.findFirst({ where: { name } });
    if (!existing) await prisma.designDetailType.create({ data: { name } });
  }
  console.log(`✓ Seeded ${designDetailTypes.length} design detail types`);

  // ── PLM Measurement Definitions ───────────────────────────────────────────────
  const measurementDefs = [
    { name: 'Chest', code: 'CHEST', bodyPart: 'torso', sequence: 1 },
    { name: 'Waist', code: 'WAIST', bodyPart: 'torso', sequence: 2 },
    { name: 'Hip', code: 'HIP', bodyPart: 'torso', sequence: 3 },
    { name: 'Shoulder', code: 'SHLDR', bodyPart: 'upper', sequence: 4 },
    { name: 'Sleeve Length', code: 'SLV_LEN', bodyPart: 'arm', sequence: 5 },
    { name: 'Body Length', code: 'BODY_LEN', bodyPart: 'torso', sequence: 6 },
    { name: 'Neck', code: 'NECK', bodyPart: 'upper', sequence: 7 },
    { name: 'Inseam', code: 'INSEAM', bodyPart: 'leg', sequence: 8 },
    { name: 'Thigh', code: 'THIGH', bodyPart: 'leg', sequence: 9 },
    { name: 'Knee', code: 'KNEE', bodyPart: 'leg', sequence: 10 },
  ];
  for (const md of measurementDefs) {
    await prisma.measurementDefinition.upsert({ where: { code: md.code }, create: md, update: {} });
  }
  console.log(`✓ Seeded ${measurementDefs.length} measurement definitions`);

  // ── PLM Season/Gender Cards ─────────────────────────────────────────────────
  // code === name === the exact strings general-tab.tsx's old SEASONS/GENDERS constants used to
  // write into StyleCard.season/.gender, so every existing StyleCard row keeps resolving without
  // a data migration once those fields become master-bound pickers.
  const seasons = ['SS25', 'AW25', 'SS26', 'AW26', 'Resort', 'Pre-Fall'];
  for (const s of seasons) {
    await prisma.seasonCard.upsert({ where: { code: s }, create: { code: s, name: s, branchId: branch.id }, update: {} });
  }
  console.log(`✓ Seeded ${seasons.length} season cards`);

  const genders = ['men', 'women', 'unisex', 'kids', 'infant'];
  for (const g of genders) {
    await prisma.genderCard.upsert({ where: { code: g }, create: { code: g, name: g, branchId: branch.id }, update: {} });
  }
  console.log(`✓ Seeded ${genders.length} gender cards`);

  // ── PLM Size Cards ───────────────────────────────────────────────────────────
  const sizes = [
    { code: 'XS', name: 'Extra Small', sequence: 1 },
    { code: 'S', name: 'Small', sequence: 2 },
    { code: 'M', name: 'Medium', sequence: 3 },
    { code: 'L', name: 'Large', sequence: 4 },
    { code: 'XL', name: 'Extra Large', sequence: 5 },
    { code: 'XXL', name: '2X Large', sequence: 6 },
  ];
  for (const s of sizes) {
    await prisma.sizeCard.upsert({ where: { code: s.code }, create: { ...s, branchId: branch.id }, update: {} });
  }
  console.log(`✓ Seeded ${sizes.length} size cards`);

  // ── Document Type Cards ───────────────────────────────────────────────────────
  const docTypeCardDefs = [
    // Design
    { id: 'dtc-tpc',      code: 'TPC',      name: 'Tech Pack',                    category: 'design',     requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf','xlsx','docx'] },
    { id: 'dtc-dsketch',  code: 'DSKETCH',  name: 'Design Sketch',                category: 'design',     requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf','jpg','png','ai'] },
    { id: 'dtc-colb',     code: 'COLB',     name: 'Colorway Board',               category: 'design',     requiresApproval: false, expiryDays: null as number|null, allowedFormats: ['pdf','jpg','png'] },
    { id: 'dtc-mood',     code: 'MOOD',     name: 'Mood Board',                   category: 'design',     requiresApproval: false, expiryDays: null as number|null, allowedFormats: ['pdf','jpg','png'] },
    { id: 'dtc-fswref',   code: 'FSWREF',   name: 'Fabric Swatch Reference',      category: 'design',     requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf','jpg','png'] },
    // Sample
    { id: 'dtc-prsrpt',   code: 'PRSRPT',  name: 'Proto Sample Report',          category: 'sample',     requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf','docx'] },
    { id: 'dtc-fitsrpt',  code: 'FITSRPT', name: 'Fit Sample Report',            category: 'sample',     requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf','docx'] },
    { id: 'dtc-smsrpt',   code: 'SMSRPT',  name: 'Salesman Sample Report',       category: 'sample',     requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf','docx'] },
    { id: 'dtc-ppsrpt',   code: 'PPSRPT',  name: 'Pre-Production Sample Report', category: 'sample',     requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf','docx'] },
    { id: 'dtc-topsrpt',  code: 'TOPSRPT', name: 'Top of Production Report',     category: 'sample',     requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf','docx'] },
    // Material
    { id: 'dtc-fabtest',  code: 'FABTEST', name: 'Fabric Test Report',           category: 'material',   requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf'] },
    { id: 'dtc-trimap',   code: 'TRIMAP',  name: 'Trim Approval Sheet',          category: 'material',   requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf','jpg'] },
    { id: 'dtc-labdip',   code: 'LABDIP',  name: 'Lab Dip Approval',             category: 'material',   requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf','jpg'] },
    { id: 'dtc-stroff',   code: 'STROFF',  name: 'Strike Off Approval',          category: 'material',   requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf','jpg'] },
    { id: 'dtc-yrntest',  code: 'YRNTEST', name: 'Yarn Test Certificate',        category: 'material',   requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf'] },
    // Compliance
    { id: 'dtc-oekotex',  code: 'OEKOTEX', name: 'OEKO-TEX Certificate',         category: 'compliance', requiresApproval: true,  expiryDays: 365,                 allowedFormats: ['pdf'] },
    { id: 'dtc-gots',     code: 'GOTS',    name: 'GOTS Certificate',             category: 'compliance', requiresApproval: true,  expiryDays: 365,                 allowedFormats: ['pdf'] },
    { id: 'dtc-socaud',   code: 'SOCAUD',  name: 'Social Audit Report',          category: 'compliance', requiresApproval: true,  expiryDays: 730,                 allowedFormats: ['pdf'] },
    { id: 'dtc-factcomp', code: 'FACTCOMP',name: 'Factory Compliance Report',    category: 'compliance', requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf'] },
    { id: 'dtc-chemtest', code: 'CHEMTEST',name: 'Chemical Test Report',         category: 'compliance', requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf'] },
    // Commercial
    { id: 'dtc-cominv',   code: 'COMINV',  name: 'Commercial Invoice',           category: 'commercial', requiresApproval: false, expiryDays: null as number|null, allowedFormats: ['pdf'] },
    { id: 'dtc-pklist',   code: 'PKLIST',  name: 'Packing List',                 category: 'commercial', requiresApproval: false, expiryDays: null as number|null, allowedFormats: ['pdf','xlsx'] },
    { id: 'dtc-bol',      code: 'BOL',     name: 'Bill of Lading',               category: 'commercial', requiresApproval: false, expiryDays: null as number|null, allowedFormats: ['pdf'] },
    { id: 'dtc-coo',      code: 'COO',     name: 'Certificate of Origin',        category: 'commercial', requiresApproval: false, expiryDays: null as number|null, allowedFormats: ['pdf'] },
    { id: 'dtc-bpoord',   code: 'BPOORD',  name: 'Buyer Purchase Order',         category: 'commercial', requiresApproval: false, expiryDays: null as number|null, allowedFormats: ['pdf','xlsx'] },
    // Quality
    { id: 'dtc-aqlinsp',  code: 'AQLINSP',  name: 'AQL Inspection Report',        category: 'quality',  requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf','xlsx'] },
    { id: 'dtc-finalinsp',code: 'FINALINSP',name: 'Final Inspection Certificate', category: 'quality',  requiresApproval: true,  expiryDays: null as number|null, allowedFormats: ['pdf'] },
  ];

  for (const dtc of docTypeCardDefs) {
    await (prisma as any).documentTypeCard.upsert({
      where: { code: dtc.code },
      create: { ...dtc, branchId: branch.id, maxSizeMb: 10, isActive: true },
      update: {},
    });
  }
  console.log(`✓ Seeded ${docTypeCardDefs.length} document type cards`);

  // ── Docket Templates ──────────────────────────────────────────────────────────
  type TplItem = { documentTypeCardId: string; isRequired: boolean; sequence: number; approvalRequired: boolean; defaultDueDays: number };
  const docketTemplateDefs: { code: string; name: string; entityType: string; isDefault: boolean; items: TplItem[] }[] = [
    {
      code: 'STYLE_CARD', name: 'Style Card Docket', entityType: 'style_card', isDefault: true,
      items: [
        { documentTypeCardId: 'dtc-tpc',      isRequired: true,  sequence: 1, approvalRequired: true,  defaultDueDays: 14 },
        { documentTypeCardId: 'dtc-dsketch',  isRequired: true,  sequence: 2, approvalRequired: true,  defaultDueDays: 7  },
        { documentTypeCardId: 'dtc-colb',     isRequired: true,  sequence: 3, approvalRequired: false, defaultDueDays: 7  },
        { documentTypeCardId: 'dtc-mood',     isRequired: false, sequence: 4, approvalRequired: false, defaultDueDays: 7  },
        { documentTypeCardId: 'dtc-fswref',   isRequired: true,  sequence: 5, approvalRequired: true,  defaultDueDays: 10 },
      ],
    },
    {
      code: 'SAMPLE_CARD', name: 'Sample Card Docket', entityType: 'sample_card', isDefault: true,
      items: [
        { documentTypeCardId: 'dtc-prsrpt',  isRequired: true,  sequence: 1, approvalRequired: true,  defaultDueDays: 7  },
        { documentTypeCardId: 'dtc-fitsrpt', isRequired: true,  sequence: 2, approvalRequired: true,  defaultDueDays: 7  },
        { documentTypeCardId: 'dtc-fabtest', isRequired: true,  sequence: 3, approvalRequired: true,  defaultDueDays: 14 },
        { documentTypeCardId: 'dtc-trimap',  isRequired: true,  sequence: 4, approvalRequired: true,  defaultDueDays: 10 },
        { documentTypeCardId: 'dtc-labdip',  isRequired: false, sequence: 5, approvalRequired: true,  defaultDueDays: 10 },
      ],
    },
    {
      code: 'PRODUCT_CARD', name: 'Product Card Docket', entityType: 'product_card', isDefault: true,
      items: [
        { documentTypeCardId: 'dtc-tpc',       isRequired: true,  sequence: 1, approvalRequired: true,  defaultDueDays: 14 },
        { documentTypeCardId: 'dtc-oekotex',   isRequired: false, sequence: 2, approvalRequired: true,  defaultDueDays: 30 },
        { documentTypeCardId: 'dtc-gots',      isRequired: false, sequence: 3, approvalRequired: true,  defaultDueDays: 30 },
        { documentTypeCardId: 'dtc-aqlinsp',   isRequired: true,  sequence: 4, approvalRequired: true,  defaultDueDays: 14 },
        { documentTypeCardId: 'dtc-finalinsp', isRequired: true,  sequence: 5, approvalRequired: true,  defaultDueDays: 14 },
      ],
    },
    {
      code: 'ORDER_LOCAL', name: 'Local Order Docket', entityType: 'plm_order', isDefault: false,
      items: [
        { documentTypeCardId: 'dtc-cominv',   isRequired: true,  sequence: 1, approvalRequired: false, defaultDueDays: 3  },
        { documentTypeCardId: 'dtc-pklist',   isRequired: true,  sequence: 2, approvalRequired: false, defaultDueDays: 3  },
        { documentTypeCardId: 'dtc-aqlinsp',  isRequired: true,  sequence: 3, approvalRequired: true,  defaultDueDays: 7  },
        { documentTypeCardId: 'dtc-finalinsp',isRequired: true,  sequence: 4, approvalRequired: true,  defaultDueDays: 7  },
      ],
    },
    {
      code: 'ORDER_EXPORT', name: 'Export Order Docket', entityType: 'plm_order', isDefault: true,
      items: [
        { documentTypeCardId: 'dtc-cominv',   isRequired: true,  sequence: 1, approvalRequired: false, defaultDueDays: 3  },
        { documentTypeCardId: 'dtc-pklist',   isRequired: true,  sequence: 2, approvalRequired: false, defaultDueDays: 3  },
        { documentTypeCardId: 'dtc-bol',      isRequired: true,  sequence: 3, approvalRequired: false, defaultDueDays: 5  },
        { documentTypeCardId: 'dtc-coo',      isRequired: true,  sequence: 4, approvalRequired: false, defaultDueDays: 5  },
        { documentTypeCardId: 'dtc-bpoord',   isRequired: true,  sequence: 5, approvalRequired: false, defaultDueDays: 2  },
        { documentTypeCardId: 'dtc-oekotex',  isRequired: false, sequence: 6, approvalRequired: true,  defaultDueDays: 30 },
        { documentTypeCardId: 'dtc-aqlinsp',  isRequired: true,  sequence: 7, approvalRequired: true,  defaultDueDays: 7  },
        { documentTypeCardId: 'dtc-finalinsp',isRequired: true,  sequence: 8, approvalRequired: true,  defaultDueDays: 7  },
      ],
    },
    {
      code: 'STYLE_FULL', name: 'Full Style Development Docket', entityType: 'style_card', isDefault: false,
      items: [
        { documentTypeCardId: 'dtc-tpc',     isRequired: true,  sequence: 1,  approvalRequired: true,  defaultDueDays: 14 },
        { documentTypeCardId: 'dtc-dsketch', isRequired: true,  sequence: 2,  approvalRequired: true,  defaultDueDays: 7  },
        { documentTypeCardId: 'dtc-colb',    isRequired: true,  sequence: 3,  approvalRequired: false, defaultDueDays: 7  },
        { documentTypeCardId: 'dtc-mood',    isRequired: true,  sequence: 4,  approvalRequired: false, defaultDueDays: 7  },
        { documentTypeCardId: 'dtc-fswref',  isRequired: true,  sequence: 5,  approvalRequired: true,  defaultDueDays: 10 },
        { documentTypeCardId: 'dtc-prsrpt',  isRequired: true,  sequence: 6,  approvalRequired: true,  defaultDueDays: 7  },
        { documentTypeCardId: 'dtc-fitsrpt', isRequired: true,  sequence: 7,  approvalRequired: true,  defaultDueDays: 7  },
        { documentTypeCardId: 'dtc-fabtest', isRequired: true,  sequence: 8,  approvalRequired: true,  defaultDueDays: 14 },
        { documentTypeCardId: 'dtc-trimap',  isRequired: true,  sequence: 9,  approvalRequired: true,  defaultDueDays: 10 },
        { documentTypeCardId: 'dtc-oekotex', isRequired: false, sequence: 10, approvalRequired: true,  defaultDueDays: 30 },
      ],
    },
  ];

  for (const tpl of docketTemplateDefs) {
    const existing = await (prisma as any).docketTemplate.findFirst({ where: { code: tpl.code } });
    if (!existing) {
      await (prisma as any).docketTemplate.create({
        data: {
          code: tpl.code,
          name: tpl.name,
          entityType: tpl.entityType,
          isDefault: tpl.isDefault,
          isActive: true,
          branchId: branch.id,
          createdBy: admin.id,
          items: { create: tpl.items },
        },
      });
      console.log(`✓ Docket template seeded: ${tpl.name}`);
    }
  }

  // ── Menu Items ────────────────────────────────────────────────────────────────
  // "Already seeded" = this menu's own first root entry exists. Not `count() === 0`: migration
  // 20260922000000_audit_log_lifecycle_fields inserts its own "Log Tracking" item, so on a fresh
  // database the count is never 0 and the whole base menu used to be skipped.
  const existingMenus = await prisma.menuItem.count();
  const baseMenuSeeded = await prisma.menuItem.findFirst({ where: { href: '/default', parentId: null }, select: { id: true } });
  if (!baseMenuSeeded) {
    type MenuNode = { title: string; href: string; icon?: string; isComing?: boolean; isNew?: boolean; isDataBadge?: string; newTab?: boolean; items?: MenuNode[] };
    type MenuGroup = { title: string; items: MenuNode[] };

    const menuGroups: MenuGroup[] = [
      {
        title: 'Dashboards',
        items: [
          { title: 'Default', href: '/default', icon: 'ChartPie' },
        ],
      },
      {
        title: 'Collaboration',
        items: [
          { title: 'Messenger', href: '/apps/chat', icon: 'MessageSquare' },
          { title: 'Feed', href: '/collaboration/feed', icon: 'FolderDot' },
          { title: 'Collabs', href: '/collaboration/collabs', icon: 'ClipboardMinus' },
          { title: 'Online Documents', href: '/collaboration/documents', icon: 'Component' },
          { title: 'File Manager', href: '/file-manager', icon: 'Folder', items: [
            { title: 'Dashboard', href: '/file-manager', icon: 'Folder' },
            { title: 'File Manager', href: '/apps/file-manager', icon: 'ArchiveRestore' },
          ]},
          { title: 'Work Groups', href: '/collaboration/work-groups', icon: 'Group' },
          { title: 'Boards', href: '/collaboration/boards', icon: 'LayoutDashboard' },
        ],
      },
      {
        title: 'Apps',
        items: [
          { title: 'Users', href: '/pages/users', icon: 'Users' },
          { title: 'Automation', href: '/pages/business-processes', icon: 'Workflow' },
          { title: 'Notes', href: '/apps/notes', icon: 'StickyNote', isDataBadge: '8' },
          { title: 'Mail', href: '/apps/mail', icon: 'Mail' },
          { title: 'Todo List App', href: '/apps/todo-list-app', icon: 'SquareCheck' },
          { title: 'Calendar', href: '/apps/calendar', icon: 'Calendar' },
          { title: 'Form Designer', href: '/pages/form-builder', icon: 'Component' },
        ],
      },
      {
        title: 'AI Apps',
        items: [
          { title: 'AI Chat', href: '/apps/ai-chat', icon: 'Brain' },
          { title: 'AI Chat V2', href: '/apps/ai-chat-v2', icon: 'BrainCircuit', isNew: true },
          { title: 'Image Generator', href: '/apps/ai-image-generator', icon: 'Images' },
          { title: 'Text to Speech', href: '/apps/text-to-speech', icon: 'Speech', isComing: true },
        ],
      },
      {
        title: 'Pages',
        items: [
          { title: 'Profile V2', href: '/pages/user-profile', icon: 'User' },
          { title: 'Authentication', href: '/', icon: 'Fingerprint', items: [
            { title: 'Login v1', href: '/login/v1' },
            { title: 'Login v2', href: '/login/v2' },
            { title: 'Register v1', href: '/register/v1' },
            { title: 'Register v2', href: '/register/v2' },
            { title: 'Forgot Password', href: '/forgot-password' },
          ]},
          { title: 'Error Pages', href: '/', icon: 'Fingerprint', items: [
            { title: '404', href: '/error/404' },
            { title: '500', href: '/error/500' },
            { title: '403', href: '/pages/error/403' },
          ]},
        ],
      },
      {
        title: 'PLM',
        items: [
          { title: 'Definitions', href: '#', icon: 'Scissors', items: [
            { title: 'Style Cards', href: '/plm/style-cards' },
            { title: 'Sample Cards', href: '/plm/sample-cards-list' },
            { title: 'Mood Boards', href: '/plm/mood-boards' },
            { title: 'Swatch Cards', href: '/plm/swatch-cards' },
            { title: 'Product Cards', href: '/plm/product-cards' },
            { title: 'Costing Sheets', href: '/plm/costing-sheets' },
            { title: 'Cost Detail Entry', href: '/plm/costing-sheets/cost-detail-entry' },
            { title: 'Costing Profit Breakdown', href: '/plm/costing-sheets/profit-breakdown' },
            { title: 'PLM Templates', href: '/plm/templates' },
          ]},
          { title: 'General Definitions', href: '#', icon: 'Layers', items: [
            { title: 'Style Sample Types', href: '/plm/general-definitions/style-sample-types' },
            { title: 'Design Detail Types', href: '/plm/general-definitions/design-detail-types' },
            { title: 'Fabric Type Cards', href: '/plm/general-definitions/fabric-type-cards' },
            { title: 'Measurement Definitions', href: '/plm/general-definitions/measurement-definitions' },
            { title: 'Measurement Charts', href: '/plm/general-definitions/measurement-charts' },
            { title: 'Department Cards', href: '/plm/general-definitions/department-cards' },
            { title: 'Process Cards', href: '/plm/general-definitions/process-cards' },
            { title: 'Employee Cards', href: '/plm/general-definitions/employee-cards' },
            { title: 'Resource Cards', href: '/plm/general-definitions/resource-cards' },
            { title: 'Study Template Cards', href: '/plm/general-definitions/study-templates' },
            { title: 'Activity Type Cards', href: '/plm/general-definitions/activity-type-cards' },
            { title: 'Color Cards', href: '/plm/general-definitions/color-cards' },
            { title: 'Company Cards', href: '/plm/general-definitions/company-cards' },
            { title: 'Sample Task Types', href: '/plm/general-definitions/sample-task-types' },
            { title: 'Route Cards', href: '/plm/general-definitions/route-cards' },
          ]},
          { title: 'Utilities', href: '#', icon: 'Workflow', items: [
            { title: 'PLM Orders', href: '/plm/orders' },
            { title: 'PLM Tasks', href: '/plm/tasks' },
            { title: 'Critical Path Chart', href: '/plm/critical-path' },
          ]},
          { title: 'Reports', href: '#', icon: 'BarChart3', items: [
            { title: 'Delayed Task List', href: '/plm/reports/delayed-tasks' },
            { title: 'Daily Task List', href: '/plm/reports/daily-tasks' },
            { title: 'Cancelled Task List', href: '/plm/reports/cancelled-tasks' },
            { title: 'PLM Sample Cost', href: '/plm/reports/sample-cost' },
            { title: 'PLM Sample History', href: '/plm/reports/sample-history' },
            { title: 'PLM Analyse Cubes', href: '/plm/reports/analyse-cubes' },
          ]},
          { title: 'Document Management', href: '/plm/documents', icon: 'FolderDot' },
          { title: 'Manufacture Sent Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=140', icon: 'Truck' },
          { title: 'Service Purchase Return Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=139', icon: 'Truck' },
        ],
      },
      {
        title: 'BPM',
        items: [
          { title: 'Task Queue', href: '/bpm/task-queue', icon: 'ClipboardCheck' },
          { title: 'Request Types', href: '/bpm/request-types', icon: 'Component' },
        ],
      },
      {
        title: 'Docket Management',
        items: [
          { title: 'Dockets', href: '#', icon: 'FolderOpen', items: [
            { title: 'Style Dockets', href: '/dockets/style-dockets', icon: 'Scissors' },
            { title: 'Sample Dockets', href: '/dockets/sample-dockets', icon: 'Layers' },
            { title: 'Product Dockets', href: '/dockets/product-dockets', icon: 'Package' },
            { title: 'Order Dockets', href: '/dockets/order-dockets', icon: 'ClipboardList' },
          ]},
          { title: 'Document Control', href: '#', icon: 'FileText', items: [
            { title: 'Approval Queue', href: '/dockets/document-control/approval-queue', icon: 'SquareCheck' },
            { title: 'Document Register', href: '/dockets/document-control/register', icon: 'List' },
          ]},
          { title: 'Docket Setup', href: '#', icon: 'Settings', items: [
            { title: 'Document Types', href: '/dockets/setup/document-types', icon: 'Component' },
            { title: 'Docket Templates', href: '/dockets/setup/docket-templates', icon: 'LayoutDashboard' },
            { title: 'Approval Workflows', href: '/dockets/setup/approval-workflows', icon: 'GitBranch' },
          ]},
          { title: 'Sharing', href: '#', icon: 'Share2', items: [
            { title: 'Shared Links', href: '/dockets/sharing/share-links', icon: 'FolderDot' },
            { title: 'External Reviews', href: '/dockets/sharing/external-review', icon: 'Mail' },
          ]},
          { title: 'Reports', href: '#', icon: 'BarChart3', items: [
            { title: 'Completeness', href: '/dockets/reports/completeness', icon: 'ChartPie' },
            { title: 'Missing Documents', href: '/dockets/reports/missing-documents', icon: 'AlertCircle' },
            { title: 'Document Expiry', href: '/dockets/reports/document-expiry', icon: 'Calendar' },
          ]},
        ],
      },
      {
        title: 'Legacy ERP',
        items: [
          { title: 'Warehouses', href: '/legacy-erp/warehouses', icon: 'Warehouse' },
          { title: 'Current Account', href: '/legacy-erp/current-accounts-list', icon: 'UserSquare2' },
          { title: 'Customer Define Trims', href: '/legacy-erp/trim-cards', icon: 'Scissors' },
          { title: 'Yarn Cards', href: '/legacy-erp/yarn-cards-list', icon: 'Layers' },
          { title: 'Fabric Cards', href: '/legacy-erp/fabric-cards-list', icon: 'Shirt' },
          { title: 'Fab Type Master', href: '/legacy-erp/master-lookup?key=fabric', icon: 'ListTree' },
          { title: 'Group Code Master', href: '/legacy-erp/master-lookup?key=group', icon: 'ListTree' },
          { title: 'Finish GSM Master', href: '/legacy-erp/master-lookup?key=finish-gsm', icon: 'ListTree' },
          { title: 'Dye Type Master', href: '/legacy-erp/master-lookup?key=dye-type', icon: 'ListTree' },
          { title: 'Composition Master', href: '/legacy-erp/master-lookup?key=composition', icon: 'ListTree' },
          // Subcontract Type / Subcontract Receipt — two deliberately separate masters (own
          // table, own nav entry each) on the same generic Master Lookup screen every other
          // *Master entry above already uses. See legacy-master-lookup.service.ts's TABLES
          // config comment for why these were confirmed to need new tables (neither concept
          // existed anywhere in the schema before).
          { title: 'Subcontract Type Master', href: '/legacy-erp/master-lookup?key=subcontract-type', icon: 'ListTree' },
          { title: 'Subcontract Receipt Master', href: '/legacy-erp/master-lookup?key=subcontract-receipt', icon: 'ListTree' },
          { title: 'Inventory Card List', href: '/legacy-erp/inventory-cards-list', icon: 'Boxes', isNew: true },
          { title: '1 - Purchase Order', href: '/legacy-erp/purchase-orders-list', icon: 'ShoppingCart', isNew: true },
          { title: '3 - Subcontract Order', href: '/legacy-erp/subcontract-orders-list', icon: 'Factory', isNew: true },
          // Work Order — MA_WorkOrder/MA_WorkOrderItem/MA_WorkOrderItemVariant, an already-
          // existing, already-migrated legacy manufacturing table family (161/100/21 real
          // columns, 0 rows — first writer). Not a new table.
          { title: 'Work Order', href: '/legacy-erp/work-orders-list', icon: 'ClipboardList', isNew: true },
          // Fabric/Trim/Yarn Requirements — one screen/route (fabric-yarn-requirements.service.ts),
          // three leaves distinguished by ?type=, same "one screen, N leaves via query param"
          // convention as the Inventory Receipts submenu below. Each leaf's own explicit tab
          // title ("Fabric Requirements"/"Trim Requirements"/"Yarn Requirements") lets all three
          // be open as separate workspace tabs at once — see registry.tsx's MULTI_KEY_ROUTES.
          { title: 'Fabric/Trim/Yarn Requirements', href: '#', icon: 'ClipboardList', isNew: true, items: [
            { title: 'Fabric Requirements', href: '/legacy-erp/fabric-yarn-requirements?type=fabric' },
            { title: 'Trim Requirements', href: '/legacy-erp/fabric-yarn-requirements?type=trim' },
            { title: 'Yarn Requirements', href: '/legacy-erp/fabric-yarn-requirements?type=yarn' },
          ]},
          // Curated subset of the existing "Inventory Receipts" 18-leaf submenu below (the four
          // "Outside Process" types — see frontend's SUBCONTRACT_RECEIPT_TYPES) surfaced as its
          // own nav entry with an in-page type dropdown, instead of 4 more individual leaves —
          // same existing generic Inventory Receipt screen/route either way, just a different
          // list page (subcontract-receipts-list) picking which type to show.
          { title: 'Subcontract Receipts', href: '/legacy-erp/subcontract-receipts-list', icon: 'Factory', isNew: true },
          { title: 'Sizes', href: '/legacy-erp/sizes-list', icon: 'Scaling', isNew: true },
          { title: 'Inventory Receipts', href: '#', icon: 'Truck', isNew: true, items: [
            { title: '2 - Purchase Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=2' },
            { title: '122 - Purchase Return', href: '/legacy-erp/inventory-receipts-list?receiptType=122' },
            { title: '16 - Counting Stock Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=16' },
            { title: '101 - Counting Stockovers Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=101' },
            { title: '17 - Warehouse Transfer Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=17' },
            { title: '11 - Outside Process Receive Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=11' },
            { title: '12 - Outside Process Return Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=12' },
            { title: '134 - Outside Process Sent Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=134' },
            { title: '133 - Outside Process Sent Return Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=133' },
            { title: '140 - Manufacture Send Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=140' },
            { title: '40 - Manufacture Return Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=40' },
            { title: '10 - Outside Manufacture Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=10' },
            { title: '132 - Special Purpose (Outflow) Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=132' },
            { title: '18 - Special Purpose (Inflow) Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=18' },
            { title: '22 - Service Purchase Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=22' },
            { title: '139 - Service Purchase Return Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=139' },
            { title: '120 - Wholesale Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=120' },
            { title: '3 - Return Wholesale Receipt', href: '/legacy-erp/inventory-receipts-list?receiptType=3' },
          ]},
          { title: '1 - Purchase Contract', href: '/legacy-erp/contracts-list', icon: 'FileSignature', isNew: true },
          { title: '2 - Sale Contract', href: '/legacy-erp/contracts-list?receiptType=2', icon: 'FileText', isNew: true },
          { title: 'Financial Receipts', href: '/legacy-erp/financial-receipt-master-data', icon: 'Landmark', isNew: true },
          { title: 'Receipt & Master Data', href: '/legacy-erp/receipt-master-data', icon: 'Receipt', isNew: true },
          { title: 'Item Statement', href: '/legacy-erp/item-statement', icon: 'FileClock', isNew: true },
          { title: 'Trim Inventory Cards', href: '/legacy-erp/trim-inventory-cards-list', icon: 'Package', isNew: true },
          { title: 'Unit Sets', href: '/legacy-erp/unit-sets-list', icon: 'Ruler', isNew: true },
          { title: 'Warehouse Parameters', href: '/legacy-erp/warehouse-parameters', icon: 'SlidersHorizontal', isNew: true },
          { title: 'General Settings', href: '/legacy-erp/general-settings', icon: 'Settings' },
          // Settings -> Screen Parameters — centralized, per-screen typed parameter management.
          // Its own screenKey (this href) is deliberately excluded from the screen picker inside
          // that page itself (see screen-parameter admin page's own filter) — configuring
          // parameters "for" the parameter-configuration screen isn't a meaningful case.
          { title: 'Screen Parameters', href: '/legacy-erp/general-settings/screen-parameters', icon: 'SlidersHorizontal' },
        ],
      },
      // Finance / Projects — real existing pages (frontend/app/[company]/(auth)/finance,
      // .../project-management), previously built but never linked into the sidebar at all.
      { title: 'Finance', items: [{ title: 'Dashboard', href: '/finance', icon: 'Wallet', isNew: true }] },
      { title: 'Projects', items: [{ title: 'Dashboard', href: '/project-management', icon: 'ClipboardList', isNew: true }] },
    ];

    async function seedNodes(nodes: MenuNode[], group: string, parentId: string | null, startOrder: number) {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const created = await prisma.menuItem.create({
          data: {
            title: node.title,
            href: node.href,
            icon: node.icon ?? null,
            group: parentId ? null : group,
            parentId,
            order: startOrder + i,
            isActive: true,
            isComing: node.isComing ?? false,
            isNew: node.isNew ?? false,
            isDataBadge: node.isDataBadge ?? null,
            newTab: node.newTab ?? false,
          },
        });
        if (node.items?.length) {
          await seedNodes(node.items, group, created.id, 0);
        }
      }
    }

    for (let g = 0; g < menuGroups.length; g++) {
      const group = menuGroups[g];
      // Use group-level order offset so groups sort correctly via root-item order
      await seedNodes(group.items, group.title, null, g * 100);
    }

    const total = await prisma.menuItem.count();
    console.log(`✓ Seeded ${total} menu items`);
  } else {
    console.log(`✓ Menu items already seeded (${existingMenus} items)`);
  }

  console.log('\n✅ NexusCore seed complete!');
  if (generatedAdminPassword) {
    // Printed once, only when the account was just created; it is not stored anywhere else.
    console.log(`   Initial admin sign-in: ${admin.email} / ${generatedAdminPassword}`);
    console.log('   (one-time password — you will be asked to change it at first sign-in)');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
