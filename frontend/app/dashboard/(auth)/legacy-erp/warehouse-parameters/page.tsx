"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { legacyErpApi } from "@/lib/nexuscore-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Search, Sliders, Warehouse as WarehouseIcon, ChevronRight, Save } from "lucide-react";

// Warehouse Parameters — Negative Stock / Critical Stock / Allow Transaction / Min-Max Stock
// Level, scoped by BOTH module (Fabric/Trim/Yarn — same FABRIC/TRIM/YARN convention Fabric
// Card/Trim Card/Yarn Card already use) and warehouse (existing IM_Warehouse master, loaded
// live via legacyErpApi.warehouses.list() — never hardcoded). Backed by the new
// warehouse-parameter.service.ts / LegacyWarehouseModuleParameter table; see that file's own
// comment for why no existing table already covered this exact relationship.
const MODULES = [
  { value: "FABRIC", label: "Fabric" },
  { value: "TRIM", label: "Trim" },
  { value: "YARN", label: "Yarn" },
] as const;

const STOCK_OPTIONS = [
  { value: "continue", label: "Continue" },
  { value: "warn", label: "Warn" },
  { value: "not_allow", label: "Not Allow" },
];

const emptyParams = {
  negativeStock: "", criticalStock: "", allowTransaction: true,
  minimumStockLevel: "", maximumStockLevel: "",
};

