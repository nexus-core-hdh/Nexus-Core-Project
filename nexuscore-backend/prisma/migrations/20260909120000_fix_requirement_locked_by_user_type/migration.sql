-- Fabric/Trim/Yarn Requirement locking reuses the 3 real, pre-existing per-type lock-flag column
-- triples on "MA_WorkOrder" (IsRequirementLocked/RequirementLockedAt/RequirementLockedBy for
-- Fabric, IsTRequirementLocked/TRequirementLockedAt/TRequirementLockedBy for Trim,
-- IsYRequirementLocked/YRequirementLockedAt/YRequirementLockedBy for Yarn — confirmed via
-- information_schema; fabric-yarn-requirements.service.ts's own save() already WRITES these
-- today). This is not a new lock system — it is what already exists.
--
-- The 3 *LockedBy columns were "integer", but this application's real user identity
-- (Prisma User.id) is a UUID string, not a legacy numeric id. Every existing write to them goes
-- through the codebase-wide `Number(userId) || 1` idiom (used for every raw-legacy InsertedBy/
-- DeletedBy/UpdatedBy column), which is always NaN || 1 for a real logged-in user — so no
-- *LockedBy column has ever actually recorded who performed an action. Widening them to TEXT is
-- the minimum change needed to let these already-existing columns hold a real, resolvable user
-- id going forward. Confirmed via a whole-repo grep that nothing else in the codebase reads these
-- 3 columns or depends on their previous integer typing (only this one service's save() writes
-- them, and only with the meaningless "1"), so this is safe.
ALTER TABLE "MA_WorkOrder" ALTER COLUMN "RequirementLockedBy" TYPE TEXT USING "RequirementLockedBy"::TEXT;
ALTER TABLE "MA_WorkOrder" ALTER COLUMN "TRequirementLockedBy" TYPE TEXT USING "TRequirementLockedBy"::TEXT;
ALTER TABLE "MA_WorkOrder" ALTER COLUMN "YRequirementLockedBy" TYPE TEXT USING "YRequirementLockedBy"::TEXT;
