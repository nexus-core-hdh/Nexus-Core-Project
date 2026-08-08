"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, Boxes } from "lucide-react";
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Legacy ERP</span>
          <ChevronRight className="h-3 w-3" />
          <span>Inventory Card List</span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-foreground">Add New Inventory Card</span>
        </div>

        <div className="flex items-center gap-4 border-b pb-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Boxes className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Add New Inventory Card</h1>
            <p className="mt-1 text-xs text-muted-foreground">Choose an Inventory Type to load its form</p>
          </div>
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
        </div>
      </div>

      {type === "fabric" && <FabricCardPage />}
      {type === "yarn" && <YarnCardPage />}
      {type === "trim" && <TrimInventoryCardPage />}
    </>
  );
}
