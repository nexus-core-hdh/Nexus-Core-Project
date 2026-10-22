-- Company registration: Demo companies on a Trial subscription.
--  * Company.accountType: Standard (every existing company) or Demo.
--  * SubscriptionStatus 'Trial': a company on trial until Company.trialEndDate. Kept as Trial after
--    that date (never silently converted to Free/paid); "expired" is trialEndDate < now(), checked
--    server-side at sign-in and on every authenticated request (AuthService / JwtStrategy).
-- Additive only: existing companies become Standard and keep their subscription unchanged.
CREATE TYPE "CompanyAccountType" AS ENUM ('Standard', 'Demo');
ALTER TABLE "Company" ADD COLUMN "accountType" "CompanyAccountType" NOT NULL DEFAULT 'Standard';
ALTER TYPE "SubscriptionStatus" ADD VALUE 'Trial';
