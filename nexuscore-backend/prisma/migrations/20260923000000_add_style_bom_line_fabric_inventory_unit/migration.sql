-- Recovery migration: schema.prisma's StyleBomLine model has had `fabricInventoryId Int?` and
-- `unitId Int?` for a while (same columns SampleBomLine already has on this DB), but no migration
-- in this repo's history ever adds them to StyleBomLine specifically -- confirmed via
-- `grep -rn 'ALTER TABLE "StyleBomLine" ADD COLUMN "fabricInventoryId"' prisma/migrations/`
-- (zero matches) and `\d "StyleBomLine"` on the live DB (columns absent). Same class of drift as
-- 20260916000000_create_fabric_yarn_recipe_line -- a column that reached schema.prisma (and,
-- evidently, SampleBomLine's own table) without its own committed migration for this table,
-- presumably via `prisma db push` on another machine's dev DB. Blocking symptom: migration
-- 20260923051300_add_recipe_usage_indexes fails with `column "fabricInventoryId" does not exist`
-- when creating StyleBomLine_fabricInventoryId_idx. Adding both nullable columns here (all
-- existing rows get NULL, matching "no fabric/unit master link yet" for pre-existing BOM lines,
-- exactly SampleBomLine's own precedent) lets that index migration replay cleanly.
ALTER TABLE "StyleBomLine" ADD COLUMN "fabricInventoryId" INTEGER;
ALTER TABLE "StyleBomLine" ADD COLUMN "unitId" INTEGER;
