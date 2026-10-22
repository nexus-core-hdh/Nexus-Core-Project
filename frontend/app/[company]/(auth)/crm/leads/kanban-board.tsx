"use client";

import * as React from "react";
import {
  GripVertical,
  Paperclip,
  MessageSquare,
  PlusCircleIcon,
  Trash2,
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
  X,
  Palette
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

import { LeadsTable } from "./leads-table";
import { LeadsCalendar, Lead } from "./leads-calendar";
import { leadStagesApi, entityDataApi, entityApi, formTemplatesApi, accessControlsApi } from "@/lib/api";
import { toast } from "sonner";
import { TemplateViewerDialog } from "@/app/[company]/(auth)/pages/form-builder/template-viewer-dialog";
import { getCurrentUser } from "@/lib/auth";
import { CsvExportDialog } from "../components/csv-export-dialog";
import { CsvImportDialog } from "../components/csv-import-dialog";
import { downloadTextFile, toCsv } from "../components/csv-utils";

interface LeadStage {
  id: number;
  name: string;
  color: string;
  order: number;
  type: string;
}

// Helper function to format date as Month-Day-Year
const formatDate = (date: string | Date): string => {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    
    const month = d.getMonth() + 1; // getMonth() returns 0-11
    const day = d.getDate();
    const year = d.getFullYear();
    
    return `${month}-${day}-${year}`;
  } catch (error) {
    return String(date);
  }
};

// Helper function to format date and time as Month-Day-Year Hour:Minute
const formatDateTime = (date: string | Date): string => {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const year = d.getFullYear();
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const paddedMinutes = minutes < 10 ? `0${minutes}` : minutes;
    const paddedHours = hours < 10 ? `0${hours}` : hours;
    
    return `${month}-${day}-${year} ${paddedHours}:${paddedMinutes}`;
  } catch (error) {
    return String(date);
  }
};

// Helper function to reload leads with comments from API
const reloadLeadsWithComments = async (leadStages: LeadStage[], companyId?: number, branchId?: number): Promise<Record<string, Lead[]>> => {
  // Entity data is already filtered by company/branch in the backend via auth middleware
  const entityDataList = await entityDataApi.getEntityDataByType("LEAD");
  
  // Transform EntityData to Lead format and load comments from Comment table
  const transformedLeads: Lead[] = await Promise.all(
    (entityDataList as any[]).map(async (entityData: any) => {
      const data = typeof entityData.data === "object" && entityData.data !== null
        ? entityData.data
        : {};
      const leadData: Lead = {
        id: entityData.id?.toString() || String(entityData.id),
        ...data,
        createdAt: entityData.createdAt,
        updatedAt: entityData.updatedAt
      };
      
      // Load comments from Comment table API
      try {
        const comments = await entityApi.getComments("LEAD", entityData.id);
        (leadData as any).comments = Array.isArray(comments) ? comments : [];
      } catch (error) {
        console.error(`Error loading comments for lead ${leadData.id}:`, error);
        (leadData as any).comments = [];
      }
      
      return leadData;
    })
  );

  // Group leads by stageId
  const groupedLeads: Record<string, Lead[]> = {};
  leadStages.forEach((stage: LeadStage) => {
    groupedLeads[`stage-${stage.id}`] = [];
  });

  transformedLeads.forEach((lead: Lead) => {
    const stageId = (lead as any).stageId;
    if (stageId) {
      const stageKey = `stage-${stageId}`;
      if (groupedLeads[stageKey]) {
        groupedLeads[stageKey].push(lead);
      } else {
        const firstStageKey = leadStages[0] ? `stage-${leadStages[0].id}` : null;
        if (firstStageKey) {
          groupedLeads[firstStageKey].push(lead);
        }
      }
    } else {
      const firstStageKey = leadStages[0] ? `stage-${leadStages[0].id}` : null;
      if (firstStageKey) {
        groupedLeads[firstStageKey].push(lead);
      }
    }
  });

  return groupedLeads;
};

