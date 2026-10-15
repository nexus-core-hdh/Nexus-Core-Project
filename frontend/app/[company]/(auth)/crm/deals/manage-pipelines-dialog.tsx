"use client";

import * as React from "react";
import { GripVertical, Paintbrush, Pencil, Plus, Trash2, X } from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
import { dealPipelinesApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StageCategory = "IN_PROGRESS" | "SUCCESS" | "FAILED";

type Point = { x: number; y: number };

function getReadableTextColor(hex: string | undefined) {
  if (!hex) return "#ffffff";
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return "#ffffff";
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  // perceived luminance
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return l > 0.6 ? "#0b1220" : "#ffffff";
}

interface PipelineStage {
  id: number;
  name: string;
  color: string;
  order: number;
  pipelineId: number;
  category?: StageCategory;
}

interface DealPipeline {
  id: number;
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  order?: number;
}

interface PipelineConnection {
  id: number;
  fromStageId: number;
  toStageId: number;
  fromStage?: PipelineStage;
  toStage?: PipelineStage;
}

interface ManagePipelinesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPipelineChange?: () => void;
}

function buildBitrixTunnelPath(from: Point, to: Point, entryX: number, trunkX: number) {
  // Bitrix-like: stage -> entry (near corridor right) -> trunk (corridor left) -> vertical -> entry -> stage.
  // This bundles tunnels into a shared trunk and avoids crossing stage cards.
  const x0 = from.x;
  const y0 = from.y;
  const x1 = entryX;
  const y1 = y0;
  const x2 = trunkX;
  const y2 = y0;
  const x3 = trunkX;
  const y3 = to.y;
  const x4 = entryX;
  const y4 = to.y;
  const x5 = to.x;
  const y5 = to.y;

  const r = 10;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

  const roundCorner = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    // returns [lineToX,lineToY, quadCtrlX,quadCtrlY, quadToX,quadToY]
    const v1x = ax - bx;
    const v1y = ay - by;
    const v2x = cx - bx;
    const v2y = cy - by;
    const l1 = Math.hypot(v1x, v1y) || 1;
    const l2 = Math.hypot(v2x, v2y) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1x = bx + (v1x / l1) * rr;
    const p1y = by + (v1y / l1) * rr;
    const p2x = bx + (v2x / l2) * rr;
    const p2y = by + (v2y / l2) * rr;
    return { p1x, p1y, bx, by, p2x, p2y };
  };

  const c1 = roundCorner(x0, y0, x1, y1, x2, y2);
  const c2 = roundCorner(x1, y1, x2, y2, x3, y3);
  const c3 = roundCorner(x2, y2, x3, y3, x4, y4);
  const c4 = roundCorner(x3, y3, x4, y4, x5, y5);

  return [
    `M ${x0} ${y0}`,
    `L ${c1.p1x} ${c1.p1y}`,
    `Q ${c1.bx} ${c1.by} ${c1.p2x} ${c1.p2y}`,
    `L ${c2.p1x} ${c2.p1y}`,
    `Q ${c2.bx} ${c2.by} ${c2.p2x} ${c2.p2y}`,
    `L ${c3.p1x} ${c3.p1y}`,
    `Q ${c3.bx} ${c3.by} ${c3.p2x} ${c3.p2y}`,
    `L ${c4.p1x} ${c4.p1y}`,
    `Q ${c4.bx} ${c4.by} ${c4.p2x} ${c4.p2y}`,
    `L ${x5} ${y5}`,
  ].join(" ");
}

function buildBitrixBranchPath(stage: Point, entryX: number, trunkX: number) {
  // One-side branch: stage -> entry -> trunk (same y), with rounded corners.
  const x0 = stage.x;
  const y0 = stage.y;
  const x1 = entryX;
  const y1 = y0;
  const x2 = trunkX;
  const y2 = y0;

  const r = 10;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const dx01 = x1 - x0;
  const dx12 = x2 - x1;

  const r01 = clamp(Math.abs(dx01) / 2, 0, r);
  const r12 = clamp(Math.abs(dx12) / 2, 0, r);
  const s01 = Math.sign(dx01) || 1;
  const s12 = Math.sign(dx12) || 1;

  const p1x = x1 - s01 * r01;
  const p1y = y1;
  const p2x = x1;
  const p2y = y1;
  const p3x = x1 + s12 * r12;
  const p3y = y1;

  return [
    `M ${x0} ${y0}`,
    `L ${p1x} ${p1y}`,
    `Q ${x1} ${y1} ${p2x} ${p2y}`,
    `L ${p3x} ${p3y}`,
    `L ${x2} ${y2}`,
  ].join(" ");
}

