"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { TasksTable } from "./components/tasks-table";
import { formTemplatesApi, entityDataApi } from "@/lib/api";
import { toast } from "sonner";
import { TemplateViewerDialog } from "@/app/[company]/(auth)/pages/form-builder/template-viewer-dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function TaskPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [taskTemplateId, setTaskTemplateId] = useState<number | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch task form template
  useEffect(() => {
    const loadTemplate = async () => {
      try {
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
          setTaskTemplateId(taskTemplate.id);
        }
        // Don't show error if no template - user might not have created one yet
      } catch (error: any) {
        console.error("Error loading task template:", error);
        toast.error("Failed to load task template");
      }
    };

    loadTemplate();
  }, []);

  // Handle form submission to create task
  const handleCreateTask = async (data: Record<string, any>) => {
    try {
      // Create entity data using the form template
      await entityDataApi.createEntityData({
        templateId: taskTemplateId,
        entityType: "TASK",
        data: data
      });
      
      toast.success("Task created successfully");
      setIsAddDialogOpen(false);
      // Trigger refresh by updating key
      setRefreshKey(prev => prev + 1);
    } catch (error: any) {
      console.error("Error creating task:", error);
      toast.error(error?.error || "Failed to create task");
      throw error; // Re-throw to let TemplateViewerDialog handle the error state
    }
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">
            Manage your tasks and track progress
          </p>
        </div>
        <Button 
          onClick={() => {
            if (!taskTemplateId) {
              toast.error("No active Task template found. Please create a Task template first.");
              return;
            }
            setIsAddDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Task
        </Button>
      </div>

      <TasksTable key={refreshKey} onRefresh={handleRefresh} />

      {/* Add Task Dialog */}
      {taskTemplateId && (
        <TemplateViewerDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          templateId={taskTemplateId}
          entityType="TASK"
          initialData={{}}
          onSubmit={handleCreateTask}
          onCancel={() => {
            setIsAddDialogOpen(false);
          }}
          submitLabel="Create Task"
        />
      )}
    </>
  );
}
