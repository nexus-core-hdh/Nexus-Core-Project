"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Pencil, X, ArrowRight, Palette, Plus, Trophy, XCircle } from "lucide-react";
import { documentStagesApi } from "@/lib/api";
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
  DragStartEvent,
  useDroppable
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

interface Stage {
  id: number;
  name: string;
  color: string; // Hex color value
  order: number;
  type: 'initial' | 'additional' | 'success' | 'failed';
  companyId?: number | null;
  branchId?: number | null;
}

// Convert Tailwind colors to hex
const colorMap: Record<string, string> = {
  "bg-blue-500": "#3b82f6",
  "bg-orange-500": "#f97316",
  "bg-red-500": "#ef4444",
  "bg-pink-500": "#ec4899",
  "bg-orange-600": "#ea580c"
};

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

// Default stages for initial load
const defaultInitialStage: Stage = {
  id: 0,
  name: "Initial Stage",
  color: colorMap["bg-blue-500"],
  order: 1,
  type: 'initial'
};

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

function SortableStageItem({ 
  stage, 
  onEdit, 
  onDelete, 
  onColorChange,
  onNameChange,
  isEditing
}: { 
  stage: Stage; 
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
  } = useSortable({ id: stage.id.toString() });

  const [editName, setEditName] = useState(stage.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const handleSave = () => {
    if (editName.trim()) {
      onNameChange(stage.id, editName.trim());
    } else {
      setEditName(stage.name);
    }
    onEdit(0); // Exit edit mode
  };

  const handleCancel = () => {
    setEditName(stage.name);
    onEdit(0); // Exit edit mode
  };

  useEffect(() => {
    if (isEditing) {
      setEditName(stage.name);
    }
  }, [isEditing, stage.name]);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: stage.color
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
        <span className="flex-1">{stage.order}. {stage.name}</span>
      )}
      <div className="flex items-center gap-1">
        <ColorPicker 
          color={stage.color} 
          onColorChange={(color) => onColorChange(stage.id, color)}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(stage.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(stage.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function InitialStageCard({ 
  stage, 
  onColorChange, 
  onEdit, 
  onNameChange 
}: { 
  stage: Stage; 
  onColorChange: (color: string) => void;
  onEdit: (id: number) => void;
  onNameChange: (name: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(stage.name);

  const handleSave = () => {
    onNameChange(editName);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(stage.name);
    setIsEditing(false);
  };

  return (
    <div 
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium shadow-sm"
      style={{ backgroundColor: stage.color }}
    >
      <ArrowRight className="h-4 w-4" />
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
          />
        </div>
      ) : (
        <span 
          className="flex-1 cursor-pointer hover:underline"
          onClick={() => setIsEditing(true)}
        >
          {stage.order}. {stage.name}
        </span>
      )}
      <div className="flex items-center gap-1">
        <ColorPicker 
          color={stage.color} 
          onColorChange={onColorChange}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function FinalStageCard({ 
  stage, 
  onColorChange, 
  onEdit, 
  onDelete,
  onNameChange,
  isEditing
}: { 
  stage: Stage; 
  onColorChange: (color: string) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onNameChange: (id: number, name: string) => void;
  isEditing: boolean;
}) {
  const [editName, setEditName] = useState(stage.name);

  const handleSave = () => {
    if (editName.trim()) {
      onNameChange(stage.id, editName.trim());
    } else {
      setEditName(stage.name);
    }
    onEdit(0); // Exit edit mode
  };

  const handleCancel = () => {
    setEditName(stage.name);
    onEdit(0); // Exit edit mode
  };

  useEffect(() => {
    if (isEditing) {
      setEditName(stage.name);
    }
  }, [isEditing, stage.name]);

  return (
    <div 
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium shadow-sm"
      style={{ backgroundColor: stage.color }}
    >
      <ArrowRight className="h-4 w-4" />
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
        <span className="flex-1">{stage.order}. {stage.name}</span>
      )}
      <div className="flex items-center gap-1">
        <ColorPicker 
          color={stage.color} 
          onColorChange={onColorChange}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(stage.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(stage.id);
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function DocumentStagesPage() {
  const [initialStage, setInitialStage] = useState<Stage | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [successStagesList, setSuccessStagesList] = useState<Stage[]>([]);
  const [failedStagesList, setFailedStagesList] = useState<Stage[]>([]);
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

  // Load stages from backend
  useEffect(() => {
    const loadStages = async () => {
      try {
        setLoading(true);
        const data = await documentStagesApi.getDocumentStages();
        
        const initial = data.find((s: Stage) => s.type === 'initial');
        const additional = data.filter((s: Stage) => s.type === 'additional').sort((a: Stage, b: Stage) => a.order - b.order);
        const success = data.filter((s: Stage) => s.type === 'success').sort((a: Stage, b: Stage) => a.order - b.order);
        const failed = data.filter((s: Stage) => s.type === 'failed').sort((a: Stage, b: Stage) => a.order - b.order);

        if (initial) {
          setInitialStage(initial);
        } else {
          // Create initial stage if it doesn't exist
          try {
            const newStage = await documentStagesApi.createDocumentStage({
              name: "Initial Stage",
              color: colorMap["bg-blue-500"],
              order: 1,
              type: 'initial'
            });
            setInitialStage(newStage);
          } catch (createError: any) {
            console.error('Failed to create initial stage:', createError);
            toast.error('Failed to create initial stage');
            setInitialStage(defaultInitialStage);
          }
        }
        
        setStages(additional);
        setSuccessStagesList(success);
        setFailedStagesList(failed);
      } catch (error: any) {
        console.error('Failed to load stages:', error);
        toast.error('Failed to load document stages');
        // Set defaults if no data
        setInitialStage(defaultInitialStage);
      } finally {
        setLoading(false);
      }
    };

    loadStages();
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(parseInt(event.active.id as string));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    const activeIdNum = parseInt(active.id as string);
    const overId = over.id as string;

    // Check if dropped into a droppable area (success or failed)
    if (overId === 'success-area' || overId === 'failed-area') {
      // Find the stage being moved
      const stageToMove = stages.find((s) => s.id === activeIdNum);
      
      if (stageToMove) {
        const newType: 'success' | 'failed' = overId === 'success-area' ? 'success' : 'failed';
        const targetList = overId === 'success-area' ? successStagesList : failedStagesList;
        const newOrder = 10 + targetList.length + 1;

        try {
          // Update stage type in backend
          await documentStagesApi.updateDocumentStage(activeIdNum, { 
            type: newType,
            order: newOrder
          });

          // Remove from additional stages
          const updatedStages = stages
            .filter((stage) => stage.id !== activeIdNum)
            .map((stage, index) => ({
              ...stage,
              order: index + 2
            }));
          setStages(updatedStages);

          // Add to target list
          const updatedStage: Stage = { ...stageToMove, type: newType, order: newOrder } as Stage;
          if (overId === 'success-area') {
            setSuccessStagesList([...successStagesList, updatedStage]);
          } else {
            setFailedStagesList([...failedStagesList, updatedStage]);
          }

          toast.success(`Stage moved to ${newType === 'success' ? 'Success' : 'Failed'}`);
        } catch (error: any) {
          console.error('Failed to move stage:', error);
          toast.error('Failed to move stage');
        }
      }
    } else {
      // Regular reordering within additional stages
      const overIdNum = parseInt(overId);
      
      if (active.id === over.id) {
        setActiveId(null);
        return;
      }

      const oldIndex = stages.findIndex((stage) => stage.id === activeIdNum);
      const newIndex = stages.findIndex((stage) => stage.id === overIdNum);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newStages = arrayMove(stages, oldIndex, newIndex);
        // Update order numbers
        const updatedStages = newStages.map((stage, index) => ({
          ...stage,
          order: index + 2 // Start from 2 since initial stage is 1
        }));
        setStages(updatedStages);
        
        // Save reorder to backend
        try {
          await documentStagesApi.reorderDocumentStages(
            updatedStages.map((s) => ({ id: s.id, order: s.order }))
          );
        } catch (error: any) {
          console.error('Failed to reorder stages:', error);
          toast.error('Failed to save stage order');
        }
      }
    }

    setActiveId(null);
  };

  const handleEdit = (id: number) => {
    setIsEditing(id === isEditing ? null : id);
  };

  const handleNameChange = async (id: number, name: string) => {
    try {
      await documentStagesApi.updateDocumentStage(id, { name });
      
      // Update the stage in the appropriate list
      if (initialStage && id === initialStage.id) {
        setInitialStage({ ...initialStage, name });
      } else {
        const stageInList = stages.find(s => s.id === id);
        if (stageInList) {
          setStages(stages.map((stage) => 
            stage.id === id ? { ...stage, name } : stage
          ));
        } else {
          const successStage = successStagesList.find(s => s.id === id);
          if (successStage) {
            setSuccessStagesList(successStagesList.map((stage) => 
              stage.id === id ? { ...stage, name } : stage
            ));
          } else {
            const failedStage = failedStagesList.find(s => s.id === id);
            if (failedStage) {
              setFailedStagesList(failedStagesList.map((stage) => 
                stage.id === id ? { ...stage, name } : stage
              ));
            }
          }
        }
      }
      toast.success('Stage name updated');
    } catch (error: any) {
      console.error('Failed to update stage name:', error);
      toast.error('Failed to update stage name');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this stage?")) {
      try {
        await documentStagesApi.deleteDocumentStage(id);
        const updatedStages = stages
          .filter((stage) => stage.id !== id)
          .map((stage, index) => ({
            ...stage,
            order: index + 2
          }));
        setStages(updatedStages);
        toast.success('Stage deleted successfully');
      } catch (error: any) {
        console.error('Failed to delete stage:', error);
        toast.error('Failed to delete stage');
      }
    }
  };

  const handleColorChange = async (id: number, color: string) => {
    try {
      await documentStagesApi.updateDocumentStage(id, { color });
      if (initialStage && id === initialStage.id) {
        setInitialStage({ ...initialStage, color });
      } else {
        setStages(stages.map((stage) => 
          stage.id === id ? { ...stage, color } : stage
        ));
      }
    } catch (error: any) {
      console.error('Failed to update color:', error);
      toast.error('Failed to update stage color');
    }
  };

  const handleInitialStageColorChange = async (color: string) => {
    if (!initialStage) return;
    try {
      await documentStagesApi.updateDocumentStage(initialStage.id, { color });
      setInitialStage({ ...initialStage, color });
    } catch (error: any) {
      console.error('Failed to update initial stage color:', error);
      toast.error('Failed to update stage color');
    }
  };

  const handleInitialStageNameChange = async (name: string) => {
    if (!initialStage) return;
    try {
      await documentStagesApi.updateDocumentStage(initialStage.id, { name });
      setInitialStage({ ...initialStage, name });
      toast.success('Stage name updated');
    } catch (error: any) {
      console.error('Failed to update stage name:', error);
      toast.error('Failed to update stage name');
    }
  };

  const handleAddStage = async () => {
    const newOrder = stages.length + 2; // +2 because initial stage is 1
    try {
      const newStage = await documentStagesApi.createDocumentStage({
        name: "New Stage",
        color: presetColors[0],
        order: newOrder,
        type: 'additional'
      });
      setStages([...stages, newStage]);
      setIsEditing(newStage.id);
      toast.success('Stage added successfully');
    } catch (error: any) {
      console.error('Failed to create stage:', error);
      toast.error('Failed to create stage');
    }
  };

  const handleSuccessColorChange = async (id: number, color: string) => {
    try {
      await documentStagesApi.updateDocumentStage(id, { color });
      setSuccessStagesList(successStagesList.map((stage) => 
        stage.id === id ? { ...stage, color } : stage
      ));
    } catch (error: any) {
      console.error('Failed to update color:', error);
      toast.error('Failed to update stage color');
    }
  };

  const handleFailedColorChange = async (id: number, color: string) => {
    try {
      await documentStagesApi.updateDocumentStage(id, { color });
      setFailedStagesList(failedStagesList.map((stage) => 
        stage.id === id ? { ...stage, color } : stage
      ));
    } catch (error: any) {
      console.error('Failed to update color:', error);
      toast.error('Failed to update stage color');
    }
  };

  const handleAddSuccessStage = async () => {
    const newOrder = 10 + successStagesList.length + 1;
    try {
      const newStage = await documentStagesApi.createDocumentStage({
        name: "New Success Stage",
        color: presetColors[0],
        order: newOrder,
        type: 'success'
      });
      setSuccessStagesList([...successStagesList, newStage]);
      setIsEditing(newStage.id);
      toast.success('Success stage added');
    } catch (error: any) {
      console.error('Failed to create success stage:', error);
      toast.error('Failed to create success stage');
    }
  };

  const handleAddFailedStage = async () => {
    const newOrder = 10 + failedStagesList.length + 1;
    try {
      const newStage = await documentStagesApi.createDocumentStage({
        name: "New Failed Stage",
        color: "#60a5fa",
        order: newOrder,
        type: 'failed'
      });
      setFailedStagesList([...failedStagesList, newStage]);
      setIsEditing(newStage.id);
      toast.success('Failed stage added');
    } catch (error: any) {
      console.error('Failed to create failed stage:', error);
      toast.error('Failed to create failed stage');
    }
  };

  const handleDeleteSuccessStage = async (id: number) => {
    if (confirm("Are you sure you want to delete this success stage?")) {
      try {
        await documentStagesApi.deleteDocumentStage(id);
        setSuccessStagesList(successStagesList.filter((stage) => stage.id !== id));
        toast.success('Stage deleted successfully');
      } catch (error: any) {
        console.error('Failed to delete stage:', error);
        toast.error('Failed to delete stage');
      }
    }
  };

  const handleDeleteFailedStage = async (id: number) => {
    if (confirm("Are you sure you want to delete this failed stage?")) {
      try {
        await documentStagesApi.deleteDocumentStage(id);
        setFailedStagesList(failedStagesList.filter((stage) => stage.id !== id));
        toast.success('Stage deleted successfully');
      } catch (error: any) {
        console.error('Failed to delete stage:', error);
        toast.error('Failed to delete stage');
      }
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Save reordered stages
      const allStages = [
        ...(initialStage ? [initialStage] : []),
        ...stages,
        ...successStagesList,
        ...failedStagesList
      ];
      
      const reorderData = allStages.map((stage) => ({
        id: stage.id,
        order: stage.order
      }));
      
      await documentStagesApi.reorderDocumentStages(reorderData);
      toast.success('Stages saved successfully!');
    } catch (error: any) {
      console.error('Failed to save stages:', error);
      toast.error('Failed to save stages');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    // Reload from backend
    try {
      setLoading(true);
      const data = await documentStagesApi.getDocumentStages();
      
      const initial = data.find((s: Stage) => s.type === 'initial') || defaultInitialStage;
      const additional = data.filter((s: Stage) => s.type === 'additional').sort((a: Stage, b: Stage) => a.order - b.order);
      const success = data.filter((s: Stage) => s.type === 'success').sort((a: Stage, b: Stage) => a.order - b.order);
      const failed = data.filter((s: Stage) => s.type === 'failed').sort((a: Stage, b: Stage) => a.order - b.order);

      setInitialStage(initial);
      setStages(additional);
      setSuccessStagesList(success);
      setFailedStagesList(failed);
      toast.success('Changes cancelled');
    } catch (error: any) {
      console.error('Failed to reload stages:', error);
      toast.error('Failed to reload stages');
    } finally {
      setLoading(false);
    }
  };

  // Droppable area component for Success and Failed sections
  function DroppableArea({ 
    id, 
    children, 
    type 
  }: { 
    id: string; 
    children: React.ReactNode; 
    type: 'success' | 'failed';
  }) {
    const { setNodeRef, isOver } = useDroppable({
      id,
    });

    return (
      <div
        ref={setNodeRef}
        className={cn(
          "transition-colors",
          isOver && "bg-muted/50 rounded-lg"
        )}
      >
        {children}
      </div>
    );
  }

  const activeStage = activeId ? stages.find((s) => s.id === activeId) : null;

  if (loading || !initialStage) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading stages...</p>
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
          {/* Initial Stage Section */}
          <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground">Initial Stage</h4>
            <InitialStageCard 
              stage={initialStage} 
              onColorChange={handleInitialStageColorChange}
              onEdit={handleEdit}
              onNameChange={handleInitialStageNameChange}
            />
          </div>

          {/* Additional Stages Section */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">Additional stages</h4>
            <SortableContext
              items={stages.map((s) => s.id.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {stages.map((stage) => (
                  <SortableStageItem
                    key={stage.id}
                    stage={stage}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onColorChange={handleColorChange}
                    onNameChange={handleNameChange}
                    isEditing={isEditing === stage.id}
                  />
                ))}
              </div>
            </SortableContext>
            <Button
              variant="outline"
              onClick={handleAddStage}
              className="w-full mt-2 border-dashed"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Stage
            </Button>
          </div>

          {/* Final Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <h4 className="text-sm font-semibold text-foreground">FINAL</h4>
              <div className="flex-1 h-px bg-border"></div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Success Stages */}
            <DroppableArea id="success-area" type="success">
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-green-600">SUCCESS</h5>
                <div className="border rounded-lg p-4 space-y-3 min-h-[200px] flex flex-col">
                  <div className="text-xs font-medium text-muted-foreground">Success stage</div>
                  <div className="flex-1 space-y-1.5">
                    {successStagesList.map((stage) => (
                      <FinalStageCard
                        key={stage.id}
                        stage={stage}
                        onColorChange={(color) => handleSuccessColorChange(stage.id, color)}
                        onEdit={handleEdit}
                        onDelete={handleDeleteSuccessStage}
                        onNameChange={handleNameChange}
                        isEditing={isEditing === stage.id}
                      />
                    ))}
                  </div>
                  <div className="flex justify-center pt-2">
                    <Trophy className="h-8 w-8 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </DroppableArea>

            {/* Failed Stages */}
            <DroppableArea id="failed-area" type="failed">
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-red-600">FAILED</h5>
                <div className="border rounded-lg p-4 space-y-3 min-h-[200px] flex flex-col">
                  <div className="text-xs font-medium text-muted-foreground">Failed stages</div>
                  <div className="flex-1 space-y-1.5">
                    {failedStagesList.map((stage) => (
                      <FinalStageCard
                        key={stage.id}
                        stage={stage}
                        onColorChange={(color) => handleFailedColorChange(stage.id, color)}
                        onEdit={handleEdit}
                        onDelete={handleDeleteFailedStage}
                        onNameChange={handleNameChange}
                        isEditing={isEditing === stage.id}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleAddFailedStage}
                    className="text-sm text-foreground hover:text-primary transition-colors text-left"
                  >
                    + ADD STAGE
                  </button>
                  <div className="flex justify-center pt-2">
                    <XCircle className="h-8 w-8 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </DroppableArea>
            </div>
          </div>
        </div>
      </div>
      <DragOverlay>
        {activeStage ? (
          <div 
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium shadow-lg opacity-90"
            style={{ backgroundColor: activeStage.color }}
          >
            <GripVertical className="h-4 w-4" />
            <span>{activeStage.order}. {activeStage.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

