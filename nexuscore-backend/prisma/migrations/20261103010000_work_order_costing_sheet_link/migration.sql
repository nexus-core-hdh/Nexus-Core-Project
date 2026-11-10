-- Work Order -> Detail -> "Initial Cost": the Costing Sheet (PLM "CostingSheet") the Work Order is
-- costed on. No existing column links the two: MA_WorkOrder."InitialCostId" is a bigint FK to the
-- legacy MA_InitialCost table (0 rows) and cannot hold a CostingSheet's text id, and copying sheets
-- into MA_InitialCost would duplicate them. Same minimal shape as "StyleCardId" (migration
-- 20260908092625_add_style_card_link_to_work_order): one nullable text column holding the
-- CostingSheet's own id, with a real foreign key. RESTRICT: a Costing Sheet linked to a Work Order
-- cannot be deleted (CostingService.delete says which Work Order) — never silently unlinked.
-- Additive; "InitialCostId" is left as it is.
ALTER TABLE "MA_WorkOrder" ADD COLUMN IF NOT EXISTS "CostingSheetId" TEXT;

DO $$ BEGIN
  ALTER TABLE "MA_WorkOrder"
    ADD CONSTRAINT "FK_MA_WorkOrder_CostingSheet_DbOnly"
    FOREIGN KEY ("CostingSheetId") REFERENCES "CostingSheet"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "IX_MA_WorkOrder_CostingSheetId" ON "MA_WorkOrder"("CostingSheetId");
