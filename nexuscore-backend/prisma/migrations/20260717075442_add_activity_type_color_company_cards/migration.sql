-- CreateTable
CREATE TABLE "ActivityTypeCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "explanation" TEXT,
    "accessCode" TEXT,
    "specialCode" TEXT,
    "connectedActivityTypeId" TEXT,
    "departmentId" TEXT,
    "resourceId" TEXT,
    "processId" TEXT,
    "productionVariant" TEXT,
    "sampleTypeId" TEXT,
    "durationDay" INTEGER,
    "nextTransactionStartDuration" INTEGER,
    "nextTransactionStartDurationType" TEXT,
    "previousTransactionStartDuration" INTEGER,
    "previousTransactionStartDurationType" TEXT,
    "transactionType" TEXT,
    "sampleTaskRequestResourceS" BOOLEAN NOT NULL DEFAULT true,
    "preProduction" BOOLEAN NOT NULL DEFAULT false,
    "postProduction" BOOLEAN NOT NULL DEFAULT false,
    "resourceFromUserCard" BOOLEAN NOT NULL DEFAULT false,
    "generateResourceAssignmentsAutomatically" BOOLEAN NOT NULL DEFAULT false,
    "useForPlmTaskRequest" BOOLEAN NOT NULL DEFAULT true,
    "inUse" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityTypeCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColorCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "explanation" TEXT,
    "accessCode" TEXT,
    "color" TEXT NOT NULL,
    "doNotUseForVariantMatrix" BOOLEAN NOT NULL DEFAULT false,
    "inUse" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ColorCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT,
    "inUse" BOOLEAN NOT NULL DEFAULT true,
    "startOfPeriod" TIMESTAMP(3),
    "endOfPeriod" TIMESTAMP(3),
    "taxOffice" TEXT,
    "taxNo" TEXT,
    "idNo" TEXT,
    "mersisNo" TEXT,
    "tradeNo" TEXT,
    "companyType" TEXT,
    "activityType" TEXT,
    "naceCode" TEXT,
    "directedCompanies" TEXT,
    "forex" TEXT,
    "forexCalculationType" TEXT DEFAULT 'Use parameter',
    "useWorkplace" BOOLEAN NOT NULL DEFAULT false,
    "eGovernmentInfo" JSONB,
    "address" JSONB,
    "workDays" JSONB,
    "smSmmmYmmInfo" JSONB,
    "certificates" JSONB,
    "imageLogo" TEXT,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityTypeCard_code_key" ON "ActivityTypeCard"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ColorCard_code_key" ON "ColorCard"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyCard_code_key" ON "CompanyCard"("code");

-- AddForeignKey
ALTER TABLE "ActivityTypeCard" ADD CONSTRAINT "ActivityTypeCard_connectedActivityTypeId_fkey" FOREIGN KEY ("connectedActivityTypeId") REFERENCES "ActivityTypeCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTypeCard" ADD CONSTRAINT "ActivityTypeCard_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "DepartmentCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTypeCard" ADD CONSTRAINT "ActivityTypeCard_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "ResourceCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTypeCard" ADD CONSTRAINT "ActivityTypeCard_processId_fkey" FOREIGN KEY ("processId") REFERENCES "ProcessCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTypeCard" ADD CONSTRAINT "ActivityTypeCard_sampleTypeId_fkey" FOREIGN KEY ("sampleTypeId") REFERENCES "StyleSampleType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
