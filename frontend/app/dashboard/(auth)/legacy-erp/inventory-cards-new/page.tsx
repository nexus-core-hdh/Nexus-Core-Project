"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Boxes } from "lucide-react";
import { LegacyErpBreadcrumb } from "@/components/legacy-erp/breadcrumb-trail";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import FabricCardPage from "../fabric-cards/page";
import YarnCardPage from "../yarn-cards/page";
import TrimInventoryCardPage from "../trim-inventory-cards/page";

// Add New Inventory Card — a thin wrapper, not a new form. Picking an Inventory Type below
// mounts that type's EXISTING, unmodified page component directly (FabricCardPage /
// YarnCardPage / TrimInventoryCardPage) — every validation, dropdown, F2 lookup, master
// lookup, auto-generated code, duplicate check, tab and Unit section behaves exactly as it
// does on that screen's own route, because it IS that screen's own code, not a copy. Each
// embedded page reads its own mode/id via useWorkspaceSearchParams(), which resolves against
// THIS wrapper's own tab/URL — since neither is present here, every one of them defaults to
// its own "create" mode, exactly like opening it fresh from its own screen.
type InventoryType = "fabric" | "yarn" | "trim";

const TYPE_OPTIONS: { value: InventoryType; label: string }[] = [
  { value: "fabric", label: "Fabric Card" },
  { value: "yarn", label: "Yarn Card" },
  { value: "trim", label: "Trim Card" },
];

export default function AddInventoryCardPage() {
  const [type, setType] = useState<InventoryType | "">("");

  return (
    <>
      {/* This wrapper's own frame holds only the type selector — the moment a type is picked,
          that card's own page renders below with its own full breadcrumb/toolbar/tabs
          (unwrapped, not nested inside this container), exactly as it looks on its own route. */}
      <div className="mx-auto max-w-[1600px] space-y-6 p-6 pb-0 lg:p-8 lg:pb-0">
        <LegacyErpBreadcrumb trail={[
          { label: "Legacy ERP" },
          { label: "Inventory Card List", href: "/dashboard/legacy-erp/inventory-cards-list" },
          { label: "Add New Inventory Card" },
        ]} />

        <ModuleHeader
          icon={Boxes}
          title="Add New Inventory Card"
          subtitle="Choose an Inventory Type to load its form"
          actions={
            <div className="w-64 shrink-0">
              <Select value={type} onValueChange={(v) => setType(v as InventoryType)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder="Select Inventory Type..." />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          }
        />
      </div>

      {type === "fabric" && <FabricCardPage />}
      {type === "yarn" && <YarnCardPage />}
      {type === "trim" && <TrimInventoryCardPage />}
    </>
  );
}