function buildBitrixPortBranchPath(stage: Point, portY: number, entryX: number, trunkX: number) {
  // Stage -> short vertical to "port" -> entry -> trunk (all at portY).
  // This allows multiple connections per stage to stack neatly (avoids the "mixed" bar).
  const x0 = stage.x;
  const y0 = stage.y;
  const x1 = x0;
  const y1 = portY;
  const x2 = entryX;
  const y2 = portY;
  const x3 = trunkX;
  const y3 = portY;

  const r = 8;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

  // Round at (x0,y1) from vertical to horizontal
  const dy = y1 - y0;
  const dx = x2 - x1;
  const r1 = clamp(Math.min(Math.abs(dy), Math.abs(dx)) / 2, 0, r);
  const sy = Math.sign(dy) || 1;
  const sx = Math.sign(dx) || 1;

  const c1x = x1;
  const c1y = y1;
  const p1x = x1;
  const p1y = y1 - sy * r1;
  const p2x = x1 + sx * r1;
  const p2y = y1;

  // Round at (x2,y2) from horizontal to horizontal (keep subtle)
  const dx23 = x3 - x2;
  const r2 = clamp(Math.abs(dx23) / 2, 0, r);
  const sx23 = Math.sign(dx23) || 1;
  const p3x = x2 + sx * r2;
  const p3y = y2;

  return [
    `M ${x0} ${y0}`,
    `L ${p1x} ${p1y}`,
    `Q ${c1x} ${c1y} ${p2x} ${p2y}`,
    `L ${x2 - sx23 * r2} ${y2}`,
    `Q ${x2} ${y2} ${p3x} ${p3y}`,
    `L ${x3} ${y3}`,
  ].join(" ");
}

type LaneSpan = { minY: number; maxY: number; lane: number };
function assignLane(spans: LaneSpan[], minY: number, maxY: number) {
  for (let lane = 0; lane < 20; lane++) {
    const conflict = spans.some((s) => s.lane === lane && !(maxY < s.minY || minY > s.maxY));
    if (!conflict) return lane;
  }
  return 0;
}

