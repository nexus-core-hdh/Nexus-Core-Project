-- Costing Sheet calculation panel: manually overridden PKR amounts (Overhead, Others, Waste,
-- G.Supplies, Excess Production, Profit, Financial Cost, Commission, Commission-3), as
-- {"overhead": 1200.5, ...}. A key present = that amount is manual; absent = automatic from its %.
-- Additive and nullable; no existing row changes (NULL = every amount automatic, as before).
ALTER TABLE "CostingSheet" ADD COLUMN IF NOT EXISTS "manualAmounts" JSONB;
