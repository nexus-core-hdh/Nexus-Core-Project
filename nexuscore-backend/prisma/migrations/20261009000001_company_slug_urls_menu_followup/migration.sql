-- Follow-up to 20261009000000_company_slug_urls: migrations merged from other branches (e.g.
-- 20261003000000_add_custom_field_administration) may still insert /dashboard/... menu hrefs.
-- Normalizes them to slug-free app paths again. Idempotent.
UPDATE "MenuItem"
SET href = CASE
  WHEN href LIKE '/dashboard/pages/onboarding-flow%' THEN substr(href, length('/dashboard/pages') + 1)
  WHEN href ~ '^/dashboard/pages/error/(404|500)' THEN substr(href, length('/dashboard/pages') + 1)
  WHEN href LIKE '/dashboard/%' THEN substr(href, length('/dashboard') + 1)
  WHEN href = '/dashboard' THEN '/default'
  ELSE href
END
WHERE href LIKE '/dashboard%';
