"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Pencil, X, Palette, Plus } from "lucide-react";
import { contactTypesApi } from "@/lib/api";
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

interface ContactType {
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

function SortableContactTypeItem({ 
  contactType, 
  onEdit, 
  onDelete, 
  onColorChange,
  onNameChange,
  isEditing
}: { 
  contactType: ContactType; 
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
  } = useSortable({ id: contactType.id.toString() });

  const [editName, setEditName] = useState(contactType.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const handleSave = () => {
    if (editName.trim()) {
      onNameChange(contactType.id, editName.trim());
    } else {
      setEditName(contactType.name);
    }
    onEdit(0); // Exit edit mode
  };

  const handleCancel = () => {
    setEditName(contactType.name);
    onEdit(0); // Exit edit mode
  };

  useEffect(() => {
    if (isEditing) {
      setEditName(contactType.name);
    }
  }, [isEditing, contactType.name]);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: contactType.color
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
        <span className="flex-1">{contactType.order}. {contactType.name}</span>
      )}
      <div className="flex items-center gap-1">
        <ColorPicker 
          color={contactType.color} 
          onColorChange={(color) => onColorChange(contactType.id, color)}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(contactType.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(contactType.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function ContactTypesPage() {
  const [contactTypes, setContactTypes] = useState<ContactType[]>([]);
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

  // Load contact types from backend
  useEffect(() => {
    const loadContactTypes = async () => {
      try {
        setLoading(true);
        const data = await contactTypesApi.getContactTypes();
        const sortedContactTypes = data.sort((a: ContactType, b: ContactType) => a.order - b.order);
        setContactTypes(sortedContactTypes);
      } catch (error: any) {
        console.error('Failed to load contact types:', error);
        toast.error('Failed to load contact types');
      } finally {
        setLoading(false);
      }
    };

    loadContactTypes();
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

    const oldIndex = contactTypes.findIndex((contactType) => contactType.id === activeIdNum);
    const newIndex = contactTypes.findIndex((contactType) => contactType.id === overIdNum);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newContactTypes = arrayMove(contactTypes, oldIndex, newIndex);
      // Update order numbers
      const updatedContactTypes = newContactTypes.map((contactType, index) => ({
        ...contactType,
        order: index + 1
      }));
      setContactTypes(updatedContactTypes);
      
      // Save reorder to backend
      try {
        await contactTypesApi.reorderContactTypes(
          updatedContactTypes.map((ct) => ({ id: ct.id, order: ct.order }))
        );
      } catch (error: any) {
        console.error('Failed to reorder contact types:', error);
        toast.error('Failed to save contact type order');
      }
    }

    setActiveId(null);
  };

  const handleEdit = (id: number) => {
    setIsEditing(id === isEditing ? null : id);
  };

  const handleNameChange = async (id: number, name: string) => {
    try {
      await contactTypesApi.updateContactType(id, { name });
      setContactTypes(contactTypes.map((contactType) => 
        contactType.id === id ? { ...contactType, name } : contactType
      ));
      toast.success('Contact type name updated');
    } catch (error: any) {
      console.error('Failed to update contact type name:', error);
      toast.error('Failed to update contact type name');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this contact type?")) {
      try {
        await contactTypesApi.deleteContactType(id);
        const updatedContactTypes = contactTypes
          .filter((contactType) => contactType.id !== id)
          .map((contactType, index) => ({
            ...contactType,
            order: index + 1
          }));
        setContactTypes(updatedContactTypes);
        toast.success('Contact type deleted successfully');
      } catch (error: any) {
        console.error('Failed to delete contact type:', error);
        toast.error('Failed to delete contact type');
      }
    }
  };

  const handleColorChange = async (id: number, color: string) => {
    try {
      await contactTypesApi.updateContactType(id, { color });
      setContactTypes(contactTypes.map((contactType) => 
        contactType.id === id ? { ...contactType, color } : contactType
      ));
    } catch (error: any) {
      console.error('Failed to update color:', error);
      toast.error('Failed to update contact type color');
    }
  };

  const handleAddContactType = async () => {
    const newOrder = contactTypes.length + 1;
    try {
      const newContactType = await contactTypesApi.createContactType({
        name: "New Contact Type",
        color: presetColors[0],
        order: newOrder
      });
      setContactTypes([...contactTypes, newContactType]);
      setIsEditing(newContactType.id);
      toast.success('Contact type added successfully');
    } catch (error: any) {
      console.error('Failed to create contact type:', error);
      toast.error('Failed to create contact type');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Save reordered contact types
      const reorderData = contactTypes.map((contactType) => ({
        id: contactType.id,
        order: contactType.order
      }));
      
      await contactTypesApi.reorderContactTypes(reorderData);
      toast.success('Contact types saved successfully!');
    } catch (error: any) {
      console.error('Failed to save contact types:', error);
      toast.error('Failed to save contact types');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    // Reload from backend
    try {
      setLoading(true);
      const data = await contactTypesApi.getContactTypes();
      const sortedContactTypes = data.sort((a: ContactType, b: ContactType) => a.order - b.order);
      setContactTypes(sortedContactTypes);
      toast.success('Changes cancelled');
    } catch (error: any) {
      console.error('Failed to reload contact types:', error);
      toast.error('Failed to reload contact types');
    } finally {
      setLoading(false);
    }
  };

  const activeContactType = activeId ? contactTypes.find((ct) => ct.id === activeId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading contact types...</p>
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
          {/* Contact Types List */}
          <div className="space-y-2">
            <SortableContext
              items={contactTypes.map((ct) => ct.id.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {contactTypes.map((contactType) => (
                  <SortableContactTypeItem
                    key={contactType.id}
                    contactType={contactType}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onColorChange={handleColorChange}
                    onNameChange={handleNameChange}
                    isEditing={isEditing === contactType.id}
                  />
                ))}
              </div>
            </SortableContext>
            <Button
              variant="outline"
              onClick={handleAddContactType}
              className="w-full mt-2 border-dashed"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Contact Type
            </Button>
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeContactType ? (
          <div 
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium shadow-lg opacity-90"
            style={{ backgroundColor: activeContactType.color }}
          >
            <GripVertical className="h-4 w-4" />
            <span>{activeContactType.order}. {activeContactType.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
