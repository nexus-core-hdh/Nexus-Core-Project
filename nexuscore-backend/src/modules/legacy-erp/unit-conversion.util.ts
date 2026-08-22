import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Structural type (not an import of LegacyMasterLookupService itself) — avoids a circular module
// dependency, since inventory-receipt.service.ts (which legacy-master-lookup.service.ts's own
// import graph touches via screenKeyFor) imports from this file. Any service exposing
// listItemUnits the way LegacyMasterLookupService does satisfies this.
interface ItemUnitsLookup {
  listItemUnits(inventoryId: number): Promise<Array<{ id: number | string }>>;
}

// Single source of truth for "Base Unit + Unit Conversion" across Purchase Order, Purchase
// Receipt, Pending Receiving and Stock On Hand. Deliberately NOT a parallel unit system — every
// query here reads the same IM_ItemUnitItemSize (per-item conversion, IsMainUnit = Base Unit)
// already populated by the shared Unit satellite tab (yarn-card-satellites.service.ts,
// SATELLITES.unit), the same table legacy-master-lookup.service.ts's own listItemUnits() already
// joins for the Unit dropdown. No new table, no new column, no stored Base Quantity — it's fully
// derivable at read time from (InventoryId, UnitId, Quantity), so it's computed live everywhere.
//
// Conversion formula: BaseQuantity = EnteredQuantity * (UnitDivisor / UnitFactor). Derived from
// the existing Unit Set/Unit-tab UI's own field labels (unit-item-detail-grid.tsx: the field
// labeled "Quantity ({unitCode})" holds UnitFactor, "Equals ({baseUnitCode})" holds UnitDivisor —
// read together: "{UnitFactor} {unitCode} equals {UnitDivisor} {baseUnitCode}"), which matches the
// spec's own worked example exactly (1 Bag, factor=1, divisor=25 -> 25 KG). This directionality is
// not yet exercised by any consumer anywhere else in the codebase (only the Unit Set screen and
// Unit tab ever write UnitFactor/UnitDivisor) — the UI label wording above is the only real
// evidence of intent, and is what every formula below adopts.

// Item -> valid-units resolution, moved here (unchanged logic) from
// inventory-receipt.service.ts's own private resolveUnitId so Purchase Order can reuse the exact
// same normalization instead of having no unit resolution at all. No inventoryId (e.g. a Service
// line) -> unitId passes through untouched. An inventoryId with zero configured units also passes
// the given value through (nothing to normalize against). Otherwise an unrelated/stale unitId is
// silently normalized to the item's own main unit rather than rejected outright, so saves never
// hard-fail over a value the frontend itself already prevents a user from picking.
export async function resolveLineUnitId(
  masterLookupSvc: ItemUnitsLookup,
  inventoryId: any,
  unitId: any,
): Promise<number | null | undefined> {
  if (inventoryId === undefined) return unitId;
  if (inventoryId === null) return unitId;
  const validUnits = await masterLookupSvc.listItemUnits(Number(inventoryId));
  if (!validUnits.length) return unitId ?? null;
  const requested = unitId != null ? Number(unitId) : null;
  if (requested != null && validUnits.some((u: any) => Number(u.id) === requested)) return requested;
  return Number(validUnits[0].id);
}

