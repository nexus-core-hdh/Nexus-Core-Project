// Style Card BOM header Route / Route Code (StyleCard.bomRouteCardId → RouteCard, StyleCard.bomRouteCode).
// "Route Code" is the selected Route's master code (RouteCard.code) — the legacy Route Code /
// Route Name pair — unless the Style Card saves its own Route Code, which then wins.

type RouteRef = { code?: string | null } | null | undefined;
type StyleCardRoute = { bomRouteCode?: string | null; bomRouteCard?: RouteRef } | null | undefined;

/** The Route Code a Style Card stands for: its own saved Route Code, else its Route's master code, else "". */
export function effectiveRouteCode(card: StyleCardRoute): string {
  return (card?.bomRouteCode ?? "").trim() || (card?.bomRouteCard?.code ?? "").trim();
}

/**
 * Route Code after the Route picker changes from `prev` to `next`: filled from the new Route's
 * master code when it was blank or still the previous Route's code (i.e. it came from the Route);
 * a Route Code typed in by hand is kept. Clearing the Route clears a code that came from it.
 */
export function routeCodeAfterRouteChange(current: string | null | undefined, prev: RouteRef, next: RouteRef): string {
  const cur = (current ?? "").trim();
  const prevCode = (prev?.code ?? "").trim();
  if (!cur || (prevCode && cur === prevCode)) return (next?.code ?? "").trim();
  return current ?? "";
}
