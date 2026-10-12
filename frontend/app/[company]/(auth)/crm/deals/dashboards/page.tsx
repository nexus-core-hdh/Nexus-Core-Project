"use client";

import * as React from "react";
import Link from "@/components/app-link";
import { useRouter } from "@/lib/app-navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { dealDashboardsApi, dealPipelinesApi, entityDataApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowUpDown, ChevronDown, GripVertical, Maximize2, Minimize2, Pin, PinOff, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { evalDealQuery, parseDealQuery } from "@/lib/deal-advanced-query";

type DealDashboardListItem = any;

type Deal = { id: string; [key: string]: any };
type StageInfo = { id: number; name: string; pipelineId: number };

type RowsSortKey = "pipelineName" | "stageName" | "status" | "count";
type RowsSortDir = "asc" | "desc";
type RowsSort = { key: RowsSortKey; dir: RowsSortDir };

type DashboardRow = {
  pipelineName: string;
  stageName: string;
  status: string;
  count: number;
  stageId: number | null;
};

function encodeBase64UrlJson(value: any) {
  const json = JSON.stringify(value);
  const base64 = btoa(json);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function formatMDY(dateLike: any) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "—";
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const y = d.getFullYear();
  return `${m}-${day}-${y}`;
}

function sortRows(rows: DashboardRow[], sort: RowsSort) {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ak = a[sort.key] as any;
    const bk = b[sort.key] as any;
    if (sort.key === "count") return dir * (Number(ak) - Number(bk));
    return dir * String(ak).localeCompare(String(bk));
  });
}

