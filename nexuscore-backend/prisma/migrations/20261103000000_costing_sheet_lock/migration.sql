-- Costing Sheet lock: a locked sheet refuses every change (header, lines, delete) until a user with
-- costing:unlock unlocks it. Additive; existing sheets start unlocked.
ALTER TABLE "CostingSheet" ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CostingSheet" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
ALTER TABLE "CostingSheet" ADD COLUMN IF NOT EXISTS "lockedById" TEXT;
