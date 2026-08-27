"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { plmApi } from "@/lib/nexuscore-api";
import { getCurrentUser } from "@/lib/auth";

interface SizeCard { id: string; code: string; name: string; sequence: number }

/**
 * Multi-select picker over the Size Card master (general-definitions/size-cards) — an
 * alternative/additional way to populate a StyleCard's `sizes` Json array (used by both
 * plm/sample-cards and plm/style-cards, both StyleCard-backed, hence this file living at the
 * shared plm/_components level rather than under either screen's own _components). Merges
 * rather than replaces on Save: any size already on the card that doesn't match a
 * SizeCard.code (a free-typed value like "2Y") is preserved untouched, since this dialog only
 * ever "knows about" master-listed sizes.
 */
export function SelectSizesDialog({
  open, onOpenChange, styleCardId, currentSizes, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  styleCardId: string;
  currentSizes: string[];
  onSaved: () => void;
}) {
  const [sizeCards, setSizeCards] = useState<SizeCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      try {
        const user = getCurrentUser();
        const r = await plmApi.sizes.list({ branchId: user?.branchId });
        const rows: SizeCard[] = Array.isArray(r) ? r : [];
        setSizeCards(rows);
        const masterCodes = new Set(rows.map((s) => s.code));
        setSelected(new Set(currentSizes.filter((s) => masterCodes.has(s))));
      } catch (e: any) {
        toast.error(e.message || "Failed to load sizes");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const masterCodes = new Set(sizeCards.map((s) => s.code));
      const freeTextKept = currentSizes.filter((s) => !masterCodes.has(s));
      const nextSizes = [...freeTextKept, ...Array.from(selected)];
      await plmApi.styleCards.update(styleCardId, { sizes: nextSizes });
      toast.success("Sizes updated");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save sizes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Select Sizes</DialogTitle></DialogHeader>
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
          ) : sizeCards.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No sizes defined yet — add some in Size Cards.</p>
          ) : (
            sizeCards.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer">
                <Checkbox checked={selected.has(s.code)} onCheckedChange={() => toggle(s.code)} />
                <span className="font-medium">{s.code}</span>
                <span className="text-muted-foreground">{s.name}</span>
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
