-- Integration of the company-slug URLs (20261009000000_company_slug_urls + its _menu_followup)
-- with 20261009000000_add_packing_list_item_size from another branch. On a database that already
-- ran the slug migrations, that migration runs afterwards and inserts its "Packing List" menu item
-- with a /dashboard/... href (and, its NOT EXISTS check looking only at the old href, possibly a
-- second copy). Runs after all of them, everywhere. Idempotent; data only, no schema change.

-- A /dashboard/... duplicate of an existing slug-free Packing List entry is switched off, not
-- deleted (nothing that may reference the row is touched).
UPDATE "MenuItem" d
SET "isActive" = false
WHERE d.href = '/dashboard/legacy-erp/packing-lists-list'
  AND EXISTS (
    SELECT 1 FROM "MenuItem" k
    WHERE k.href = '/legacy-erp/packing-lists-list' AND k."isActive" AND k.id <> d.id
  );

-- The same normalization as 20261009000001_company_slug_urls_menu_followup.
UPDATE "MenuItem"
SET href = CASE
  WHEN href LIKE '/dashboard/pages/onboarding-flow%' THEN substr(href, length('/dashboard/pages') + 1)
  WHEN href ~ '^/dashboard/pages/error/(404|500)' THEN substr(href, length('/dashboard/pages') + 1)
  WHEN href LIKE '/dashboard/%' THEN substr(href, length('/dashboard') + 1)
  WHEN href = '/dashboard' THEN '/default'
  ELSE href
END
WHERE href LIKE '/dashboard%';
