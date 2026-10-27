-- ProcessCard (PLM process master, named by Route Card lines) → legacy MA_Process (what Order
-- Manufacturing Entry stores in MA_WorkOrderProduction.ProcessId): an explicit, optional link.
-- Additive and nullable; no existing row changes.
ALTER TABLE "ProcessCard" ADD COLUMN IF NOT EXISTS "legacyProcessId" INTEGER;
