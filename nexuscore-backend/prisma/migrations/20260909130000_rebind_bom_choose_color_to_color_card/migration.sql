-- BOM's "Choose Color" cell (bom-tab.tsx) was bound to SwatchCard, a separate master that is
-- empty in production (0 rows) -- the user's real, saved colors live in ColorCard (the master
-- already used by Purchase Order/Inventory Receipt lines and the Style/Sample Card General tabs).
-- Repoint the existing FK from SwatchCard to ColorCard; SwatchCard itself is untouched (still used
-- by ProductCard's own colorway picker, a separate feature, out of scope here). Confirmed via
-- direct query before writing this migration: both columns are currently all-NULL/unused in
-- production data, so this is a safe, lossless repoint, not a data migration.

ALTER TABLE "StyleBomLine" DROP CONSTRAINT "StyleBomLine_swatchCardId_fkey";
ALTER TABLE "StyleBomLine" RENAME COLUMN "swatchCardId" TO "colorCardId";
ALTER TABLE "StyleBomLine" ADD CONSTRAINT "StyleBomLine_colorCardId_fkey" FOREIGN KEY ("colorCardId") REFERENCES "ColorCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SampleBomLine" DROP CONSTRAINT "SampleBomLine_swatchCardId_fkey";
ALTER TABLE "SampleBomLine" RENAME COLUMN "swatchCardId" TO "colorCardId";
ALTER TABLE "SampleBomLine" ADD CONSTRAINT "SampleBomLine_colorCardId_fkey" FOREIGN KEY ("colorCardId") REFERENCES "ColorCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MA_RecipeItem (Work Order BOM, raw legacy table): SwatchCardId was bigint -- structurally
-- incompatible with ColorCard's text/uuid id (every write already silently failed). Confirmed all
-- 25 existing rows are already NULL here, so no data loss. A leftover legacy DB-level FK
-- (FK_MA_RecipeItem_IM_Item_SwatchCard_DBOnly, tying it to IM_Item.RecId from the original SQL
-- Server migration) must be dropped before the type can change. Widen to text and rename to match
-- the existing IM_ReceiptItem.ColorCardId convention already used for this exact master elsewhere.
ALTER TABLE "MA_RecipeItem" DROP CONSTRAINT "FK_MA_RecipeItem_IM_Item_SwatchCard_DBOnly";
ALTER TABLE "MA_RecipeItem" ALTER COLUMN "SwatchCardId" TYPE TEXT USING NULL;
ALTER TABLE "MA_RecipeItem" RENAME COLUMN "SwatchCardId" TO "ColorCardId";
