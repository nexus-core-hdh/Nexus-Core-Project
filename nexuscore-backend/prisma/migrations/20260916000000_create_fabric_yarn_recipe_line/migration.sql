-- Recovery migration: the "FabricYarnRecipeLine" table was never actually created by any prior
-- migration in this repo (only two later ALTER migrations reference it -- 20260917090000 and
-- 20260918100000 -- both assuming it already existed, likely because it was created out-of-band
-- via `prisma db push` on another machine's dev DB before migrations were introduced for this
-- table). This DB never had that push applied, so `migrate deploy` failed with "relation
-- FabricYarnRecipeLine does not exist". This migration creates it in the pre-20260917090000 state
-- (no colorCardId/updatedAt yet -- those two pending migrations add them on top, unchanged) so the
-- migration history replays correctly from here.
CREATE TABLE "FabricYarnRecipeLine" (
    "id" TEXT NOT NULL,
    "fabricInventoryId" INTEGER NOT NULL,
    "yarnInventoryId" INTEGER,
    "yarnCode" TEXT,
    "yarnName" TEXT,
    "explanation" TEXT,
    "variant1" TEXT,
    "variant2" TEXT,
    "process" TEXT,
    "knittedInVariants" TEXT,
    "percentage" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "wastePct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "dyeWastagePct" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FabricYarnRecipeLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FabricYarnRecipeLine_fabricInventoryId_idx" ON "FabricYarnRecipeLine"("fabricInventoryId");
