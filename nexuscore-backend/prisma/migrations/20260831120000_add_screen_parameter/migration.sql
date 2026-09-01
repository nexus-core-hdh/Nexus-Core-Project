-- CreateTable
CREATE TABLE "ScreenParameter" (
    "id" TEXT NOT NULL,
    "screenKey" TEXT NOT NULL,
    "paramKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "value" TEXT,
    "options" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ScreenParameter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScreenParameter_screenKey_idx" ON "ScreenParameter"("screenKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScreenParameter_screenKey_paramKey_key" ON "ScreenParameter"("screenKey", "paramKey");
