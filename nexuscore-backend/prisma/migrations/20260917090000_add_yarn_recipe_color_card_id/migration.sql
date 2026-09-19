-- Common/Overall vs Color-Specific Yarn Recipe.
-- FabricYarnRecipeLine (Prisma-native table) previously had exactly one recipe per Fabric Card,
-- with no color dimension at all. Adds one nullable ColorCard.id column, same convention already
-- used for this exact relationship elsewhere (StyleBomLine.colorCardId, MA_RecipeItem.ColorCardId,
-- MA_Requirement.ColorCardId, see 20260909140000_add_requirement_color_card_id) -- stores
-- ColorCard.id directly, no join table. NULL means "Common/Overall" (the default for every color
-- unless overridden); a real ColorCard.id means this row belongs to that one color's own override
-- recipe. All 10 existing rows get NULL, i.e. they become each fabric's Common/Overall recipe
-- unchanged -- no data migration/backfill needed beyond the column itself.
ALTER TABLE "FabricYarnRecipeLine" ADD COLUMN "colorCardId" TEXT;

DROP INDEX IF EXISTS "FabricYarnRecipeLine_fabricInventoryId_idx";
CREATE INDEX "FabricYarnRecipeLine_fabricInventoryId_colorCardId_idx" ON "FabricYarnRecipeLine"("fabricInventoryId", "colorCardId");