export function ManagePipelinesDialog({ open, onOpenChange, onPipelineChange }: ManagePipelinesDialogProps) {
  const [pipelines, setPipelines] = React.useState<DealPipeline[]>([]);
  const [allStages, setAllStages] = React.useState<Map<number, PipelineStage[]>>(new Map());
  const [selectedPipeline, setSelectedPipeline] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [connections, setConnections] = React.useState<PipelineConnection[]>([]);
  const [connectFromStageId, setConnectFromStageId] = React.useState<number | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = React.useState<number | null>(null);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const corridorRef = React.useRef<HTMLDivElement | null>(null);

  const [anchorPoints, setAnchorPoints] = React.useState<Map<number, Point>>(new Map());

  const [editingPipelineId, setEditingPipelineId] = React.useState<number | null>(null);
  const [editingPipelineName, setEditingPipelineName] = React.useState("");

  const [editingStageId, setEditingStageId] = React.useState<number | null>(null);
  const [editingStageName, setEditingStageName] = React.useState("");
  const [stageDeleteTarget, setStageDeleteTarget] = React.useState<{
    pipelineId: number;
    stage: PipelineStage;
  } | null>(null);

  const isDealWonStage = React.useCallback((stage: PipelineStage, variant: "inProgress" | "success" | "failed") => {
    if ((stage.category as any) === "SUCCESS") return true;
    if (variant === "success") return true;
    const n = (stage.name || "").trim().toLowerCase();
    return n === "deal won" || n.includes("won");
  }, []);

  const handleChangeStageColor = React.useCallback(async (pipelineId: number, stageId: number, color: string) => {
    // optimistic update
    setAllStages((prev) => {
      const next = new Map(prev);
      const stages = next.get(pipelineId) || [];
      next.set(pipelineId, stages.map((s) => (s.id === stageId ? { ...s, color } : s)));
      return next;
    });
    try {
      await dealPipelinesApi.updatePipelineStage(pipelineId, stageId, { color });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to change stage color");
    }
  }, []);

  const handleDeleteStage = React.useCallback(
    async (pipelineId: number, stage: PipelineStage) => {
      try {
        setLoading(true);
        await dealPipelinesApi.deletePipelineStage(pipelineId, stage.id);
        setAllStages((prev) => {
          const next = new Map(prev);
          const stages = next.get(pipelineId) || [];
          next.set(pipelineId, stages.filter((s) => s.id !== stage.id));
          return next;
        });
        toast.success("Stage deleted");
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Failed to delete stage");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  type StageChipSize = "normal" | "compact" | "tiny";
  const renderStageChip = (
    stage: PipelineStage,
    opts: { variant: "inProgress" | "success" | "failed"; index: number; size: StageChipSize }
  ) => {
    const isEditing = editingStageId === stage.id;
    const isConnectFrom = connectFromStageId === stage.id;
    const bg = stage.color || (opts.variant === "success" ? "#22c55e" : opts.variant === "failed" ? "#ef4444" : "#3b82f6");
    const fg = getReadableTextColor(bg);
    // Use a small gap between stages (Bitrix-like spacing) to avoid visual merging.
    const overlap = "";
    // Bitrix stages use the same chevron shape for every stage.
    const clip = "polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)";

    const sizeCfg =
      opts.size === "tiny"
        ? { h: "h-7", px: "px-2", text: "text-xs", inputW: "w-[120px]", top: 28 }
        : opts.size === "compact"
          ? { h: "h-8", px: "px-3", text: "text-[13px]", inputW: "w-[135px]", top: 32 }
          : { h: "h-9", px: "px-4", text: "text-sm", inputW: "w-[150px]", top: 36 };

    return (
      <div key={stage.id} className={cn("group/stage relative flex flex-col items-center flex-1 basis-0 min-w-0", overlap)}>
        <div
          className={cn(
            "relative w-full flex items-center justify-center shadow-sm",
            sizeCfg.h,
            sizeCfg.px,
            "ring-1 ring-black/5"
          )}
          style={{ backgroundColor: bg, color: fg, clipPath: clip as any }}
        >
          {!isEditing && !isDealWonStage(stage, opts.variant) ? (
            <div className="absolute right-1 top-1 flex items-center gap-1 opacity-0 transition-opacity group-hover/stage:opacity-100">
              {opts.size !== "tiny" ? (
                <>
                  <label className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-white/80 hover:bg-white shadow-sm cursor-pointer">
                    <Paintbrush className="h-3.5 w-3.5 text-black/70" />
                    <input
                      type="color"
                      value={bg}
                      onChange={(e) => handleChangeStageColor(stage.pipelineId, stage.id, e.target.value)}
                      className="sr-only"
                      aria-label="Change stage color"
                    />
                  </label>
                  <button
                    type="button"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-white/80 hover:bg-white shadow-sm"
                    onClick={() => setStageDeleteTarget({ pipelineId: stage.pipelineId, stage })}
                    aria-label="Delete stage"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-black/70" />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-white/80 hover:bg-white shadow-sm"
                onClick={() => handleInsertStageAfter(stage.pipelineId, stage)}
                aria-label="Add stage after"
              >
                <Plus className="h-3.5 w-3.5 text-black/70" />
              </button>
            </div>
          ) : null}
          {isEditing ? (
            <Input
              value={editingStageName}
              onChange={(e) => setEditingStageName(e.target.value)}
              className={cn("h-7 bg-white/90 text-black", sizeCfg.inputW)}
              autoFocus
              onKeyDown={async (e) => {
                if (e.key === "Escape") {
                  setEditingStageId(null);
                  setEditingStageName("");
                }
                if (e.key === "Enter") {
                  await handleUpdateStage(stage.id, stage.pipelineId, { name: editingStageName });
                  setEditingStageId(null);
                  setEditingStageName("");
                }
              }}
              onBlur={async () => {
                await handleUpdateStage(stage.id, stage.pipelineId, { name: editingStageName });
                setEditingStageId(null);
                setEditingStageName("");
              }}
            />
          ) : (
            <button
              type="button"
              className={cn(sizeCfg.text, "font-medium truncate w-full")}
              onClick={() => {
                setEditingStageId(stage.id);
                setEditingStageName(stage.name);
              }}
              title={stage.name}
            >
              {stage.name}
            </button>
          )}
        </div>

        {/* connector circle (Bitrix-like) */}
        <button
          type="button"
          data-stage-anchor="true"
          data-stage-id={stage.id}
          className={cn(
            // Touch the bottom edge of the stage by overlapping slightly.
            "absolute left-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border bg-white shadow-sm",
            isConnectFrom && "ring-2 ring-primary",
            "hover:bg-muted"
          )}
          style={{ top: sizeCfg.top }}
          onClick={() => handleStageAnchorClick(stage)}
          aria-label="Stage tunnel anchor"
        />
      </div>
    );
  };

  const categorizeStages = React.useCallback((stages: PipelineStage[]) => {
    const inProgress: PipelineStage[] = [];
    const success: PipelineStage[] = [];
    const failed: PipelineStage[] = [];

    stages.forEach((stage) => {
      const n = (stage.name || "").toLowerCase();
      const category: StageCategory =
        stage.category ||
        (n.includes("won") || n === "deal won"
          ? "SUCCESS"
          : n.includes("lost") || n === "deal lost"
            ? "FAILED"
            : "IN_PROGRESS");

      if (category === "SUCCESS") success.push({ ...stage, category });
      else if (category === "FAILED") failed.push({ ...stage, category });
      else inProgress.push({ ...stage, category });
    });

    inProgress.sort((a, b) => a.order - b.order);
    success.sort((a, b) => a.order - b.order);
    failed.sort((a, b) => a.order - b.order);

    return { inProgress, success, failed };
  }, []);

  const generatePipelineName = React.useCallback(() => {
    const base = "New Pipeline";
    const existing = new Set(pipelines.map((p) => (p.name || "").trim().toLowerCase()));
    if (!existing.has(base.toLowerCase())) return base;
    for (let i = 2; i < 1000; i++) {
      const name = `${base} ${i}`;
      if (!existing.has(name.toLowerCase())) return name;
    }
    return `${base} ${Date.now()}`;
  }, [pipelines]);

  const fetchPipelines = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await dealPipelinesApi.getDealPipelines();
      setPipelines(Array.isArray(data) ? data : []);

      const stagesMap = new Map<number, PipelineStage[]>();
      for (const p of Array.isArray(data) ? data : []) {
        try {
          const stages = await dealPipelinesApi.getPipelineStages(p.id);
          stagesMap.set(
            p.id,
            (Array.isArray(stages) ? stages : []).sort((a: PipelineStage, b: PipelineStage) => a.order - b.order)
          );
        } catch {
          stagesMap.set(p.id, []);
        }
      }
      setAllStages(stagesMap);

      // Connections: fetch per pipeline but de-dup by id (cross-pipeline connections can appear multiple times)
      const connsById = new Map<number, PipelineConnection>();
      await Promise.all(
        (Array.isArray(data) ? data : []).map(async (p: DealPipeline) => {
          try {
            const conns = await dealPipelinesApi.getPipelineConnections(p.id);
            if (Array.isArray(conns)) {
              for (const c of conns as any[]) {
                if (c?.id != null) connsById.set(Number(c.id), c as PipelineConnection);
              }
            }
          } catch {
            // ignore per-pipeline failure
          }
        })
      );
      setConnections(Array.from(connsById.values()));

      if (!selectedPipeline && Array.isArray(data) && data.length > 0) {
        setSelectedPipeline(data[0].id);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to load pipelines");
    } finally {
      setLoading(false);
    }
  }, [selectedPipeline]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const persistPipelineOrder = React.useCallback(async (next: DealPipeline[]) => {
    // Use sparse, stable ordering increments.
    const payload = next.map((p, idx) => ({ id: p.id, order: idx * 10 }));
    await dealPipelinesApi.reorderDealPipelines(payload);
  }, []);

  const handlePipelineDragEnd = React.useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setPipelines((prev) => {
        const oldIndex = prev.findIndex((p) => String(p.id) === String(active.id));
        const newIndex = prev.findIndex((p) => String(p.id) === String(over.id));
        if (oldIndex < 0 || newIndex < 0) return prev;
        const next = arrayMove(prev, oldIndex, newIndex);
        // fire-and-forget persist
        persistPipelineOrder(next).catch((e: any) => {
          console.error(e);
          toast.error(e?.message || "Failed to save pipeline order");
        });
        return next;
      });
    },
    [persistPipelineOrder]
  );

  function SortablePipelineRow(props: {
    pipeline: DealPipeline;
    children: (handle: {
      attributes: Record<string, any>;
      listeners: Record<string, any>;
      isDragging: boolean;
    }) => React.ReactNode;
  }) {
    const { pipeline, children } = props;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: String(pipeline.id),
    });
    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.6 : undefined,
    };
    return (
      <div ref={setNodeRef} style={style}>
        {children({ attributes: (attributes ?? {}) as any, listeners: (listeners ?? {}) as any, isDragging })}
      </div>
    );
  }

  React.useEffect(() => {
    if (open) fetchPipelines();
  }, [open, fetchPipelines]);

  const stageById = React.useMemo(() => {
    const map = new Map<number, PipelineStage>();
    for (const stages of allStages.values()) {
      for (const s of stages) map.set(s.id, s);
    }
    return map;
  }, [allStages]);

  const refreshConnections = React.useCallback(async () => {
    const connsById = new Map<number, PipelineConnection>();
    await Promise.all(
      pipelines.map(async (p) => {
        try {
          const conns = await dealPipelinesApi.getPipelineConnections(p.id);
          if (Array.isArray(conns)) {
            for (const c of conns as any[]) {
              if (c?.id != null) connsById.set(Number(c.id), c as PipelineConnection);
            }
          }
        } catch {
          // ignore
        }
      })
    );
    setConnections(Array.from(connsById.values()));
  }, [pipelines]);

  const measureAnchors = React.useCallback(() => {
    const overlayEl = overlayRef.current;
    const scrollEl = scrollRef.current;
    if (!overlayEl || !scrollEl) return;

    const overlayRect = overlayEl.getBoundingClientRect();
    const points = new Map<number, Point>();

    const anchors = scrollEl.querySelectorAll<HTMLElement>("[data-stage-anchor='true'][data-stage-id]");
    anchors.forEach((el) => {
      const id = Number(el.dataset.stageId);
      if (!Number.isFinite(id)) return;
      const r = el.getBoundingClientRect();
      const x = r.left - overlayRect.left + r.width / 2;
      const y = r.top - overlayRect.top + r.height / 2;
      points.set(id, { x, y });
    });

    setAnchorPoints(points);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    measureAnchors();

    const onScroll = () => measureAnchors();
    const scrollEl = scrollRef.current;
    scrollEl?.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(() => measureAnchors());
    if (scrollEl) ro.observe(scrollEl);
    if (overlayRef.current) ro.observe(overlayRef.current);
    if (corridorRef.current) ro.observe(corridorRef.current);

    return () => {
      scrollEl?.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [open, measureAnchors, pipelines, allStages, connections]);

  const tunnels = React.useMemo(() => {
    const overlayEl = overlayRef.current;
    if (!overlayEl)
      return {
        branches: [] as Array<{
          id: number;
          from: Point;
          to: Point;
          lane: number;
          entryX: number;
          trunkX: number;
          fromPortY: number;
          toPortY: number;
          stubFromD: string;
          stubToD: string;
          mainD: string;
        }>,
        mids: new Map<number, Point>(),
        corridorX: 0,
      };
    const o = overlayEl.getBoundingClientRect();
    const cEl = corridorRef.current;
    const corridorRect = cEl?.getBoundingClientRect();
    const corridorLeft = corridorRect ? corridorRect.left - o.left : 0;
    const corridorRight = corridorRect ? corridorRect.right - o.left : 0;
    const corridorXCenter = corridorRect ? corridorRect.left - o.left + corridorRect.width / 2 : 0;
    const corridorWidth = corridorRect?.width ?? 0;

    const branches: Array<{
      id: number;
      from: Point;
      to: Point;
      lane: number;
      entryX: number;
      trunkX: number;
      fromPortY: number;
      toPortY: number;
      stubFromD: string;
      stubToD: string;
      mainD: string;
    }> = [];
    const mids = new Map<number, Point>();
    const spans: LaneSpan[] = [];

    const laneGap = 10;
    const maxLanes = corridorWidth > 0 ? Math.max(1, Math.floor((corridorWidth - 24) / laneGap)) : 1;
    const laneOffset = (lane: number) => {
      const mid = (maxLanes - 1) / 2;
      const dx = (lane - mid) * laneGap;
      return dx;
    };

    // Assign stacked "ports" per stage so multiple tunnels don't overlap on same y.
    const outPortIdx = new Map<number, number>();
    const inPortIdx = new Map<number, number>();
    const portStep = 6; // vertical separation between ports
    // Push the horizontal rails well below the stage chevrons to avoid the "thick bar" overlap under stages.
    const portStart = 34; // how far below the circle the first port sits

    for (const conn of connections) {
      const fromId = Number(conn.fromStageId);
      const toId = Number(conn.toStageId);
      const from = anchorPoints.get(fromId);
      const to = anchorPoints.get(toId);
      if (!from || !to) continue;

      const minY = Math.min(from.y, to.y) - 8;
      const maxY = Math.max(from.y, to.y) + 8;
      const lane = assignLane(spans, minY, maxY) % maxLanes;
      spans.push({ minY, maxY, lane });

      // Entry near the right edge of the corridor, trunk near the left edge (lane shifts trunk slightly).
      const entryX = corridorRight ? corridorRight - 10 : corridorXCenter;
      const trunkX = corridorLeft ? corridorLeft + 14 + laneOffset(lane) : corridorXCenter + laneOffset(lane);

      const outIdx = outPortIdx.get(fromId) ?? 0;
      outPortIdx.set(fromId, outIdx + 1);
      const inIdx = inPortIdx.get(toId) ?? 0;
      inPortIdx.set(toId, inIdx + 1);

      const fromPortY = from.y + portStart + outIdx * portStep;
      const toPortY = to.y + portStart + inIdx * portStep;

      // Dedicated bar per connection:
      // - short stubs from circle to portY (vertical)
      // - main path between port points through its own trunkX lane
      const stubFromD = `M ${from.x} ${from.y} L ${from.x} ${fromPortY}`;
      const stubToD = `M ${to.x} ${to.y} L ${to.x} ${toPortY}`;
      const fromPort: Point = { x: from.x, y: fromPortY };
      const toPort: Point = { x: to.x, y: toPortY };
      const mainD = buildBitrixTunnelPath(fromPort, toPort, entryX, trunkX);

      const mid: Point = { x: trunkX, y: (from.y + to.y) / 2 };
      branches.push({
        id: conn.id,
        from,
        to,
        lane,
        entryX,
        trunkX,
        fromPortY,
        toPortY,
        stubFromD,
        stubToD,
        mainD,
      });
      mids.set(conn.id, mid);
    }

    return { branches, mids, corridorX: corridorXCenter };
  }, [connections, anchorPoints]);

  const visibleTunnels = React.useMemo(() => {
    if (selectedConnectionId == null) return tunnels.branches;
    return tunnels.branches.filter((b) => b.id === selectedConnectionId);
  }, [selectedConnectionId, tunnels.branches]);

  const handleDeleteConnection = React.useCallback(
    async (connectionId: number) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) return;
      const fromStage = stageById.get(Number(conn.fromStageId)) || (conn.fromStage as any);
      const pipelineId = fromStage?.pipelineId;
      if (!pipelineId) {
        toast.error("Could not determine source pipeline for this connection");
        return;
      }
      try {
        setLoading(true);
        await dealPipelinesApi.deletePipelineConnection(pipelineId, connectionId);
        setConnections((prev) => prev.filter((c) => c.id !== connectionId));
        toast.success("Tunnel deleted");
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Failed to delete tunnel");
      } finally {
        setLoading(false);
      }
    },
    [connections, stageById]
  );

  const handleStageAnchorClick = React.useCallback(
    async (stage: PipelineStage) => {
      if (connectFromStageId == null) {
        setConnectFromStageId(stage.id);
        toast.message("Select a target stage to create a tunnel");
        return;
      }

      const fromStageId = connectFromStageId;
      const toStageId = stage.id;
      if (fromStageId === toStageId) return;

      const fromStage = stageById.get(fromStageId);
      const pipelineId = fromStage?.pipelineId ?? stage.pipelineId;
      try {
        setLoading(true);
        await dealPipelinesApi.createPipelineConnection(pipelineId, { fromStageId, toStageId });
        toast.success("Tunnel created");
        setConnectFromStageId(null);
        await refreshConnections();
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Failed to create tunnel");
      } finally {
        setLoading(false);
      }
    },
    [connectFromStageId, refreshConnections, stageById]
  );

  const normalizeStageOrders = React.useCallback(
    async (pipelineId: number) => {
      const stages = (allStages.get(pipelineId) || []).slice().sort((a, b) => a.order - b.order);
      const updates = stages.map((s, idx) => ({ id: s.id, order: idx * 10 }));
      try {
        await dealPipelinesApi.reorderPipelineStages(pipelineId, updates);
        setAllStages((prev) => {
          const next = new Map(prev);
          const nextStages = stages.map((s, idx) => ({ ...s, order: idx * 10 }));
          next.set(pipelineId, nextStages);
          return next;
        });
      } catch (e) {
        console.error(e);
      }
    },
    [allStages]
  );

  const handleInsertStageAfter = React.useCallback(
    async (pipelineId: number, afterStage: PipelineStage) => {
      const stages = allStages.get(pipelineId) || [];
      const siblings = stages
        .filter((s) => (s.category || "IN_PROGRESS") === (afterStage.category || "IN_PROGRESS"))
        .slice()
        .sort((a, b) => a.order - b.order);

      const idx = siblings.findIndex((s) => s.id === afterStage.id);
      const next = idx >= 0 ? siblings[idx + 1] : undefined;

      let order = afterStage.order + 1;
      if (next) {
        const gap = next.order - afterStage.order;
        if (gap >= 2) order = Math.floor(afterStage.order + gap / 2);
        else {
          // no room, normalize then retry once
          await normalizeStageOrders(pipelineId);
          const refreshed = (allStages.get(pipelineId) || []).slice().sort((a, b) => a.order - b.order);
          const a = refreshed.find((s) => s.id === afterStage.id);
          if (a) order = a.order + 5;
        }
      }

      const defaultColor =
        (afterStage.category || "IN_PROGRESS") === "SUCCESS"
          ? "#22c55e"
          : (afterStage.category || "IN_PROGRESS") === "FAILED"
            ? "#ef4444"
            : "#3b82f6";

      try {
        setLoading(true);
        const created = await dealPipelinesApi.createPipelineStage(pipelineId, {
          name: "New stage",
          color: defaultColor,
          order,
        });
        setAllStages((prev) => {
          const nextMap = new Map(prev);
          const cur = nextMap.get(pipelineId) || [];
          nextMap.set(pipelineId, [...cur, created].sort((a, b) => a.order - b.order));
          return nextMap;
        });
        setEditingStageId(created.id);
        setEditingStageName(created.name);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message || "Failed to add stage");
      } finally {
        setLoading(false);
      }
    },
    [allStages, normalizeStageOrders]
  );

  const ensureDefaultStages = React.useCallback(
    async (pipelineId: number) => {
      const stages = allStages.get(pipelineId) || [];
      const { inProgress, success, failed } = categorizeStages(stages);

      const needsInitial = inProgress.length === 0;
      const needsSuccess = success.length === 0;
      const needsFailed = failed.length === 0;
      if (!needsInitial && !needsSuccess && !needsFailed) return;

      const promises: Promise<PipelineStage>[] = [];
      if (needsInitial) {
        promises.push(
          dealPipelinesApi
            .createPipelineStage(pipelineId, { name: "Initial", color: "#3b82f6", order: 0 })
            .then((s) => ({ ...s, category: "IN_PROGRESS" as StageCategory }))
        );
      }
      if (needsSuccess) {
        promises.push(
          dealPipelinesApi
            .createPipelineStage(pipelineId, { name: "Deal Won", color: "#10b981", order: 1000 })
            .then((s) => ({ ...s, category: "SUCCESS" as StageCategory }))
        );
      }
      if (needsFailed) {
        promises.push(
          dealPipelinesApi
            .createPipelineStage(pipelineId, { name: "Deal Lost", color: "#ef4444", order: 2000 })
            .then((s) => ({ ...s, category: "FAILED" as StageCategory }))
        );
      }

      try {
        const created = await Promise.all(promises);
        setAllStages((prev) => {
          const next = new Map(prev);
          const current = next.get(pipelineId) || [];
          next.set(pipelineId, [...current, ...created].sort((a, b) => a.order - b.order));
          return next;
        });
      } catch (e) {
        console.error(e);
      }
    },
    [allStages, categorizeStages]
  );

  const handleQuickAddPipeline = React.useCallback(async () => {
    try {
      setLoading(true);
      const newPipeline = await dealPipelinesApi.createDealPipeline({
        name: generatePipelineName(),
        description: "",
        isDefault: false,
        isActive: true,
      });
      setPipelines((prev) => [...prev, newPipeline]);
      setAllStages((prev) => {
        const next = new Map(prev);
        next.set(newPipeline.id, []);
        return next;
      });
      setSelectedPipeline(newPipeline.id);
      await ensureDefaultStages(newPipeline.id);
      toast.success("Pipeline created");
      onPipelineChange?.();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to create pipeline");
    } finally {
      setLoading(false);
    }
  }, [ensureDefaultStages, generatePipelineName, onPipelineChange]);

  const savePipelineName = React.useCallback(
    async (pipelineId: number, nextName: string) => {
      const name = nextName.trim();
      if (!name) {
        toast.error("Pipeline name is required");
        return;
      }
      setLoading(true);
      try {
        await dealPipelinesApi.updateDealPipeline(pipelineId, { name });
        setPipelines((prev) => prev.map((p) => (p.id === pipelineId ? { ...p, name } : p)));
        toast.success("Pipeline renamed");
        onPipelineChange?.();
      } catch (e: any) {
        console.error(e);
        toast.error("Failed to rename pipeline: " + (e?.message || "Unknown error"));
      } finally {
        setLoading(false);
      }
    },
    [onPipelineChange]
  );

  const handleUpdateStage = React.useCallback(async (stageId: number, pipelineId: number, updates: { name?: string }) => {
    const name = updates.name?.trim();
    if (name !== undefined && !name) {
      toast.error("Stage name is required");
      return;
    }
    try {
      setLoading(true);
      await dealPipelinesApi.updatePipelineStage(pipelineId, stageId, { ...(name !== undefined ? { name } : {}) });
      setAllStages((prev) => {
        const next = new Map(prev);
        const stages = next.get(pipelineId) || [];
        next.set(
          pipelineId,
          stages.map((s) => (s.id === stageId ? { ...s, ...(name !== undefined ? { name } : {}) } : s))
        );
        return next;
      });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to update stage");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseIcon={false} className="sm:max-w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0">
        <AlertDialog open={stageDeleteTarget != null} onOpenChange={(v) => (v ? null : setStageDeleteTarget(null))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete stage?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the stage{" "}
                <span className="font-medium">{stageDeleteTarget?.stage.name}</span>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setStageDeleteTarget(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!stageDeleteTarget) return;
                  const { pipelineId, stage } = stageDeleteTarget;
                  setStageDeleteTarget(null);
                  await handleDeleteStage(pipelineId, stage);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-lg">Manage Pipelines</DialogTitle>
              <DialogDescription>
                Manage pipelines and stages. Use the small circle under a stage to create tunnels (click source, then target).
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {connectFromStageId != null ? (
                <Button variant="secondary" onClick={() => setConnectFromStageId(null)} disabled={loading}>
                  Cancel tunnel
                </Button>
              ) : null}
              <Button onClick={handleQuickAddPipeline} disabled={loading}>
                <Plus className="h-4 w-4 mr-2" />
                Add pipeline
              </Button>
              <DialogClose asChild>
                <Button size="icon" variant="ghost" aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="flex-1 overflow-auto p-6"
          onPointerDownCapture={(e) => {
            // Clicking anywhere that isn't a tunnel hit-area clears selection.
            const el = e.target as HTMLElement | null;
            const hit = el?.closest?.("[data-connection-hit='true']");
            if (!hit) setSelectedConnectionId(null);
          }}
        >
          {loading && pipelines.length === 0 ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : null}

          <div className="relative">
            {/* Render tunnels visually, but never block interactions underneath. */}
              <div ref={overlayRef} className="absolute inset-0 pointer-events-none">
              <svg className="h-full w-full pointer-events-none">
                {/* One dedicated bar per connection (no merging). */}
                {visibleTunnels.map((p) => {
                  // Bitrix-ish styling: bright cyan + junction dots at trunk/branch points
                  const stroke = "#22b6e7";
                  const strokeOuter = "rgba(34, 182, 231, 0.18)";
                  const dotR = 4;
                  const dotStrokeR = 6;

                  const entryFrom: Point = { x: p.entryX, y: p.fromPortY };
                  const trunkFrom: Point = { x: p.trunkX, y: p.fromPortY };
                  const entryTo: Point = { x: p.entryX, y: p.toPortY };

                  return (
                    <g key={p.id}>
                      {/* click hit-area for selecting this connection */}
                      <path
                        d={p.mainD}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={14}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="pointer-events-auto"
                        data-connection-hit="true"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedConnectionId((prev) => (prev === p.id ? null : p.id));
                        }}
                      />
                      {/* soft outer glow */}
                      <path d={p.stubFromD} fill="none" stroke={strokeOuter} strokeWidth={6} strokeLinecap="round" />
                      <path d={p.stubToD} fill="none" stroke={strokeOuter} strokeWidth={6} strokeLinecap="round" />
                      <path d={p.mainD} fill="none" stroke={strokeOuter} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
                      {/* main line */}
                      <path d={p.stubFromD} fill="none" stroke={stroke} strokeWidth={2.75} strokeLinecap="round" />
                      <path d={p.stubToD} fill="none" stroke={stroke} strokeWidth={2.75} strokeLinecap="round" />
                      <path d={p.mainD} fill="none" stroke={stroke} strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" />

                      {/* junction dots (like Bitrix) */}
                      {[entryFrom, trunkFrom, entryTo].map((pt, idx) => (
                        <g key={idx}>
                          <circle cx={pt.x} cy={pt.y} r={dotStrokeR} fill="rgba(255,255,255,0.85)" />
                          <circle cx={pt.x} cy={pt.y} r={dotR} fill={stroke} />
                        </g>
                      ))}
                    </g>
                  );
                })}
              </svg>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePipelineDragEnd}>
              <SortableContext items={pipelines.map((p) => String(p.id))} strategy={verticalListSortingStrategy}>
                <div className="space-y-8">
                  {pipelines.map((pipeline, pipelineIndex) => {
              const stages = allStages.get(pipeline.id) || [];
              const { inProgress, success, failed } = categorizeStages(stages);

              return (
                <SortablePipelineRow key={pipeline.id} pipeline={pipeline}>
                  {({ attributes, listeners, isDragging }) => (
                    <>
                      <div className="space-y-4 py-4">
                        <div className="grid grid-cols-12 gap-4 items-start">
                          <div className="col-span-2 flex items-center">
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                type="button"
                                className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground cursor-grab active:cursor-grabbing"
                                {...attributes}
                                {...listeners}
                                aria-label="Reorder pipeline"
                                title="Drag to reorder"
                              >
                                <GripVertical className={cn("h-4 w-4", isDragging && "opacity-70")} />
                              </button>
                              {editingPipelineId === pipeline.id ? (
                                <Input
                                  value={editingPipelineName}
                                  onChange={(e) => setEditingPipelineName(e.target.value)}
                                  className="h-8"
                                  autoFocus
                                  onKeyDown={async (e) => {
                                    if (e.key === "Escape") {
                                      setEditingPipelineId(null);
                                      setEditingPipelineName("");
                                    }
                                    if (e.key === "Enter") {
                                      await savePipelineName(pipeline.id, editingPipelineName);
                                      setEditingPipelineId(null);
                                      setEditingPipelineName("");
                                    }
                                  }}
                                  onBlur={async () => {
                                    await savePipelineName(pipeline.id, editingPipelineName);
                                    setEditingPipelineId(null);
                                    setEditingPipelineName("");
                                  }}
                                />
                              ) : (
                                <>
                                  <span className="font-semibold text-base truncate">{pipeline.name}</span>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      setEditingPipelineId(pipeline.id);
                                      setEditingPipelineName(pipeline.name || "");
                                    }}
                                    aria-label="Rename pipeline"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Corridor reference element (invisible). Used only for tunnel coordinate calculations. */}
                          <div className="col-span-1">
                            <div ref={pipelineIndex === 0 ? corridorRef : undefined} className="h-full min-h-[110px] opacity-0" />
                          </div>

                          <div className="col-span-6 space-y-2">
                            <Label className={cn("text-sm font-semibold", pipelineIndex !== 0 && "opacity-0")}>In Progress</Label>
                            <div className="flex items-start min-h-[96px] flex-nowrap gap-2">
                              {inProgress.map((stage, idx) =>
                                renderStageChip(stage, {
                                  variant: "inProgress",
                                  index: idx,
                                  size: inProgress.length > 10 ? "tiny" : inProgress.length > 7 ? "compact" : "normal",
                                })
                              )}
                            </div>
                          </div>

                          <div className="col-span-1 space-y-2">
                            <Label className={cn("text-sm font-semibold", pipelineIndex !== 0 && "opacity-0")}>Success</Label>
                            <div className="flex items-start min-h-[96px] flex-nowrap gap-2">
                              {success.map((stage, idx) =>
                                renderStageChip(stage, {
                                  variant: "success",
                                  index: idx,
                                  size: success.length > 10 ? "tiny" : success.length > 7 ? "compact" : "normal",
                                })
                              )}
                            </div>
                          </div>

                          <div className="col-span-2 space-y-2 pl-8">
                            <Label className={cn("text-sm font-semibold", pipelineIndex !== 0 && "opacity-0")}>Failed</Label>
                            <div className="flex items-start min-h-[96px] flex-nowrap gap-2">
                              {failed.map((stage, idx) =>
                                renderStageChip(stage, {
                                  variant: "failed",
                                  index: idx,
                                  size: failed.length > 10 ? "tiny" : failed.length > 7 ? "compact" : "normal",
                                })
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <Separator />
                    </>
                  )}
                </SortablePipelineRow>
              );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

