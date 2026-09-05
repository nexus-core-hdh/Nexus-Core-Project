-- Sample Card General tab parity with Style Card's own general-tab.tsx (Brand/Department/Group
-- Code/Gender/Category/Customer Info/Access-Special Code/Designer-Representative/Garment Wash-
-- Dye, plus the Master Size + Sizes[] + Colorways[] Colorway/Sizes Set functionality) — all
-- genuinely SampleCard-owned columns, never linked to Style Card's own values.
ALTER TABLE "SampleCard" ADD COLUMN     "accessCode" TEXT,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "colorways" JSONB,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "customerStyleNo" TEXT,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "designerId" TEXT,
ADD COLUMN     "garmentDye" TEXT,
ADD COLUMN     "garmentWash" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "groupCode" TEXT,
ADD COLUMN     "masterSize" TEXT,
ADD COLUMN     "representativeId" TEXT,
ADD COLUMN     "sizes" JSONB,
ADD COLUMN     "specialCode" TEXT;

-- AddForeignKey
ALTER TABLE "SampleCard" ADD CONSTRAINT "SampleCard_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "DepartmentCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleCard" ADD CONSTRAINT "SampleCard_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleCard" ADD CONSTRAINT "SampleCard_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "EmployeeCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleCard" ADD CONSTRAINT "SampleCard_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "EmployeeCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
