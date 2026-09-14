-- Cutting Card: add the real "Cutting Analysis Detail" fields to CuttingCard, and replace the flat
-- CuttingCardSize (one scalar Cut Qty per size) with a proper CuttingCardEntry log (one row per
-- real cutting batch: Date/Factory/Party No/Document/Explanation + its own per-size quantities) --
-- the reference legacy screen's own top "Cutting Entries" grid. The Cutting Summary's "Cut" row is
-- now always the SUM of every entry's own quantities for that size, never a second independently
-- editable number.
--
-- All existing CuttingCard/CuttingCardSize rows at this point are orphaned test/verification
-- artifacts from this same feature's own development this session (confirmed via a live query --
-- every one points at a Work Order id that was already deleted through the app's own UI/API), so
-- this clears them rather than attempting to backfill entries for data that was never real.
DELETE FROM "CuttingCardSize";
DELETE FROM "CuttingCard";

DROP TABLE "CuttingCardSize";

ALTER TABLE "CuttingCard"
  ADD COLUMN "markerNo" TEXT,
  ADD COLUMN "spreader" TEXT,
  ADD COLUMN "cadOperator" TEXT,
  ADD COLUMN "cutter" TEXT,
  ADD COLUMN "specialCode" TEXT,
  ADD COLUMN "explanation" TEXT,
  ADD COLUMN "fabricType" TEXT,
  ADD COLUMN "markerWeight" DECIMAL(14,4),
  ADD COLUMN "markerPlies" DECIMAL(14,4),
  ADD COLUMN "markerCount" DECIMAL(14,4),
  ADD COLUMN "sentForCutting" DECIMAL(14,4),
  ADD COLUMN "increase" DECIMAL(14,4),
  ADD COLUMN "returnQty" DECIMAL(14,4),
  ADD COLUMN "endOfRoll" DECIMAL(14,4),
  ADD COLUMN "clipping" DECIMAL(14,4),
  ADD COLUMN "markerGrams" DECIMAL(14,4),
  ADD COLUMN "actualGrams" DECIMAL(14,4);

CREATE TABLE "CuttingCardEntry" (
    "id" TEXT NOT NULL,
    "cuttingCardId" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "factoryId" INTEGER,
    "partyNo" TEXT,
    "document" TEXT,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuttingCardEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CuttingCardEntrySize" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "sizeCode" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "CuttingCardEntrySize_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CuttingCardEntry_cuttingCardId_idx" ON "CuttingCardEntry"("cuttingCardId");

CREATE UNIQUE INDEX "CuttingCardEntrySize_entryId_sizeCode_key" ON "CuttingCardEntrySize"("entryId", "sizeCode");

ALTER TABLE "CuttingCardEntry" ADD CONSTRAINT "CuttingCardEntry_cuttingCardId_fkey" FOREIGN KEY ("cuttingCardId") REFERENCES "CuttingCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CuttingCardEntrySize" ADD CONSTRAINT "CuttingCardEntrySize_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CuttingCardEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
