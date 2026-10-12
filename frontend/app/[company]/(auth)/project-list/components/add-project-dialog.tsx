"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/date-time-picker";
import { projectApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

interface AddProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function AddProjectDialog({ open, onOpenChange, onSaved }: AddProjectDialogProps) {
  const user = getCurrentUser();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);
  const [formData, setFormData] = useState({
    title: "",
    subtitle: "",
    description: "",
    status: "PENDING" as "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED",
    progress: "",
    budget: "",
    spent: "",
    clientName: "",
    clientAvatar: "",
    progressColor: "",
    badgeColor: "",
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setFormData({
        title: "",
        subtitle: "",
        description: "",
        status: "PENDING",
        progress: "",
        budget: "",
        spent: "",
        clientName: "",
        clientAvatar: "",
        progressColor: "",
        badgeColor: "",
      });
      setStartDate(undefined);
      setEndDate(undefined);
      setDeadline(undefined);
    }
  }, [open]);

  const getProgressColor = (progress: number) => {
    if (progress >= 75) return "bg-green-500";
    if (progress >= 50) return "bg-blue-500";
    if (progress >= 25) return "bg-orange-500";
    return "bg-red-500";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      toast.error("User not found");
      return;
    }

    if (!formData.title.trim()) {
      toast.error("Please enter a project title");
      return;
    }

    const progress = formData.progress ? parseInt(formData.progress) : 0;
    const progressColor = formData.progressColor || getProgressColor(progress);
    const badgeColor = formData.badgeColor || progressColor;

    try {
      setLoading(true);
      const data = {
        title: formData.title.trim(),
        subtitle: formData.subtitle.trim() || undefined,
        description: formData.description.trim() || undefined,
        status: formData.status,
        progress: Math.min(100, Math.max(0, progress)),
        startDate: startDate?.toISOString(),
        endDate: endDate?.toISOString(),
        deadline: deadline?.toISOString(),
        budget: formData.budget ? parseFloat(formData.budget) : undefined,
        spent: formData.spent ? parseFloat(formData.spent) : undefined,
        clientName: formData.clientName.trim() || undefined,
        clientAvatar: formData.clientAvatar.trim() || undefined,
        progressColor,
        badgeColor,
        managerId: user.id, // Set current user as manager
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
      };

      await projectApi.createProject(data);
      toast.success("Project created successfully");
      onOpenChange(false);
      // Wait a bit for the dialog to close, then refresh the list
      setTimeout(() => {
        onSaved();
      }, 100);
    } catch (error: any) {
      console.error("Failed to create project:", error);
      toast.error(error?.error || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[90vw] max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add New Project</DialogTitle>
          <DialogDescription>
            Create a new project with all the necessary details
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 pr-2 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Project Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Mobile App Development"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subtitle">Subtitle</Label>
              <Input
                id="subtitle"
                value={formData.subtitle}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                placeholder="e.g., Prototyping"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Project description..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED") =>
                  setFormData({ ...formData, status: value })
                }>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="progress">Progress (%)</Label>
              <Input
                id="progress"
                type="number"
                min="0"
                max="100"
                value={formData.progress}
                onChange={(e) => setFormData({ ...formData, progress: e.target.value })}
                placeholder="0-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <DateTimePicker date={startDate} setDate={setStartDate} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <DateTimePicker date={endDate} setDate={setEndDate} />
            </div>
            <div className="space-y-2">
              <Label>Deadline</Label>
              <DateTimePicker date={deadline} setDate={setDeadline} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="budget">Budget</Label>
              <Input
                id="budget"
                type="number"
                step="0.01"
                value={formData.budget}
                onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spent">Spent</Label>
              <Input
                id="spent"
                type="number"
                step="0.01"
                value={formData.spent}
                onChange={(e) => setFormData({ ...formData, spent: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientName">Client Name</Label>
              <Input
                id="clientName"
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                placeholder="Client name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientAvatar">Client Avatar URL</Label>
              <Input
                id="clientAvatar"
                value={formData.clientAvatar}
                onChange={(e) => setFormData({ ...formData, clientAvatar: e.target.value })}
                placeholder="/images/avatars/01.png"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="progressColor">Progress Color (Tailwind class)</Label>
              <Input
                id="progressColor"
                value={formData.progressColor}
                onChange={(e) => setFormData({ ...formData, progressColor: e.target.value })}
                placeholder="bg-blue-500 (auto if empty)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="badgeColor">Badge Color (Tailwind class)</Label>
              <Input
                id="badgeColor"
                value={formData.badgeColor}
                onChange={(e) => setFormData({ ...formData, badgeColor: e.target.value })}
                placeholder="bg-blue-500 (auto if empty)"
              />
            </div>
          </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

