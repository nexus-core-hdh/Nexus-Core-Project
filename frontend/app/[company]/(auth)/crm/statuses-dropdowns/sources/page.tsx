"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Pencil, X, Palette, Plus } from "lucide-react";
import { sourcesApi } from "@/lib/api";
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

interface Source {
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

function SortableSourceItem({ 
  source, 
  onEdit, 
  onDelete, 
  onColorChange,
  onNameChange,
  isEditing
}: { 
  source: Source; 
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
  } = useSortable({ id: source.id.toString() });

  const [editName, setEditName] = useState(source.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const handleSave = () => {
    if (editName.trim()) {
      onNameChange(source.id, editName.trim());
    } else {
      setEditName(source.name);
    }
    onEdit(0); // Exit edit mode
  };

  const handleCancel = () => {
    setEditName(source.name);
    onEdit(0); // Exit edit mode
  };

  useEffect(() => {
    if (isEditing) {
      setEditName(source.name);
    }
  }, [isEditing, source.name]);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: source.color
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
        <span className="flex-1">{source.order}. {source.name}</span>
      )}
      <div className="flex items-center gap-1">
        <ColorPicker 
          color={source.color} 
          onColorChange={(color) => onColorChange(source.id, color)}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(source.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(source.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
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

  // Load sources from backend
  useEffect(() => {
    const loadSources = async () => {
      try {
        setLoading(true);
        const data = await sourcesApi.getSources();
        const sortedSources = data.sort((a: Source, b: Source) => a.order - b.order);
        setSources(sortedSources);
      } catch (error: any) {
        console.error('Failed to load sources:', error);
        toast.error('Failed to load sources');
      } finally {
        setLoading(false);
      }
    };

    loadSources();
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

    const oldIndex = sources.findIndex((source) => source.id === activeIdNum);
    const newIndex = sources.findIndex((source) => source.id === overIdNum);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newSources = arrayMove(sources, oldIndex, newIndex);
      // Update order numbers
      const updatedSources = newSources.map((source, index) => ({
        ...source,
        order: index + 1
      }));
      setSources(updatedSources);
      
      // Save reorder to backend
      try {
        await sourcesApi.reorderSources(
          updatedSources.map((s) => ({ id: s.id, order: s.order }))
        );
      } catch (error: any) {
        console.error('Failed to reorder sources:', error);
        toast.error('Failed to save source order');
      }
    }

    setActiveId(null);
  };

  const handleEdit = (id: number) => {
    setIsEditing(id === isEditing ? null : id);
  };

  const handleNameChange = async (id: number, name: string) => {
    try {
      await sourcesApi.updateSource(id, { name });
      setSources(sources.map((source) => 
        source.id === id ? { ...source, name } : source
      ));
      toast.success('Source name updated');
    } catch (error: any) {
      console.error('Failed to update source name:', error);
      toast.error('Failed to update source name');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this source?")) {
      try {
        await sourcesApi.deleteSource(id);
        const updatedSources = sources
          .filter((source) => source.id !== id)
          .map((source, index) => ({
            ...source,
            order: index + 1
          }));
        setSources(updatedSources);
        toast.success('Source deleted successfully');
      } catch (error: any) {
        console.error('Failed to delete source:', error);
        toast.error('Failed to delete source');
      }
    }
  };

  const handleColorChange = async (id: number, color: string) => {
    try {
      await sourcesApi.updateSource(id, { color });
      setSources(sources.map((source) => 
        source.id === id ? { ...source, color } : source
      ));
    } catch (error: any) {
      console.error('Failed to update color:', error);
      toast.error('Failed to update source color');
    }
  };

  const handleAddSource = async () => {
    const newOrder = sources.length + 1;
    try {
      const newSource = await sourcesApi.createSource({
        name: "New Source",
        color: presetColors[0],
        order: newOrder
      });
      setSources([...sources, newSource]);
      setIsEditing(newSource.id);
      toast.success('Source added successfully');
    } catch (error: any) {
      console.error('Failed to create source:', error);
      toast.error('Failed to create source');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Save reordered sources
      const reorderData = sources.map((source) => ({
        id: source.id,
        order: source.order
      }));
      
      await sourcesApi.reorderSources(reorderData);
      toast.success('Sources saved successfully!');
    } catch (error: any) {
      console.error('Failed to save sources:', error);
      toast.error('Failed to save sources');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    // Reload from backend
    try {
      setLoading(true);
      const data = await sourcesApi.getSources();
      const sortedSources = data.sort((a: Source, b: Source) => a.order - b.order);
      setSources(sortedSources);
      toast.success('Changes cancelled');
    } catch (error: any) {
      console.error('Failed to reload sources:', error);
      toast.error('Failed to reload sources');
    } finally {
      setLoading(false);
    }
  };

  const activeSource = activeId ? sources.find((s) => s.id === activeId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading sources...</p>
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
          {/* Sources List */}
          <div className="space-y-2">
            <SortableContext
              items={sources.map((s) => s.id.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {sources.map((source) => (
                  <SortableSourceItem
                    key={source.id}
                    source={source}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onColorChange={handleColorChange}
                    onNameChange={handleNameChange}
                    isEditing={isEditing === source.id}
                  />
                ))}
              </div>
            </SortableContext>
            <Button
              variant="outline"
              onClick={handleAddSource}
              className="w-full mt-2 border-dashed"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Source
            </Button>
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeSource ? (
          <div 
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium shadow-lg opacity-90"
            style={{ backgroundColor: activeSource.color }}
          >
            <GripVertical className="h-4 w-4" />
            <span>{activeSource.order}. {activeSource.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
