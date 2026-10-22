"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Pencil, X, Palette, Plus } from "lucide-react";
import { employeesApi } from "@/lib/api";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";

interface Employee {
  id: number;
  name: string;
  color: string; // Hex color value
  order: number;
  companyId?: number | null;
  branchId?: number | null;
}

const presetColors = [
  "#3b82f6", // blue-500
  "#f97316", // orange-500
  "#ef4444", // red-500
  "#ec4899", // pink-500
  "#10b981", // emerald-500
  "#8b5cf6", // violet-500
  "#f59e0b", // amber-500
  "#06b6d4", // cyan-500
  "#84cc16", // lime-500
  "#f43f5e", // rose-500
  "#6366f1", // indigo-500
  "#14b8a6"  // teal-500
];

function ColorPicker({ color, onColorChange }: { color: string; onColorChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <Palette className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Custom Color
            </label>
            <input
              type="color"
              value={color}
              onChange={(e) => {
                onColorChange(e.target.value);
                setOpen(false);
              }}
              className="w-full h-10 rounded cursor-pointer"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Preset Colors
            </label>
            <div className="grid grid-cols-6 gap-2">
              {presetColors.map((presetColor) => (
                <button
                  key={presetColor}
                  onClick={() => {
                    onColorChange(presetColor);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-8 h-8 rounded border-2 transition-all",
                    color === presetColor ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: presetColor }}
                />
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SortableEmployeeItem({ 
  employee, 
  onEdit, 
  onDelete, 
  onColorChange,
  onNameChange,
  isEditing
}: { 
  employee: Employee; 
  onEdit: (id: number) => void; 
  onDelete: (id: number) => void;
  onColorChange: (id: number, color: string) => void;
  onNameChange: (id: number, name: string) => void;
  isEditing: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: employee.id.toString() });

  const [editName, setEditName] = useState(employee.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const handleSave = () => {
    if (editName.trim()) {
      onNameChange(employee.id, editName.trim());
    } else {
      setEditName(employee.name);
    }
    onEdit(0); // Exit edit mode
  };

  const handleCancel = () => {
    setEditName(employee.name);
    onEdit(0); // Exit edit mode
  };

  useEffect(() => {
    if (isEditing) {
      setEditName(employee.name);
    }
  }, [isEditing, employee.name]);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: employee.color
      }}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium",
        "shadow-sm cursor-move",
        isDragging && "ring-2 ring-primary"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      {isEditing ? (
        <div className="flex-1 flex items-center gap-2">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            className="h-7 text-sm text-foreground bg-white/90"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : (
        <span className="flex-1">{employee.order}. {employee.name}</span>
      )}
      <div className="flex items-center gap-1">
        <ColorPicker 
          color={employee.color} 
          onColorChange={(color) => onColorChange(employee.id, color)}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(employee.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(employee.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // Load employees from backend
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        setLoading(true);
        const data = await employeesApi.getEmployees();
        const sortedEmployees = data.sort((a: Employee, b: Employee) => a.order - b.order);
        setEmployees(sortedEmployees);
      } catch (error: any) {
        console.error('Failed to load employees:', error);
        toast.error('Failed to load employees');
      } finally {
        setLoading(false);
      }
    };

    loadEmployees();
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(parseInt(event.active.id as string));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      setActiveId(null);
      return;
    }

    const activeIdNum = parseInt(active.id as string);
    const overIdNum = parseInt(over.id as string);

    const oldIndex = employees.findIndex((employee) => employee.id === activeIdNum);
    const newIndex = employees.findIndex((employee) => employee.id === overIdNum);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newEmployees = arrayMove(employees, oldIndex, newIndex);
      // Update order numbers
      const updatedEmployees = newEmployees.map((employee, index) => ({
        ...employee,
        order: index + 1
      }));
      setEmployees(updatedEmployees);
      
      // Save reorder to backend
      try {
        await employeesApi.reorderEmployees(
          updatedEmployees.map((emp) => ({ id: emp.id, order: emp.order }))
        );
      } catch (error: any) {
        console.error('Failed to reorder employees:', error);
        toast.error('Failed to save employee order');
      }
    }

    setActiveId(null);
  };

  const handleEdit = (id: number) => {
    setIsEditing(id === isEditing ? null : id);
  };

  const handleNameChange = async (id: number, name: string) => {
    try {
      await employeesApi.updateEmployee(id, { name });
      setEmployees(employees.map((employee) => 
        employee.id === id ? { ...employee, name } : employee
      ));
      toast.success('Employee name updated');
    } catch (error: any) {
      console.error('Failed to update employee name:', error);
      toast.error('Failed to update employee name');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this employee?")) {
      try {
        await employeesApi.deleteEmployee(id);
        const updatedEmployees = employees
          .filter((employee) => employee.id !== id)
          .map((employee, index) => ({
            ...employee,
            order: index + 1
          }));
        setEmployees(updatedEmployees);
        toast.success('Employee deleted successfully');
      } catch (error: any) {
        console.error('Failed to delete employee:', error);
        toast.error('Failed to delete employee');
      }
    }
  };

  const handleColorChange = async (id: number, color: string) => {
    try {
      await employeesApi.updateEmployee(id, { color });
      setEmployees(employees.map((employee) => 
        employee.id === id ? { ...employee, color } : employee
      ));
    } catch (error: any) {
      console.error('Failed to update color:', error);
      toast.error('Failed to update employee color');
    }
  };

  const handleAddEmployee = async () => {
    const newOrder = employees.length + 1;
    try {
      const newEmployee = await employeesApi.createEmployee({
        name: "New Employee",
        color: presetColors[0],
        order: newOrder
      });
      setEmployees([...employees, newEmployee]);
      setIsEditing(newEmployee.id);
      toast.success('Employee added successfully');
    } catch (error: any) {
      console.error('Failed to create employee:', error);
      toast.error('Failed to create employee');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Save reordered employees
      const reorderData = employees.map((employee) => ({
        id: employee.id,
        order: employee.order
      }));
      
      await employeesApi.reorderEmployees(reorderData);
      toast.success('Employees saved successfully!');
    } catch (error: any) {
      console.error('Failed to save employees:', error);
      toast.error('Failed to save employees');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    // Reload from backend
    try {
      setLoading(true);
      const data = await employeesApi.getEmployees();
      const sortedEmployees = data.sort((a: Employee, b: Employee) => a.order - b.order);
      setEmployees(sortedEmployees);
      toast.success('Changes cancelled');
    } catch (error: any) {
      console.error('Failed to reload employees:', error);
      toast.error('Failed to reload employees');
    } finally {
      setLoading(false);
    }
  };

  const activeEmployee = activeId ? employees.find((emp) => emp.id === activeId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading employees...</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">

        <div className="space-y-6">
          {/* Employees List */}
          <div className="space-y-2">
            <SortableContext
              items={employees.map((emp) => emp.id.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {employees.map((employee) => (
                  <SortableEmployeeItem
                    key={employee.id}
                    employee={employee}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onColorChange={handleColorChange}
                    onNameChange={handleNameChange}
                    isEditing={isEditing === employee.id}
                  />
                ))}
              </div>
            </SortableContext>
            <Button
              variant="outline"
              onClick={handleAddEmployee}
              className="w-full mt-2 border-dashed"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Employee
            </Button>
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeEmployee ? (
          <div 
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium shadow-lg opacity-90"
            style={{ backgroundColor: activeEmployee.color }}
          >
            <GripVertical className="h-4 w-4" />
            <span>{activeEmployee.order}. {activeEmployee.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
