// One-off, idempotent seed for the new Approval Configuration framework's permissions —
// reuses the existing Role/Permission/RolePermission tables and @@unique([module, action])
// convention (see prisma/schema.prisma), not a second permission system. Grants every new
// permission to the existing "Admin" role (seed-admin-role-001) so the seeded admin login can
// exercise the feature immediately; other roles get none by default. Safe to re-run.
//
// Run manually: npx ts-node scripts/seed-approval-permissions.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PERMISSIONS: { module: string; action: string; description: string }[] = [
  { module: 'general-settings', action: 'view-approval-configuration', description: 'View Approval Configuration' },
  { module: 'general-settings', action: 'manage-approval-configuration', description: 'Manage Approval Configuration' },
  { module: 'approval', action: 'view-pending', description: 'View Pending Approvals' },
  { module: 'approval', action: 'approve', description: 'Approve' },
  { module: 'approval', action: 'reject', description: 'Reject' },
  { module: 'approval', action: 'view-history', description: 'View Approval History' },
];

async function main() {
  const adminRole = await prisma.role.findFirst({ where: { name: 'Admin' } });
  if (!adminRole) {
    console.error('No "Admin" role found — skipping role grant (permissions will still be created).');
  }

  for (const p of PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { module_action: { module: p.module, action: p.action } },
      create: p,
      update: { description: p.description },
    });
    console.log(`+ permission: ${p.module}:${p.action}`);

    if (adminRole) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
        create: { roleId: adminRole.id, permissionId: permission.id },
        update: {},
      });
      console.log(`  granted to role: ${adminRole.name}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
