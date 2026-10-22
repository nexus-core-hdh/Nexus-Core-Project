import { fetchAllPages, legacyErpApi } from "@/lib/nexuscore-api";

// Display values for the master records a SAVED transaction references — shared by the Purchase /
// Subcontract Order, Inventory Receipt and Contract screens' View/Edit loaders.

// Current Account label "Code — Name". accounts.get() returns the full FI_Account row
// (currentAccountCode/currentAccountName); the generic lookup / picker rows use code/name — both
// shapes are read here so a loader never renders "undefined — undefined".
export function currentAccountLabel(account: any): string {
  if (!account) return "";
  const code = account.currentAccountCode ?? account.code ?? "";
  const name = account.currentAccountName ?? account.name ?? "";
  return code && name ? `${code} — ${name}` : code || name;
}

// Saved lines' Inventory records by id: the Inventory Card List (code/name plus unit, stock and
// last price the grids also show), then — for any id that list doesn't return, or if it failed —
// the existing resolve-by-id master lookup ("inventory-item", IM_Item of any card type), so a line
// that really references an item never shows a blank Code/Name.
export async function loadSavedInventoryItems(ids: Array<number | string | null | undefined>): Promise<Map<string, any>> {
  const wanted = Array.from(new Set(ids.filter((id) => id != null && id !== "").map(String)));
  const byId = new Map<string, any>();
  if (!wanted.length) return byId;
  try {
    const all: any = await fetchAllPages((req) => legacyErpApi.inventoryCards.list(undefined, req));
    for (const r of Array.isArray(all) ? all : []) byId.set(String(r.id), r);
  } catch { /* fall through to the by-id lookup below */ }
  const missing = wanted.filter((id) => !byId.has(id));
  const resolved = await Promise.all(missing.map((id) => legacyErpApi.lookupTableGet("inventory-item", Number(id)).catch(() => null)));
  resolved.forEach((r: any, i) => {
    if (r) byId.set(missing[i], { id: r.id, inventoryCode: r.code ?? "", inventoryName: r.name ?? "" });
  });
  return byId;
}
