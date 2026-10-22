"use client";

// Complete Order Cutting (?id=<Work Order>) — the same Cutting Entry screen as Colour-wise
// (components/legacy-erp/cutting-entry-screen.tsx) for every Production Color of the Work Order:
// one size-wise Order / Will Be Cut / Cut / Less / Over summary added up across the colors, while
// every Cutting Entry and its quantities stay with their own color.

import { CuttingEntryScreen } from "@/components/legacy-erp/cutting-entry-screen";

export default function CompleteOrderCuttingPage() {
  return <CuttingEntryScreen mode="order" />;
}