// Write-time enforcement (spec: "if no valid conversion exists ... return a clear validation
// error", "prevent clients from submitting arbitrary conversion factors"). Only rejects when the
// item HAS configured units (IM_ItemUnitItemSize rows exist) but the given unitId isn't one of
// them — an item that never used the Unit tab at all keeps today's exact behavior (no-op), so this
// can never break a record that predates this feature. Never trusts a client-sent factor/divisor —
// only ever resolves them from IM_ItemUnitItemSize itself.
export async function assertValidItemUnit(prisma: PrismaService, inventoryId: any, unitId: any): Promise<void> {
  if (inventoryId === undefined || inventoryId === null || unitId === undefined || unitId === null) return;
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT "UnitItemId" as "unitItemId" FROM "IM_ItemUnitItemSize"
    WHERE "InventoryId" = ${Number(inventoryId)} AND "IsDeleted" = 0
  `);
  if (!rows.length) return;
  const valid = rows.some((r) => Number(r.unitItemId) === Number(unitId));
  if (!valid) {
    throw new BadRequestException('No conversion is configured for this unit on this item — choose one of the item\'s configured units.');
  }
}

// Missing-Base-Unit blocking (spec: "if an Item has no IsMainUnit=true, block conversion-dependent
// stock transactions ... do not assume 1:1 ... do not arbitrarily select a Base Unit"). Scoped
// deliberately narrow: only blocks an item that has ENTERED the per-item conversion system (has ≥1
// IM_ItemUnitItemSize row) but has a data-integrity gap — no row flagged IsMainUnit=1, so which
// unit is "base" is genuinely undefined. An item with ZERO configured units was never enrolled in
// this system at all (its raw quantity has always been its only/native unit, exactly as before this
// feature existed anywhere in the codebase) — blocking those too would hard-stop the vast majority
// of today's items over a feature they never opted into, which is not "missing Base Unit," it's
// "not using Base Units." Same reasoning `assertValidItemUnit` above already uses.
export async function assertHasBaseUnit(prisma: PrismaService, inventoryId: any): Promise<void> {
  if (inventoryId === undefined || inventoryId === null) return;
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT "IsMainUnit" as "isMainUnit" FROM "IM_ItemUnitItemSize"
    WHERE "InventoryId" = ${Number(inventoryId)} AND "IsDeleted" = 0
  `);
  if (!rows.length) return;
  const hasBaseUnit = rows.some((r) => Number(r.isMainUnit) === 1);
  if (!hasBaseUnit) {
    throw new BadRequestException('This item has configured units but no Base Unit is set — set one unit as the Base Unit before posting stock transactions for it.');
  }
}

// Reusable SQL fragment: converts `qtyExpr` (a Quantity expressed in `unitIdExpr`) into the given
// item's (`invIdExpr`) Base Unit. LEFT JOIN LATERAL against the matching IM_ItemUnitItemSize row
// (for the exact unit used) and, separately, the item's own IsMainUnit=1 row (for its
// UnitFactor/UnitDivisor, which convention-wise is 1/1 for the base row itself). Falls back to
// `qtyExpr` unchanged when the item has no configured units at all (legacy/never-configured items
// keep today's exact behavior) or when the specific unit used has no matching row (can only happen
// for data written before this feature existed — assertValidItemUnit blocks it going forward).
// `alias` must be unique within the enclosing query whenever this fragment is used more than once
// (e.g. Pending Receiving joins it for both the PO line and the receipt lines).
export function baseQuantitySql(qtyExpr: Prisma.Sql, invIdExpr: Prisma.Sql, unitIdExpr: Prisma.Sql, alias: string): Prisma.Sql {
  const matched = Prisma.raw(`${alias}_unit`);
  return Prisma.sql`(${qtyExpr} * COALESCE(${matched}."UnitDivisor" / NULLIF(${matched}."UnitFactor", 0), 1))`;
}

// Inverse of baseQuantitySql — converts a quantity already expressed in the Base Unit back into
// whichever unit `alias`'s join resolved (i.e. `qtyExpr * UnitFactor/UnitDivisor`). Used only where
// an existing field's contract requires staying in a line's own entered unit rather than switching
// to the Base Unit (see purchase-order.service.ts's listPending — pending-orders-dialog.tsx copies
// `pendingQty` straight onto a new receipt line together with the PO line's own `unitId`).
export function fromBaseQuantitySql(qtyExpr: Prisma.Sql, alias: string): Prisma.Sql {
  const matched = Prisma.raw(`${alias}_unit`);
  return Prisma.sql`(${qtyExpr} * COALESCE(${matched}."UnitFactor" / NULLIF(${matched}."UnitDivisor", 0), 1))`;
}

