-- Marks the platform-owner company (Nexus Core), which manages the other companies and their
-- billing and is never on a trial or subscription limit itself.
ALTER TABLE "Company" ADD COLUMN "isPlatformOwner" BOOLEAN NOT NULL DEFAULT false;
