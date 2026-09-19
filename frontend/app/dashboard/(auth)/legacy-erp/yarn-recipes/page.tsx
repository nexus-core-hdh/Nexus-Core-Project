"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { ModuleHeader } from "@/components/legacy-erp/module-header";
import { CardLookupDialog, type CardLookupRow } from "@/components/legacy-erp/card-lookup-dialog";
import { YarnRecipeDialog } from "@/components/legacy-erp/yarn-recipe-dialog";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Scissors, Search, Plus, Eye, Pencil, Copy, ChevronRight, ChevronsUpDown, PackageSearch } from "lucide-react";

type FabricRef = { id: number; inventoryCode: string; inventoryName: string };

type RecipeSummary = {
  recipeType: "common" | "color";
  colorCardId: string | null;
  colorCode: string | null;
  colorName: string | null;
  colorSwatch: string | null;
  rowCount: number;
  totalPct: number;
  updatedAt: string;
};

type ColorOption = { id: string; code: string; name: string; color?: string | null };

// Yarn Recipe — list/management screen for the Fabric-level Yarn Recipe feature
// (FabricYarnRecipeLine, FabricYarnRecipeService — same tables/service the Yarn Recipe Detail
// dialog already uses from bom-tab.tsx's Fabric Name cell). This screen doesn't introduce a
// second implementation: it's a browsing surface over the exact same
// getYarnRecipeSummary/getYarnRecipe/upsertYarnRecipe/listYarnRecipeColors endpoints, opening the
// SAME YarnRecipeDialog for view/edit. Placed under legacy-erp (not plm/) because Fabric Cards
// themselves live entirely under legacy-erp/fabric-cards — this keeps Fabric-adjacent screens in
// one place rather than splitting them across two modules.
export default function YarnRecipesPage() {
  const [fabric, setFabric] = useState<FabricRef | null>(null);
  const [fabricPickerOpen, setFabricPickerOpen] = useState(false);
  const [summaries, setSummaries] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [availableColors, setAvailableColors] = useState<ColorOption[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitial, setDialogInitial] = useState<{ recipeType?: "common" | "color"; colorId?: string | null }>({});

  const [copySource, setCopySource] = useState<RecipeSummary | null>(null);

  const loadSummaries = async (f: FabricRef) => {
    setLoading(true);
    try {
      const r: any = await legacyErpApi.fabricCards.getYarnRecipeSummary(f.id);
      setSummaries(Array.isArray(r) ? r : []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load Yarn Recipes");
      setSummaries([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableColors = async (f: FabricRef) => {
    try {
      const r: any = await legacyErpApi.fabricCards.listYarnRecipeColors(f.id);
      setAvailableColors(Array.isArray(r) ? r : []);
    } catch {
      setAvailableColors([]);
    }
  };

  useEffect(() => {
    if (!fabric) { setSummaries([]); setAvailableColors([]); return; }
    loadSummaries(fabric);
    loadAvailableColors(fabric);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fabric?.id]);

  const openDialog = (initial?: { recipeType?: "common" | "color"; colorId?: string | null }) => {
    setDialogInitial(initial || {});
    setDialogOpen(true);
  };

  const closeDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open && fabric) loadSummaries(fabric);
  };

  const performCopy = async (targetColorId: string) => {
    if (!copySource || !fabric) return;
    try {
      const sourceRows: any = await legacyErpApi.fabricCards.getYarnRecipe(fabric.id, copySource.colorCardId);
      await legacyErpApi.fabricCards.upsertYarnRecipe(fabric.id, Array.isArray(sourceRows) ? sourceRows : [], targetColorId);
      toast.success("Recipe copied to the selected color");
      setCopySource(null);
      loadSummaries(fabric);
    } catch (e: any) {
      toast.error(e.message || "Failed to copy recipe");
    }
  };

  const term = search.trim().toLowerCase();
  const filteredSummaries = term
    ? summaries.filter((s) => {
        const label = s.recipeType === "common" ? "common all colors" : `color override ${s.colorCode || ""} ${s.colorName || ""}`;
        return label.toLowerCase().includes(term);
      })
    : summaries;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span>Fabric</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Yarn Recipe</span>
      </div>

      <ModuleHeader
        icon={Scissors}
        title="Yarn Recipe"
        subtitle="Manage yarn composition for each fabric (common for all colors, with optional color-specific overrides)."
        actions={
          <>
            <button
              type="button"
              onClick={() => setFabricPickerOpen(true)}
              className="flex h-9 w-64 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm hover:bg-accent"
            >
              <span className={cn("truncate", fabric ? "text-foreground" : "text-muted-foreground")}>
                {fabric ? `Fabric: ${fabric.inventoryCode}` : "Select Fabric"}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
            <InputGroup className="h-9 w-56 shrink-0">
              <InputGroupAddon>
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-sm"
                disabled={!fabric}
              />
            </InputGroup>
            <Button size="sm" onClick={() => openDialog()} disabled={!fabric}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Recipe
            </Button>
          </>
        }
      />

      <div className="overflow-hidden rounded-xl border shadow-sm">
        {!fabric ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon"><PackageSearch /></EmptyMedia>
              <EmptyTitle>Select a Fabric to begin</EmptyTitle>
              <EmptyDescription>Choose a Fabric above to view its Common and Color Override Yarn Recipes.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" variant="outline" onClick={() => setFabricPickerOpen(true)}>
                <Search className="h-3.5 w-3.5 mr-1.5" />Select Fabric
              </Button>
            </EmptyContent>
          </Empty>
        ) : loading ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Loading...</p>
        ) : filteredSummaries.length === 0 ? (
          <Empty className="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Scissors /></EmptyMedia>
              <EmptyTitle>{term ? "No matching recipes" : "No Yarn Recipe yet"}</EmptyTitle>
              <EmptyDescription>
                {term ? "Try a different search term." : `${fabric.inventoryCode} has no Common or Color Override recipe configured yet.`}
              </EmptyDescription>
            </EmptyHeader>
            {!term && (
              <EmptyContent>
                <Button size="sm" onClick={() => openDialog()}><Plus className="h-3.5 w-3.5 mr-1.5" />Add Recipe</Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Fabric Code</TableHead>
                <TableHead>Fabric Name</TableHead>
                <TableHead>Recipe Type</TableHead>
                <TableHead>Color / Variant</TableHead>
                <TableHead className="text-right">Total %</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSummaries.map((s, idx) => (
                <TableRow key={s.colorCardId ?? "common"}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell><span className="font-mono text-primary">{fabric.inventoryCode}</span></TableCell>
                  <TableCell>{fabric.inventoryName}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "font-normal",
                        s.recipeType === "common"
                          ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                          : "bg-pink-500/10 text-pink-700 dark:text-pink-400"
                      )}
                    >
                      {s.recipeType === "common" ? "Common (All Colors)" : "Color Override"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {s.recipeType === "common" ? (
                      <span className="text-muted-foreground">--</span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {s.colorSwatch && <span className="h-3 w-3 shrink-0 rounded-full border" style={{ backgroundColor: s.colorSwatch }} />}
                        {s.colorCode || s.colorName}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{s.totalPct}%</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(s.updatedAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge className="bg-emerald-600 font-normal hover:bg-emerald-600/90 dark:bg-emerald-500">Active</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="View" onClick={() => openDialog({ recipeType: s.recipeType, colorId: s.colorCardId })}>
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openDialog({ recipeType: s.recipeType, colorId: s.colorCardId })}>
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Copy to another color" onClick={() => setCopySource(s)}>
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {fabricPickerOpen && (
        <CardLookupDialog<CardLookupRow>
          open={fabricPickerOpen}
          onOpenChange={setFabricPickerOpen}
          title="Select Fabric"
          fetchOptions={legacyErpApi.fabricCards.list}
          onSelect={(row: any) => {
            setFabric({ id: Number(row.id), inventoryCode: row.inventoryCode || "", inventoryName: row.inventoryName || "" });
            setFabricPickerOpen(false);
          }}
        />
      )}

      {fabric && dialogOpen && (
        <YarnRecipeDialog
          open={dialogOpen}
          onOpenChange={closeDialog}
          fabricInventoryId={fabric.id}
          fabricCode={fabric.inventoryCode}
          fabricName={fabric.inventoryName}
          fabricQuantity={0}
          fabricUnit=""
          initialRecipeType={dialogInitial.recipeType}
          initialColorId={dialogInitial.colorId}
        />
      )}

      {/* Copy target picker — reuses the SAME BOM-scoped availableColors list already loaded for
          this fabric (never the global ColorCard master), select-only via the existing generic
          CardLookupDialog grid. */}
      {copySource && (
        <CardLookupDialog<CardLookupRow>
          open={!!copySource}
          onOpenChange={(open) => !open && setCopySource(null)}
          title={`Copy "${copySource.recipeType === "common" ? "Common (All Colors)" : copySource.colorCode || copySource.colorName}" to...`}
          fetchOptions={async (term) => {
            const q = (term || "").trim().toLowerCase();
            const filtered = q ? availableColors.filter((c) => (c.code || "").toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q)) : availableColors;
            return filtered.map((c): CardLookupRow => ({ id: c.id, inventoryCode: c.code, inventoryName: c.name, inUse: true }));
          }}
          onSelect={(row) => performCopy(String(row.id))}
        />
      )}
    </div>
  );
}
