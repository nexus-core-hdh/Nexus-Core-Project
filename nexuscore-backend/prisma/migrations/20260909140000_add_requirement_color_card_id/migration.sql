-- Multi-Color BOM -> Color-Wise Requirement Calculation.
-- MA_Requirement (raw legacy table, read/written only via fabric-yarn-requirements.service.ts)
-- already has Variant1/Variant2 text columns but no stable Material Color identity, so two
-- differently-colored BOM lines resolving to the SAME InventoryId (e.g. RED fleece vs BLUE
-- fleece, same fabric item) currently collapse into one Total Requirement row -- silently wrong
-- once a Work Order has more than one garment color. Adds one nullable text column, same
-- convention already used for this exact relationship elsewhere (IM_ReceiptItem.ColorCardId,
-- MA_RecipeItem.ColorCardId) -- stores ColorCard.id directly, no join table needed. 23 existing
-- rows all get NULL (their prior, unchanged behavior -- see the service's own fallback-key logic).
ALTER TABLE "MA_Requirement" ADD COLUMN "ColorCardId" TEXT NULL;
