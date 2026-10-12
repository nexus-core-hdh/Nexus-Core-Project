"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Pencil, X, Palette, Plus } from "lucide-react";
import { callStatusesApi } from "@/lib/api";
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

interface CallStatus {
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

function SortableCallStatusItem({ 
  callStatus, 
  onEdit, 
  onDelete, 
  onColorChange,
  onNameChange,
  isEditing
}: { 
  callStatus: CallStatus; 
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
  } = useSortable({ id: callStatus.id.toString() });

  const [editName, setEditName] = useState(callStatus.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const handleSave = () => {
    if (editName.trim()) {
      onNameChange(callStatus.id, editName.trim());
    } else {
      setEditName(callStatus.name);
    }
    onEdit(0); // Exit edit mode
  };

  const handleCancel = () => {
    setEditName(callStatus.name);
    onEdit(0); // Exit edit mode
  };

  useEffect(() => {
    if (isEditing) {
      setEditName(callStatus.name);
    }
  }, [isEditing, callStatus.name]);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: callStatus.color
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
        <span className="flex-1">{callStatus.order}. {callStatus.name}</span>
      )}
      <div className="flex items-center gap-1">
        <ColorPicker 
          color={callStatus.color} 
          onColorChange={(color) => onColorChange(callStatus.id, color)}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(callStatus.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(callStatus.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function CallStatusesPage() {
  const [callStatuses, setCallStatuses] = useState<CallStatus[]>([]);
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

  // Load call statuses from backend
  useEffect(() => {
    const loadCallStatuses = async () => {
      try {
        setLoading(true);
        const data = await callStatusesApi.getCallStatuses();
        const sortedCallStatuses = data.sort((a: CallStatus, b: CallStatus) => a.order - b.order);
        setCallStatuses(sortedCallStatuses);
      } catch (error: any) {
        console.error('Failed to load call statuses:', error);
        toast.error('Failed to load call statuses');
      } finally {
        setLoading(false);
      }
    };

    loadCallStatuses();
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

    const oldIndex = callStatuses.findIndex((callStatus) => callStatus.id === activeIdNum);
    const newIndex = callStatuses.findIndex((callStatus) => callStatus.id === overIdNum);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newCallStatuses = arrayMove(callStatuses, oldIndex, newIndex);
      // Update order numbers
      const updatedCallStatuses = newCallStatuses.map((callStatus, index) => ({
        ...callStatus,
        order: index + 1
      }));
      setCallStatuses(updatedCallStatuses);
      
      // Save reorder to backend
      try {
        await callStatusesApi.reorderCallStatuses(
          updatedCallStatuses.map((cs) => ({ id: cs.id, order: cs.order }))
        );
      } catch (error: any) {
        console.error('Failed to reorder call statuses:', error);
        toast.error('Failed to save call status order');
      }
    }

    setActiveId(null);
  };

  const handleEdit = (id: number) => {
    setIsEditing(id === isEditing ? null : id);
  };

  const handleNameChange = async (id: number, name: string) => {
    try {
      await callStatusesApi.updateCallStatus(id, { name });
      setCallStatuses(callStatuses.map((callStatus) => 
        callStatus.id === id ? { ...callStatus, name } : callStatus
      ));
      toast.success('Call status name updated');
    } catch (error: any) {
      console.error('Failed to update call status name:', error);
      toast.error('Failed to update call status name');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this call status?")) {
      try {
        await callStatusesApi.deleteCallStatus(id);
        const updatedCallStatuses = callStatuses
          .filter((callStatus) => callStatus.id !== id)
          .map((callStatus, index) => ({
            ...callStatus,
            order: index + 1
          }));
        setCallStatuses(updatedCallStatuses);
        toast.success('Call status deleted successfully');
      } catch (error: any) {
        console.error('Failed to delete call status:', error);
        toast.error('Failed to delete call status');
      }
    }
  };

  const handleColorChange = async (id: number, color: string) => {
    try {
      await callStatusesApi.updateCallStatus(id, { color });
      setCallStatuses(callStatuses.map((callStatus) => 
        callStatus.id === id ? { ...callStatus, color } : callStatus
      ));
    } catch (error: any) {
      console.error('Failed to update color:', error);
      toast.error('Failed to update call status color');
    }
  };

  const handleAddCallStatus = async () => {
    const newOrder = callStatuses.length + 1;
    try {
      const newCallStatus = await callStatusesApi.createCallStatus({
        name: "New Call Status",
        color: presetColors[0],
        order: newOrder
      });
      setCallStatuses([...callStatuses, newCallStatus]);
      setIsEditing(newCallStatus.id);
      toast.success('Call status added successfully');
    } catch (error: any) {
      console.error('Failed to create call status:', error);
      toast.error('Failed to create call status');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Save reordered call statuses
      const reorderData = callStatuses.map((callStatus) => ({
        id: callStatus.id,
        order: callStatus.order
      }));
      
      await callStatusesApi.reorderCallStatuses(reorderData);
      toast.success('Call statuses saved successfully!');
    } catch (error: any) {
      console.error('Failed to save call statuses:', error);
      toast.error('Failed to save call statuses');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    // Reload from backend
    try {
      setLoading(true);
      const data = await callStatusesApi.getCallStatuses();
      const sortedCallStatuses = data.sort((a: CallStatus, b: CallStatus) => a.order - b.order);
      setCallStatuses(sortedCallStatuses);
      toast.success('Changes cancelled');
    } catch (error: any) {
      console.error('Failed to reload call statuses:', error);
      toast.error('Failed to reload call statuses');
    } finally {
      setLoading(false);
    }
  };

  const activeCallStatus = activeId ? callStatuses.find((cs) => cs.id === activeId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading call statuses...</p>
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
          {/* Call Statuses List */}
          <div className="space-y-2">
            <SortableContext
              items={callStatuses.map((cs) => cs.id.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {callStatuses.map((callStatus) => (
                  <SortableCallStatusItem
                    key={callStatus.id}
                    callStatus={callStatus}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onColorChange={handleColorChange}
                    onNameChange={handleNameChange}
                    isEditing={isEditing === callStatus.id}
                  />
                ))}
              </div>
            </SortableContext>
            <Button
              variant="outline"
              onClick={handleAddCallStatus}
              className="w-full mt-2 border-dashed"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Call Status
            </Button>
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeCallStatus ? (
          <div 
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium shadow-lg opacity-90"
            style={{ backgroundColor: activeCallStatus.color }}
          >
            <GripVertical className="h-4 w-4" />
            <span>{activeCallStatus.order}. {activeCallStatus.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

