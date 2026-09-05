-- Route-name-only pickers: Style Card BOM header "Route" and Sample Card "Route", each an
-- existing RouteCard selected by name, id stored here. No Route Processes/RouteCardLine data
-- is read or copied through either link — that stays a future task.
ALTER TABLE "StyleCard" ADD COLUMN "bomRouteCardId" TEXT;
ALTER TABLE "StyleCard" ADD CONSTRAINT "StyleCard_bomRouteCardId_fkey" FOREIGN KEY ("bomRouteCardId") REFERENCES "RouteCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SampleCard" ADD COLUMN "routeCardId" TEXT;
ALTER TABLE "SampleCard" ADD CONSTRAINT "SampleCard_routeCardId_fkey" FOREIGN KEY ("routeCardId") REFERENCES "RouteCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
