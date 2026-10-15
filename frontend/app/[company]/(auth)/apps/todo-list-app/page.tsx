import React from "react";
import { generateMeta } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/api";

import Tasks from "@/app/[company]/(auth)/apps/todo-list-app/tasks";

async function getTasks() {
  try {
    const response = await fetch(`${API_BASE_URL}/todos`, {
      cache: 'no-store'
    });
    if (response.ok) {
      const data = await response.json();
      // Map backend data to frontend format
      return data.map((todo: any) => ({
        id: todo.id,
        title: todo.title,
        description: todo.description,
        status: todo.status === 'inProgress' ? 'in-progress' : todo.status,
        priority: todo.priority,
        starred: todo.starred,
        dueDate: todo.dueDate ? new Date(todo.dueDate) : null,
        reminderDate: todo.reminderDate ? new Date(todo.reminderDate) : null,
        assignedTo: todo.assignedTo || [],
        comments: todo.comments || [],
        files: todo.files || [],
        subTasks: todo.subTasks || [],
        createdAt: new Date(todo.createdAt)
      }));
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return [];
  }
}

export async function generateMetadata() {
  return generateMeta({
    title: "Todo List App",
    description:
      "Organize your tasks, add new tasks and view task details with the to-do list app template. Built with shadcn/ui, Next.js and Tailwind CSS.",
    canonical: "/apps/todo-list-app"
  });
}

export default async function Page() {
  const tasks = await getTasks();

  return <Tasks tasks={tasks} />;
}
