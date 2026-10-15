"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Pencil, X, Palette, Plus } from "lucide-react";
import { industriesApi } from "@/lib/api";
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

interface Industry {
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

function SortableIndustryItem({ 
  industry, 
  onEdit, 
  onDelete, 
  onColorChange,
  onNameChange,
  isEditing
}: { 
  industry: Industry; 
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
  } = useSortable({ id: industry.id.toString() });

  const [editName, setEditName] = useState(industry.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const handleSave = () => {
    if (editName.trim()) {
      onNameChange(industry.id, editName.trim());
    } else {
      setEditName(industry.name);
    }
    onEdit(0); // Exit edit mode
  };

  const handleCancel = () => {
    setEditName(industry.name);
    onEdit(0); // Exit edit mode
  };

  useEffect(() => {
    if (isEditing) {
      setEditName(industry.name);
    }
  }, [isEditing, industry.name]);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: industry.color
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
        <span className="flex-1">{industry.order}. {industry.name}</span>
      )}
      <div className="flex items-center gap-1">
        <ColorPicker 
          color={industry.color} 
          onColorChange={(color) => onColorChange(industry.id, color)}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(industry.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(industry.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function IndustryPage() {
  const [industries, setIndustries] = useState<Industry[]>([]);
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

  // Load industries from backend
  useEffect(() => {
    const loadIndustries = async () => {
      try {
        setLoading(true);
        const data = await industriesApi.getIndustries();
        const sortedIndustries = data.sort((a: Industry, b: Industry) => a.order - b.order);
        setIndustries(sortedIndustries);
      } catch (error: any) {
        console.error('Failed to load industries:', error);
        toast.error('Failed to load industries');
      } finally {
        setLoading(false);
      }
    };

    loadIndustries();
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

    const oldIndex = industries.findIndex((industry) => industry.id === activeIdNum);
    const newIndex = industries.findIndex((industry) => industry.id === overIdNum);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newIndustries = arrayMove(industries, oldIndex, newIndex);
      // Update order numbers
      const updatedIndustries = newIndustries.map((industry, index) => ({
        ...industry,
        order: index + 1
      }));
      setIndustries(updatedIndustries);
      
      // Save reorder to backend
      try {
        await industriesApi.reorderIndustries(
          updatedIndustries.map((ind) => ({ id: ind.id, order: ind.order }))
        );
      } catch (error: any) {
        console.error('Failed to reorder industries:', error);
        toast.error('Failed to save industry order');
      }
    }

    setActiveId(null);
  };

  const handleEdit = (id: number) => {
    setIsEditing(id === isEditing ? null : id);
  };

  const handleNameChange = async (id: number, name: string) => {
    try {
      await industriesApi.updateIndustry(id, { name });
      setIndustries(industries.map((industry) => 
        industry.id === id ? { ...industry, name } : industry
      ));
      toast.success('Industry name updated');
    } catch (error: any) {
      console.error('Failed to update industry name:', error);
      toast.error('Failed to update industry name');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this industry?")) {
      try {
        await industriesApi.deleteIndustry(id);
        const updatedIndustries = industries
          .filter((industry) => industry.id !== id)
          .map((industry, index) => ({
            ...industry,
            order: index + 1
          }));
        setIndustries(updatedIndustries);
        toast.success('Industry deleted successfully');
      } catch (error: any) {
        console.error('Failed to delete industry:', error);
        toast.error('Failed to delete industry');
      }
    }
  };

  const handleColorChange = async (id: number, color: string) => {
    try {
      await industriesApi.updateIndustry(id, { color });
      setIndustries(industries.map((industry) => 
        industry.id === id ? { ...industry, color } : industry
      ));
    } catch (error: any) {
      console.error('Failed to update color:', error);
      toast.error('Failed to update industry color');
    }
  };

  const handleAddIndustry = async () => {
    const newOrder = industries.length + 1;
    try {
      const newIndustry = await industriesApi.createIndustry({
        name: "New Industry",
        color: presetColors[0],
        order: newOrder
      });
      setIndustries([...industries, newIndustry]);
      setIsEditing(newIndustry.id);
      toast.success('Industry added successfully');
    } catch (error: any) {
      console.error('Failed to create industry:', error);
      toast.error('Failed to create industry');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Save reordered industries
      const reorderData = industries.map((industry) => ({
        id: industry.id,
        order: industry.order
      }));
      
      await industriesApi.reorderIndustries(reorderData);
      toast.success('Industries saved successfully!');
    } catch (error: any) {
      console.error('Failed to save industries:', error);
      toast.error('Failed to save industries');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    // Reload from backend
    try {
      setLoading(true);
      const data = await industriesApi.getIndustries();
      const sortedIndustries = data.sort((a: Industry, b: Industry) => a.order - b.order);
      setIndustries(sortedIndustries);
      toast.success('Changes cancelled');
    } catch (error: any) {
      console.error('Failed to reload industries:', error);
      toast.error('Failed to reload industries');
    } finally {
      setLoading(false);
    }
  };

  const activeIndustry = activeId ? industries.find((ind) => ind.id === activeId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading industries...</p>
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
        <div>
          <h3 className="text-lg font-semibold">Industry</h3>
          <p className="text-sm text-muted-foreground">
            Manage the industries in your CRM system.
          </p>
        </div>

        <div className="space-y-6">
          {/* Industries List */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">Industries</h4>
            <SortableContext
              items={industries.map((ind) => ind.id.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {industries.map((industry) => (
                  <SortableIndustryItem
                    key={industry.id}
                    industry={industry}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onColorChange={handleColorChange}
                    onNameChange={handleNameChange}
                    isEditing={isEditing === industry.id}
                  />
                ))}
              </div>
            </SortableContext>
            <Button
              variant="outline"
              onClick={handleAddIndustry}
              className="w-full mt-2 border-dashed"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Industry
            </Button>
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeIndustry ? (
          <div 
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium shadow-lg opacity-90"
            style={{ backgroundColor: activeIndustry.color }}
          >
            <GripVertical className="h-4 w-4" />
            <span>{activeIndustry.order}. {activeIndustry.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