export default function KanbanBoard() {
  const [leadStages, setLeadStages] = React.useState<LeadStage[]>([]);
  const [columns, setColumns] = React.useState<Record<string, Lead[]>>({});
  const [filteredColumns, setFilteredColumns] = React.useState<Record<string, Lead[]>>({});
  const [loading, setLoading] = React.useState(true);

  const [filterStatus, setFilterStatus] = React.useState<string | null>(null);
  const [filterPriority, setFilterPriority] = React.useState<string | null>(null);
  const [filterUser, setFilterUser] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const [isNewLeadModalOpen, setIsNewLeadModalOpen] = React.useState(false);
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = React.useState(false);
  const [isEditLeadModalOpen, setIsEditLeadModalOpen] = React.useState(false);
  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);
  const [selectedStageForLead, setSelectedStageForLead] = React.useState<number | null>(null);
  const [leadTemplateId, setLeadTemplateId] = React.useState<number | undefined>();
  const [formTemplate, setFormTemplate] = React.useState<any>(null);
  const [fieldLabelMap, setFieldLabelMap] = React.useState<Record<string, string>>({});
  const [commentLeads, setCommentLeads] = React.useState<Record<string, boolean>>({});
  const [leadComments, setLeadComments] = React.useState<Record<string, string>>({});
  const [editingStageId, setEditingStageId] = React.useState<number | null>(null);
  const [editingStageName, setEditingStageName] = React.useState("");
  const [isColorPickerOpen, setIsColorPickerOpen] = React.useState<number | null>(null);
  const [stageDeleteTarget, setStageDeleteTarget] = React.useState<LeadStage | null>(null);
  const [isExportOpen, setIsExportOpen] = React.useState(false);
  const [isImportOpen, setIsImportOpen] = React.useState(false);

  // Load lead template ID and field labels
  React.useEffect(() => {
    const loadTemplate = async () => {
      try {
        const templates = await formTemplatesApi.getFormTemplates(
          undefined,
          undefined,
          "LEAD",
          true
        );
        const activeTemplate = Array.isArray(templates)
          ? templates.find((t: any) => t.entityType === "LEAD" && t.isActive)
          : null;
        if (activeTemplate) {
          setLeadTemplateId(activeTemplate.id);
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
        console.error("Error loading lead template:", error);
      }
    };
    loadTemplate();
  }, []);

  // Load lead stages from database
  React.useEffect(() => {
    const loadStages = async () => {
      try {
        setLoading(true);
        const user = getCurrentUser();
        const stages = await leadStagesApi.getLeadStages(user?.companyId || undefined, user?.branchId || undefined);
        const sortedStages = Array.isArray(stages)
          ? stages.sort((a: LeadStage, b: LeadStage) => {
              // Order strictly by the order column from database
              return a.order - b.order;
            })
          : [];
        setLeadStages(sortedStages);

        // Initialize columns with empty arrays for each stage
        // Use "stage-" prefix to avoid conflicts with lead IDs
        const initialColumns: Record<string, Lead[]> = {};
        sortedStages.forEach((stage: LeadStage) => {
          initialColumns[`stage-${stage.id}`] = [];
        });
        setColumns(initialColumns);
        setFilteredColumns(initialColumns);
      } catch (error) {
        console.error("Error loading lead stages:", error);
        toast.error("Failed to load lead stages");
      } finally {
        setLoading(false);
      }
    };
    loadStages();
  }, []);

  // Load leads from database and group by stageId
  React.useEffect(() => {
    const loadLeads = async () => {
      if (leadStages.length === 0) return;

      try {
        const user = getCurrentUser();
        const groupedLeads = await reloadLeadsWithComments(leadStages, user?.companyId || undefined, user?.branchId || undefined);
        setColumns(groupedLeads);
        setFilteredColumns(groupedLeads);
      } catch (error: any) {
        console.error("Error loading leads:", error);
        toast.error(error?.error || "Failed to load leads");
      }
    };
    loadLeads();
  }, [leadStages]);

  const getActiveFilters = () => {
    const filters = [];
    if (filterStatus) filters.push(filterStatus);
    if (filterPriority) filters.push(filterPriority);
    if (filterUser) filters.push(filterUser);
    return filters;
  };

  const [searchQuery, setSearchQuery] = React.useState("");

  const exportFields = React.useMemo<Array<{ key: string; label: string }>>(() => {
    const fields = Array.isArray(formTemplate?.formFields) ? formTemplate.formFields : [];
    if (fields.length > 0) {
      return fields
        .filter((f: any) => !!f?.name)
        .map((f: any) => ({
          key: String(f.name),
          label: String(f.label || fieldLabelMap[f.name] || f.name)
        }));
    }
    // Fallback: use keys from first lead if template isn't available
    const sample = Object.values(columns).flat()[0] as any;
    if (!sample) return [];
    return Object.keys(sample)
      .filter((k) => !["createdAt", "updatedAt", "comments"].includes(k))
      .map((k) => ({ key: k, label: fieldLabelMap[k] || k }));
  }, [formTemplate, fieldLabelMap, columns]);

  const handleExportCsv = async (selectedKeys: string[]) => {
    try {
      const entityDataList = await entityDataApi.getEntityDataByType("LEAD");
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
      downloadTextFile(`leads-${today}.csv`, csv, "text/csv;charset=utf-8");
      toast.success("CSV exported");
    } catch (e: any) {
      console.error("Export leads CSV failed:", e);
      toast.error(e?.message || "Failed to export CSV");
    }
  };

  const handleImportCsvRows = async (rows: Array<Record<string, string>>) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    try {
      const initialStageId = leadStages.length > 0 ? leadStages[0].id : null;
      if (!initialStageId) {
        toast.error("No lead stages found");
        return;
      }

      for (const row of rows) {
        const data: any = { ...row };
        // Normalize empty strings to null
        Object.keys(data).forEach((k) => {
          if (data[k] === "") data[k] = null;
        });

        // Ensure stageId exists
        if (!data.stageId) data.stageId = initialStageId;
        if (typeof data.stageId === "string") {
          const n = parseInt(data.stageId, 10);
          data.stageId = isNaN(n) ? initialStageId : n;
        }

        await entityDataApi.createEntityData({
          entityType: "LEAD",
          templateId: leadTemplateId,
          data
        });
      }

      const groupedLeads = await reloadLeadsWithComments(leadStages);
      setColumns(groupedLeads);
      setFilteredColumns(groupedLeads);
      toast.success(`Imported ${rows.length} lead(s)`);
    } catch (e: any) {
      console.error("Import leads CSV failed:", e);
      toast.error(e?.message || "Failed to import CSV");
      throw e;
    }
  };

  const filterTasks = React.useCallback(() => {
    let filtered: Record<string, Lead[]> = { ...columns };

    Object.keys(filtered).forEach((columnKey) => {
      filtered[columnKey] = columns[columnKey].filter((lead) => {
        const searchMatch =
          searchQuery === "" ||
          (lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
          (lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
          (lead.company?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

        const statusMatch = !filterStatus || lead.status === filterStatus;
        const priorityMatch = !filterPriority || lead.priority === filterPriority;
        const userMatch = !filterUser; // User filtering can be added if leads have assignee field

        return searchMatch && statusMatch && priorityMatch && userMatch;
      });
    });

    setFilteredColumns(filtered);
  }, [columns, searchQuery, filterStatus, filterPriority, filterUser]);

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

      // Get column keys in the current order (based on leadStages order)
      const currentColumnKeys = leadStages.map((stage) => `stage-${stage.id}`);
      
      // Reorder the column keys
      const reorderedColumnKeys = [...currentColumnKeys];
      const [movedKey] = reorderedColumnKeys.splice(activeIndex, 1);
      reorderedColumnKeys.splice(overIndex, 0, movedKey);

      // Map column keys back to stages and reorder leadStages
      const reorderedStages = reorderedColumnKeys.map((key) => {
        const stageId = parseInt(key.replace(/^stage-/, ""));
        return leadStages.find((s) => s.id === stageId)!;
      }).filter(Boolean);

      // Update order values based on new positions
      const updates: Promise<void>[] = [];
      reorderedStages.forEach((stage, index) => {
        const newOrder = index + 1; // Start from 1
        if (stage.order !== newOrder) {
          updates.push(
            leadStagesApi
              .updateLeadStage(stage.id, {
                name: stage.name,
                color: stage.color,
                order: newOrder,
                type: stage.type
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
      setLeadStages(reorderedStages);

      // Update columns order
      const reorderedColumns: Record<string, Lead[]> = {};
      reorderedStages.forEach((stage) => {
        const columnKey = `stage-${stage.id}`;
        reorderedColumns[columnKey] = columns[columnKey] || [];
      });
      setColumns(reorderedColumns);
      setFilteredColumns(reorderedColumns);

      // Wait for all updates to complete
      if (updates.length > 0) {
        await Promise.all(updates);
        // No notification for stage reordering
      }
    },
    [leadStages, columns]
  );

  const handleColumnChange = React.useCallback(
    async (newColumns: Record<string, Lead[]>) => {
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

      // Find which leads moved to which columns and check permissions
      const moves: Array<{ lead: Lead; fromStageId: number; toStageId: number }> = [];

      Object.entries(newColumns).forEach(([stageId, leads]) => {
        leads.forEach((lead) => {
          const oldStageId = Object.keys(columns).find((key) =>
            columns[key].some((l) => l.id === lead.id)
          );

          if (oldStageId && oldStageId !== stageId) {
            // Lead moved to a different stage
            // Extract stage ID from column key (remove "stage-" prefix)
            const fromStageId = parseInt(oldStageId.replace(/^stage-/, ""));
            const toStageId = parseInt(stageId.replace(/^stage-/, ""));
            
            if (!isNaN(fromStageId) && !isNaN(toStageId)) {
              moves.push({ lead, fromStageId, toStageId });
            }
          }
        });
      });

      // Check permissions for all moves
      if (moves.length > 0) {
        const user = getCurrentUser();
        const permissionChecks = await Promise.all(
          moves.map(async (move) => {
            try {
              const result = await accessControlsApi.checkDragDropPermission("leads", move.fromStageId, move.toStageId);
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
          toast.error(`You don't have permission to move ${deniedMoves.length} lead(s) between those stages`);
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

        allowedMoves.forEach(({ lead, toStageId }) => {
          const leadId = parseInt(lead.id);
          if (!isNaN(leadId)) {
            // Extract only the data fields (exclude id, createdAt, updatedAt)
            const { id, createdAt, updatedAt, ...leadData } = lead as any;
            const updateData = {
              ...leadData,
              stageId: toStageId
            };

            updates.push(
              entityDataApi
                .updateEntityData(leadId, updateData)
                .then(() => {
                  // Update successful
                })
                .catch((error) => {
                  console.error(`Failed to update lead ${leadId}:`, error);
                  toast.error(`Failed to update lead stage`);
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
    [columns]
  );


  // Add a new stage after the selected stage
  const addStageAfter = React.useCallback(async (afterStageId: number, stageName: string) => {
    try {
      // Find the current stage index
      const currentStageIndex = leadStages.findIndex((s) => s.id === afterStageId);
      if (currentStageIndex === -1) {
        toast.error("Stage not found");
        return;
      }

      // Get the current stage's order
      const currentStage = leadStages[currentStageIndex];
      const newOrder = currentStage.order + 1; // New stage order is right after current stage

      // Update orders of all stages that come after the current stage
      const updates: Promise<void>[] = [];
      
      // Update orders for stages that come after the new position
      leadStages.forEach((stage) => {
        if (stage.order > currentStage.order) {
          const updatedOrder = stage.order + 1; // Increment by 1 to make room for new stage
          updates.push(
            leadStagesApi
              .updateLeadStage(stage.id, {
                name: stage.name,
                color: stage.color,
                order: updatedOrder,
                type: stage.type
              })
              .then(() => {})
              .catch((error) => {
                console.error(`Failed to update stage ${stage.id} order:`, error);
              })
          );
        }
      });

      // Create the new stage
      await leadStagesApi.createLeadStage({
        name: stageName.trim(),
        color: "#808080", // Default gray color
        order: newOrder,
        type: "additional" // Default type - valid enum values: initial, additional, success, failed
      });

      // Wait for all updates to complete
      if (updates.length > 0) {
        await Promise.all(updates);
      }

      // Reload stages to get the updated order
      const stages = await leadStagesApi.getLeadStages();
      const sortedStages = Array.isArray(stages)
        ? stages.sort((a: LeadStage, b: LeadStage) => a.order - b.order)
        : [];
      setLeadStages(sortedStages);

      // Update columns
      const initialColumns: Record<string, Lead[]> = {};
      sortedStages.forEach((stage: LeadStage) => {
        initialColumns[`stage-${stage.id}`] = columns[`stage-${stage.id}`] || [];
      });
      setColumns(initialColumns);
      setFilteredColumns(initialColumns);

      toast.success("Stage added successfully");
    } catch (error: any) {
      console.error("Error adding stage:", error);
      toast.error(error?.error || "Failed to add stage");
    }
  }, [leadStages, columns]);

  const handleDeleteStage = React.useCallback(
    async (stage: LeadStage) => {
      try {
        await leadStagesApi.deleteLeadStage(stage.id);
        const stages = await leadStagesApi.getLeadStages();
        const sortedStages = Array.isArray(stages) ? stages.sort((a: LeadStage, b: LeadStage) => a.order - b.order) : [];
        setLeadStages(sortedStages);

        const nextColumns: Record<string, Lead[]> = {};
        sortedStages.forEach((s: LeadStage) => {
          nextColumns[`stage-${s.id}`] = columns[`stage-${s.id}`] || [];
        });
        setColumns(nextColumns);
        setFilteredColumns(nextColumns);

        toast.success("Stage deleted");
      } catch (error: any) {
        console.error("Error deleting stage:", error);
        toast.error(error?.error || error?.message || "Failed to delete stage");
      }
    },
    [columns]
  );

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Leads</h1>
        <div className="flex items-center space-x-2">
        </div>
      </div>
      <Tabs defaultValue="board" className="w-full">
        <div className="mb-2 flex justify-between gap-3">
          <TabsList className="z-10">
            <TabsTrigger value="board"><KanbanIcon /> Kanban</TabsTrigger>
            <TabsTrigger value="list"><ListIcon /> Table</TabsTrigger>
            <TabsTrigger value="table"><CalendarDaysIcon /> Calendar</TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <div className="relative hidden w-auto lg:block">
              <SearchIcon className="absolute top-2.5 left-3 size-4 opacity-50" />
              <Input
                placeholder="Search leads..."
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
                    placeholder="Search leads..."
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
              open={isNewLeadModalOpen}
              onOpenChange={setIsNewLeadModalOpen}
              templateId={leadTemplateId}
              entityType="LEAD"
              initialData={
                leadStages.length > 0
                  ? {
                      stageId: leadStages[0].id // Set to initial (first) stage
                    }
                  : {}
              }
              onSubmit={async (data) => {
                try {
                  // Ensure stageId is set to initial stage if not provided
                  const leadData = {
                    ...data,
                    stageId: data.stageId || (leadStages.length > 0 ? leadStages[0].id : null)
                  };

                  const createdEntity = await entityDataApi.createEntityData({
                    entityType: "LEAD",
                    templateId: leadTemplateId,
                    data: leadData
                  });

                  // Reload leads to show the new one
                  const groupedLeads = await reloadLeadsWithComments(leadStages);
                  setColumns(groupedLeads);
                  setFilteredColumns(groupedLeads);

                  setIsNewLeadModalOpen(false);
                  toast.success("Lead created successfully");
                } catch (error: any) {
                  console.error("Error creating lead:", error);
                  toast.error(error?.error || "Failed to create lead");
                  throw error;
                }
              }}
              onCancel={() => setIsNewLeadModalOpen(false)}
              submitLabel="Create Lead"
            />
            <Button onClick={() => setIsNewLeadModalOpen(true)}>
              <PlusCircleIcon />
              <span className="hidden lg:inline">Create Lead</span>
            </Button>
          </div>
        </div>
        <TabsContent value="board">
          <Kanban.Root
            value={filteredColumns}
            onValueChange={handleColumnChange}
            onMove={handleMove}
            getItemValue={(item) => item.id}>
            <Kanban.Board className="flex w-full gap-4 overflow-x-auto pb-4">
              {leadStages.map((stage) => {
                const columnValue = `stage-${stage.id}`;
                const leads = filteredColumns[columnValue] || [];
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
                                  await leadStagesApi.updateLeadStage(stage.id, {
                                    name: editingStageName.trim(),
                                    color: stage.color,
                                    order: stage.order,
                                    type: stage.type
                                  });
                                  // Reload stages
                                  const stages = await leadStagesApi.getLeadStages();
                                  const sortedStages = Array.isArray(stages)
                                    ? stages.sort((a: LeadStage, b: LeadStage) => a.order - b.order)
                                    : [];
                                  setLeadStages(sortedStages);
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
                          {leads.length}
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
                                        await leadStagesApi.updateLeadStage(stage.id, {
                                          name: stage.name,
                                          color: color,
                                          order: stage.order,
                                          type: stage.type
                                        });
                                        // Reload stages
                                        const stages = await leadStagesApi.getLeadStages();
                                        const sortedStages = Array.isArray(stages)
                                          ? stages.sort((a: LeadStage, b: LeadStage) => a.order - b.order)
                                          : [];
                                        setLeadStages(sortedStages);
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
                              onClick={async () => {
                                // Generate a default stage name based on existing stages
                                const existingNames = leadStages.map(s => s.name.toLowerCase());
                                let stageNumber = 1;
                                let defaultName = `New Stage ${stageNumber}`;
                                
                                // Find a unique name
                                while (existingNames.includes(defaultName.toLowerCase())) {
                                  stageNumber++;
                                  defaultName = `New Stage ${stageNumber}`;
                                }
                                
                                await addStageAfter(stage.id, defaultName);
                              }}>
                              <PlusCircleIcon className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Add Stage</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-white hover:bg-white/20"
                              type="button"
                              onClick={() => setStageDeleteTarget(stage)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete Stage</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    {leads.length > 0 ? (
                      <div className="flex flex-col gap-2 p-0.5">
                        {leads.map((lead) => {
                          const getFieldLabel = (fieldName: string) => {
                            return fieldLabelMap[fieldName] || fieldName.replace(/([A-Z])/g, ' $1').trim();
                          };

                          // Extract comments - they should already be an array from API
                          const leadCommentsList = Array.isArray((lead as any).comments) 
                            ? (lead as any).comments 
                            : [];
                          const currentComment = leadComments[lead.id] || "";

                          return (
                          <Kanban.Item key={lead.id} value={lead.id} asHandle asChild>
                              <Card className="border-0 group relative" onPointerDown={(e) => {
                                // Prevent drag when clicking on interactive elements
                                const target = e.target as HTMLElement;
                                const isInteractive = target.closest('button') || 
                                                     target.closest('textarea') || 
                                                     target.closest('input') || 
                                                     target.closest('[data-comment-section]');
                                if (isInteractive) {
                                  e.stopPropagation();
                                }
                              }}
                              onDragStart={(e) => {
                                // Prevent drag if clicking on interactive elements
                                const target = e.target as HTMLElement;
                                const isInteractive = target.closest('button') || 
                                                     target.closest('textarea') || 
                                                     target.closest('input') || 
                                                     target.closest('[data-comment-section]');
                                if (isInteractive) {
                                  e.preventDefault();
                                  return false;
                                }
                              }}>
                                <CardHeader className="pb-3">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                <CardTitle className="text-base font-semibold">
                                  {lead.name || "Unnamed Lead"}
                                </CardTitle>
                                <CardDescription>
                                  {lead.email || lead.company || "No additional information"}
                                </CardDescription>
                                    </div>
                                    {/* Edit icon - shows on hover */}
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-10 relative">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            type="button"
                                            onPointerDown={(e) => {
                                              e.stopPropagation();
                                              e.preventDefault();
                                            }}
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setSelectedLead(lead);
                                              setIsEditLeadModalOpen(true);
                                            }}
                                            onMouseDown={(e) => {
                                              e.stopPropagation();
                                              e.preventDefault();
                                            }}>
                                            <Pencil className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>Edit Lead</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                  </div>
                              </CardHeader>
                                <CardContent className="space-y-3">
                                <div className="text-muted-foreground flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2 flex-wrap">
                                    {lead.company && (
                                      <Badge variant="outline">{lead.company}</Badge>
                                    )}
                                    {lead.status && (
                                      <Badge variant="secondary">{lead.status}</Badge>
                                    )}
                                  {lead.priority && (
                                    <Badge className="capitalize" variant="outline">
                                      {lead.priority}
                                    </Badge>
                                  )}
                                </div>
                                  </div>
                                  
                                  {/* Display more lead data fields with labels */}
                                  <div className="text-muted-foreground text-xs space-y-1">
                                {lead.phone && (
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{getFieldLabel("phone")}:</span>
                                        <span>{lead.phone}</span>
                                      </div>
                                    )}
                                    {lead.email && (
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{getFieldLabel("email")}:</span>
                                        <span className="truncate">{lead.email}</span>
                                      </div>
                                    )}
                                    {lead.source && (
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{getFieldLabel("source")}:</span>
                                        <span>{lead.source}</span>
                                      </div>
                                    )}
                                    {lead.dueDate && (
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{getFieldLabel("dueDate")}:</span>
                                        <span>{formatDate(lead.dueDate)}</span>
                                      </div>
                                    )}
                                    {lead.followUpDate && (
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{getFieldLabel("followUpDate")}:</span>
                                        <span>{formatDate(lead.followUpDate)}</span>
                                      </div>
                                    )}
                                    {/* Display additional fields from lead data - show at least 10 total fields */}
                                    {Object.entries(lead).filter(([key, value]) => 
                                      !['id', 'name', 'email', 'phone', 'company', 'status', 'priority', 'source', 'dueDate', 'followUpDate', 'createdAt', 'updatedAt', 'stageId', 'comments'].includes(key) &&
                                      value !== null && 
                                      value !== undefined && 
                                      value !== '' &&
                                      typeof value !== 'object'
                                    ).slice(0, 10).map(([key, value]) => {
                                      // Check if the value is a date string
                                      let displayValue = String(value);
                                      if (key.toLowerCase().includes('date') || key.toLowerCase().includes('time')) {
                                        try {
                                          const dateValue = new Date(value as string);
                                          if (!isNaN(dateValue.getTime())) {
                                            displayValue = formatDate(dateValue);
                                          }
                                        } catch {
                                          // Keep original value if not a valid date
                                        }
                                      }
                                      return (
                                        <div key={key} className="flex items-center gap-2">
                                          <span className="font-medium">{getFieldLabel(key)}:</span>
                                          <span className="truncate">{displayValue}</span>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Comments section - Always visible */}
                                    <Separator />
                                  <div className="space-y-2" data-comment-section>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <MessageSquare className="h-3.5 w-3.5" />
                                        <span>Comments ({leadCommentsList.length})</span>
                                    </div>
                                    </div>
                                    
                                    {/* Always show comments section */}
                                    <div className="space-y-2">
                                        {leadCommentsList.length > 0 && (
                                          <div className="space-y-1 max-h-32 overflow-y-auto">
                                            {leadCommentsList.map((comment: any, idx: number) => (
                                              <div key={comment.id || idx} className="bg-muted rounded p-2 text-xs">
                                                <p>{comment.text || comment}</p>
                                                {comment.createdAt && (
                                                  <p className="text-muted-foreground text-[10px] mt-1">
                                                    {formatDateTime(comment.createdAt)}
                                                    {comment.userName && ` by ${comment.userName}`}
                                                  </p>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        <div className="space-y-2">
                                        <Textarea
                                          placeholder="Add a comment..."
                                          value={currentComment}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            setLeadComments((prev) => ({
                                              ...prev,
                                              [lead.id]: e.target.value
                                            }));
                                          }}
                                          onPointerDown={(e) => {
                                            e.stopPropagation();
                                          }}
                                          onMouseDown={(e) => {
                                            e.stopPropagation();
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                          }}
                                          onKeyDown={(e) => {
                                            e.stopPropagation();
                                            // Allow all keys including space to work normally
                                          }}
                                          onFocus={(e) => {
                                            e.stopPropagation();
                                          }}
                                          className="min-h-[60px] text-xs relative z-10"
                                        />
                                        <div className="flex gap-2">
                                          <Button
                                            size="sm"
                                            className="h-7 text-xs"
                                            type="button"
                                            onPointerDown={(e) => {
                                              e.stopPropagation();
                                            }}
                                            onMouseDown={(e) => {
                                              e.stopPropagation();
                                            }}
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              if (!currentComment.trim()) return;

                                              try {
                                                const leadId = parseInt(lead.id);
                                                if (!isNaN(leadId)) {
                                                  // Create comment using the Comment table API
                                                  await entityApi.createComment("LEAD", leadId, currentComment.trim());

                                                  // Reload leads with comments
                                                  const groupedLeads = await reloadLeadsWithComments(leadStages);
                                                  setColumns(groupedLeads);
                                                  setFilteredColumns(groupedLeads);
                                                  setLeadComments((prev) => ({
                                                    ...prev,
                                                    [lead.id]: ""
                                                  }));
                                                  toast.success("Comment added successfully");
                                                }
                                              } catch (error: any) {
                                                console.error("Error adding comment:", error);
                                                toast.error(error?.error || "Failed to add comment");
                                              }
                                            }}>
                                            Add Comment
                                          </Button>
                                          {currentComment && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 text-xs"
                                              type="button"
                                              onPointerDown={(e) => {
                                                e.stopPropagation();
                                              }}
                                              onMouseDown={(e) => {
                                                e.stopPropagation();
                                              }}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setLeadComments((prev) => ({
                                                  ...prev,
                                                  [lead.id]: ""
                                                }));
                                              }}>
                                              Cancel
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                              </CardContent>
                            </Card>
                          </Kanban.Item>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col justify-center gap-4 pt-4">
                        <div className="text-muted-foreground text-sm">No leads added here.</div>
                        <Button 
                          variant="outline"
                          onClick={() => {
                            setSelectedStageForLead(stage.id);
                            setIsAddLeadModalOpen(true);
                          }}
                        >
                          Add Lead
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
        </TabsContent>
        <TabsContent value="list">
          <LeadsTable />
        </TabsContent>
        <TabsContent value="table">
          <LeadsCalendar
            leads={Object.values(columns).flat()}
            loading={loading}
          />
        </TabsContent>
      </Tabs>

      {/* Add Lead Dialog (for column-specific leads) */}
      <TemplateViewerDialog
        open={isAddLeadModalOpen}
        onOpenChange={setIsAddLeadModalOpen}
        templateId={leadTemplateId}
        entityType="LEAD"
        initialData={
          selectedStageForLead !== null
            ? {
                stageId: selectedStageForLead // Set to the column's stage
              }
            : {}
        }
        onSubmit={async (data) => {
          try {
            // Ensure stageId is set to the selected stage
            const leadData = {
              ...data,
              stageId: selectedStageForLead || (leadStages.length > 0 ? leadStages[0].id : null)
            };

            const createdEntity = await entityDataApi.createEntityData({
              entityType: "LEAD",
              templateId: leadTemplateId,
              data: leadData
            });

            // Reload leads to show the new one
            const groupedLeads = await reloadLeadsWithComments(leadStages);
            setColumns(groupedLeads);
            setFilteredColumns(groupedLeads);

            setIsAddLeadModalOpen(false);
            setSelectedStageForLead(null);
            toast.success("Lead created successfully");
          } catch (error: any) {
            console.error("Error creating lead:", error);
            toast.error(error?.error || "Failed to create lead");
            throw error;
          }
        }}
        onCancel={() => {
          setIsAddLeadModalOpen(false);
          setSelectedStageForLead(null);
        }}
        submitLabel="Add Lead"
      />

      {/* Edit Lead Dialog */}
      {selectedLead && (
        <TemplateViewerDialog
          open={isEditLeadModalOpen}
          onOpenChange={setIsEditLeadModalOpen}
          templateId={leadTemplateId}
          entityType="LEAD"
          entityId={
            typeof selectedLead.id === "number"
              ? selectedLead.id
              : typeof selectedLead.id === "string" && !selectedLead.id.startsWith("lead-")
              ? parseInt(selectedLead.id)
              : undefined
          }
          initialData={selectedLead || {}}
          onSubmit={async (data) => {
            try {
              if (selectedLead) {
                // Update in database using entity data API
                const leadEntityId = typeof selectedLead.id === "number" 
                  ? selectedLead.id 
                  : typeof selectedLead.id === "string" && !selectedLead.id.startsWith("lead-")
                  ? parseInt(selectedLead.id)
                  : undefined;

                if (leadEntityId) {
                  await entityDataApi.updateEntityData(leadEntityId, data);
                }

                // Reload leads to show updated data
                const groupedLeads = await reloadLeadsWithComments(leadStages);
                setColumns(groupedLeads);
                setFilteredColumns(groupedLeads);

                setIsEditLeadModalOpen(false);
                setSelectedLead(null);
                toast.success("Lead updated successfully");
              }
            } catch (error: any) {
              console.error("Error updating lead:", error);
              toast.error(error?.error || "Failed to update lead");
              throw error;
            }
          }}
          onCancel={() => {
            setIsEditLeadModalOpen(false);
            setSelectedLead(null);
          }}
          submitLabel="Update Lead"
        />
      )}

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
        title="Export Leads to CSV"
        description="Select which fields you want to export."
        fields={exportFields}
        defaultSelectedKeys={exportFields.slice(0, 10).map((f) => f.key)}
        onExport={handleExportCsv}
      />

      <CsvImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        title="Import Leads from CSV"
        description="Upload a CSV file. Rows will be created as new leads in the first stage unless stageId is provided."
        onImportRows={handleImportCsvRows}
      />
    </div>
  );
}
