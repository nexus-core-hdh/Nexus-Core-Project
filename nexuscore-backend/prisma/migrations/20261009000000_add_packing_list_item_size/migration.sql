-- Packing List — dynamic size quantities (Size Strategy D).
-- Additive only: one new table, its indexes/constraints and one navigation entry. No DROP, no
-- TRUNCATE, no DELETE, no ALTER of any existing table. The legacy IM_PackagingList /
-- IM_PackagingListItem / IM_PackagingListItemVariant / IM_Packaging tables are untouched and stay
-- the header/line store; IM_PackagingListItemVariant.InventoryVariantId is NOT used, because the
-- legacy IM_ItemVariant master is empty and Nexus Work Orders identify a size by the text key
-- "Color‖Size" (MA_WorkOrderItemVariant.Explanation) instead.
--
-- One row per (packing line, variant key). variantKey is exactly the Work Order's own identity,
-- e.g. 'MIXED ECRU‖03M', so packed quantities bind to the Order's sizes by identity, never by
-- column position.

CREATE TABLE IF NOT EXISTS "PackingListItemSize" (
  "id" BIGSERIAL PRIMARY KEY,
  "packingListItemId" BIGINT NOT NULL,
  "variantKey" TEXT NOT NULL,
  "quantity" DECIMAL(18, 4) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" INTEGER,
  CONSTRAINT "PackingListItemSize_quantity_check" CHECK ("quantity" >= 0),
  CONSTRAINT "PackingListItemSize_variantKey_check" CHECK (length(btrim("variantKey")) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "PackingListItemSize_packingListItemId_variantKey_key"
  ON "PackingListItemSize"("packingListItemId", "variantKey");

CREATE INDEX IF NOT EXISTS "PackingListItemSize_packingListItemId_idx"
  ON "PackingListItemSize"("packingListItemId");

-- Reference to the legacy line it belongs to — NOT VALID, the same form every legacy FK in the
-- baseline uses, so it is enforced for new rows without scanning or touching existing data.
DO $packing_list_item_size_fk$
BEGIN
  IF to_regclass('"IM_PackagingListItem"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PackingListItemSize_packingListItemId_fkey') THEN
    ALTER TABLE "PackingListItemSize"
      ADD CONSTRAINT "PackingListItemSize_packingListItemId_fkey"
      FOREIGN KEY ("packingListItemId") REFERENCES "IM_PackagingListItem"("RecId") NOT VALID;
  END IF;
END
$packing_list_item_size_fk$;

-- Navigation entry beside "Work Order" / "Order Manufacturing Entry" in the existing "Legacy ERP"
-- sidebar group — same global (companyId/branchId NULL) shape as the other legacy entries.
INSERT INTO "MenuItem" ("id", "title", "href", "icon", "group", "parentId", "order", "isActive", "isComing", "isNew", "newTab", "companyId", "branchId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'Packing List', '/dashboard/legacy-erp/packing-lists-list', 'Package', 'Legacy ERP', NULL, 815, true, false, false, false, NULL, NULL, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "MenuItem" WHERE "href" = '/dashboard/legacy-erp/packing-lists-list');
