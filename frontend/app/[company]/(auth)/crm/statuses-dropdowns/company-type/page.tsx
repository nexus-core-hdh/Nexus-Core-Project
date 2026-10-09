"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Pencil, X, Palette, Plus } from "lucide-react";
import { companyTypesApi } from "@/lib/api";
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

interface CompanyType {
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

function SortableCompanyTypeItem({ 
  companyType, 
  onEdit, 
  onDelete, 
  onColorChange,
  onNameChange,
  isEditing
}: { 
  companyType: CompanyType; 
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
  } = useSortable({ id: companyType.id.toString() });

  const [editName, setEditName] = useState(companyType.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const handleSave = () => {
    if (editName.trim()) {
      onNameChange(companyType.id, editName.trim());
    } else {
      setEditName(companyType.name);
    }
    onEdit(0); // Exit edit mode
  };

  const handleCancel = () => {
    setEditName(companyType.name);
    onEdit(0); // Exit edit mode
  };

  useEffect(() => {
    if (isEditing) {
      setEditName(companyType.name);
    }
  }, [isEditing, companyType.name]);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: companyType.color
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
        <span className="flex-1">{companyType.order}. {companyType.name}</span>
      )}
      <div className="flex items-center gap-1">
        <ColorPicker 
          color={companyType.color} 
          onColorChange={(color) => onColorChange(companyType.id, color)}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(companyType.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(companyType.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function CompanyTypePage() {
  const [companyTypes, setCompanyTypes] = useState<CompanyType[]>([]);
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

  // Load company types from backend
  useEffect(() => {
    const loadCompanyTypes = async () => {
      try {
        setLoading(true);
        const data = await companyTypesApi.getCompanyTypes();
        const sortedCompanyTypes = data.sort((a: CompanyType, b: CompanyType) => a.order - b.order);
        setCompanyTypes(sortedCompanyTypes);
      } catch (error: any) {
        console.error('Failed to load company types:', error);
        toast.error('Failed to load company types');
      } finally {
        setLoading(false);
      }
    };

    loadCompanyTypes();
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

    const oldIndex = companyTypes.findIndex((companyType) => companyType.id === activeIdNum);
    const newIndex = companyTypes.findIndex((companyType) => companyType.id === overIdNum);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newCompanyTypes = arrayMove(companyTypes, oldIndex, newIndex);
      // Update order numbers
      const updatedCompanyTypes = newCompanyTypes.map((companyType, index) => ({
        ...companyType,
        order: index + 1
      }));
      setCompanyTypes(updatedCompanyTypes);
      
      // Save reorder to backend
      try {
        await companyTypesApi.reorderCompanyTypes(
          updatedCompanyTypes.map((ct) => ({ id: ct.id, order: ct.order }))
        );
      } catch (error: any) {
        console.error('Failed to reorder company types:', error);
        toast.error('Failed to save company type order');
      }
    }

    setActiveId(null);
  };

  const handleEdit = (id: number) => {
    setIsEditing(id === isEditing ? null : id);
  };

  const handleNameChange = async (id: number, name: string) => {
    try {
      await companyTypesApi.updateCompanyType(id, { name });
      setCompanyTypes(companyTypes.map((companyType) => 
        companyType.id === id ? { ...companyType, name } : companyType
      ));
      toast.success('Company type name updated');
    } catch (error: any) {
      console.error('Failed to update company type name:', error);
      toast.error('Failed to update company type name');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this company type?")) {
      try {
        await companyTypesApi.deleteCompanyType(id);
        const updatedCompanyTypes = companyTypes
          .filter((companyType) => companyType.id !== id)
          .map((companyType, index) => ({
            ...companyType,
            order: index + 1
          }));
        setCompanyTypes(updatedCompanyTypes);
        toast.success('Company type deleted successfully');
      } catch (error: any) {
        console.error('Failed to delete company type:', error);
        toast.error('Failed to delete company type');
      }
    }
  };

  const handleColorChange = async (id: number, color: string) => {
    try {
      await companyTypesApi.updateCompanyType(id, { color });
      setCompanyTypes(companyTypes.map((companyType) => 
        companyType.id === id ? { ...companyType, color } : companyType
      ));
    } catch (error: any) {
      console.error('Failed to update color:', error);
      toast.error('Failed to update company type color');
    }
  };

  const handleAddCompanyType = async () => {
    const newOrder = companyTypes.length + 1;
    try {
      const newCompanyType = await companyTypesApi.createCompanyType({
        name: "New Company Type",
        color: presetColors[0],
        order: newOrder
      });
      setCompanyTypes([...companyTypes, newCompanyType]);
      setIsEditing(newCompanyType.id);
      toast.success('Company type added successfully');
    } catch (error: any) {
      console.error('Failed to create company type:', error);
      toast.error('Failed to create company type');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Save reordered company types
      const reorderData = companyTypes.map((companyType) => ({
        id: companyType.id,
        order: companyType.order
      }));
      
      await companyTypesApi.reorderCompanyTypes(reorderData);
      toast.success('Company types saved successfully!');
    } catch (error: any) {
      console.error('Failed to save company types:', error);
      toast.error('Failed to save company types');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    // Reload from backend
    try {
      setLoading(true);
      const data = await companyTypesApi.getCompanyTypes();
      const sortedCompanyTypes = data.sort((a: CompanyType, b: CompanyType) => a.order - b.order);
      setCompanyTypes(sortedCompanyTypes);
      toast.success('Changes cancelled');
    } catch (error: any) {
      console.error('Failed to reload company types:', error);
      toast.error('Failed to reload company types');
    } finally {
      setLoading(false);
    }
  };

  const activeCompanyType = activeId ? companyTypes.find((ct) => ct.id === activeId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading company types...</p>
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
          {/* Company Types List */}
          <div className="space-y-2">
            <SortableContext
              items={companyTypes.map((ct) => ct.id.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {companyTypes.map((companyType) => (
                  <SortableCompanyTypeItem
                    key={companyType.id}
                    companyType={companyType}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onColorChange={handleColorChange}
                    onNameChange={handleNameChange}
                    isEditing={isEditing === companyType.id}
                  />
                ))}
              </div>
            </SortableContext>
            <Button
              variant="outline"
              onClick={handleAddCompanyType}
              className="w-full mt-2 border-dashed"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Company Type
            </Button>
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeCompanyType ? (
          <div 
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium shadow-lg opacity-90"
            style={{ backgroundColor: activeCompanyType.color }}
          >
            <GripVertical className="h-4 w-4" />
            <span>{activeCompanyType.order}. {activeCompanyType.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
