"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PlusCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";

type Task = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  dueDate: string;
  priority: "high" | "medium" | "low";
};

interface RecentTasksProps {
  tasks?: any[];
  loading?: boolean;
}

export function RecentTasks({ tasks = [], loading = false }: RecentTasksProps) {
  // Transform tasks data to match component format
  const transformedTasks: Task[] = tasks.slice(0, 5).map((task: any, index: number) => {
    const taskData = task.data || task;
    const dueDate = task.dueDate || task.due_date || task.createdAt;
    const formattedDate = dueDate 
      ? format(new Date(dueDate), "MMM dd")
      : "No date";
    
    return {
      id: task.id?.toString() || index.toString(),
      title: taskData.title || taskData.name || taskData.message || "Untitled Task",
      description: taskData.description || taskData.message || "",
      completed: taskData.completed || taskData.status === "completed" || false,
      dueDate: formattedDate,
      priority: (taskData.priority || "medium").toLowerCase() as "high" | "medium" | "low"
    };
  });

  const [localTasks, setLocalTasks] = useState<Task[]>(transformedTasks);

  const toggleTaskStatus = (id: string) => {
    setLocalTasks(
      localTasks.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task))
    );
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Tasks</CardTitle>
        <CardDescription>Track and manage your upcoming tasks.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm">
            <PlusCircleIcon /> Add Task
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-[200px]">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : localTasks.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">No tasks found.</p>
        ) : (
          localTasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                "flex items-start space-x-3 rounded-md border p-3 transition-colors",
                task.completed && "bg-muted/50"
              )}>
              <Checkbox
                checked={task.completed}
                onCheckedChange={() => toggleTaskStatus(task.id)}
                className="mt-1"
              />
              <div className="space-y-1">
                <p
                  className={cn(
                    "text-sm leading-none font-medium",
                    task.completed && "text-muted-foreground line-through"
                  )}>
                  {task.title}
                </p>
                {task.description && (
                  <p className={cn("text-muted-foreground text-xs", task.completed && "line-through")}>
                    {task.description}
                  </p>
                )}
                <div className="flex items-center pt-1">
                  <div
                    className={cn(
                      "mr-2 rounded-full px-2 py-0.5 text-xs font-medium",
                      task.priority === "high" && "bg-red-100 text-red-700",
                      task.priority === "medium" && "bg-amber-100 text-amber-700",
                      task.priority === "low" && "bg-green-100 text-green-700"
                    )}>
                    {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                  </div>
                  <span className="text-muted-foreground text-xs">Due {task.dueDate}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
