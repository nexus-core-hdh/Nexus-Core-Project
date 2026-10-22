"use client";

// Cutting Entry — Colour-wise Cutting: one (Work Order, Production Color, Fabric) context
// (?id=<Work Order>&color=<Production Color>). The screen itself is the shared
// components/legacy-erp/cutting-entry-screen.tsx, which Complete Order Cutting (../order) uses too.

import { CuttingEntryScreen } from "@/components/legacy-erp/cutting-entry-screen";

export default function CuttingEntryPage() {
  return <CuttingEntryScreen mode="color" />;
}