function sortDashboardsForLibrary(list: DealDashboardListItem[]) {
  return [...list].sort((a, b) => {
    const pinDiff = Number(!!b.userPref?.isPinned) - Number(!!a.userPref?.isPinned);
    if (pinDiff !== 0) return pinDiff;
    const ao = a.userPref?.order ?? 1_000_000_000;
    const bo = b.userPref?.order ?? 1_000_000_000;
    if (ao !== bo) return ao - bo;
    const at = new Date(a.updatedAt).getTime();
    const bt = new Date(b.updatedAt).getTime();
    return bt - at;
  });
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function matchesDashboardFilter(
  deal: Deal,
  filter: any,
  pipelineStageIdsByPipelineId: Record<number, number[]>
): boolean {
  const f = filter || {};

  // Advanced query wins
  const query = String(f.query || "").trim();
  if (query) {
    const parsed = parseDealQuery(query);
    if (!parsed.ok) return false;
    return evalDealQuery(parsed.ast, deal);
  }

  const text = String(f.text || "").trim().toLowerCase();
  if (text) {
    const hay = `${deal.name ?? ""} ${deal.email ?? ""} ${deal.company ?? ""}`.toLowerCase();
    if (!hay.includes(text)) return false;
  }

  if (f.status) {
    if (String(deal.status ?? "") !== String(f.status)) return false;
  }
  if (f.priority) {
    if (String(deal.priority ?? "") !== String(f.priority)) return false;
  }
  if (f.assigneeName) {
    const users = Array.isArray((deal as any).users) ? (deal as any).users : [];
    const ok = users.some((u: any) => String(u?.name || "") === String(f.assigneeName));
    if (!ok) return false;
  }

  const stageId = toNumber((deal as any).stageId);
  const pipelineId = toNumber(f.pipelineId);

  // Pipeline filter (when stageIds are not specified)
  if ((!Array.isArray(f.stageIds) || f.stageIds.length === 0) && pipelineId !== null) {
    const allowed = pipelineStageIdsByPipelineId[pipelineId] || [];
    if (stageId === null || !allowed.includes(stageId)) return false;
  }
  if (Array.isArray(f.stageIds) && f.stageIds.length > 0) {
    if (stageId === null || !f.stageIds.map(Number).includes(stageId)) return false;
  }

  const amountRaw = (deal as any).amount ?? (deal as any).dealAmount ?? (deal as any).value ?? (deal as any).total;
  const amount = toNumber(amountRaw);
  if (f.minAmount !== undefined) {
    const min = toNumber(f.minAmount);
    if (min !== null) {
      if (amount === null || amount < min) return false;
    }
  }
  if (f.maxAmount !== undefined) {
    const max = toNumber(f.maxAmount);
    if (max !== null) {
      if (amount === null || amount > max) return false;
    }
  }

  return true;
}

function SortableDashboardCard({
  dashboard,
  expanded,
  onToggleExpand,
  onTogglePin,
  onRefresh,
  onDelete,
  rows,
  onOpenDeals,
  rowsSort,
  onChangeRowsSort,
  refreshing,
  maximized,
  onToggleMaximize,
}: {
  dashboard: DealDashboardListItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onTogglePin: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  rows: DashboardRow[];
  onOpenDeals: (row: DashboardRow) => void;
  rowsSort: RowsSort;
  onChangeRowsSort: (next: RowsSort) => void;
  refreshing: boolean;
  maximized: boolean;
  onToggleMaximize: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: String(dashboard.id) });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const pinned = !!dashboard.userPref?.isPinned;
  const shownRows = React.useMemo(() => sortRows(rows, rowsSort), [rows, rowsSort]);

  const toggleSort = (key: RowsSortKey) => {
    onChangeRowsSort({
      key,
      dir: rowsSort.key === key ? (rowsSort.dir === "asc" ? "desc" : "asc") : key === "count" ? "desc" : "asc",
    });
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <button
              type="button"
              className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground touch-none"
              {...attributes}
              {...listeners}
              aria-label="Reorder"
            >
              <GripVertical className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="truncate">{dashboard.name}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {dashboard.description || "No description"}
                  </CardDescription>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {String(dashboard.visibility || "PRIVATE").toLowerCase()}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRefresh();
                    }}
                    aria-label="Refresh"
                    disabled={refreshing}
                  >
                    <RefreshCw className={cn("h-4 w-4", refreshing ? "animate-spin" : "")} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleMaximize();
                    }}
                    aria-label={maximized ? "Minimize" : "Maximize"}
                  >
                    {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={onTogglePin} aria-label="Pin">
                    {pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-md border overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium bg-muted">
                    <button
                      type="button"
                      className="col-span-4 flex items-center gap-1 text-left hover:underline"
                      onClick={() => toggleSort("pipelineName")}
                    >
                      Pipeline <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                    <button
                      type="button"
                      className="col-span-4 flex items-center gap-1 text-left hover:underline"
                      onClick={() => toggleSort("stageName")}
                    >
                      Stage <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                    <button
                      type="button"
                      className="col-span-2 flex items-center gap-1 text-left hover:underline"
                      onClick={() => toggleSort("status")}
                    >
                      Status <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                    <button
                      type="button"
                      className="col-span-2 flex items-center justify-end gap-1 text-right hover:underline"
                      onClick={() => toggleSort("count")}
                    >
                      Count <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </div>
                  <div className="divide-y">
                    {rows.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-muted-foreground">No matching deals</div>
                    ) : (
                      shownRows.slice(0, 8).map((r, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
                          <div className="col-span-4 truncate">{r.pipelineName}</div>
                          <div className="col-span-4 truncate">{r.stageName}</div>
                          <div className="col-span-2 truncate">{r.status}</div>
                          <div className="col-span-2 text-right">
                            <button
                              type="button"
                              className="font-medium hover:underline"
                              onClick={() => onOpenDeals(r)}
                            >
                              {r.count}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/crm/deals/dashboards/${dashboard.id}/edit`}>Edit</Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={onDelete} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>

              <Collapsible open={expanded} onOpenChange={() => onToggleExpand()}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="px-0">
                    <ChevronDown className={cn("h-4 w-4 mr-2 transition-transform", expanded ? "rotate-180" : "")} />
                    Details
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Owner: {dashboard.createdBy?.name || dashboard.createdById}
                  </div>
                <div className="text-xs text-muted-foreground">
                  Last updated: {formatMDY(dashboard.updatedAt)}
                </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground" />
      </Card>
    </div>
  );
}

export default function DealDashboardsPage() {
  const router = useRouter();
  const user = getCurrentUser();
  const [items, setItems] = React.useState<DealDashboardListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({});
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [refreshingIds, setRefreshingIds] = React.useState<Record<number, boolean>>({});
  const [maximizedId, setMaximizedId] = React.useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DealDashboardListItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [rowsSortByDashboardId, setRowsSortByDashboardId] = React.useState<Record<number, RowsSort>>({});
  const [pipelineNameById, setPipelineNameById] = React.useState<Record<number, string>>({});
  const [stageById, setStageById] = React.useState<Record<number, StageInfo>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);
      const data = await dealDashboardsApi.list();
      setItems(sortDashboardsForLibrary(Array.isArray(data) ? data : []));
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to load dashboards");
      setItems([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
  }, []);

  React.useEffect(() => {
    const loadMeta = async () => {
      try {
        const pipelines = await dealPipelinesApi.getDealPipelines(user?.companyId ?? undefined, user?.branchId ?? undefined);
        const list = Array.isArray(pipelines) ? pipelines : [];
        const pn: Record<number, string> = {};
        for (const p of list) pn[p.id] = p.name;
        setPipelineNameById(pn);

        const stageMap: Record<number, StageInfo> = {};
        await Promise.all(
          list.map(async (p: any) => {
            try {
              const stages = await dealPipelinesApi.getPipelineStages(p.id);
              (Array.isArray(stages) ? stages : []).forEach((s: any) => {
                stageMap[Number(s.id)] = { id: Number(s.id), name: String(s.name), pipelineId: Number(p.id) };
              });
            } catch {
              // ignore per-pipeline failure
            }
          })
        );
        setStageById(stageMap);
      } catch {
        setPipelineNameById({});
        setStageById({});
      }
    };
    loadMeta();
  }, [user?.companyId, user?.branchId]);

  React.useEffect(() => {
    const loadDeals = async () => {
      try {
        const list = await entityDataApi.getEntityDataByType("DEAL", {
          companyId: user?.companyId ?? undefined,
          branchId: user?.branchId ?? undefined,
        });
        const arr = Array.isArray(list) ? list : [];
        const normalized: Deal[] = arr.map((entityData: any) => {
          const data = typeof entityData?.data === "object" && entityData.data !== null ? entityData.data : {};
          return { id: String(entityData.id), ...data };
        });
        setDeals(normalized);
      } catch {
        setDeals([]);
      }
    };
    loadDeals();
  }, [user?.companyId, user?.branchId]);

  const refreshCard = async (dashboardId: number) => {
    setRefreshingIds((s) => ({ ...s, [dashboardId]: true }));
    try {
      // Refresh dashboards list (for prefs like pin/order) and deals data (for counts)
      await Promise.all([load({ silent: true }), (async () => {
        try {
          const list = await entityDataApi.getEntityDataByType("DEAL", {
            companyId: user?.companyId ?? undefined,
            branchId: user?.branchId ?? undefined,
          });
          const arr = Array.isArray(list) ? list : [];
          const normalized: Deal[] = arr.map((entityData: any) => {
            const data = typeof entityData?.data === "object" && entityData.data !== null ? entityData.data : {};
            return { id: String(entityData.id), ...data };
          });
          setDeals(normalized);
        } catch {
          // keep existing deals on refresh failure
        }
      })()]);
    } finally {
      setRefreshingIds((s) => ({ ...s, [dashboardId]: false }));
    }
  };

  const maximizedDashboard = React.useMemo(() => {
    if (maximizedId === null) return null;
    return items.find((d) => d.id === maximizedId) || null;
  }, [items, maximizedId]);

  const pipelineStageIdsByPipelineId = React.useMemo(() => {
    const map: Record<number, number[]> = {};
    Object.values(stageById).forEach((s) => {
      if (!map[s.pipelineId]) map[s.pipelineId] = [];
      map[s.pipelineId].push(s.id);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a - b));
    return map;
  }, [stageById]);

  const rowsByDashboardId = React.useMemo(() => {
    const out: Record<number, DashboardRow[]> = {};
    for (const d of items) {
      const filter = d.filter || {};
      const matching = deals.filter((deal) => matchesDashboardFilter(deal, filter, pipelineStageIdsByPipelineId));

      const counts = new Map<string, number>();
      for (const deal of matching) {
        const sId = toNumber((deal as any).stageId);
        const status = String((deal as any).status ?? "—");
        const key = `${sId ?? "none"}|${status}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }

      const rows = Array.from(counts.entries()).map(([key, count]) => {
        const [stageIdRaw, status] = key.split("|");
        const stageId = stageIdRaw === "none" ? null : Number(stageIdRaw);
        const stage = stageId !== null ? stageById[stageId] : undefined;
        const pipelineName =
          stage?.pipelineId && pipelineNameById[stage.pipelineId]
            ? pipelineNameById[stage.pipelineId]
            : filter.pipelineId && pipelineNameById[Number(filter.pipelineId)]
              ? pipelineNameById[Number(filter.pipelineId)]
              : "—";
        const stageName = stage?.name || (stageId !== null ? `Stage ${stageId}` : "—");
        return { pipelineName, stageName, status, count, stageId };
      });
      out[d.id] = rows;
    }
    return out;
  }, [items, deals, stageById, pipelineNameById, pipelineStageIdsByPipelineId]);

  const openDealsForRow = (dashboard: DealDashboardListItem, row: DashboardRow) => {
    const base = (dashboard.filter || {}) as any;
    const next: any = { ...base };

    if (row.stageId !== null) next.stageIds = [row.stageId];
    if (row.status && row.status !== "—") next.status = row.status;

    const df = encodeBase64UrlJson(next);
    router.push(`/crm/deals?tab=list&df=${encodeURIComponent(df)}`);
  };

  const ids = items.map((d) => String(d.id));

  const persistOrder = async (next: DealDashboardListItem[]) => {
    setItems(next);
    try {
      await dealDashboardsApi.reorder(next.map((d) => d.id));
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to save order");
      load();
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((d) => String(d.id) === String(active.id));
    const newIndex = items.findIndex((d) => String(d.id) === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    persistOrder(arrayMove(items, oldIndex, newIndex));
  };

  const toggleExpand = async (dashboard: DealDashboardListItem) => {
    const nextOpen = !expanded[dashboard.id];
    setExpanded((s) => ({ ...s, [dashboard.id]: nextOpen }));
    try {
      await dealDashboardsApi.updatePrefs(dashboard.id, { isCollapsed: !nextOpen });
    } catch {
      // non-fatal
    }
  };

  const togglePin = async (dashboard: DealDashboardListItem) => {
    const nextPinned = !dashboard.userPref?.isPinned;
    // Optimistic update to avoid full-page loading flash
    setItems((prev) =>
      sortDashboardsForLibrary(
        prev.map((d) =>
          d.id === dashboard.id
            ? {
                ...d,
                userPref: {
                  ...(d.userPref || { order: 0, isCollapsed: false, isPinned: false }),
                  isPinned: nextPinned,
                },
              }
            : d
        )
      )
    );
    try {
      await dealDashboardsApi.updatePrefs(dashboard.id, { isPinned: nextPinned });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to update pin");
      // Re-sync from server on failure
      load();
    }
  };

  const handleDelete = async (dashboard: DealDashboardListItem) => {
    setDeleteTarget(dashboard);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    try {
      setDeleting(true);
      await dealDashboardsApi.remove(deleteTarget.id);
      toast.success("Deleted");
      await load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to delete");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">Loading dashboards...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Deal Dashboards</h1>
          <p className="text-muted-foreground text-sm">
            Save deal board filters + layout. Drag cards to reorder your library.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/crm/deals")}>
            Deals Board
          </Button>
          <Button onClick={() => router.push("/crm/deals/dashboards/create")}>Create Dashboard</Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No dashboards yet</CardTitle>
            <CardDescription>Create your first dashboard to save a filter and layout.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/crm/deals/dashboards/create")}>Create Dashboard</Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {items.map((d) => {
                return (
                  <SortableDashboardCard
                    key={d.id}
                    dashboard={d}
                    expanded={expanded[d.id] ?? !d.userPref?.isCollapsed}
                    onToggleExpand={() => toggleExpand(d)}
                    onTogglePin={() => togglePin(d)}
                    onRefresh={() => refreshCard(d.id)}
                    onDelete={() => handleDelete(d)}
                    rows={rowsByDashboardId[d.id] || []}
                    onOpenDeals={(row) => openDealsForRow(d, row)}
                    rowsSort={rowsSortByDashboardId[d.id] || { key: "count", dir: "desc" }}
                    onChangeRowsSort={(next) => setRowsSortByDashboardId((s) => ({ ...s, [d.id]: next }))}
                    refreshing={!!refreshingIds[d.id]}
                    maximized={maximizedId === d.id}
                    onToggleMaximize={() => setMaximizedId((cur) => (cur === d.id ? null : d.id))}
                  />
                );
              })}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeId ? <div className="text-sm text-muted-foreground px-3 py-2 border rounded-md bg-background">Moving…</div> : null}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog
        open={maximizedId !== null}
        onOpenChange={(open) => {
          if (!open) setMaximizedId(null);
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-5xl max-h-[calc(100vh-2rem)] overflow-hidden p-0">
          <div className="p-6 border-b">
            <DialogHeader>
              <DialogTitle>{maximizedDashboard?.name || "Dashboard"}</DialogTitle>
              <DialogDescription>{maximizedDashboard?.description || " "}</DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6 overflow-auto">
            <div className="rounded-md border overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium bg-muted">
                <div className="col-span-4">Pipeline</div>
                <div className="col-span-4">Stage</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2 text-right">Count</div>
              </div>
              <div className="divide-y">
                {(maximizedDashboard && rowsByDashboardId[maximizedDashboard.id]?.length ? rowsByDashboardId[maximizedDashboard.id] : []).length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">No matching deals</div>
                ) : (
                  sortRows(
                    maximizedDashboard ? rowsByDashboardId[maximizedDashboard.id] || [] : [],
                    maximizedDashboard ? rowsSortByDashboardId[maximizedDashboard.id] || { key: "count", dir: "desc" } : { key: "count", dir: "desc" }
                  ).map((r, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
                      <div className="col-span-4 truncate">{r.pipelineName}</div>
                      <div className="col-span-4 truncate">{r.stageName}</div>
                      <div className="col-span-2 truncate">{r.status}</div>
                      <div className="col-span-2 text-right">
                        <button
                          type="button"
                          className="font-medium hover:underline"
                          onClick={() => {
                            if (maximizedDashboard) openDealsForRow(maximizedDashboard, r as any);
                          }}
                        >
                          {r.count}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => (!open ? setDeleteTarget(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete dashboard?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-medium">"{deleteTarget?.name}"</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
