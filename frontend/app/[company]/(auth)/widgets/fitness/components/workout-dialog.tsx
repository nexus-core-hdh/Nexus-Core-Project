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
import { fitnessApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

interface WorkoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout?: any;
  onSaved: () => void;
}

export function WorkoutDialog({ open, onOpenChange, workout, onSaved }: WorkoutDialogProps) {
  const user = getCurrentUser();
  const [loading, setLoading] = useState(false);
  const [startTime, setStartTime] = useState<Date | undefined>(undefined);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    type: "RUNNING",
    status: "PLANNED",
    duration: "",
    distance: "",
    calories: "",
    heartRate: "",
    notes: "",
  });

  useEffect(() => {
    if (workout) {
      setFormData({
        title: workout.title || "",
        description: workout.description || "",
        type: workout.type || "RUNNING",
        status: workout.status || "PLANNED",
        duration: workout.duration?.toString() || "",
        distance: workout.distance?.toString() || "",
        calories: workout.calories?.toString() || "",
        heartRate: workout.heartRate?.toString() || "",
        notes: workout.notes || "",
      });
      setStartTime(workout.startTime ? new Date(workout.startTime) : undefined);
    } else {
      setFormData({
        title: "",
        description: "",
        type: "RUNNING",
        status: "PLANNED",
        duration: "",
        distance: "",
        calories: "",
        heartRate: "",
        notes: "",
      });
      setStartTime(new Date());
    }
  }, [workout, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      toast.error("User not found");
      return;
    }

    if (!startTime) {
      toast.error("Please select a start time");
      return;
    }

    try {
      setLoading(true);
      const data = {
        title: formData.title,
        description: formData.description || undefined,
        type: formData.type,
        status: formData.status,
        startTime: startTime.toISOString(),
        duration: formData.duration ? parseInt(formData.duration) : undefined,
        distance: formData.distance ? parseFloat(formData.distance) : undefined,
        calories: formData.calories ? parseInt(formData.calories) : undefined,
        heartRate: formData.heartRate ? parseInt(formData.heartRate) : undefined,
        notes: formData.notes || undefined,
        userId: user.id,
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
      };

      if (workout) {
        await fitnessApi.updateFitnessActivity(workout.id, data);
        toast.success("Workout updated successfully");
      } else {
        await fitnessApi.createFitnessActivity(data);
        toast.success("Workout created successfully");
      }
      onSaved();
    } catch (error: any) {
      console.error("Failed to save workout:", error);
      toast.error(error?.error || "Failed to save workout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{workout ? "Edit Workout" : "Add Workout"}</DialogTitle>
          <DialogDescription>
            {workout ? "Update your workout details" : "Add a new workout to your schedule"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
                required>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RUNNING">Running</SelectItem>
                  <SelectItem value="CYCLING">Cycling</SelectItem>
                  <SelectItem value="WALKING">Walking</SelectItem>
                  <SelectItem value="SWIMMING">Swimming</SelectItem>
                  <SelectItem value="STRENGTH_TRAINING">Strength Training</SelectItem>
                  <SelectItem value="YOGA">Yoga</SelectItem>
                  <SelectItem value="PILATES">Pilates</SelectItem>
                  <SelectItem value="CARDIO">Cardio</SelectItem>
                  <SelectItem value="CROSSFIT">CrossFit</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time *</Label>
              <DateTimePicker date={startTime} setDate={setStartTime} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLANNED">Planned</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  <SelectItem value="SKIPPED">Skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (min)</Label>
              <Input
                id="duration"
                type="number"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="distance">Distance (km)</Label>
              <Input
                id="distance"
                type="number"
                step="0.1"
                value={formData.distance}
                onChange={(e) => setFormData({ ...formData, distance: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calories">Calories</Label>
              <Input
                id="calories"
                type="number"
                value={formData.calories}
                onChange={(e) => setFormData({ ...formData, calories: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="heartRate">Heart Rate (BPM)</Label>
            <Input
              id="heartRate"
              type="number"
              value={formData.heartRate}
              onChange={(e) => setFormData({ ...formData, heartRate: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : workout ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

