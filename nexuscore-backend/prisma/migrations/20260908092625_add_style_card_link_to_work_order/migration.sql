-- "Create Order" from a Style Card, using the existing Work Order system — genuine DB
-- investigation (information_schema on both "MA_WorkOrder" and "MA_WorkOrderItem") confirmed
-- NO existing column links a Work Order back to a Style Card; the Work Order screen's own
-- styleCardId/styleCode/styleName were previously in-memory-only display fields (see
-- work-orders/page.tsx's own "Global Rule #5" comment: no bridge column existed, so a reload
-- never re-resolved the real Style Card, only best-effort text copied into Explanation/
-- SpecialCode). This is the minimal real column needed to persist that relationship — one
-- nullable text column on the Work Order HEADER (MA_WorkOrder), holding the linked StyleCard's
-- own uuid primary key, with a real foreign key constraint since both tables already live in
-- the same Postgres database. Not a new table, not a duplicate of any existing relationship.
ALTER TABLE "MA_WorkOrder" ADD COLUMN "StyleCardId" TEXT;

ALTER TABLE "MA_WorkOrder"
  ADD CONSTRAINT "FK_MA_WorkOrder_StyleCard_DbOnly"
  FOREIGN KEY ("StyleCardId") REFERENCES "StyleCard"("id") ON DELETE SET NULL;

CREATE INDEX "IX_MA_WorkOrder_StyleCardId" ON "MA_WorkOrder"("StyleCardId");
