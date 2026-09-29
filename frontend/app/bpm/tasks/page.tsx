"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { io, Socket } from "socket.io-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { bpmApi } from "@/lib/nexuscore-api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BpmStage {
  id: string;
  name: string;
  color: string;
  sequence: number;
  isTerminal: boolean;
}

interface BpmTask {
  id: string;
  title: string;
  entityType: string;
  entityId: string;
  priority: "low" | "medium" | "high" | "urgent";
  stageId: string;
  stage: BpmStage;
  assignee?: { id: string; name: string };
  dueDate?: string;
  process: { id: string; name: string; module: string; stages: BpmStage[] };
  history?: Array<{ id: string; fromStageId?: string; toStageId: string; changedBy: string; comment?: string; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  urgent: { label: "URGENT", color: "bg-red-500/10 text-red-600 border-red-200", dot: "bg-red-500" },
  high:   { label: "HIGH",   color: "bg-orange-500/10 text-orange-600 border-orange-200", dot: "bg-orange-500" },
  medium: { label: "MED",    color: "bg-yellow-500/10 text-yellow-600 border-yellow-200", dot: "bg-yellow-500" },
  low:    { label: "LOW",    color: "bg-green-500/10 text-green-600 border-green-200", dot: "bg-green-500" },
};

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  selected,
  onClick,
  dragging,
}: {
  task: BpmTask;
  selected: boolean;
  onClick: () => void;
  dragging?: boolean;
}) {
  const pc = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <div
      onClick={onClick}
      className={cn(
        "group cursor-pointer rounded-lg border p-3 transition-all",
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/40 hover:shadow-sm",
        dragging && "rotate-1 shadow-lg opacity-90"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold", pc.color)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", pc.dot)} />
          {pc.label}
        </span>
        <span className="text-muted-foreground truncate text-[11px]">{task.entityType}</span>
      </div>

      <p className="mt-2 line-clamp-2 text-sm font-medium">{task.title}</p>

      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{task.assignee?.name ?? "Unassigned"}</span>
        {task.dueDate && (
          <span className={cn("font-medium", isOverdue && "text-red-500")}>
            Due {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1">
        <div
          className="h-1.5 w-3 rounded-full"
          style={{ backgroundColor: task.stage?.color || "#94a3b8" }}
        />
        <span className="text-[11px] text-muted-foreground">{task.stage?.name}</span>
      </div>
    </div>
  );
}

// ── Stage Pipeline ────────────────────────────────────────────────────────────

function StagePipeline({ stages, currentStageId }: { stages: BpmStage[]; currentStageId: string }) {
  const sorted = [...stages].sort((a, b) => a.sequence - b.sequence);
  const currentIdx = sorted.findIndex((s) => s.id === currentStageId);

  return (
    <div className="flex items-center gap-0">
      {sorted.map((stage, idx) => (
        <React.Fragment key={stage.id}>
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full ring-2",
                idx <= currentIdx
                  ? "ring-offset-1"
                  : "bg-muted ring-muted"
              )}
              style={idx <= currentIdx ? { backgroundColor: stage.color, ['--ring-color']: stage.color } as React.CSSProperties : {}}
            />
            <span className="mt-1 max-w-[60px] text-center text-[9px] text-muted-foreground leading-tight">
              {stage.name}
            </span>
          </div>
          {idx < sorted.length - 1 && (
            <div className={cn("mb-3 h-px flex-1", idx < currentIdx ? "bg-primary/40" : "bg-border")} style={{ minWidth: 12 }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Task Detail Panel ─────────────────────────────────────────────────────────

function TaskDetailPanel({
  task,
  onMoved,
}: {
  task: BpmTask | null;
  onMoved: (taskId: string, toStageId: string, comment?: string) => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (task) setSelectedStage(task.stageId);
  }, [task?.id]);

  if (!task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="rounded-full bg-muted p-4">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <p className="text-sm">Select a task to view details</p>
      </div>
    );
  }

  const stages = task.process?.stages ?? [];
  const pc = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;

  const handleMove = async () => {
    if (!selectedStage || selectedStage === task.stageId) return;
    setMoving(true);
    try {
      await onMoved(task.id, selectedStage, comment || undefined);
      setComment("");
      toast.success("Task moved to new stage");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setMoving(false);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-5">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold leading-tight">{task.title}</h2>
            <Badge variant="outline" className={cn("shrink-0 text-[10px]", pc.color)}>
              {task.priority.toUpperCase()}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {task.entityType} · {task.entityId.slice(0, 8)}…
          </p>
        </div>

        {/* Current Stage */}
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: task.stage?.color }} />
          <span className="text-sm font-medium">{task.stage?.name}</span>
          <span className="text-xs text-muted-foreground">— current stage</span>
        </div>

        {/* Pipeline visual */}
        {stages.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <StagePipeline stages={stages} currentStageId={task.stageId} />
          </div>
        )}

        <Separator />

        {/* Move Stage */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Move to Stage</p>
          <Select value={selectedStage} onValueChange={setSelectedStage}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select stage…" />
            </SelectTrigger>
            <SelectContent>
              {stages
                .sort((a, b) => a.sequence - b.sequence)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <Textarea
            placeholder="Comment (required for rejection / optional otherwise)…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="text-sm resize-none"
          />

          <Button
            onClick={handleMove}
            disabled={moving || selectedStage === task.stageId}
            className="w-full"
            size="sm"
          >
            {moving ? "Moving…" : "Move to Stage"}
          </Button>
        </div>

        <Separator />

        {/* Info */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Assignee</p>
            <p className="font-medium">{task.assignee?.name ?? "Unassigned"}</p>
          </div>
          {task.dueDate && (
            <div>
              <p className="text-muted-foreground">Due Date</p>
              <p className="font-medium">
                {new Date(task.dueDate).toLocaleDateString("en-US", { dateStyle: "medium" })}
              </p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Module</p>
            <p className="font-medium capitalize">{task.process?.module}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Created</p>
            <p className="font-medium">
              {new Date(task.createdAt).toLocaleDateString("en-US", { dateStyle: "short" })}
            </p>
          </div>
        </div>

        <Separator />

        {/* History */}
        {task.history && task.history.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground tracking-wider">History</p>
            <ol className="relative border-l border-border space-y-4 pl-4">
              {task.history.map((h, i) => (
                <li key={h.id} className="relative">
                  <div className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-primary" />
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                  <p className="text-xs">
                    Moved to <span className="font-medium">{h.toStageId.slice(0, 6)}…</span>
                    {h.comment && <span className="text-muted-foreground"> — {h.comment}</span>}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// ── Kanban View ───────────────────────────────────────────────────────────────

function KanbanView({
  stages,
  tasksByStage,
  onDrop,
  onTaskClick,
  selectedId,
}: {
  stages: BpmStage[];
  tasksByStage: Record<string, BpmTask[]>;
  onDrop: (taskId: string, toStageId: string) => void;
  onTaskClick: (task: BpmTask) => void;
  selectedId?: string;
}) {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    onDrop(draggableId, destination.droppableId);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 h-full">
        {stages.sort((a, b) => a.sequence - b.sequence).map((stage) => (
          <div key={stage.id} className="flex-shrink-0 w-64">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="text-xs font-semibold">{stage.name}</span>
              </div>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {(tasksByStage[stage.id] ?? []).length}
              </Badge>
            </div>

            <Droppable droppableId={stage.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    "min-h-[200px] space-y-2 rounded-lg p-2 transition-colors",
                    snapshot.isDraggingOver ? "bg-primary/5 border border-primary/20" : "bg-muted/30"
                  )}
                >
                  {(tasksByStage[stage.id] ?? []).map((task, idx) => (
                    <Draggable key={task.id} draggableId={task.id} index={idx}>
                      {(prov, snap) => (
                        <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}>
                          <TaskCard
                            task={task}
                            selected={task.id === selectedId}
                            onClick={() => onTaskClick(task)}
                            dragging={snap.isDragging}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BpmTaskQueuePage() {
  const [view, setView] = useState<"list" | "kanban">("list");
  const [tasks, setTasks] = useState<BpmTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<BpmTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterModule, setFilterModule] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const socketRef = useRef<Socket | null>(null);

  // ── Fetch tasks ───────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filterModule !== "all") params.module = filterModule;
      if (filterPriority !== "all") params.priority = filterPriority;
      if (search) params.search = search;

      const res = await bpmApi.getTasks(Object.keys(params).length ? params : undefined);
      setTasks(res.data ?? []);
    } catch (e: any) {
      toast.error(`Failed to load tasks: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [filterModule, filterPriority, search]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // ── Socket.IO ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("nc_token");
    // "" (same-origin deployment) is valid: io("/nexuscore") then connects to the page's own origin.
    const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3000";

    const socket = io(`${SOCKET_URL}/nexuscore`, {
      auth: { token },
      transports: ["websocket"],
    });

    socket.on("bpm.task.updated", (data) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === data.taskId ? { ...t, stageId: data.toStageId } : t))
      );
      toast.info("A task was updated in real-time");
    });

    socket.on("notification.new", (n) => {
      toast.info(n.title, { description: n.message });
    });

    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────────
  const handleMoveStage = async (taskId: string, toStageId: string, comment?: string) => {
    const res = await bpmApi.moveStage(taskId, toStageId, comment);
    const updated = res.data as BpmTask;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)));
    setSelectedTask((prev) => (prev?.id === taskId ? { ...prev, ...updated } : prev));
    socketRef.current?.emit("bpm.task.updated", { taskId, toStageId });
  };

  const handleKanbanDrop = async (taskId: string, toStageId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.stageId === toStageId) return;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, stageId: toStageId } : t)));
    try {
      await handleMoveStage(taskId, toStageId);
    } catch {
      fetchTasks();
    }
  };

  const handleSelectTask = async (task: BpmTask) => {
    try {
      const res = await bpmApi.getTask(task.id);
      setSelectedTask(res.data);
    } catch {
      setSelectedTask(task);
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────────
  const stages: BpmStage[] = tasks.length > 0 ? (tasks[0].process?.stages ?? []) : [];
  const tasksByStage = tasks.reduce<Record<string, BpmTask[]>>((acc, t) => {
    acc[t.stageId] = [...(acc[t.stageId] ?? []), t];
    return acc;
  }, {});

  const modules = [...new Set(tasks.map((t) => t.process?.module).filter(Boolean))];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between border-b px-4 py-3 gap-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
            <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          </div>
          <h1 className="text-sm font-semibold">Task Queue</h1>
          <Badge variant="secondary" className="text-[10px]">{tasks.length} tasks</Badge>
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <Input
            placeholder="Search tasks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
          <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              {modules.map((m) => (
                <SelectItem key={m} value={m!} className="capitalize">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 rounded-lg border p-0.5">
          <button
            onClick={() => setView("list")}
            className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            List
          </button>
          <button
            onClick={() => setView("kanban")}
            className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Kanban
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {view === "list" ? (
          <>
            {/* Left — Task list */}
            <div className="flex w-[40%] flex-col border-r">
              <ScrollArea className="flex-1">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    Loading tasks…
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    No tasks found
                  </div>
                ) : (
                  <div className="space-y-2 p-3">
                    {tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        selected={selectedTask?.id === task.id}
                        onClick={() => handleSelectTask(task)}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Right — Detail panel */}
            <div className="flex-1 overflow-hidden">
              <TaskDetailPanel task={selectedTask} onMoved={handleMoveStage} />
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-hidden p-4">
            {loading ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Loading tasks…
              </div>
            ) : (
              <KanbanView
                stages={stages}
                tasksByStage={tasksByStage}
                onDrop={handleKanbanDrop}
                onTaskClick={handleSelectTask}
                selectedId={selectedTask?.id}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
