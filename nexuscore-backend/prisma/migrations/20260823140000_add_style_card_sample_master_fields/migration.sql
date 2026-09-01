-- Sample Card Master screen (legacy-ERP-style header/General tab parity for StyleCard, the
-- existing model that already backs this screen — see plm-cards.service.ts). These three
-- columns were the only genuine gaps against the target field list; no new tables.
--
-- IF NOT EXISTS makes this migration idempotent and safe to run twice: on this development
-- database the columns were already added via a direct ALTER TABLE while the schema change was
-- being reconciled into tracked migration history, so this file is a no-op here; on any other
-- environment (a fresh database, CI, another developer's clone) it performs the real ALTER.
ALTER TABLE "StyleCard" ADD COLUMN IF NOT EXISTS "inUse" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StyleCard" ADD COLUMN IF NOT EXISTS "sentByCustomer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StyleCard" ADD COLUMN IF NOT EXISTS "productCode" TEXT;
