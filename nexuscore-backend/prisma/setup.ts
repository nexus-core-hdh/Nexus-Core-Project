// One-command initial data setup for a database that `prisma migrate deploy` has just created
// (and safe to re-run on an existing one — every step below is idempotent):
//
//   production:   npm run build && npm run db:deploy && npm run db:setup
//   development:  npm run db:setup:dev
//
// Runs prisma/seed.ts (company, branch, initial administrator, permissions, Admin role, legacy
// company/workplace, reference data, menu) and then the existing menu scripts in scripts/, in the
// order they were introduced — some of them attach to menu entries created by earlier ones. The
// scripts are run as-is (each skips entries that already exist), not copied, so there is exactly
// one definition of every menu item. Not included:
//   - scripts/fix-fabric-card-yarn-names.ts — a one-off data repair, not setup;
//   - scripts/reorganize-menu-modules.ts — targets menu rows by hard-coded ids that exist in no
//     database this setup produces (nor in the current development database, where the
//     reorganization was never applied); on a fresh install it would only create a half-applied
//     set of empty groups. Re-key it by href before adding it here if that reorganization is wanted.
import { spawnSync } from 'child_process';
import * as path from 'path';

const STEPS = [
  'prisma/seed',
  'scripts/seed-approval-permissions',
  'scripts/seed-general-settings-menu-item',
  'scripts/seed-contract-menu-items',
  'scripts/seed-financial-receipt-menu-item',
  'scripts/seed-receipt-type-menu-items',
  'scripts/seed-purchase-receipt-menu-item',
  'scripts/seed-fabric-planning-menu-item',
  'scripts/seed-yarn-recipes-menu-item',
  'scripts/seed-yarn-planning-menu-item',
  'scripts/seed-trim-planning-menu-item',
  'scripts/seed-fabric-yarn-requirements-menu-item',
  'scripts/seed-order-manufacturing-menu-item',
  'scripts/seed-serial-cards-menu-item',
];

// Compiled (dist/prisma/setup.js) runs the compiled steps with plain node; the TypeScript source
// runs them through ts-node.
const compiled = __filename.endsWith('.js');
const root = path.resolve(__dirname, '..');

for (const step of STEPS) {
  const file = path.join(root, `${step}${compiled ? '.js' : '.ts'}`);
  console.log(`\n▶ ${step}`);
  const args = compiled ? [file] : ['-r', 'ts-node/register', file];
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env, cwd: path.resolve(__dirname, compiled ? '../..' : '..') });
  if (result.status !== 0) {
    console.error(`\n✖ setup step failed: ${step} (exit ${result.status ?? result.signal})`);
    process.exit(1);
  }
}
console.log('\n✅ Setup complete.');
