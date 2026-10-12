-- Company-slug URLs: signed-in frontend screens moved from /dashboard/... to /{company-slug}/...
-- (frontend/lib/company-path.ts). Stored paths become slug-free app paths (/plm/sample-cards);
-- guest pages (onboarding, error pages) move to the root. Data-only and idempotent.

-- 1. Every company gets a URL slug: "Nexus Core" -> "nexus-core", duplicates -> "-2", "-3", ...
WITH base AS (
  SELECT id,
         COALESCE(NULLIF(trim(BOTH '-' FROM regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'company') AS slug
  FROM "Company"
  WHERE slug IS NULL
),
numbered AS (
  SELECT b.id, b.slug,
         row_number() OVER (PARTITION BY b.slug ORDER BY b.id)
           + (SELECT count(*) FROM "Company" c WHERE c.slug = b.slug) AS n
  FROM base b
)
UPDATE "Company" c
SET slug = CASE WHEN n.n = 1 THEN n.slug ELSE n.slug || '-' || n.n END
FROM numbered n
WHERE c.id = n.id;

-- 2. Stored app paths: /dashboard/x -> /x (guest pages to the root, bare /dashboard -> /default).
CREATE OR REPLACE FUNCTION pg_temp.nc_app_path(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    WHEN p LIKE '/dashboard/pages/onboarding-flow%' THEN substr(p, length('/dashboard/pages') + 1)
    WHEN p ~ '^/dashboard/pages/error/(404|500)' THEN substr(p, length('/dashboard/pages') + 1)
    WHEN p LIKE '/dashboard/%' THEN substr(p, length('/dashboard') + 1)
    WHEN p = '/dashboard' THEN '/default'
    ELSE p
  END
$$;

UPDATE "MenuItem" SET href = pg_temp.nc_app_path(href) WHERE href LIKE '/dashboard%';
UPDATE "AuditLog" SET "screenKey" = pg_temp.nc_app_path("screenKey") WHERE "screenKey" LIKE '/dashboard%';
UPDATE "ApprovalConfiguration" SET "screenKey" = pg_temp.nc_app_path("screenKey") WHERE "screenKey" LIKE '/dashboard%';
UPDATE "ScreenParameter" SET "screenKey" = pg_temp.nc_app_path("screenKey") WHERE "screenKey" LIKE '/dashboard%';
UPDATE "ApprovalRequest" SET "screenKey" = pg_temp.nc_app_path("screenKey") WHERE "screenKey" LIKE '/dashboard%';

-- Saved workspace tabs / My Menu (JSON): every "/dashboard/..." string value.
UPDATE "UserSettings"
SET "tablePreferences" = replace(replace(replace("tablePreferences"::text,
      '"/dashboard/pages/onboarding-flow', '"/onboarding-flow'),
      '"/dashboard/', '"/'),
      '"/dashboard"', '"/default"')::jsonb
WHERE "tablePreferences"::text LIKE '%"/dashboard%';