// The LEFT JOIN LATERAL itself, kept separate from the expression above so callers can place it
// alongside their other joins (see purchase-order.service.ts/inventory-receipt.service.ts/
// inventory-card.service.ts). Resolves the row matching the exact (item, unit) pair used by the
// line being converted — not the item's main-unit row, which isn't needed by the formula (a line
// already in the Base Unit has a matching row with UnitFactor=UnitDivisor=1 by convention).
export function baseQuantityJoinSql(invIdExpr: Prisma.Sql, unitIdExpr: Prisma.Sql, alias: string): Prisma.Sql {
  const matched = Prisma.raw(`${alias}_unit`);
  return Prisma.sql`
    LEFT JOIN LATERAL (
      SELECT "UnitFactor", "UnitDivisor" FROM "IM_ItemUnitItemSize"
      WHERE "InventoryId" = ${invIdExpr} AND "UnitItemId" = ${unitIdExpr} AND "IsDeleted" = 0
      LIMIT 1
    ) ${matched} ON true
  `;
}

// Single-value helper for call sites that only need one converted number (not embedded in a
// larger query) — e.g. assertPendingQty's own requestedQty. Same fallback rules as
// baseQuantitySql/baseQuantityJoinSql above.
export async function toBaseQuantity(prisma: PrismaService, inventoryId: any, unitId: any, quantity: number): Promise<number> {
  if (inventoryId === undefined || inventoryId === null || unitId === undefined || unitId === null) return quantity;
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT "UnitFactor" as "unitFactor", "UnitDivisor" as "unitDivisor" FROM "IM_ItemUnitItemSize"
    WHERE "InventoryId" = ${Number(inventoryId)} AND "UnitItemId" = ${Number(unitId)} AND "IsDeleted" = 0
    LIMIT 1
  `);
  if (!rows.length) return quantity;
  const factor = Number(rows[0].unitFactor);
  const divisor = Number(rows[0].unitDivisor);
  if (!factor) return quantity;
  return quantity * (divisor / factor);
}

// ---------------------------------------------------------------------------------------------
// Named centralized API (ConvertToBaseUnit / ConvertFromBaseUnit) — the explicit entry points
// every module should call instead of re-deriving the formula. Both are thin wrappers: no new
// math, no new query shape — `convertToBaseUnit` is `toBaseQuantity` above plus the
// missing-Base-Unit guard; `convertFromBaseUnit` is the async mirror of `fromBaseQuantitySql`
// (which only existed as a SQL fragment for embedding in larger queries until now). Both reject
// (rather than silently assume 1:1) exactly when the item has configured units but no row is
// flagged IsMainUnit=1 — see assertHasBaseUnit's own comment for why zero-configured-units items
// are not blocked by this.
// ---------------------------------------------------------------------------------------------

export async function convertToBaseUnit(prisma: PrismaService, itemId: any, quantity: number, fromUnitId: any): Promise<number> {
  await assertHasBaseUnit(prisma, itemId);
  return toBaseQuantity(prisma, itemId, fromUnitId, quantity);
}

export async function convertFromBaseUnit(prisma: PrismaService, itemId: any, baseQuantity: number, toUnitId: any): Promise<number> {
  await assertHasBaseUnit(prisma, itemId);
  if (itemId === undefined || itemId === null || toUnitId === undefined || toUnitId === null) return baseQuantity;
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT "UnitFactor" as "unitFactor", "UnitDivisor" as "unitDivisor" FROM "IM_ItemUnitItemSize"
    WHERE "InventoryId" = ${Number(itemId)} AND "UnitItemId" = ${Number(toUnitId)} AND "IsDeleted" = 0
    LIMIT 1
  `);
  if (!rows.length) return baseQuantity;
  const factor = Number(rows[0].unitFactor);
  const divisor = Number(rows[0].unitDivisor);
  if (!divisor) return baseQuantity;
  return baseQuantity * (factor / divisor);
}
