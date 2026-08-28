import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding NexusCore database...');

  // ── Company ───────────────────────────────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { id: 'seed-company-id-001' },
    create: { id: 'seed-company-id-001', name: 'NexusCore Demo' },
    update: {},
  });
  console.log(`✓ Company: ${company.name}`);

  // ── Branch ────────────────────────────────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch-id-001' },
    create: { id: 'seed-branch-id-001', companyId: company.id, name: 'Main Branch' },
    update: {},
  });
  console.log(`✓ Branch: ${branch.name}`);

  // ── Admin User ────────────────────────────────────────────────────────────────
  const password = await bcrypt.hash('nexuscore123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@nexuscore.io' },
    create: {
      email: 'admin@nexuscore.io',
      name: 'Admin',
      password,
      companyId: company.id,
      branchId: branch.id,
    },
    update: {},
  });
  console.log(`✓ Admin user: ${admin.email}`);

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
  console.log(`✓ Role: ${adminRole.name}`);

  // Assign admin role to admin user
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    create: { userId: admin.id, roleId: adminRole.id },
    update: {},
  });
  console.log(`✓ Admin role assigned to ${admin.email}`);

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
  const existingMenus = await prisma.menuItem.count();
  if (existingMenus === 0) {
    type MenuNode = { title: string; href: string; icon?: string; isComing?: boolean; isNew?: boolean; isDataBadge?: string; newTab?: boolean; items?: MenuNode[] };
    type MenuGroup = { title: string; items: MenuNode[] };

    const menuGroups: MenuGroup[] = [
      {
        title: 'Dashboards',
        items: [
          { title: 'Default', href: '/dashboard/default', icon: 'ChartPie' },
          { title: 'Collaboration', href: '#', icon: 'Users', items: [
            { title: 'Messenger', href: '/dashboard/apps/chat', icon: 'MessageSquare' },
            { title: 'Feed', href: '/dashboard/collaboration/feed', icon: 'FolderDot' },
            { title: 'Collabs', href: '/dashboard/collaboration/collabs', icon: 'ClipboardMinus' },
            { title: 'Online Documents', href: '/dashboard/collaboration/documents', icon: 'Component' },
            { title: 'File Manager', href: '/dashboard/file-manager', icon: 'Folder', items: [
              { title: 'Dashboard', href: '/dashboard/file-manager', icon: 'Folder' },
              { title: 'File Manager', href: '/dashboard/apps/file-manager', icon: 'ArchiveRestore' },
            ]},
            { title: 'Work Groups', href: '/dashboard/collaboration/work-groups', icon: 'Group' },
            { title: 'Boards', href: '/dashboard/collaboration/boards', icon: 'LayoutDashboard' },
          ]},
          { title: 'E-commerce', href: '#', icon: 'ShoppingBag', items: [
            { title: 'Dashboard', href: '/dashboard/ecommerce', icon: 'ChartPie' },
            { title: 'Product List', href: '/dashboard/pages/products', icon: 'Package' },
            { title: 'Add Product', href: '/dashboard/pages/products/create', icon: 'Plus' },
            { title: 'Customers', href: '/dashboard/crm/customers', icon: 'Users' },
            { title: 'Order List', href: '/dashboard/pages/orders', icon: 'ShoppingCart' },
            { title: 'Order Detail', href: '/dashboard/pages/orders/detail', icon: 'FileText' },
            { title: 'Returns', href: '/dashboard/pages/returns', icon: 'RotateCcw' },
          ]},
          { title: 'Sales', href: '/dashboard/sales', icon: 'BadgeDollarSign' },
          { title: 'CRM', href: '#', icon: 'ChartBar', items: [
            { title: 'Dashboard', href: '/dashboard/crm', icon: 'ChartPie' },
            { title: 'Leads', href: '/dashboard/crm/leads', icon: 'User' },
            { title: 'Contacts', href: '/dashboard/crm/contacts', icon: 'Users' },
            { title: 'Deals', href: '/dashboard/crm/deals', icon: 'BadgeDollarSign' },
            ]},
          { title: 'Project Management', href: '/dashboard/project-management', icon: 'FolderDot', items: [
            { title: 'Dashboard', href: '/dashboard/project-management', icon: 'LayoutDashboard' },
            { title: 'Project List', href: '/dashboard/project-list', icon: 'List' },
            { title: 'Tasks', href: '/dashboard/apps/tasks', icon: 'ClipboardCheck' },
          ]},
          { title: 'Payment Dashboard', href: '/dashboard/payment', icon: 'CreditCard', items: [
            { title: 'Dashboard', href: '/dashboard/payment', icon: 'LayoutDashboard' },
            { title: 'Transactions', href: '/dashboard/payment/transactions', icon: 'Wallet' },
            { title: 'Customer Payments', href: '/dashboard/payment/customer-payments', icon: 'User' },
            { title: 'Supplier Payments', href: '/dashboard/payment/supplier-payments', icon: 'Users' },
          ]},
        ],
      },
      {
        title: 'Apps',
        items: [
          { title: 'Users', href: '/dashboard/pages/users', icon: 'Users' },
          { title: 'Companies', href: '/dashboard/pages/companies', icon: 'Building2' },
          { title: 'Automation', href: '/dashboard/pages/business-processes', icon: 'Workflow' },
          { title: 'Notes', href: '/dashboard/apps/notes', icon: 'StickyNote', isDataBadge: '8' },
          { title: 'Mail', href: '/dashboard/apps/mail', icon: 'Mail' },
          { title: 'Todo List App', href: '/dashboard/apps/todo-list-app', icon: 'SquareCheck' },
          { title: 'Calendar', href: '/dashboard/apps/calendar', icon: 'Calendar' },
          { title: 'Api Keys', href: '/dashboard/apps/api-keys', icon: 'Key' },
          { title: 'POS App', href: '/dashboard/apps/pos-system', icon: 'Cookie' },
          { title: 'Form Designer', href: '/dashboard/pages/form-builder', icon: 'Component' },
          { title: 'Settings', href: '/dashboard/crm/settings', icon: 'Settings' },
        ],
      },
      {
        title: 'AI Apps',
        items: [
          { title: 'AI Chat', href: '/dashboard/apps/ai-chat', icon: 'Brain' },
          { title: 'AI Chat V2', href: '/dashboard/apps/ai-chat-v2', icon: 'BrainCircuit', isNew: true },
          { title: 'Image Generator', href: '/dashboard/apps/ai-image-generator', icon: 'Images' },
          { title: 'Text to Speech', href: '/dashboard/apps/text-to-speech', icon: 'Speech', isComing: true },
        ],
      },
      {
        title: 'Pages',
        items: [
          { title: 'Profile V2', href: '/dashboard/pages/user-profile', icon: 'User' },
          { title: 'Authentication', href: '/', icon: 'Fingerprint', items: [
            { title: 'Login v1', href: '/dashboard/login/v1' },
            { title: 'Login v2', href: '/dashboard/login/v2' },
            { title: 'Register v1', href: '/dashboard/register/v1' },
            { title: 'Register v2', href: '/dashboard/register/v2' },
            { title: 'Forgot Password', href: '/dashboard/forgot-password' },
          ]},
          { title: 'Error Pages', href: '/', icon: 'Fingerprint', items: [
            { title: '404', href: '/dashboard/pages/error/404' },
            { title: '500', href: '/dashboard/pages/error/500' },
            { title: '403', href: '/dashboard/pages/error/403' },
          ]},
        ],
      },
      {
        title: 'Others',
        items: [
          { title: 'Widgets', href: '#', icon: 'Puzzle', items: [
            { title: 'Fitness', href: '/dashboard/widgets/fitness' },
            { title: 'E-commerce', href: '/dashboard/widgets/ecommerce' },
            { title: 'Analytics', href: '/dashboard/widgets/analytics' },
          ]},
        ],
      },
      {
        title: 'PLM',
        items: [
          { title: 'Definitions', href: '#', icon: 'Scissors', items: [
            { title: 'Style Cards', href: '/dashboard/plm/style-cards' },
            { title: 'Sample Cards', href: '/dashboard/plm/sample-cards' },
            { title: 'Mood Boards', href: '/dashboard/plm/mood-boards' },
            { title: 'Swatch Cards', href: '/dashboard/plm/swatch-cards' },
            { title: 'Product Cards', href: '/dashboard/plm/product-cards' },
            { title: 'Costing Sheets', href: '/dashboard/plm/costing-sheets' },
            { title: 'Cost Detail Entry', href: '/dashboard/plm/costing-sheets/cost-detail-entry' },
            { title: 'Costing Profit Breakdown', href: '/dashboard/plm/costing-sheets/profit-breakdown' },
            { title: 'PLM Templates', href: '/dashboard/plm/templates' },
          ]},
          { title: 'General Definitions', href: '#', icon: 'Layers', items: [
            { title: 'Style Sample Types', href: '/dashboard/plm/general-definitions/style-sample-types' },
            { title: 'Design Detail Types', href: '/dashboard/plm/general-definitions/design-detail-types' },
            { title: 'Fabric Type Cards', href: '/dashboard/plm/general-definitions/fabric-type-cards' },
            { title: 'Measurement Definitions', href: '/dashboard/plm/general-definitions/measurement-definitions' },
            { title: 'Measurement Charts', href: '/dashboard/plm/general-definitions/measurement-charts' },
            { title: 'Department Cards', href: '/dashboard/plm/general-definitions/department-cards' },
            { title: 'Process Cards', href: '/dashboard/plm/general-definitions/process-cards' },
            { title: 'Employee Cards', href: '/dashboard/plm/general-definitions/employee-cards' },
            { title: 'Resource Cards', href: '/dashboard/plm/general-definitions/resource-cards' },
            { title: 'Study Template Cards', href: '/dashboard/plm/general-definitions/study-templates' },
            { title: 'Activity Type Cards', href: '/dashboard/plm/general-definitions/activity-type-cards' },
            { title: 'Color Cards', href: '/dashboard/plm/general-definitions/color-cards' },
            { title: 'Company Cards', href: '/dashboard/plm/general-definitions/company-cards' },
            { title: 'Sample Task Types', href: '/dashboard/plm/general-definitions/sample-task-types' },
            { title: 'Route Cards', href: '/dashboard/plm/general-definitions/route-cards' },
          ]},
          { title: 'Utilities', href: '#', icon: 'Workflow', items: [
            { title: 'PLM Orders', href: '/dashboard/plm/orders' },
            { title: 'PLM Tasks', href: '/dashboard/plm/tasks' },
            { title: 'Critical Path Chart', href: '/dashboard/plm/critical-path' },
          ]},
          { title: 'Reports', href: '#', icon: 'BarChart3', items: [
            { title: 'Delayed Task List', href: '/dashboard/plm/reports/delayed-tasks' },
            { title: 'Daily Task List', href: '/dashboard/plm/reports/daily-tasks' },
            { title: 'Cancelled Task List', href: '/dashboard/plm/reports/cancelled-tasks' },
            { title: 'PLM Sample Cost', href: '/dashboard/plm/reports/sample-cost' },
            { title: 'PLM Sample History', href: '/dashboard/plm/reports/sample-history' },
            { title: 'PLM Analyse Cubes', href: '/dashboard/plm/reports/analyse-cubes' },
          ]},
          { title: 'Document Management', href: '/dashboard/plm/documents', icon: 'FolderDot' },
        ],
      },
      {
        title: 'BPM',
        items: [
          { title: 'Task Queue', href: '/dashboard/bpm/task-queue', icon: 'ClipboardCheck' },
          { title: 'Request Types', href: '/dashboard/bpm/request-types', icon: 'Component' },
        ],
      },
      {
        title: 'Docket Management',
        items: [
          { title: 'Dockets', href: '#', icon: 'FolderOpen', items: [
            { title: 'Style Dockets', href: '/dashboard/dockets/style-dockets', icon: 'Scissors' },
            { title: 'Sample Dockets', href: '/dashboard/dockets/sample-dockets', icon: 'Layers' },
            { title: 'Product Dockets', href: '/dashboard/dockets/product-dockets', icon: 'Package' },
            { title: 'Order Dockets', href: '/dashboard/dockets/order-dockets', icon: 'ClipboardList' },
          ]},
          { title: 'Document Control', href: '#', icon: 'FileText', items: [
            { title: 'Approval Queue', href: '/dashboard/dockets/document-control/approval-queue', icon: 'SquareCheck' },
            { title: 'Document Register', href: '/dashboard/dockets/document-control/register', icon: 'List' },
          ]},
          { title: 'Docket Setup', href: '#', icon: 'Settings', items: [
            { title: 'Document Types', href: '/dashboard/dockets/setup/document-types', icon: 'Component' },
            { title: 'Docket Templates', href: '/dashboard/dockets/setup/docket-templates', icon: 'LayoutDashboard' },
            { title: 'Approval Workflows', href: '/dashboard/dockets/setup/approval-workflows', icon: 'GitBranch' },
          ]},
          { title: 'Sharing', href: '#', icon: 'Share2', items: [
            { title: 'Shared Links', href: '/dashboard/dockets/sharing/share-links', icon: 'FolderDot' },
            { title: 'External Reviews', href: '/dashboard/dockets/sharing/external-review', icon: 'Mail' },
          ]},
          { title: 'Reports', href: '#', icon: 'BarChart3', items: [
            { title: 'Completeness', href: '/dashboard/dockets/reports/completeness', icon: 'ChartPie' },
            { title: 'Missing Documents', href: '/dashboard/dockets/reports/missing-documents', icon: 'AlertCircle' },
            { title: 'Document Expiry', href: '/dashboard/dockets/reports/document-expiry', icon: 'Calendar' },
          ]},
        ],
      },
      {
        title: 'Legacy ERP',
        items: [
          { title: 'Warehouses', href: '/dashboard/legacy-erp/warehouses', icon: 'Warehouse' },
          { title: 'Current Account', href: '/dashboard/legacy-erp/current-accounts-list', icon: 'UserSquare2' },
          { title: 'Customer Define Trims', href: '/dashboard/legacy-erp/trim-cards', icon: 'Scissors' },
          { title: 'Yarn Cards', href: '/dashboard/legacy-erp/yarn-cards-list', icon: 'Layers' },
          { title: 'Fabric Cards', href: '/dashboard/legacy-erp/fabric-cards-list', icon: 'Shirt' },
          { title: 'Fab Type Master', href: '/dashboard/legacy-erp/master-lookup?key=fabric', icon: 'ListTree' },
          { title: 'Group Code Master', href: '/dashboard/legacy-erp/master-lookup?key=group', icon: 'ListTree' },
          { title: 'Finish GSM Master', href: '/dashboard/legacy-erp/master-lookup?key=finish-gsm', icon: 'ListTree' },
          { title: 'Dye Type Master', href: '/dashboard/legacy-erp/master-lookup?key=dye-type', icon: 'ListTree' },
          { title: 'Composition Master', href: '/dashboard/legacy-erp/master-lookup?key=composition', icon: 'ListTree' },
          // Subcontract Type / Subcontract Receipt — two deliberately separate masters (own
          // table, own nav entry each) on the same generic Master Lookup screen every other
          // *Master entry above already uses. See legacy-master-lookup.service.ts's TABLES
          // config comment for why these were confirmed to need new tables (neither concept
          // existed anywhere in the schema before).
          { title: 'Subcontract Type Master', href: '/dashboard/legacy-erp/master-lookup?key=subcontract-type', icon: 'ListTree' },
          { title: 'Subcontract Receipt Master', href: '/dashboard/legacy-erp/master-lookup?key=subcontract-receipt', icon: 'ListTree' },
          { title: 'Inventory Card List', href: '/dashboard/legacy-erp/inventory-cards-list', icon: 'Boxes', isNew: true },
          { title: '1 - Purchase Order', href: '/dashboard/legacy-erp/purchase-orders-list', icon: 'ShoppingCart', isNew: true },
          { title: '3 - Subcontract Order', href: '/dashboard/legacy-erp/subcontract-orders-list', icon: 'Factory', isNew: true },
          // Curated subset of the existing "Inventory Receipts" 18-leaf submenu below (the four
          // "Outside Process" types — see frontend's SUBCONTRACT_RECEIPT_TYPES) surfaced as its
          // own nav entry with an in-page type dropdown, instead of 4 more individual leaves —
          // same existing generic Inventory Receipt screen/route either way, just a different
          // list page (subcontract-receipts-list) picking which type to show.
          { title: 'Subcontract Receipts', href: '/dashboard/legacy-erp/subcontract-receipts-list', icon: 'Factory', isNew: true },
          { title: 'Sizes', href: '/dashboard/legacy-erp/sizes-list', icon: 'Scaling', isNew: true },
          { title: 'Inventory Receipts', href: '#', icon: 'Truck', isNew: true, items: [
            { title: '2 - Purchase Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=2' },
            { title: '122 - Purchase Return', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=122' },
            { title: '16 - Counting Stock Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=16' },
            { title: '101 - Counting Stockovers Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=101' },
            { title: '17 - Warehouse Transfer Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=17' },
            { title: '11 - Outside Process Receive Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=11' },
            { title: '12 - Outside Process Return Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=12' },
            { title: '134 - Outside Process Sent Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=134' },
            { title: '133 - Outside Process Sent Return Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=133' },
            { title: '140 - Manufacture Send Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=140' },
            { title: '40 - Manufacture Return Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=40' },
            { title: '10 - Outside Manufacture Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=10' },
            { title: '132 - Special Purpose (Outflow) Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=132' },
            { title: '18 - Special Purpose (Inflow) Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=18' },
            { title: '22 - Service Purchase Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=22' },
            { title: '139 - Service Purchase Return Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=139' },
            { title: '120 - Wholesale Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=120' },
            { title: '3 - Return Wholesale Receipt', href: '/dashboard/legacy-erp/inventory-receipts-list?receiptType=3' },
          ]},
          { title: '1 - Purchase Contract', href: '/dashboard/legacy-erp/contracts-list', icon: 'FileSignature', isNew: true },
          { title: '2 - Sale Contract', href: '/dashboard/legacy-erp/contracts-list?receiptType=2', icon: 'FileText', isNew: true },
          { title: 'Financial Receipts', href: '/dashboard/legacy-erp/financial-receipt-master-data', icon: 'Landmark', isNew: true },
          { title: 'Receipt & Master Data', href: '/dashboard/legacy-erp/receipt-master-data', icon: 'Receipt', isNew: true },
          { title: 'Trim Inventory Cards', href: '/dashboard/legacy-erp/trim-inventory-cards-list', icon: 'Package', isNew: true },
          { title: 'Unit Sets', href: '/dashboard/legacy-erp/unit-sets-list', icon: 'Ruler', isNew: true },
          { title: 'Warehouse Parameters', href: '/dashboard/legacy-erp/warehouse-parameters', icon: 'SlidersHorizontal', isNew: true },
          { title: 'General Settings', href: '/dashboard/legacy-erp/general-settings', icon: 'Settings' },
        ],
      },
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
  console.log('   Admin login: admin@nexuscore.io / nexuscore123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
