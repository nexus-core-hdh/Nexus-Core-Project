"use client";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlidersHorizontal } from "lucide-react";
import { STANDARD_WORKLIST_ID, type Worklist } from "@/lib/legacy-erp/worklist-types";

interface WorklistBarProps {
  worklists: Worklist[];
  activeWorklistId: string;
  onActiveWorklistChange: (id: string) => void;
  onDesignOpen: () => void;
}

// The bottom "Customize Worklist [Standard ▼] [Design]" bar — pixel-identical markup to
// receipt-master-data/page.tsx's original inline bar, extracted so every list screen gets the
// same spacing/typography/button style/dropdown/alignment for free.
export function WorklistBar({ worklists, activeWorklistId, onActiveWorklistChange, onDesignOpen }: WorklistBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-4">
      <span className="text-xs font-medium text-muted-foreground">Customize Worklist</span>
      <Select value={activeWorklistId} onValueChange={onActiveWorklistChange}>
        <SelectTrigger className="h-8 w-56 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={STANDARD_WORKLIST_ID}>Standard</SelectItem>
          {worklists.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={onDesignOpen}>
        <SlidersHorizontal className="h-3.5 w-3.5 mr-2" />Design
      </Button>
    </div>
  );
}
