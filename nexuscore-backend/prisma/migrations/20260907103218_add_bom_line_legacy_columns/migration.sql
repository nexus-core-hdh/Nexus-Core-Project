-- Extends StyleBomLine/SampleBomLine with the remaining legacy BOM columns (Manage Columns) that
-- have no existing master/relation and no existing calculated source — plain scalar fields
-- matching the exact free-text/boolean/decimal convention every other column on these two models
-- already uses (component/dia/gauge/finishWidth/finishRoute/revision, willBeCut/mainFabric,
-- wastePct/dyeWastagePct/otherWastagePct). See bom-tab.tsx for how each is used.

ALTER TABLE "StyleBomLine" ADD COLUMN "notForRequirement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StyleBomLine" ADD COLUMN "useFixQuantity" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StyleBomLine" ADD COLUMN "printWastagePct" DECIMAL(8,4) NOT NULL DEFAULT 0;
ALTER TABLE "StyleBomLine" ADD COLUMN "forex" TEXT;
ALTER TABLE "StyleBomLine" ADD COLUMN "manProductCode" TEXT;
ALTER TABLE "StyleBomLine" ADD COLUMN "orderCondition" TEXT;
ALTER TABLE "StyleBomLine" ADD COLUMN "condition" TEXT;
ALTER TABLE "StyleBomLine" ADD COLUMN "reasonRevision" TEXT;
ALTER TABLE "StyleBomLine" ADD COLUMN "dyeingInstruction" TEXT;
ALTER TABLE "StyleBomLine" ADD COLUMN "remarks" TEXT;
ALTER TABLE "StyleBomLine" ADD COLUMN "category" TEXT;
ALTER TABLE "StyleBomLine" ADD COLUMN "bodyColor" TEXT;
ALTER TABLE "StyleBomLine" ADD COLUMN "printColor" TEXT;
ALTER TABLE "StyleBomLine" ADD COLUMN "dyeingProcess" TEXT;

ALTER TABLE "SampleBomLine" ADD COLUMN "notForRequirement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SampleBomLine" ADD COLUMN "useFixQuantity" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SampleBomLine" ADD COLUMN "printWastagePct" DECIMAL(8,4) NOT NULL DEFAULT 0;
ALTER TABLE "SampleBomLine" ADD COLUMN "forex" TEXT;
ALTER TABLE "SampleBomLine" ADD COLUMN "manProductCode" TEXT;
ALTER TABLE "SampleBomLine" ADD COLUMN "orderCondition" TEXT;
ALTER TABLE "SampleBomLine" ADD COLUMN "condition" TEXT;
ALTER TABLE "SampleBomLine" ADD COLUMN "reasonRevision" TEXT;
ALTER TABLE "SampleBomLine" ADD COLUMN "dyeingInstruction" TEXT;
ALTER TABLE "SampleBomLine" ADD COLUMN "remarks" TEXT;
ALTER TABLE "SampleBomLine" ADD COLUMN "category" TEXT;
ALTER TABLE "SampleBomLine" ADD COLUMN "bodyColor" TEXT;
ALTER TABLE "SampleBomLine" ADD COLUMN "printColor" TEXT;
ALTER TABLE "SampleBomLine" ADD COLUMN "dyeingProcess" TEXT;
