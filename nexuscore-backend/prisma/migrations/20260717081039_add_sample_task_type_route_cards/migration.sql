-- CreateTable
CREATE TABLE "SampleTaskType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "explanation" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SampleTaskType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessCode" TEXT,
    "specialCode" TEXT,
    "serviceCode" TEXT,
    "inUse" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteCardLine" (
    "id" TEXT NOT NULL,
    "routeCardId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "explanation" TEXT,
    "unitPrice" DECIMAL(10,2),
    "forex" TEXT,
    "forexRate" DECIMAL(10,4),
    "forexUnitPrice" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RouteCardLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SampleTaskType_code_key" ON "SampleTaskType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RouteCard_code_key" ON "RouteCard"("code");

-- AddForeignKey
ALTER TABLE "RouteCardLine" ADD CONSTRAINT "RouteCardLine_routeCardId_fkey" FOREIGN KEY ("routeCardId") REFERENCES "RouteCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteCardLine" ADD CONSTRAINT "RouteCardLine_processId_fkey" FOREIGN KEY ("processId") REFERENCES "ProcessCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
