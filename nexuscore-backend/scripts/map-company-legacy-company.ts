// Company isolation — set (or create and set) a NexusCore company's legacy ERP company mapping
// (Company.legacyCompanyId -> MD_Company.RecId; migration 20261031000000). Dry run by default.
//
//   Map to an EXISTING legacy company (e.g. NexusCore Demo -> C001, RecId 1):
//     npx ts-node -T scripts/map-company-legacy-company.ts --company=nexuscore-demo --legacy=1
//     ... --apply --backup=<pg_dump file written in the last 60 minutes>
//
//   Create a NEW legacy company + workplace for a company, then map it (e.g. Creative Apparels):
//     npx ts-node -T scripts/map-company-legacy-company.ts --company=creative-apparels --create --code=C002 --workplace-code=W002
//     ... --apply --backup=<file>
//
// --company takes the company slug or id. Refuses when: the company is unknown or already mapped;
// the legacy company is missing / deleted / unused / has no live workplace / is mapped to another
// company; a new code is already used. Changes only Company."legacyCompanyId" (and, with --create,
// inserts exactly one MD_Company and one MD_Workplace row). One transaction. Touches no business
// record and reassigns nothing.
import * as fs from 'fs';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  const apply = process.argv.includes('--apply');
  const create = process.argv.includes('--create');
  const companyKey = arg('company');
  const backup = arg('backup');
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  console.log(`database: ${db} — ${apply ? 'APPLY' : 'dry run (read-only)'}`);
  if (!companyKey) throw new Error('--company=<slug or id> is required');

  const [company] = await prisma.$queryRaw<any[]>`SELECT "id", "name", "slug", "legacyCompanyId" FROM "Company" WHERE "id" = ${companyKey} OR "slug" = ${companyKey}`;
  if (!company) return refuse(`no company with id or slug "${companyKey}"`);
  if (company.legacyCompanyId !== null) return refuse(`${company.name} is already mapped to legacy company ${company.legacyCompanyId} — this script never changes a mapping`);

  let plan: { legacyId?: number; code?: string; name?: string; workplaceCode?: string };
  if (create) {
    const code = arg('code');
    const workplaceCode = arg('workplace-code');
    if (!code || !workplaceCode) return refuse('--create needs --code=<CompanyCode> and --workplace-code=<WorkplaceCode>');
    const clash = await prisma.$queryRaw<any[]>`SELECT "RecId" FROM "MD_Company" WHERE LOWER("CompanyCode") = LOWER(${code})`;
    if (clash.length) return refuse(`legacy company code ${code} is already used (RecId ${clash[0].RecId})`);
    plan = { code, name: company.name, workplaceCode };
    console.log(`+ would insert MD_Company { CompanyCode: "${code}", CompanyName: "${company.name}", InUse: 1, IsDeleted: 0 }`);
    console.log(`+ would insert MD_Workplace { CompanyId: <new RecId>, WorkplaceCode: "${workplaceCode}", WorkplaceName: "Main Workplace", InUse: 1, IsDeleted: 0 }`);
  } else {
    const legacyId = Number(arg('legacy'));
    if (!Number.isInteger(legacyId) || legacyId <= 0) return refuse('--legacy=<MD_Company.RecId> (or --create) is required');
    const [legacy] = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT c."RecId", c."CompanyCode", c."CompanyName",
        (SELECT count(*)::int FROM "MD_Workplace" w WHERE w."CompanyId" = c."RecId" AND COALESCE(w."IsDeleted",0)=0 AND COALESCE(w."InUse",1)<>0) workplaces,
        (SELECT x."name" FROM "Company" x WHERE x."legacyCompanyId" = c."RecId") "mappedTo"
      FROM "MD_Company" c WHERE c."RecId" = ${legacyId} AND COALESCE(c."IsDeleted",0)=0 AND COALESCE(c."InUse",1)<>0`);
    if (!legacy) return refuse(`legacy company ${legacyId} does not exist or is deleted / unused`);
    if (!legacy.workplaces) return refuse(`legacy company ${legacyId} has no live workplace`);
    if (legacy.mappedTo) return refuse(`legacy company ${legacyId} is already mapped to ${legacy.mappedTo}`);
    plan = { legacyId };
    console.log(`  legacy company ${legacyId}: ${legacy.CompanyCode} "${legacy.CompanyName}" (${legacy.workplaces} live workplace)`);
  }
  console.log(`~ would set Company "${company.name}" (${company.slug}).legacyCompanyId = ${plan.legacyId ?? '<new RecId>'}`);
  if (!apply) { console.log('dry run: nothing written.'); return; }
  if (!backup || !fs.existsSync(backup) || fs.statSync(backup).size === 0 || Date.now() - fs.statSync(backup).mtimeMs > 60 * 60_000) {
    return refuse('--apply needs --backup=<a non-empty pg_dump file written in the last 60 minutes>');
  }

  const legacyId = await prisma.$transaction(async (tx) => {
    let id = plan.legacyId;
    if (create) {
      for (const t of ['MD_Company', 'MD_Workplace']) {
        await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${t}"', 'RecId'), GREATEST((SELECT MAX("RecId") FROM "${t}"), 1))`);
      }
      const [c] = await tx.$queryRaw<{ id: number }[]>`
        INSERT INTO "MD_Company" ("CompanyCode", "CompanyName", "InUse", "InsertedAt", "IsDeleted", "UUID")
        VALUES (${plan.code}, ${plan.name}, 1, now(), 0, gen_random_uuid()) RETURNING "RecId" AS id`;
      id = Number(c.id);
      await tx.$executeRaw`
        INSERT INTO "MD_Workplace" ("CompanyId", "WorkplaceCode", "WorkplaceName", "InUse", "InsertedAt", "IsDeleted", "UUID")
        VALUES (${id}, ${plan.workplaceCode}, 'Main Workplace', 1, now(), 0, gen_random_uuid())`;
    }
    const n = await tx.$executeRaw`UPDATE "Company" SET "legacyCompanyId" = ${id} WHERE "id" = ${company.id} AND "legacyCompanyId" IS NULL`;
    if (n !== 1) throw new Error('company mapping changed concurrently — nothing written');
    return id;
  });
  console.log(`applied: ${company.name} -> legacy company ${legacyId}`);
}

function refuse(message: string) {
  console.log(`REFUSED — ${message}`);
  process.exitCode = 1;
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
