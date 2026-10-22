"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Pencil, X, Palette, Plus } from "lucide-react";
import { salutationsApi } from "@/lib/api";
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

interface Salutation {
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

function SortableSalutationItem({ 
  salutation, 
  onEdit, 
  onDelete, 
  onColorChange,
  onNameChange,
  isEditing
}: { 
  salutation: Salutation; 
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
  } = useSortable({ id: salutation.id.toString() });

  const [editName, setEditName] = useState(salutation.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const handleSave = () => {
    if (editName.trim()) {
      onNameChange(salutation.id, editName.trim());
    } else {
      setEditName(salutation.name);
    }
    onEdit(0); // Exit edit mode
  };

  const handleCancel = () => {
    setEditName(salutation.name);
    onEdit(0); // Exit edit mode
  };

  useEffect(() => {
    if (isEditing) {
      setEditName(salutation.name);
    }
  }, [isEditing, salutation.name]);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: salutation.color
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
        <span className="flex-1">{salutation.order}. {salutation.name}</span>
      )}
      <div className="flex items-center gap-1">
        <ColorPicker 
          color={salutation.color} 
          onColorChange={(color) => onColorChange(salutation.id, color)}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(salutation.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(salutation.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function SalutationsPage() {
  const [salutations, setSalutations] = useState<Salutation[]>([]);
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

  // Load salutations from backend
  useEffect(() => {
    const loadSalutations = async () => {
      try {
        setLoading(true);
        const data = await salutationsApi.getSalutations();
        const sortedSalutations = data.sort((a: Salutation, b: Salutation) => a.order - b.order);
        setSalutations(sortedSalutations);
      } catch (error: any) {
        console.error('Failed to load salutations:', error);
        toast.error('Failed to load salutations');
      } finally {
        setLoading(false);
      }
    };

    loadSalutations();
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

    const oldIndex = salutations.findIndex((salutation) => salutation.id === activeIdNum);
    const newIndex = salutations.findIndex((salutation) => salutation.id === overIdNum);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newSalutations = arrayMove(salutations, oldIndex, newIndex);
      // Update order numbers
      const updatedSalutations = newSalutations.map((salutation, index) => ({
        ...salutation,
        order: index + 1
      }));
      setSalutations(updatedSalutations);
      
      // Save reorder to backend
      try {
        await salutationsApi.reorderSalutations(
          updatedSalutations.map((s) => ({ id: s.id, order: s.order }))
        );
      } catch (error: any) {
        console.error('Failed to reorder salutations:', error);
        toast.error('Failed to save salutation order');
      }
    }

    setActiveId(null);
  };

  const handleEdit = (id: number) => {
    setIsEditing(id === isEditing ? null : id);
  };

  const handleNameChange = async (id: number, name: string) => {
    try {
      await salutationsApi.updateSalutation(id, { name });
      setSalutations(salutations.map((salutation) => 
        salutation.id === id ? { ...salutation, name } : salutation
      ));
      toast.success('Salutation name updated');
    } catch (error: any) {
      console.error('Failed to update salutation name:', error);
      toast.error('Failed to update salutation name');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this salutation?")) {
      try {
        await salutationsApi.deleteSalutation(id);
        const updatedSalutations = salutations
          .filter((salutation) => salutation.id !== id)
          .map((salutation, index) => ({
            ...salutation,
            order: index + 1
          }));
        setSalutations(updatedSalutations);
        toast.success('Salutation deleted successfully');
      } catch (error: any) {
        console.error('Failed to delete salutation:', error);
        toast.error('Failed to delete salutation');
      }
    }
  };

  const handleColorChange = async (id: number, color: string) => {
    try {
      await salutationsApi.updateSalutation(id, { color });
      setSalutations(salutations.map((salutation) => 
        salutation.id === id ? { ...salutation, color } : salutation
      ));
    } catch (error: any) {
      console.error('Failed to update color:', error);
      toast.error('Failed to update salutation color');
    }
  };

  const handleAddSalutation = async () => {
    const newOrder = salutations.length + 1;
    try {
      const newSalutation = await salutationsApi.createSalutation({
        name: "New Salutation",
        color: presetColors[0],
        order: newOrder
      });
      setSalutations([...salutations, newSalutation]);
      setIsEditing(newSalutation.id);
      toast.success('Salutation added successfully');
    } catch (error: any) {
      console.error('Failed to create salutation:', error);
      toast.error('Failed to create salutation');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Save reordered salutations
      const reorderData = salutations.map((salutation) => ({
        id: salutation.id,
        order: salutation.order
      }));
      
      await salutationsApi.reorderSalutations(reorderData);
      toast.success('Salutations saved successfully!');
    } catch (error: any) {
      console.error('Failed to save salutations:', error);
      toast.error('Failed to save salutations');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    // Reload from backend
    try {
      setLoading(true);
      const data = await salutationsApi.getSalutations();
      const sortedSalutations = data.sort((a: Salutation, b: Salutation) => a.order - b.order);
      setSalutations(sortedSalutations);
      toast.success('Changes cancelled');
    } catch (error: any) {
      console.error('Failed to reload salutations:', error);
      toast.error('Failed to reload salutations');
    } finally {
      setLoading(false);
    }
  };

  const activeSalutation = activeId ? salutations.find((s) => s.id === activeId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading salutations...</p>
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
          {/* Salutations List */}
          <div className="space-y-2">
            <SortableContext
              items={salutations.map((s) => s.id.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {salutations.map((salutation) => (
                  <SortableSalutationItem
                    key={salutation.id}
                    salutation={salutation}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onColorChange={handleColorChange}
                    onNameChange={handleNameChange}
                    isEditing={isEditing === salutation.id}
                  />
                ))}
              </div>
            </SortableContext>
            <Button
              variant="outline"
              onClick={handleAddSalutation}
              className="w-full mt-2 border-dashed"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Salutation
            </Button>
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeSalutation ? (
          <div 
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium shadow-lg opacity-90"
            style={{ backgroundColor: activeSalutation.color }}
          >
            <GripVertical className="h-4 w-4" />
            <span>{activeSalutation.order}. {activeSalutation.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

