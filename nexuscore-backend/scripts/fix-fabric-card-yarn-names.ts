// One-off backfill — NOT wired into app startup, run manually once via
// `npm run fix:fabric-card-yarn-names`.
//
// Root cause (see fabric-card.service.ts's resolveIdentity): the Yarn Count 1-4 segment of a
// Fabric Card's auto-generated Name was built from each selected Yarn Card's `inventoryCode`
// (e.g. "YARN-00006") instead of its `inventoryName` (e.g. "20/1 carded"). That bug is now
// fixed for every future Create/Update, but every Fabric Card saved BEFORE the fix still has
// the wrong Name already persisted in IM_Item.InventoryName — this script corrects those
// existing rows.
//
// Reuses the app's own, now-fixed FabricCardService.update() for every existing Fabric Card —
// resubmitting each record's own current identity fields (its own FabricTypeId/GSM/DyeType/
// Composition/Yarn Counts), which the identity-resolution/duplicate-check/Name-build pipeline
// already runs on every real Save. This is functionally identical to a user opening and
// re-saving every Fabric Card with no changes — zero new resolution logic, zero risk of the
// Name drifting from what the app itself would produce. Every other IM_Item column round-trips
// through `update()` unchanged (dto carries the record's own current values), so nothing besides
// InventoryName (and, only if it had actually gone stale, an identity column) is touched.
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FabricCardService } from '../src/modules/legacy-erp/fabric-card.service';

const SYSTEM_USER_ID = 1;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const prisma = app.get(PrismaService);
    const fabricCardSvc = app.get(FabricCardService);

    const rows = await prisma.$queryRaw<{ id: number }[]>`
      SELECT "RecId" as id FROM "IM_Item" WHERE "AccessCode" = 'FABRIC' AND "IsDeleted" = 0 ORDER BY "RecId"
    `;
    console.log(`Found ${rows.length} Fabric Card(s) to check.`);

    let fixed = 0;
    let unchanged = 0;
    let failed = 0;
    for (const { id } of rows) {
      try {
        const current: any = await fabricCardSvc.get(id);
        const before = current.inventoryName;
        // Resubmit the record's own current values — update() re-resolves the 8 identity
        // fields from these and recomputes inventoryName from them; every other field passes
        // through unchanged since it's present in `current` already.
        const after: any = await fabricCardSvc.update(id, current, SYSTEM_USER_ID);
        if (after.inventoryName !== before) {
          fixed++;
          console.log(`Fixed #${id}: "${before}" -> "${after.inventoryName}"`);
        } else {
          unchanged++;
        }
      } catch (err: any) {
        failed++;
        console.error(`Failed #${id}: ${err?.message || err}`);
      }
    }
    console.log(`Done. Fixed: ${fixed}, already correct: ${unchanged}, failed: ${failed}.`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