export default function WarehouseParametersPage() {
  const [module, setModule] = useState<string>("FABRIC");
  const [search, setSearch] = useState("");
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);

  const [params, setParams] = useState<typeof emptyParams>(emptyParams);
  const [loadingParams, setLoadingParams] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ minimumStockLevel?: string; maximumStockLevel?: string }>({});

  useEffect(() => {
    (async () => {
      setLoadingWarehouses(true);
      try {
        const r: any = await legacyErpApi.warehouses.list();
        const list = Array.isArray(r) ? r : [];
        setWarehouses(list);
        if (list.length && selectedWarehouseId == null) setSelectedWarehouseId(Number(list[0].id));
      } catch (e: any) {
        toast.error(e.message || "Failed to load warehouses");
      } finally {
        setLoadingWarehouses(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, []);

  const loadParams = async (mod: string, warehouseId: number) => {
    setLoadingParams(true);
    setErrors({});
    try {
      const r: any = await legacyErpApi.warehouseParameters.get(mod, warehouseId);
      setParams({
        negativeStock: r.negativeStock || "warn",
        criticalStock: r.criticalStock || "warn",
        allowTransaction: r.allowTransaction !== false,
        minimumStockLevel: r.minimumStockLevel === null || r.minimumStockLevel === undefined ? "" : String(r.minimumStockLevel),
        maximumStockLevel: r.maximumStockLevel === null || r.maximumStockLevel === undefined ? "" : String(r.maximumStockLevel),
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to load warehouse parameters");
    } finally {
      setLoadingParams(false);
    }
  };

  useEffect(() => {
    if (selectedWarehouseId != null) loadParams(module, selectedWarehouseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, selectedWarehouseId]);

  const set = (k: keyof typeof emptyParams, v: any) => setParams((p) => ({ ...p, [k]: v }));

  const filteredWarehouses = warehouses.filter((w) =>
    !search.trim() ||
    (w.warehouseCode || "").toLowerCase().includes(search.trim().toLowerCase()) ||
    (w.warehouseName || "").toLowerCase().includes(search.trim().toLowerCase()));

  const selectedWarehouse = warehouses.find((w) => Number(w.id) === selectedWarehouseId);

  // Mirrors the backend's own checks (warehouse-parameter.service.ts's upsert) — never accepts
  // negative values, never lets minimum exceed maximum, and blank stays blank ("no limit set"
  // per the existing DB's nullable MinimumStockLevel/MaximumStockLevel columns) rather than
  // being coerced to 0.
  const validate = (): boolean => {
    const next: typeof errors = {};
    const min = params.minimumStockLevel.trim() === "" ? null : Number(params.minimumStockLevel);
    const max = params.maximumStockLevel.trim() === "" ? null : Number(params.maximumStockLevel);
    if (min !== null && (!Number.isFinite(min) || min < 0)) next.minimumStockLevel = "Must be a non-negative number";
    if (max !== null && (!Number.isFinite(max) || max < 0)) next.maximumStockLevel = "Must be a non-negative number";
    if (!next.minimumStockLevel && !next.maximumStockLevel && min !== null && max !== null && min > max) {
      next.minimumStockLevel = "Minimum must not exceed Maximum";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (selectedWarehouseId == null) return;
    if (!validate()) return;
    setSaving(true);
    try {
      const r: any = await legacyErpApi.warehouseParameters.save({
        module,
        warehouseId: selectedWarehouseId,
        negativeStock: params.negativeStock,
        criticalStock: params.criticalStock,
        allowTransaction: params.allowTransaction,
        minimumStockLevel: params.minimumStockLevel.trim() === "" ? null : Number(params.minimumStockLevel),
        maximumStockLevel: params.maximumStockLevel.trim() === "" ? null : Number(params.maximumStockLevel),
      });
      toast.success("Warehouse parameters updated successfully.");
      // Keep the current warehouse selected; refresh from the server's own response so the
      // form reflects exactly what was persisted.
      setParams({
        negativeStock: r.negativeStock, criticalStock: r.criticalStock, allowTransaction: r.allowTransaction,
        minimumStockLevel: r.minimumStockLevel === null ? "" : String(r.minimumStockLevel),
        maximumStockLevel: r.maximumStockLevel === null ? "" : String(r.maximumStockLevel),
      });
    } catch (e: any) {
      toast.error(e.message || "Failed to save warehouse parameters");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-6 lg:p-8">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Legacy ERP</span>
        <ChevronRight className="h-3 w-3" />
        <span>Inventory</span>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">Warehouse Parameters</span>
      </div>

      <div className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
            <Sliders className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Warehouse Parameters</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Negative/critical stock behavior and stock levels, per module and warehouse</p>
          </div>
        </div>

        <Tabs value={module} onValueChange={setModule}>
          <TabsList>
            {MODULES.map((m) => <TabsTrigger key={m.value} value={m.value}>{m.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        {/* LEFT — warehouse list, loaded live from the existing Warehouse master, never hardcoded */}
        <Card className="gap-0 py-0">
          <div className="border-b p-3">
            <InputGroup className="h-9">
              <InputGroupAddon>
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput placeholder="Search warehouses..." value={search} onChange={(e) => setSearch(e.target.value)} className="text-sm" />
            </InputGroup>
          </div>
          <div className="max-h-[520px] overflow-y-auto p-1.5">
            {loadingWarehouses ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="mb-1.5 h-10 w-full" />)
            ) : filteredWarehouses.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">No warehouses found.</p>
            ) : (
              filteredWarehouses.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelectedWarehouseId(Number(w.id))}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    Number(w.id) === selectedWarehouseId ? "bg-primary/10 text-foreground" : "text-foreground/90 hover:bg-muted/60",
                  )}
                >
                  <WarehouseIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono text-xs text-muted-foreground">{w.warehouseCode}</span>
                    <span className="ml-2 font-medium">{w.warehouseName}</span>
                  </span>
                  {!w.inUse && <Badge variant="secondary" className="h-5 shrink-0 text-[10px] font-normal">Inactive</Badge>}
                </button>
              ))
            )}
          </div>
        </Card>

        {/* RIGHT — Controls + Stock Levels for the selected module + warehouse */}
        <Card className="p-5">
          {selectedWarehouse ? (
            <>
              <div className="mb-5 flex items-center gap-2 border-b pb-4">
                <WarehouseIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{selectedWarehouse.warehouseName}</span>
                <Badge variant="outline" className="font-mono text-[11px]">{selectedWarehouse.warehouseCode}</Badge>
                <Badge className="ml-auto text-[11px] font-normal">{MODULES.find((m) => m.value === module)?.label}</Badge>
              </div>

              {loadingParams ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Controls</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Negative Stock</label>
                        <Select value={params.negativeStock} onValueChange={(v) => set("negativeStock", v)}>
                          <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Select Parameter" /></SelectTrigger>
                          <SelectContent>
                            {STOCK_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Critical Stock</label>
                        <Select value={params.criticalStock} onValueChange={(v) => set("criticalStock", v)}>
                          <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="Select Parameter" /></SelectTrigger>
                          <SelectContent>
                            {STOCK_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <label className="mt-4 flex h-9 w-fit cursor-pointer items-center gap-2 rounded-md border border-transparent px-1 transition-colors hover:border-border hover:bg-muted/40">
                      <Checkbox checked={params.allowTransaction} onCheckedChange={(v) => set("allowTransaction", v === true)} />
                      <span className="text-sm text-foreground/90">Allow Transaction for This Warehouse</span>
                    </label>
                  </div>

                  <div>
                    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Stock Levels</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Minimum Stock Level</label>
                        <Input
                          type="number" min={0} inputMode="decimal"
                          value={params.minimumStockLevel}
                          onChange={(e) => set("minimumStockLevel", e.target.value)}
                          className={cn("h-9 text-sm", errors.minimumStockLevel && "border-destructive focus-visible:ring-destructive/20")}
                        />
                        {errors.minimumStockLevel && <p className="text-xs text-destructive">{errors.minimumStockLevel}</p>}
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">Maximum Stock Level</label>
                        <Input
                          type="number" min={0} inputMode="decimal"
                          value={params.maximumStockLevel}
                          onChange={(e) => set("maximumStockLevel", e.target.value)}
                          className={cn("h-9 text-sm", errors.maximumStockLevel && "border-destructive focus-visible:ring-destructive/20")}
                        />
                        {errors.maximumStockLevel && <p className="text-xs text-destructive">{errors.maximumStockLevel}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end border-t pt-4">
                    <Button onClick={save} disabled={saving}>
                      <Save className="h-3.5 w-3.5 mr-2" />{saving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">Select a warehouse to configure its parameters.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
