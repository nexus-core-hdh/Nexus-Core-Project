"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ChevronsUpDown, Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { formTemplatesApi, entityDataApi } from "@/lib/api";
import { DataTable } from "@/components/shared/data-table/data-table";
import { FormField } from "@/app/dashboard/(auth)/pages/form-builder/form-builder";
import { toast } from "sonner";
import { TemplateViewerDialog } from "@/app/dashboard/(auth)/pages/form-builder/template-viewer-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

export type Task = {
  id: string;
  [key: string]: any; // Dynamic fields based on form template
};

interface TasksTableProps {
  tasks?: Task[];
  loading?: boolean;
  onRefresh?: () => void;
}

export function TasksTable({ tasks: propTasks, loading: propLoading = false, onRefresh }: TasksTableProps) {
  const [formTemplate, setFormTemplate] = React.useState<any>(null);
  const [templateFields, setTemplateFields] = React.useState<FormField[]>([]);
  const [loadingTemplate, setLoadingTemplate] = React.useState(true);
  const [tasks, setTasks] = React.useState<Task[]>(propTasks || []);
  const [loading, setLoading] = React.useState(propLoading);
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = React.useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [taskTemplateId, setTaskTemplateId] = React.useState<number | undefined>();

  // Fetch Task form template and entity data
  React.useEffect(() => {
    const loadTemplate = async () => {
      try {
        setLoadingTemplate(true);
        const templates = await formTemplatesApi.getFormTemplates(
          undefined,
          undefined,
          "TASK",
          true
        );
        
        // Get the first active Task template
        const taskTemplate = Array.isArray(templates) 
          ? templates.find((t: any) => t.entityType === "TASK" && t.isActive)
          : null;
        
        if (taskTemplate) {
          setFormTemplate(taskTemplate);
          setTaskTemplateId(taskTemplate.id);
          const fields = Array.isArray(taskTemplate.formFields) 
            ? taskTemplate.formFields 
            : [];
          setTemplateFields(fields);
        } else {
          // If no template, use default columns
          setTemplateFields([]);
        }
      } catch (error: any) {
        console.error("Error loading form template:", error);
        toast.error("Failed to load form template");
        setTemplateFields([]);
      } finally {
        setLoadingTemplate(false);
      }
    };

    loadTemplate();
  }, []);

  // Fetch Task entity data from database
  React.useEffect(() => {
    const loadTasks = async () => {
      // Always fetch from database to get latest data
      // Only use propTasks if explicitly provided and not empty
      try {
        setLoading(true);
        const entityDataList = await entityDataApi.getEntityDataByType("TASK");
        
        // Transform EntityData to Task format
        // EntityData.data is a JSON object containing all the form field values
        const transformedTasks: Task[] = (entityDataList as any[]).map((entityData: any) => {
          const taskData: Task = {
            id: entityData.id?.toString() || String(entityData.id),
            // Spread the data object which contains all form field values
            ...(typeof entityData.data === "object" && entityData.data !== null 
              ? entityData.data 
              : {}),
            // Add metadata
            createdAt: entityData.createdAt,
            updatedAt: entityData.updatedAt,
            entityType: entityData.entityType,
            templateId: entityData.templateId
          };
          return taskData;
        });
        
        setTasks(transformedTasks);
      } catch (error: any) {
        console.error("Error loading tasks:", error);
        toast.error(error?.error || "Failed to load tasks");
        setTasks([]);
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, [onRefresh]); // Only reload when onRefresh changes

  // Helper function to get entity ID from task
  const getTaskEntityId = (task: Task): number | undefined => {
    const id = task.id;
    if (typeof id === "number") return id;
    if (typeof id === "string" && !id.startsWith("task-")) {
      const parsed = parseInt(id);
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  };

  // Handle view task
  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
    setIsViewDialogOpen(true);
  };

  // Handle edit task
  const handleEditTask = (task: Task) => {
    setSelectedTask(task);
    setIsEditDialogOpen(true);
  };

  // Handle delete task
  const handleDeleteTask = (task: Task) => {
    setSelectedTask(task);
    setIsDeleteDialogOpen(true);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!selectedTask) return;

    const entityId = getTaskEntityId(selectedTask);
    if (!entityId) {
      toast.error("Invalid task ID");
      setIsDeleteDialogOpen(false);
      return;
    }

    try {
      await entityDataApi.deleteEntityData(entityId);
      toast.success("Task deleted successfully");
      
      // Remove task from local state
      setTasks((prev) => prev.filter((t) => getTaskEntityId(t) !== entityId));
      
      setIsDeleteDialogOpen(false);
      setSelectedTask(null);
      
      // Trigger refresh if callback provided
      if (onRefresh) {
        onRefresh();
      }
    } catch (error: any) {
      console.error("Error deleting task:", error);
      toast.error(error?.error || "Failed to delete task");
    }
  };

  // Handle update task (from edit dialog)
  const handleUpdateTask = async (data: Record<string, any>) => {
    if (!selectedTask) return;

    const entityId = getTaskEntityId(selectedTask);
    if (!entityId) {
      toast.error("Invalid task ID");
      return;
    }

    try {
      await entityDataApi.updateEntityData(entityId, data);
      toast.success("Task updated successfully");
      
      // Update task in local state
      setTasks((prev) =>
        prev.map((t) => {
          const tId = getTaskEntityId(t);
          if (tId === entityId) {
            return {
              ...t,
              ...data,
              updatedAt: new Date().toISOString()
            };
          }
          return t;
        })
      );
      
      setIsEditDialogOpen(false);
      setSelectedTask(null);
      
      // Trigger refresh if callback provided
      if (onRefresh) {
        onRefresh();
      }
    } catch (error: any) {
      console.error("Error updating task:", error);
      toast.error(error?.error || "Failed to update task");
      throw error; // Re-throw to let TemplateViewerDialog handle the error state
    }
  };

  // Build columns dynamically from form template fields
  const columns = React.useMemo<ColumnDef<Task>[]>(() => {
    const cols: ColumnDef<Task>[] = [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false
      }
    ];

    // Add columns from form template fields
    if (templateFields.length > 0) {
      templateFields.forEach((field) => {
        cols.push({
          id: field.name,
          accessorKey: field.name,
          meta: { label: field.label },
          header: ({ column }) => {
            return (
              <Button
                variant="ghost"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              >
                {field.label}
                <ChevronsUpDown className="ml-2 h-4 w-4" />
              </Button>
            );
          },
          cell: ({ row }) => {
            const value = row.getValue(field.name);
            // Format value based on field type
            if (value === null || value === undefined || value === "") {
              return <span className="text-muted-foreground">-</span>;
            }
            
            if (field.type === "date") {
              try {
                const dateValue = new Date(value as string);
                if (!isNaN(dateValue.getTime())) {
                  return dateValue.toLocaleDateString();
                }
              } catch (e) {
                // Invalid date, return as string
              }
            }
            
            if (field.type === "datetime") {
              try {
                const dateValue = new Date(value as string);
                if (!isNaN(dateValue.getTime())) {
                  return dateValue.toLocaleString();
                }
              } catch (e) {
                // Invalid date, return as string
              }
            }
            
            if (field.type === "multiselect" && Array.isArray(value)) {
              return value.length > 0 ? value.join(", ") : <span className="text-muted-foreground">-</span>;
            }
            
            if (field.type === "tags" && Array.isArray(value)) {
              return value.length > 0 ? value.join(", ") : <span className="text-muted-foreground">-</span>;
            }
            
            if (field.type === "checkbox" || field.type === "toggle") {
              return value ? "Yes" : "No";
            }
            
            if (typeof value === "object" && value !== null) {
              return JSON.stringify(value);
            }
            
            return String(value);
          }
        });
      });
    } else {
      // Default columns if no template
      cols.push(
        {
          id: "title",
          accessorKey: "title",
          header: "Title",
          cell: ({ row }) => <div>{row.getValue("title") || "-"}</div>
        },
        {
          id: "status",
          accessorKey: "status",
          header: "Status",
          cell: ({ row }) => <div>{row.getValue("status") || "-"}</div>
        }
      );
    }

    // Add actions column
    cols.push({
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const task = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <Ellipsis className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(task.id)}>
                Copy task ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleViewTask(task)}>View task</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleEditTask(task)}>Edit task</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-destructive" 
                onClick={() => handleDeleteTask(task)}
              >
                Delete task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      }
    });

    return cols;
  }, [templateFields]);

  if (loadingTemplate) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading table configuration...</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {loading ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : (
        <DataTable
          columns={columns}
          data={tasks}
          storageKey="tasks"
          searchColumn={templateFields[0]?.name || "title"}
          searchPlaceholder="Filter tasks..."
        />
      )}

      {/* View Task Dialog */}
      {selectedTask && taskTemplateId && (
        <TemplateViewerDialog
          open={isViewDialogOpen}
          onOpenChange={setIsViewDialogOpen}
          templateId={taskTemplateId}
          entityType="TASK"
          entityId={getTaskEntityId(selectedTask)}
          initialData={selectedTask}
          onSubmit={async () => {
            // View mode - no submission, just close
            setIsViewDialogOpen(false);
          }}
          onCancel={() => {
            setIsViewDialogOpen(false);
          }}
          submitLabel="Close"
        />
      )}

      {/* Edit Task Dialog */}
      {selectedTask && taskTemplateId && (
        <TemplateViewerDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          templateId={taskTemplateId}
          entityType="TASK"
          entityId={getTaskEntityId(selectedTask)}
          initialData={selectedTask}
          onSubmit={handleUpdateTask}
          onCancel={() => {
            setIsEditDialogOpen(false);
            setSelectedTask(null);
          }}
          submitLabel="Update Task"
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the task.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

