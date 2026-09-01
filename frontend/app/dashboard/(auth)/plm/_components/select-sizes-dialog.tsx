"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { legacyErpApi, plmApi } from "@/lib/nexuscore-api";

interface SizeGroup { id: number; code: string; name: string; inUse?: number }

/**
 * Size Group picker over the legacy-erp Size Set master (MA_SizeSet header / MA_SizeSetItem
 * detail — see size-set.service.ts, the same master/detail shape Unit Set already uses) — used
 * by both plm/sample-cards and plm/style-cards (both StyleCard-backed, hence living at the
 * shared plm/_components level rather than under either screen's own _components). Selecting a
 * group (e.g. "BABY") fetches that Size Set's own configured detail rows and loads ALL of them
 * onto the card's `sizes` array in one action — there is no individual per-size picking here
 * anymore; the Size Set IS the list of sizes for that group, not a menu to pick from.
 * Merges rather than fully replaces: any size already on the card that isn't one of the newly
 * selected group's own codes (a free-typed value like "2Y") is preserved untouched.
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
  const [groups, setGroups] = useState<SizeGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      try {
        const r = await legacyErpApi.sizeSets.list();
        const rows: SizeGroup[] = Array.isArray(r) ? r : [];
        setGroups(rows.filter((g: any) => g.inUse !== 0));
      } catch (e: any) {
        toast.error(e.message || "Failed to load size groups");
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const selectGroup = async (group: SizeGroup) => {
    setApplyingId(group.id);
    try {
      const items: any = await legacyErpApi.sizeSets.listItems(group.id);
      const groupCodes = (Array.isArray(items) ? items : [])
        .filter((it: any) => it.inUse !== 0)
        .map((it: any) => String(it.code || "").trim())
        .filter((c: string) => !!c);
      if (!groupCodes.length) {
        toast.error(`No sizes configured for "${group.name.trim()}" yet — add some in Sizes.`);
        return;
      }
      // The selected group's own full set replaces whatever master-sourced sizes were there
      // before; a manually-typed size that isn't one of this group's own codes is kept as-is.
      const freeTextKept = currentSizes.filter((s) => !groupCodes.includes(s));
      const nextSizes = [...freeTextKept, ...groupCodes];
      await plmApi.styleCards.update(styleCardId, { sizes: nextSizes });
      toast.success(`Loaded ${groupCodes.length} size${groupCodes.length === 1 ? "" : "s"} from "${group.name.trim()}"`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to load sizes");
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Select Sizes</DialogTitle></DialogHeader>
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No size groups defined yet — add some in Sizes.</p>
          ) : (
            groups.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={applyingId !== null}
                onClick={() => selectGroup(g)}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted/50 disabled:opacity-50 text-left"
              >
                <span className="font-medium">{g.name.trim()}</span>
                {applyingId === g.id && <span className="text-xs text-muted-foreground">Loading...</span>}
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
