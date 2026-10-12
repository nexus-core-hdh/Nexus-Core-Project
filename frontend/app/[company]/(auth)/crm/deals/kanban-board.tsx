"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { evalDealQuery, parseDealQuery } from "@/lib/deal-advanced-query";
import {
  GripVertical,
  Paperclip,
  MessageSquare,
  PlusCircleIcon,
  Download,
  Upload,
  Search,
  CheckIcon,
  SlidersHorizontalIcon,
  SearchIcon,
  KanbanIcon,
  CalendarDaysIcon,
  ListIcon,
  Pencil,
  Palette,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import * as Kanban from "@/components/ui/kanban";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import { dealPipelinesApi, entityDataApi, entityApi, formTemplatesApi, accessControlsApi } from "@/lib/api";
import { toast } from "sonner";
import { getCurrentUser } from "@/lib/auth";
import { TemplateViewerDialog } from "@/app/[company]/(auth)/pages/form-builder/template-viewer-dialog";
import { ManagePipelinesDialog } from "./manage-pipelines-dialog";
import { DealsTable } from "./deals-table";
import { DealsCalendar, Deal as DealCalendarType } from "./deals-calendar";
import { CsvExportDialog } from "../components/csv-export-dialog";
import { CsvImportDialog } from "../components/csv-import-dialog";
import { downloadTextFile, toCsv } from "../components/csv-utils";


interface PipelineStage {
  id: number;
  name: string;
  color: string;
  order: number;
  pipelineId: number;
}

interface Deal {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  status?: string;
  priority?: "low" | "medium" | "high";
  createdAt?: Date | string;
  updatedAt?: Date | string;
  [key: string]: any;
}

type DashboardDealFilter = {
  pipelineId?: number;
  text?: string;
  query?: string;
  status?: string | null;
  priority?: "low" | "medium" | "high" | string | null;
  assigneeName?: string | null;
  stageIds?: number[];
  minAmount?: number;
  maxAmount?: number;
};

// (advanced query parsing/evaluation lives in /lib/deal-advanced-query)

function decodeBase64UrlJson<T = any>(value: string): T | null {
  try {
    const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
    const json = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

// Helper function to reload deals with comments from API
const reloadDealsWithComments = async (pipelineStages: PipelineStage[]): Promise<Record<string, Deal[]>> => {
  const entityDataList = await entityDataApi.getEntityDataByType("DEAL");
  
  // Transform EntityData to Deal format and load comments from Comment table
  const transformedDeals: Deal[] = await Promise.all(
    (entityDataList as any[]).map(async (entityData: any) => {
      const data = typeof entityData.data === "object" && entityData.data !== null
        ? entityData.data
        : {};
      const dealData: Deal = {
        id: entityData.id?.toString() || String(entityData.id),
        ...data,
        createdAt: entityData.createdAt,
        updatedAt: entityData.updatedAt
      };
      
      // Load comments from Comment table API
      try {
        const comments = await entityApi.getComments("DEAL", entityData.id);
        (dealData as any).comments = Array.isArray(comments) ? comments : [];
      } catch (error) {
        console.error(`Error loading comments for deal ${dealData.id}:`, error);
        (dealData as any).comments = [];
      }
      
      return dealData;
    })
  );

  // Group deals by stageId
  const groupedDeals: Record<string, Deal[]> = {};
  pipelineStages.forEach((stage: PipelineStage) => {
    groupedDeals[`stage-${stage.id}`] = [];
  });

  transformedDeals.forEach((deal: Deal) => {
    const stageId = (deal as any).stageId;
    if (stageId) {
      const stageKey = `stage-${stageId}`;
      if (groupedDeals[stageKey]) {
        groupedDeals[stageKey].push(deal);
      } else {
        const firstStageKey = pipelineStages[0] ? `stage-${pipelineStages[0].id}` : null;
        if (firstStageKey) {
          groupedDeals[firstStageKey].push(deal);
        }
      }
    } else {
      const firstStageKey = pipelineStages[0] ? `stage-${pipelineStages[0].id}` : null;
      if (firstStageKey) {
        groupedDeals[firstStageKey].push(deal);
      }
    }
  });

  return groupedDeals;
};

export default function KanbanBoard() {
  const searchParams = useSearchParams();
  const [pipelineStages, setPipelineStages] = React.useState<PipelineStage[]>([]);
  const [columns, setColumns] = React.useState<Record<string, Deal[]>>({});
  const [filteredColumns, setFilteredColumns] = React.useState<Record<string, Deal[]>>({});
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<"board" | "list" | "table">("board");

  const [filterStatus, setFilterStatus] = React.useState<string | null>(null);
  const [filterPriority, setFilterPriority] = React.useState<string | null>(null);
  const [filterUser, setFilterUser] = React.useState<string | null>(null);
  const [dashboardFilter, setDashboardFilter] = React.useState<DashboardDealFilter | null>(null);
  const [open, setOpen] = React.useState(false);

  const [isNewDealModalOpen, setIsNewDealModalOpen] = React.useState(false);
  const [isAddDealModalOpen, setIsAddDealModalOpen] = React.useState(false);
  const [isEditDealModalOpen, setIsEditDealModalOpen] = React.useState(false);
  const [selectedDeal, setSelectedDeal] = React.useState<Deal | null>(null);
  const [selectedStageForDeal, setSelectedStageForDeal] = React.useState<number | null>(null);
  const [dealTemplateId, setDealTemplateId] = React.useState<number | undefined>();
  const [formTemplate, setFormTemplate] = React.useState<any>(null);
  const [fieldLabelMap, setFieldLabelMap] = React.useState<Record<string, string>>({});
  const [dealComments, setDealComments] = React.useState<Record<string, string>>({});
  const [editingStageId, setEditingStageId] = React.useState<number | null>(null);
  const [editingStageName, setEditingStageName] = React.useState("");
  const [isColorPickerOpen, setIsColorPickerOpen] = React.useState<number | null>(null);
  const [stageDeleteTarget, setStageDeleteTarget] = React.useState<PipelineStage | null>(null);
  const [selectedPipeline, setSelectedPipeline] = React.useState<string | null>(null);
  const [pipelines, setPipelines] = React.useState<Array<{ id: number; name: string; isDefault: boolean }>>([]);
  const [isManagePipelinesOpen, setIsManagePipelinesOpen] = React.useState(false);
  const [isExportOpen, setIsExportOpen] = React.useState(false);
  const [isImportOpen, setIsImportOpen] = React.useState(false);

  const isProtectedStage = React.useCallback((stage: PipelineStage) => {
    const n = (stage.name || "").trim().toLowerCase();
    return n === "deal won" || n === "deal lost";
  }, []);

  const handleAddStageAfter = React.useCallback(
    async (afterStageId: number) => {
      const pipelineId = selectedPipeline ? parseInt(selectedPipeline, 10) : NaN;
      if (Number.isNaN(pipelineId)) {
        toast.error("Please select a pipeline first");
        return;
      }

      const stages = pipelineStages.slice().sort((a, b) => a.order - b.order);
      const idx = stages.findIndex((s) => s.id === afterStageId);
      const afterStage = stages[idx];
      if (!afterStage) return;

      const nextStage = idx >= 0 ? stages[idx + 1] : undefined;
      let order = afterStage.order + 1;
      if (nextStage) {
        const gap = nextStage.order - afterStage.order;
        order = gap >= 2 ? Math.floor(afterStage.order + gap / 2) : afterStage.order + 1;
      }

      try {
        setLoading(true);
        await dealPipelinesApi.createPipelineStage(pipelineId, {
          name: "New Stage",
          color: afterStage.color || "#3b82f6",
          order,
        });

        const refreshedStages = await dealPipelinesApi.getPipelineStages(pipelineId);
        const sortedStages = Array.isArray(refreshedStages)
          ? refreshedStages.sort((a: PipelineStage, b: PipelineStage) => a.order - b.order)
          : [];
        setPipelineStages(sortedStages);

        const groupedDeals = await reloadDealsWithComments(sortedStages);
        setColumns(groupedDeals);
        setFilteredColumns(groupedDeals);

        toast.success("Stage added");
      } catch (e: any) {
        console.error(e);
        toast.error(e?.error || e?.message || "Failed to add stage");
      } finally {
        setLoading(false);
      }
    },
    [pipelineStages, selectedPipeline]
  );

  const handleDeleteStage = React.useCallback(
    async (stage: PipelineStage) => {
      const pipelineId = selectedPipeline ? parseInt(selectedPipeline, 10) : NaN;
      if (Number.isNaN(pipelineId)) return;
      try {
        setLoading(true);
        await dealPipelinesApi.deletePipelineStage(pipelineId, stage.id);

        const refreshedStages = await dealPipelinesApi.getPipelineStages(pipelineId);
        const sortedStages = Array.isArray(refreshedStages)
          ? refreshedStages.sort((a: PipelineStage, b: PipelineStage) => a.order - b.order)
          : [];
        setPipelineStages(sortedStages);

        const groupedDeals = await reloadDealsWithComments(sortedStages);
        setColumns(groupedDeals);
        setFilteredColumns(groupedDeals);

        toast.success("Stage deleted");
      } catch (e: any) {
        console.error(e);
        toast.error(e?.error || e?.message || "Failed to delete stage");
      } finally {
        setLoading(false);
      }
    },
    [selectedPipeline]
  );

  const getActiveFilters = () => {
    const filters = [];
    if (filterStatus) filters.push(filterStatus);
    if (filterPriority) filters.push(filterPriority);
    if (filterUser) filters.push(filterUser);
    return filters;
  };

  const [searchQuery, setSearchQuery] = React.useState("");

  const exportFields = React.useMemo(() => {
    const fields = Array.isArray(formTemplate?.formFields) ? formTemplate.formFields : [];
    if (fields.length > 0) {
      return fields
        .filter((f: any) => !!f?.name)
        .map((f: any) => ({
          key: String(f.name),
          label: String(f.label || fieldLabelMap[f.name] || f.name)
        }));
    }
    const sample = Object.values(columns).flat()[0] as any;
    if (!sample) return [];
    return Object.keys(sample)
      .filter((k) => !["createdAt", "updatedAt", "comments"].includes(k))
      .map((k) => ({ key: k, label: fieldLabelMap[k] || k }));
  }, [formTemplate, fieldLabelMap, columns]);

  const handleExportCsv = async (selectedKeys: string[]) => {
    try {
      const entityDataList = await entityDataApi.getEntityDataByType("DEAL");
      const rows = (Array.isArray(entityDataList) ? entityDataList : []).map((entityData: any) => {
        const data = typeof entityData.data === "object" && entityData.data !== null ? entityData.data : {};
        const merged = { id: entityData.id, ...data };
        const out: Record<string, any> = {};
        selectedKeys.forEach((k) => {
          out[k] = merged?.[k] ?? "";
        });
        return out;
      });

      const csv = toCsv(selectedKeys, rows);
      const today = new Date().toISOString().slice(0, 10);
      downloadTextFile(`deals-${today}.csv`, csv, "text/csv;charset=utf-8");
      toast.success("CSV exported");
    } catch (e: any) {
      console.error("Export deals CSV failed:", e);
      toast.error(e?.message || "Failed to export CSV");
    }
  };

  const handleImportCsvRows = async (rows: Array<Record<string, string>>) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    try {
      const initialStageId = pipelineStages.length > 0 ? pipelineStages[0].id : null;
      if (!initialStageId) {
        toast.error("No deal stages found");
        return;
      }

      for (const row of rows) {
        const data: any = { ...row };
        Object.keys(data).forEach((k) => {
          if (data[k] === "") data[k] = null;
        });

        if (!data.stageId) data.stageId = initialStageId;
        if (typeof data.stageId === "string") {
          const n = parseInt(data.stageId, 10);
          data.stageId = isNaN(n) ? initialStageId : n;
        }

        await entityDataApi.createEntityData({
          entityType: "DEAL",
          templateId: dealTemplateId,
          data
        });
      }

      const groupedDeals = await reloadDealsWithComments(pipelineStages);
      setColumns(groupedDeals);
      setFilteredColumns(groupedDeals);
      toast.success(`Imported ${rows.length} deal(s)`);
    } catch (e: any) {
      console.error("Import deals CSV failed:", e);
      toast.error(e?.message || "Failed to import CSV");
      throw e;
    }
  };

  // Load deal template ID and field labels
  React.useEffect(() => {
    const loadTemplate = async () => {
      try {
        const templates = await formTemplatesApi.getFormTemplates(
          undefined,
          undefined,
          "DEAL",
          true
        );
        const activeTemplate = Array.isArray(templates)
          ? templates.find((t: any) => t.entityType === "DEAL" && t.isActive)
          : null;
        if (activeTemplate) {
          setDealTemplateId(activeTemplate.id);
          setFormTemplate(activeTemplate);
          
          // Create field label mapping
          const fields = Array.isArray(activeTemplate.formFields) ? activeTemplate.formFields : [];
          const labelMap: Record<string, string> = {};
          fields.forEach((field: any) => {
            labelMap[field.name] = field.label || field.name;
          });
          setFieldLabelMap(labelMap);
        }
      } catch (error) {
        console.error("Error loading deal template:", error);
      }
    };
    loadTemplate();
  }, []);

  // Fetch pipelines on mount
  React.useEffect(() => {
    const fetchPipelines = async () => {
      try {
        const data = (await dealPipelinesApi.getDealPipelines()) as Array<{ id: number; name: string; isDefault: boolean }>;
        setPipelines(data);
        const defaultPipeline = data.find((p: { id: number; name: string; isDefault: boolean }) => p.isDefault) || data[0];
        if (defaultPipeline) {
          setSelectedPipeline(defaultPipeline.id.toString());
        }
      } catch (error) {
        console.error("Failed to fetch pipelines:", error);
      }
    };
    fetchPipelines();
  }, [isManagePipelinesOpen]);

  React.useEffect(() => {
    const df = searchParams.get("df");
    if (!df) return;
    if (!pipelines || pipelines.length === 0) return;

    const parsed = decodeBase64UrlJson<DashboardDealFilter>(df);
    if (!parsed) return;

    setDashboardFilter(parsed);

    if (parsed.pipelineId) {
      const exists = pipelines.some((p) => p.id === parsed.pipelineId);
      if (exists) {
        setSelectedPipeline(String(parsed.pipelineId));
      }
    }

    if (parsed.text !== undefined) {
      setSearchQuery(parsed.text ?? "");
    }
    if ("status" in parsed) {
      setFilterStatus(parsed.status ?? null);
    }
    if ("priority" in parsed) {
      const p = parsed.priority;
      setFilterPriority(p ? String(p) : null);
    }
    if ("assigneeName" in parsed) {
      setFilterUser(parsed.assigneeName ?? null);
    }
  }, [searchParams, pipelines]);

  React.useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "board" || tab === "list" || tab === "table") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Load pipeline stages when pipeline is selected
  React.useEffect(() => {
    const loadStages = async () => {
      if (!selectedPipeline) {
        setPipelineStages([]);
        setColumns({});
        setFilteredColumns({});
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const pipelineId = parseInt(selectedPipeline);
        if (isNaN(pipelineId)) {
          setPipelineStages([]);
          setColumns({});
          setFilteredColumns({});
          setLoading(false);
          return;
        }

        const stages = await dealPipelinesApi.getPipelineStages(pipelineId);
        const sortedStages = Array.isArray(stages)
          ? stages.sort((a: PipelineStage, b: PipelineStage) => {
              return a.order - b.order;
            })
          : [];
        setPipelineStages(sortedStages);

        // Initialize columns with empty arrays for each stage
        const initialColumns: Record<string, Deal[]> = {};
        sortedStages.forEach((stage: PipelineStage) => {
          initialColumns[`stage-${stage.id}`] = [];
        });
        setColumns(initialColumns);
        setFilteredColumns(initialColumns);
      } catch (error) {
        console.error("Error loading pipeline stages:", error);
        toast.error("Failed to load pipeline stages");
        setPipelineStages([]);
        setColumns({});
        setFilteredColumns({});
      } finally {
        setLoading(false);
      }
    };
    loadStages();
  }, [selectedPipeline]);

  // Load deals from database and group by stageId
  React.useEffect(() => {
    const loadDeals = async () => {
      if (pipelineStages.length === 0) return;

      try {
        const groupedDeals = await reloadDealsWithComments(pipelineStages);
        setColumns(groupedDeals);
        setFilteredColumns(groupedDeals);
      } catch (error: any) {
        console.error("Error loading deals:", error);
        toast.error(error?.error || "Failed to load deals");
      }
    };
    loadDeals();
  }, [pipelineStages]);

  const filterTasks = React.useCallback(() => {
    let filtered: Record<string, Deal[]> = { ...columns };
    const advancedParsed = dashboardFilter?.query ? parseDealQuery(dashboardFilter.query) : null;
    const hasAdvanced = !!(dashboardFilter?.query && dashboardFilter.query.trim().length > 0);
    const advancedAst = advancedParsed && advancedParsed.ok ? advancedParsed.ast : null;

    Object.keys(filtered).forEach((columnKey) => {
      filtered[columnKey] = columns[columnKey].filter((deal) => {
        const stageId = (deal as any).stageId ? parseInt(String((deal as any).stageId), 10) : NaN;
        const stageMatch =
          !dashboardFilter?.stageIds ||
          dashboardFilter.stageIds.length === 0 ||
          (!Number.isNaN(stageId) && dashboardFilter.stageIds.includes(stageId));

        const amountRaw =
          (deal as any).amount ??
          (deal as any).dealAmount ??
          (deal as any).value ??
          (deal as any).total;
        const amountNum =
          amountRaw === undefined || amountRaw === null || amountRaw === ""
            ? null
            : Number(amountRaw);
        const amountMatch =
          (dashboardFilter?.minAmount === undefined || Number.isNaN(Number(dashboardFilter.minAmount))
            ? true
            : amountNum !== null && !Number.isNaN(amountNum) && amountNum >= Number(dashboardFilter.minAmount)) &&
          (dashboardFilter?.maxAmount === undefined || Number.isNaN(Number(dashboardFilter.maxAmount))
            ? true
            : amountNum !== null && !Number.isNaN(amountNum) && amountNum <= Number(dashboardFilter.maxAmount));

        // Jira behavior: if Advanced query is set, it replaces Basic filters.
        const searchMatch = hasAdvanced
          ? true
          : searchQuery === "" ||
            (deal.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
            (deal.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
            (deal.company?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

        const statusMatch = hasAdvanced ? true : !filterStatus || deal.status === filterStatus;
        const priorityMatch = hasAdvanced ? true : !filterPriority || deal.priority === filterPriority;
        const userMatch = hasAdvanced
          ? true
          : !filterUser ||
            (Array.isArray((deal as any).users) &&
              (deal as any).users.some((u: any) => String(u?.name || "") === String(filterUser)));

        const advancedMatch = !advancedAst ? true : evalDealQuery(advancedAst, deal);

        return stageMatch && amountMatch && searchMatch && statusMatch && priorityMatch && userMatch && advancedMatch;
      });
    });

    setFilteredColumns(filtered);
  }, [columns, searchQuery, filterStatus, filterPriority, filterUser, dashboardFilter]);

  React.useEffect(() => {
    filterTasks();
  }, [filterTasks]);

  const FilterDropdown = () => {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <SlidersHorizontalIcon />
            <span className="hidden lg:inline">
              {getActiveFilters().length > 0 ? (
                <>Filters ({getActiveFilters().length})</>
              ) : (
                "Filters"
              )}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="end">
          <Command>
            <CommandInput placeholder="Search filters..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>

              {/* Status Filters */}
              <CommandGroup heading="Status">
                <CommandItem
                  onSelect={() => {
                    setFilterStatus("completed");
                    setOpen(false);
                  }}>
                  <span>Completed</span>
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setFilterStatus("inProgress");
                    setOpen(false);
                  }}>
                  <span>In Progress</span>
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setFilterStatus("notStarted");
                    setOpen(false);
                  }}>
                  <span>Not Started</span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              {/* Priority Filters */}
              <CommandGroup heading="Priority">
                <CommandItem
                  onSelect={() => {
                    setFilterPriority("high");
                    setOpen(false);
                  }}>
                  <span>High </span>
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setFilterPriority("medium");
                    setOpen(false);
                  }}>
                  <span>Medium </span>
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    setFilterPriority("low");
                    setOpen(false);
                  }}>
                  <span>Low </span>
                </CommandItem>
              </CommandGroup>

              <CommandSeparator />

              {/* User Filters */}
              <CommandGroup heading="Assigned To">
                {Array.from(
                  new Set(
                    Object.values(columns).flatMap((tasks) =>
                      (tasks ?? []).flatMap((task: any) =>
                        ((task?.users ?? []) as any[])
                          .map((user) => user?.name)
                          .filter(Boolean)
                      )
                    )
                  )
                ).map((userName) => (
                  <CommandItem
                    key={userName}
                    onSelect={() => {
                      setFilterUser(userName);
                      setOpen(false);
                    }}>
                    <Avatar className="mr-2 h-5 w-5">
                      <AvatarImage
                        src={
                          Object.values(columns)
                            .flat()
                            .find((task: any) => (task?.users ?? []).some((user: any) => user?.name === userName))
                            ?.users?.find((user: any) => user?.name === userName)?.src
                        }
                        alt={userName}
                      />
                      <AvatarFallback>{userName[0]}</AvatarFallback>
                    </Avatar>
                    <span>{userName}</span>
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandSeparator />

              {/* Clear Filters */}
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setFilterStatus(null);
                    setFilterPriority(null);
                    setFilterUser(null);
                    setOpen(false);
                  }}
                  className="justify-center text-center">
                  Clear Filters
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  const handleMove = React.useCallback(
    async (event: any) => {
      // This is called when columns are reordered
      const { activeIndex, overIndex } = event;
      
      if (activeIndex === overIndex) return;

      // Get column keys in the current order (based on pipelineStages order)
      const currentColumnKeys = pipelineStages.map((stage) => `stage-${stage.id}`);
      
      // Reorder the column keys
      const reorderedColumnKeys = [...currentColumnKeys];
      const [movedKey] = reorderedColumnKeys.splice(activeIndex, 1);
      reorderedColumnKeys.splice(overIndex, 0, movedKey);

      // Map column keys back to stages and reorder pipelineStages
      const reorderedStages = reorderedColumnKeys.map((key) => {
        const stageId = parseInt(key.replace(/^stage-/, ""));
        return pipelineStages.find((s) => s.id === stageId)!;
      }).filter(Boolean);

      if (!selectedPipeline) return;
      const pipelineId = parseInt(selectedPipeline);
      if (isNaN(pipelineId)) return;

      // Update order values based on new positions
      const updates: Promise<void>[] = [];
      reorderedStages.forEach((stage, index) => {
        const newOrder = index + 1; // Start from 1
        if (stage.order !== newOrder) {
          updates.push(
            dealPipelinesApi
              .updatePipelineStage(pipelineId, stage.id, {
                name: stage.name,
                color: stage.color,
                order: newOrder
              })
              .then(() => {
                // Update successful
              })
              .catch((error) => {
                console.error(`Failed to update stage ${stage.id} order:`, error);
                toast.error(`Failed to update stage order`);
              })
          );
        }
      });

      // Update local state immediately
      setPipelineStages(reorderedStages);

      // Update columns order
      const reorderedColumns: Record<string, Deal[]> = {};
      reorderedStages.forEach((stage) => {
        const columnKey = `stage-${stage.id}`;
        reorderedColumns[columnKey] = columns[columnKey] || [];
      });
      setColumns(reorderedColumns);
      setFilteredColumns(reorderedColumns);

      // Wait for all updates to complete
      if (updates.length > 0) {
        await Promise.all(updates);
      }
    },
    [pipelineStages, columns, selectedPipeline]
  );

  const handleColumnChange = React.useCallback(
    async (newColumns: Record<string, Deal[]>) => {
      // Check if this is a column reorder by comparing column keys order
      const oldColumnKeys = Object.keys(columns);
      const newColumnKeys = Object.keys(newColumns);
      
      // If column keys are the same but in different order, it's a column reorder
      const isColumnReorder = 
        oldColumnKeys.length === newColumnKeys.length &&
        oldColumnKeys.every(key => newColumnKeys.includes(key)) &&
        JSON.stringify(oldColumnKeys) !== JSON.stringify(newColumnKeys);

      if (isColumnReorder) {
        // Column reordering is handled by handleMove, just update local state
        setColumns(newColumns);
        setFilteredColumns(newColumns);
        return;
      }

      // Find which deals moved to which columns and check permissions
      const moves: Array<{ deal: Deal; fromStageId: number; toStageId: number }> = [];

      Object.entries(newColumns).forEach(([stageId, deals]) => {
        deals.forEach((deal) => {
          const oldStageId = Object.keys(columns).find((key) =>
            columns[key].some((d) => d.id === deal.id)
          );

          if (oldStageId && oldStageId !== stageId) {
            // Deal moved to a different stage
            // Extract stage ID from column key (remove "stage-" prefix)
            const fromStageId = parseInt(oldStageId.replace(/^stage-/, ""));
            const toStageId = parseInt(stageId.replace(/^stage-/, ""));
            
            if (!isNaN(fromStageId) && !isNaN(toStageId)) {
              moves.push({ deal, fromStageId, toStageId });
            }
          }
        });
      });

      // Check permissions for all moves
      if (moves.length > 0) {
        const permissionChecks = await Promise.all(
          moves.map(async (move) => {
            try {
              const pipelineId = selectedPipeline ? parseInt(selectedPipeline) : null;
              const result = await accessControlsApi.checkDragDropPermission("deals", move.fromStageId, move.toStageId, pipelineId);
              return { move, allowed: result.allowed };
            } catch (error) {
              console.error("Error checking drag-drop permission:", error);
              // On error, allow by default to not break existing functionality
              return { move, allowed: true };
            }
          })
        );

        // Filter out moves that are not allowed
        const allowedMoves = permissionChecks.filter(check => check.allowed).map(check => check.move);
        const deniedMoves = permissionChecks.filter(check => !check.allowed).map(check => check.move);

        if (deniedMoves.length > 0) {
          toast.error(`You don't have permission to move ${deniedMoves.length} deal(s) between those stages`);
          // Revert to original columns
          setColumns(columns);
          setFilteredColumns(columns);
          return;
        }

        // Update local state for allowed moves
        setColumns(newColumns);
        setFilteredColumns(newColumns);

        // Update database for allowed moves
        const updates: Promise<void>[] = [];

        allowedMoves.forEach(({ deal, toStageId }) => {
          const dealId = parseInt(deal.id);
          if (!isNaN(dealId)) {
            // Extract only the data fields (exclude id, createdAt, updatedAt)
            const { id, createdAt, updatedAt, ...dealData } = deal as any;
            const updateData = {
              ...dealData,
              stageId: toStageId
            };

            updates.push(
              entityDataApi
                .updateEntityData(dealId, updateData)
                .then(() => {
                  // Update successful
                })
                .catch((error) => {
                  console.error(`Failed to update deal ${dealId}:`, error);
                  toast.error(`Failed to update deal stage`);
                })
            );
          }
        });

        // Wait for all updates to complete
        if (updates.length > 0) {
          await Promise.all(updates);
        }
      } else {
        // No moves, just update local state
        setColumns(newColumns);
        setFilteredColumns(newColumns);
      }
    },
    [columns, selectedPipeline]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Deals</h1>
        <div className="flex items-center space-x-2">
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <div className="mb-2 flex justify-between gap-3">
          <TabsList className="z-10">
            <TabsTrigger value="board"><KanbanIcon /> Kanban</TabsTrigger>
            <TabsTrigger value="list"><ListIcon /> Table</TabsTrigger>
            <TabsTrigger value="table"><CalendarDaysIcon /> Calendar</TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <Select
              value={selectedPipeline || ""}
              onValueChange={(value) => {
                if (value === "manage") {
                  setIsManagePipelinesOpen(true);
                } else {
                  setSelectedPipeline(value);
                }
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select Pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((pipeline) => (
                  <SelectItem key={pipeline.id} value={pipeline.id.toString()}>
                    {pipeline.name}
                    {pipeline.isDefault && " (Default)"}
                  </SelectItem>
                ))}
                {pipelines.length > 0 && <SelectSeparator />}
                <SelectItem value="manage">Manage Pipelines</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative hidden w-auto lg:block">
              <SearchIcon className="absolute top-2.5 left-3 size-4 opacity-50" />
              <Input
                placeholder="Search deals..."
                className="ps-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="none lg:hidden">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <SearchIcon />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[240px] p-0" align="end">
                  <Input
                    placeholder="Search deals..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <FilterDropdown />

            <Button variant="outline" onClick={() => setIsImportOpen(true)}>
              <Upload className="h-4 w-4" />
              <span className="hidden lg:inline">Import CSV</span>
            </Button>
            <Button variant="outline" onClick={() => setIsExportOpen(true)} disabled={exportFields.length === 0}>
              <Download className="h-4 w-4" />
              <span className="hidden lg:inline">Export CSV</span>
            </Button>
            
            <TemplateViewerDialog
              open={isNewDealModalOpen}
              onOpenChange={setIsNewDealModalOpen}
              templateId={dealTemplateId}
              entityType="DEAL"
              initialData={
                pipelineStages.length > 0
                  ? {
                      stageId: pipelineStages[0].id // Set to initial (first) stage
                    }
                  : {}
              }
              onSubmit={async (data) => {
                try {
                  // Ensure stageId is set to initial stage if not provided
                  const dealData = {
                    ...data,
                    stageId: data.stageId || (pipelineStages.length > 0 ? pipelineStages[0].id : null)
                  };

                  const createdEntity = await entityDataApi.createEntityData({
                    entityType: "DEAL",
                    templateId: dealTemplateId,
                    data: dealData
                  });

                  // Reload deals to show the new one
                  const groupedDeals = await reloadDealsWithComments(pipelineStages);
                  setColumns(groupedDeals);
                  setFilteredColumns(groupedDeals);

                  setIsNewDealModalOpen(false);
                  toast.success("Deal created successfully");
                } catch (error: any) {
                  console.error("Error creating deal:", error);
                  toast.error(error?.error || "Failed to create deal");
                  throw error;
                }
              }}
              onCancel={() => setIsNewDealModalOpen(false)}
              submitLabel="Create Deal"
            />
            <Button onClick={() => setIsNewDealModalOpen(true)}>
                  <PlusCircleIcon />
                  <span className="hidden lg:inline">Create Deal</span>
                </Button>
          </div>
        </div>
        <TabsContent value="board">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-muted-foreground">Loading deals...</div>
            </div>
          ) : (
          <Kanban.Root
            value={filteredColumns}
            onValueChange={handleColumnChange}
            onMove={handleMove}
            getItemValue={(item) => item.id}>
            <Kanban.Board className="flex w-full gap-4 overflow-x-auto pb-4">
              {pipelineStages.map((stage) => {
                const columnValue = `stage-${stage.id}`;
                const deals = filteredColumns[columnValue] || [];
                return (
                <Kanban.Column
                  key={columnValue}
                  value={columnValue}
                  className="w-[400px] min-w-[400px]">
                  <div 
                    className="group flex items-center justify-between rounded-t-lg px-3 py-2"
                    style={{ backgroundColor: stage?.color || "#808080" }}>
                    <div className="flex items-center gap-2 flex-1">
                      {editingStageId === stage.id ? (
                  <Input
                          value={editingStageName}
                          onChange={(e) => setEditingStageName(e.target.value)}
                          onBlur={async () => {
                            if (editingStageName.trim() && editingStageName !== stage.name) {
                              try {
                                await dealPipelinesApi.updatePipelineStage(stage.pipelineId, stage.id, {
                                  name: editingStageName.trim(),
                                  color: stage.color,
                                  order: stage.order
                                });
                                // Reload stages
                                const stages = await dealPipelinesApi.getPipelineStages(parseInt(selectedPipeline!));
                                const sortedStages = Array.isArray(stages)
                                  ? stages.sort((a: PipelineStage, b: PipelineStage) => a.order - b.order)
                                  : [];
                                setPipelineStages(sortedStages);
                              } catch (error: any) {
                                console.error("Error updating stage name:", error);
                                toast.error(error?.error || "Failed to update stage name");
                              }
                            }
                            setEditingStageId(null);
                            setEditingStageName("");
                          }}
                    onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            } else if (e.key === "Escape") {
                              setEditingStageId(null);
                              setEditingStageName("");
                            }
                          }}
                          className="h-6 text-sm font-semibold bg-background/90"
                          autoFocus
                        />
                      ) : (
                        <span className="text-sm font-semibold text-white drop-shadow-sm">
                          {stage?.name || columnValue}
                        </span>
                      )}
                      <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                        {deals.length}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Tooltip>
                        <TooltipTrigger asChild>
                  <Button
                            variant="ghost"
                    size="icon"
                            className="h-7 w-7 text-white hover:bg-white/20"
                            type="button"
                            onClick={() => {
                              setEditingStageId(stage.id);
                              setEditingStageName(stage.name);
                            }}>
                            <Pencil className="h-3.5 w-3.5" />
                  </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Edit Stage Name</p>
                        </TooltipContent>
                      </Tooltip>
                      <Popover open={isColorPickerOpen === stage.id} onOpenChange={(open) => setIsColorPickerOpen(open ? stage.id : null)}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-white hover:bg-white/20"
                                type="button">
                                <Palette className="h-3.5 w-3.5" />
                </Button>
                            </PopoverTrigger>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Change Color</p>
                          </TooltipContent>
                        </Tooltip>
                        <PopoverContent className="w-64" align="start">
                          <div className="space-y-2">
                            <div className="text-sm font-medium">Select Color</div>
                            <div className="grid grid-cols-8 gap-2">
                              {[
                                "#808080", "#ef4444", "#f97316", "#eab308", 
                                "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6",
                                "#ec4899", "#84cc16", "#14b8a6", "#6366f1",
                                "#a855f7", "#f43f5e", "#fb923c", "#fbbf24"
                              ].map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  className={`w-8 h-8 rounded-md border-2 transition-all ${
                                    stage.color === color 
                                      ? "border-foreground scale-110" 
                                      : "border-transparent hover:scale-105"
                                  }`}
                                  style={{ backgroundColor: color }}
                                  onClick={async () => {
                                    try {
                                      await dealPipelinesApi.updatePipelineStage(stage.pipelineId, stage.id, {
                                        name: stage.name,
                                        color: color,
                                        order: stage.order
                                      });
                                      // Reload stages
                                      const stages = await dealPipelinesApi.getPipelineStages(parseInt(selectedPipeline!));
                                      const sortedStages = Array.isArray(stages)
                                        ? stages.sort((a: PipelineStage, b: PipelineStage) => a.order - b.order)
                                        : [];
                                      setPipelineStages(sortedStages);
                                      setIsColorPickerOpen(null);
                                      toast.success("Stage color updated");
                                    } catch (error: any) {
                                      console.error("Error updating stage color:", error);
                                      toast.error(error?.error || "Failed to update stage color");
                      }
                    }}
                  />
                              ))}
                </div>
          </div>
                        </PopoverContent>
                      </Popover>
                      <Kanban.ColumnHandle asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-white/20" type="button">
                          <GripVertical className="h-4 w-4" />
                        </Button>
                      </Kanban.ColumnHandle>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-white hover:bg-white/20"
                            onClick={() => {
                              handleAddStageAfter(stage.id);
                            }}>
                            <PlusCircleIcon className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Add Stage</p>
                        </TooltipContent>
                      </Tooltip>
                      {!isProtectedStage(stage) ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-white hover:bg-white/20"
                              onClick={() => setStageDeleteTarget(stage)}
                              aria-label="Delete stage"
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete Stage</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                  </div>
                  {deals.length > 0 ? (
                    <div className="flex flex-col gap-2 p-0.5">
                      {deals.map((deal) => (
                        <Kanban.Item key={deal.id} value={deal.id} asHandle asChild>
                          <Card className="border-0">
                            <CardHeader>
                              <CardTitle className="text-base font-semibold">
                                {deal.name || "Unnamed Deal"}
                              </CardTitle>
                              <CardDescription>
                                {deal.email || deal.company || "No additional information"}
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="text-muted-foreground flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {deal.company && (
                                    <Badge variant="outline">{deal.company}</Badge>
                                  )}
                                  {deal.status && (
                                    <Badge variant="secondary">{deal.status}</Badge>
                                  )}
                                  {deal.priority && (
                                <Badge className="capitalize" variant="outline">
                                      {deal.priority}
                                </Badge>
                                  )}
                                  </div>
                                  </div>
                              {deal.email && (
                                <div className="text-muted-foreground text-xs">
                                  {deal.email}
                                </div>
                              )}
                              {deal.phone && (
                                <div className="text-muted-foreground text-xs">
                                  {deal.phone}
                              </div>
                              )}
                            </CardContent>
                          </Card>
                        </Kanban.Item>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col justify-center gap-4 pt-4">
                      <div className="text-muted-foreground text-sm">No deals added here.</div>
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setSelectedStageForDeal(stage.id);
                          setIsAddDealModalOpen(true);
                        }}
                      >
                        Add Deal
                      </Button>
                    </div>
                  )}
                </Kanban.Column>
                );
              })}
            </Kanban.Board>
            <Kanban.Overlay>
              <div className="bg-primary/10 size-full rounded-md" />
            </Kanban.Overlay>
          </Kanban.Root>
          )}
        </TabsContent>
        <TabsContent value="list">
          <DealsTable />
        </TabsContent>
        <TabsContent value="table">
          <DealsCalendar
            deals={Object.values(columns).flat()}
            loading={loading}
          />
        </TabsContent>
      </Tabs>

      {/* Add Deal Dialog (for column-specific deals) */}
      <TemplateViewerDialog
        open={isAddDealModalOpen}
        onOpenChange={setIsAddDealModalOpen}
        templateId={dealTemplateId}
        entityType="DEAL"
        initialData={
          selectedStageForDeal !== null
            ? {
                stageId: selectedStageForDeal // Set to the column's stage
              }
            : {}
        }
        onSubmit={async (data) => {
          try {
            // Ensure stageId is set to the selected stage
            const dealData = {
              ...data,
              stageId: selectedStageForDeal || (pipelineStages.length > 0 ? pipelineStages[0].id : null)
            };

            const createdEntity = await entityDataApi.createEntityData({
              entityType: "DEAL",
              templateId: dealTemplateId,
              data: dealData
            });

            // Reload deals to show the new one
            const groupedDeals = await reloadDealsWithComments(pipelineStages);
            setColumns(groupedDeals);
            setFilteredColumns(groupedDeals);

            setIsAddDealModalOpen(false);
            setSelectedStageForDeal(null);
            toast.success("Deal created successfully");
          } catch (error: any) {
            console.error("Error creating deal:", error);
            toast.error(error?.error || "Failed to create deal");
            throw error;
          }
        }}
        onCancel={() => {
          setIsAddDealModalOpen(false);
          setSelectedStageForDeal(null);
        }}
        submitLabel="Add Deal"
      />

      <AlertDialog open={stageDeleteTarget != null} onOpenChange={(v) => (v ? null : setStageDeleteTarget(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete stage?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the stage{" "}
              <span className="font-medium">{stageDeleteTarget?.name}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setStageDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!stageDeleteTarget) return;
                const s = stageDeleteTarget;
                setStageDeleteTarget(null);
                await handleDeleteStage(s);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CsvExportDialog
        open={isExportOpen}
        onOpenChange={setIsExportOpen}
        title="Export Deals to CSV"
        description="Select which fields you want to export."
        fields={exportFields}
        defaultSelectedKeys={exportFields.slice(0, 10).map((f: { key: string }) => f.key)}
        onExport={handleExportCsv}
      />

      <CsvImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        title="Import Deals from CSV"
        description="Upload a CSV file. Rows will be created as new deals in the first stage unless stageId is provided."
        onImportRows={handleImportCsvRows}
      />

      <ManagePipelinesDialog
        open={isManagePipelinesOpen}
        onOpenChange={setIsManagePipelinesOpen}
        onPipelineChange={() => {
          // Refresh pipelines when dialog closes
        }}
      />
    </div>
  );
}
