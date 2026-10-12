import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import {
  Todo,
  FilterTab,
  ViewMode,
  TodoFile,
  TodoPriority
} from "@/app/[company]/(auth)/apps/todo-list-app/types";
import { todosApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

interface TodoStore {
  todos: Todo[];
  selectedTodoId: string | null;
  activeTab: FilterTab;
  isAddDialogOpen: boolean;
  isTodoSheetOpen: boolean;
  viewMode: ViewMode;
  filterUser: string[] | null;
  filterPriority: TodoPriority | null;
  showStarredOnly: boolean; // New field for starred filter
  searchQuery: string;

  // Actions
  setTodos: (todos: Todo[]) => void;
  addTodo: (
    todo: Omit<
      Todo,
      "id" | "createdAt" | "comments" | "files" | "subTasks" | "starred" | "reminderDate"
    >
  ) => void;
  updateTodo: (id: string, updatedTodo: Partial<Omit<Todo, "id">>) => void;
  deleteTodo: (id: string) => void;
  setSelectedTodoId: (id: string | null) => void;
  setActiveTab: (tab: FilterTab) => void;
  setAddDialogOpen: (isOpen: boolean) => void;
  setTodoSheetOpen: (isOpen: boolean) => void;
  addComment: (todoId: string, text: string) => void;
  deleteComment: (todoId: string, commentId: string) => void;
  reorderTodos: (todoPositions: { id: string; position: number }[]) => void;
  setViewMode: (mode: ViewMode) => void;
  setFilterUser: (users: string[] | null) => void;
  setFilterPriority: (priority: TodoPriority | null) => void;
  setSearchQuery: (query: string) => void;
  toggleShowStarredOnly: () => void; // New action for toggling starred filter
  addFile: (todoId: string, file: Omit<TodoFile, "id">) => void;
  removeFile: (todoId: string, fileId: string) => void;
  addSubTask: (todoId: string, title: string) => void;
  updateSubTask: (todoId: string, subTaskId: string, completed: boolean) => void;
  removeSubTask: (todoId: string, subTaskId: string) => void;
  toggleStarred: (todoId: string) => void;
}

export const useTodoStore = create<TodoStore>((set) => ({
  todos: [],
  selectedTodoId: null,
  activeTab: "all",
  isAddDialogOpen: false,
  isTodoSheetOpen: false,
  viewMode: "list",
  filterUser: null,
  filterPriority: null,
  showStarredOnly: false, // Initialize starred filter state
  searchQuery: "",

  setTodos: (todos) =>
    set(() => ({
      todos: todos
    })),
  addTodo: async (todo) => {
    try {
      const user = getCurrentUser();
      const todoData = {
        ...todo,
        userId: user?.id,
        status: todo.status === 'in-progress' ? 'inProgress' : todo.status,
        comments: [],
        files: [],
        subTasks: []
      };
      const created = await todosApi.createTodo(todoData);
      // Map backend response to frontend format
      const mappedTodo: Todo = {
        ...created,
        status: created.status === 'inProgress' ? 'in-progress' : created.status,
        comments: created.comments || [],
        files: created.files || [],
        subTasks: created.subTasks || [],
        createdAt: new Date(created.createdAt)
      };
      set((state) => ({
        todos: [...state.todos, mappedTodo]
      }));
      toast.success("Todo created successfully");
    } catch (error: any) {
      console.error('Failed to create todo:', error);
      toast.error("Failed to create todo", { description: error.message });
    }
  },

  updateTodo: async (id, updatedTodo) => {
    try {
      const updateData: any = { ...updatedTodo };
      if (updateData.status === 'in-progress') {
        updateData.status = 'inProgress';
      }
      const updated = await todosApi.updateTodo(id, updateData);
      // Map backend response to frontend format
      const mappedTodo: Todo = {
        ...updated,
        status: updated.status === 'inProgress' ? 'in-progress' : updated.status,
        comments: updated.comments || [],
        files: updated.files || [],
        subTasks: updated.subTasks || [],
        createdAt: new Date(updated.createdAt)
      };
      set((state) => ({
        todos: state.todos.map((todo) => (todo.id === id ? mappedTodo : todo))
      }));
    } catch (error: any) {
      console.error('Failed to update todo:', error);
      toast.error("Failed to update todo", { description: error.message });
    }
  },

  deleteTodo: async (id) => {
    try {
      await todosApi.deleteTodo(id);
      set((state) => ({
        todos: state.todos.filter((todo) => todo.id !== id)
      }));
      toast.success("Todo deleted successfully");
    } catch (error: any) {
      console.error('Failed to delete todo:', error);
      toast.error("Failed to delete todo", { description: error.message });
    }
  },

  setSelectedTodoId: (id) =>
    set(() => ({
      selectedTodoId: id
    })),

  setActiveTab: (tab) =>
    set(() => ({
      activeTab: tab
    })),

  setAddDialogOpen: (isOpen) =>
    set(() => ({
      isAddDialogOpen: isOpen
    })),

  setTodoSheetOpen: (isOpen) =>
    set(() => ({
      isTodoSheetOpen: isOpen
    })),

  addComment: async (todoId, text) => {
    try {
      const comment = await todosApi.addComment(todoId, text);
      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === todoId
            ? {
                ...todo,
                comments: [
                  ...todo.comments,
                  {
                    id: comment.id,
                    text: comment.text,
                    createdAt: new Date(comment.createdAt)
                  }
                ]
              }
            : todo
        )
      }));
    } catch (error: any) {
      console.error('Failed to add comment:', error);
      toast.error("Failed to add comment", { description: error.message });
    }
  },

  deleteComment: async (todoId, commentId) => {
    try {
      await todosApi.deleteComment(todoId, commentId);
      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === todoId
            ? {
                ...todo,
                comments: todo.comments.filter((comment) => comment.id !== commentId)
              }
            : todo
        )
      }));
    } catch (error: any) {
      console.error('Failed to delete comment:', error);
      toast.error("Failed to delete comment", { description: error.message });
    }
  },

  reorderTodos: async (todoPositions) => {
    try {
      await todosApi.reorderTodos(todoPositions);
      set((state) => {
        const reorderedTodos = [...state.todos];

        todoPositions.forEach(({ id, position }) => {
          const todoIndex = reorderedTodos.findIndex((todo) => todo.id === id);
          if (todoIndex !== -1) {
            const [todo] = reorderedTodos.splice(todoIndex, 1);
            reorderedTodos.splice(position, 0, todo);
          }
        });

        return { todos: reorderedTodos };
      });
    } catch (error: any) {
      console.error('Failed to reorder todos:', error);
      toast.error("Failed to reorder todos", { description: error.message });
    }
  },

  setViewMode: (mode) =>
    set(() => ({
      viewMode: mode
    })),

  setFilterUser: (users) =>
    set(() => ({
      filterUser: users
    })),

  setFilterPriority: (priority) =>
    set(() => ({
      filterPriority: priority
    })),

  setSearchQuery: (query) =>
    set(() => ({
      searchQuery: query
    })),

  toggleShowStarredOnly: () =>
    set((state) => ({
      showStarredOnly: !state.showStarredOnly
    })),

  addFile: async (todoId, file) => {
    try {
      const createdFile = await todosApi.addFile(todoId, file);
      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === todoId
            ? {
                ...todo,
                files: [
                  ...(todo.files || []),
                  {
                    id: createdFile.id,
                    name: createdFile.name,
                    url: createdFile.url,
                    type: createdFile.type,
                    size: createdFile.size,
                    uploadedAt: new Date(createdFile.uploadedAt)
                  }
                ]
              }
            : todo
        )
      }));
    } catch (error: any) {
      console.error('Failed to add file:', error);
      toast.error("Failed to add file", { description: error.message });
    }
  },

  removeFile: async (todoId, fileId) => {
    try {
      await todosApi.removeFile(todoId, fileId);
      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === todoId
            ? {
                ...todo,
                files: (todo.files || []).filter((file) => file.id !== fileId)
              }
            : todo
        )
      }));
    } catch (error: any) {
      console.error('Failed to remove file:', error);
      toast.error("Failed to remove file", { description: error.message });
    }
  },

  addSubTask: async (todoId, title) => {
    try {
      const subTask = await todosApi.addSubTask(todoId, title);
      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === todoId
            ? {
                ...todo,
                subTasks: [
                  ...(todo.subTasks || []),
                  {
                    id: subTask.id,
                    title: subTask.title,
                    completed: subTask.completed
                  }
                ]
              }
            : todo
        )
      }));
    } catch (error: any) {
      console.error('Failed to add subtask:', error);
      toast.error("Failed to add subtask", { description: error.message });
    }
  },

  updateSubTask: async (todoId, subTaskId, completed) => {
    try {
      await todosApi.updateSubTask(todoId, subTaskId, { completed });
      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === todoId
            ? {
                ...todo,
                subTasks: (todo.subTasks || []).map((subTask) =>
                  subTask.id === subTaskId ? { ...subTask, completed } : subTask
                )
              }
            : todo
        )
      }));
    } catch (error: any) {
      console.error('Failed to update subtask:', error);
      toast.error("Failed to update subtask", { description: error.message });
    }
  },

  removeSubTask: async (todoId, subTaskId) => {
    try {
      await todosApi.removeSubTask(todoId, subTaskId);
      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === todoId
            ? {
                ...todo,
                subTasks: (todo.subTasks || []).filter((subTask) => subTask.id !== subTaskId)
              }
            : todo
        )
      }));
    } catch (error: any) {
      console.error('Failed to remove subtask:', error);
      toast.error("Failed to remove subtask", { description: error.message });
    }
  },

  toggleStarred: async (todoId) => {
    try {
      set((state) => {
        const todo = state.todos.find(t => t.id === todoId);
        if (todo) {
          todosApi.updateTodo(todoId, { starred: !todo.starred }).catch((error: any) => {
            console.error('Failed to toggle starred:', error);
            toast.error("Failed to update todo", { description: error.message });
          });
          return {
            todos: state.todos.map((todo) =>
              todo.id === todoId ? { ...todo, starred: !todo.starred } : todo
            )
          };
        }
        return state;
      });
    } catch (error: any) {
      console.error('Failed to toggle starred:', error);
      toast.error("Failed to update todo", { description: error.message });
    }
  }
}));
