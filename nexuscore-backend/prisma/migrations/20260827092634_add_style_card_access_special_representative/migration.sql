-- Style Card screen (General tab parity with the reference screenshot) — Access Code/Special
-- Code are plain text (same convention Fabric Card already uses for these two fields);
-- Representative is a 4th EmployeeCard lookup on StyleCard, following the exact same pattern
-- already used for Designer/Production Merchandiser/Product Merchandiser.
ALTER TABLE "StyleCard" ADD COLUMN IF NOT EXISTS "accessCode" TEXT;
ALTER TABLE "StyleCard" ADD COLUMN IF NOT EXISTS "specialCode" TEXT;
ALTER TABLE "StyleCard" ADD COLUMN IF NOT EXISTS "representativeId" TEXT;

-- AddForeignKey
ALTER TABLE "StyleCard" ADD CONSTRAINT "StyleCard_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "EmployeeCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
