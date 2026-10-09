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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateTimePicker } from "@/components/date-time-picker";
import { CalendarIcon } from "@radix-ui/react-icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { sleepApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

interface SleepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sleep?: any;
  onSaved: () => void;
}

export function SleepDialog({ open, onOpenChange, sleep, onSaved }: SleepDialogProps) {
  const user = getCurrentUser();
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [bedTime, setBedTime] = useState<Date | undefined>(undefined);
  const [wakeTime, setWakeTime] = useState<Date | undefined>(undefined);
  const [formData, setFormData] = useState({
    sleepHours: "",
    sleepMinutes: "",
    quality: "",
  });

  useEffect(() => {
    if (sleep) {
      setFormData({
        sleepHours: sleep.sleepHours?.toString() || "",
        sleepMinutes: sleep.sleepMinutes?.toString() || "",
        quality: sleep.quality?.toString() || "",
      });
      setDate(sleep.date ? new Date(sleep.date) : new Date());
      setBedTime(sleep.bedTime ? new Date(sleep.bedTime) : undefined);
      setWakeTime(sleep.wakeTime ? new Date(sleep.wakeTime) : undefined);
    } else {
      setFormData({
        sleepHours: "",
        sleepMinutes: "",
        quality: "",
      });
      setDate(new Date());
      setBedTime(undefined);
      setWakeTime(undefined);
    }
  }, [sleep, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      toast.error("User not found");
      return;
    }

    if (!date) {
      toast.error("Please select a date");
      return;
    }

    if (!formData.sleepHours || !formData.quality) {
      toast.error("Please fill in sleep hours and quality");
      return;
    }

    try {
      setLoading(true);
      const data = {
        userId: user.id,
        date: date.toISOString().split('T')[0], // YYYY-MM-DD format
        sleepHours: parseFloat(formData.sleepHours),
        sleepMinutes: formData.sleepMinutes ? parseInt(formData.sleepMinutes) : 0,
        quality: parseInt(formData.quality),
        bedTime: bedTime?.toISOString(),
        wakeTime: wakeTime?.toISOString(),
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
      };

      await sleepApi.upsertSleepRecord(data);
      toast.success(sleep ? "Sleep record updated successfully" : "Sleep logged successfully");
      onSaved();
    } catch (error: any) {
      console.error("Failed to save sleep:", error);
      toast.error(error?.error || "Failed to save sleep");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sleep ? "Edit Sleep Record" : "Log Sleep"}</DialogTitle>
          <DialogDescription>
            {sleep ? "Update your sleep record" : "Log your sleep duration and quality"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(selectedDate) => setDate(selectedDate || undefined)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sleepHours">Sleep Hours *</Label>
              <Input
                id="sleepHours"
                type="number"
                step="0.1"
                value={formData.sleepHours}
                onChange={(e) => setFormData({ ...formData, sleepHours: e.target.value })}
                placeholder="7.5"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sleepMinutes">Sleep Minutes</Label>
              <Input
                id="sleepMinutes"
                type="number"
                value={formData.sleepMinutes}
                onChange={(e) => setFormData({ ...formData, sleepMinutes: e.target.value })}
                placeholder="30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quality">Sleep Quality (%) *</Label>
            <Input
              id="quality"
              type="number"
              min="0"
              max="100"
              value={formData.quality}
              onChange={(e) => setFormData({ ...formData, quality: e.target.value })}
              placeholder="89"
              required
            />
            <p className="text-xs text-muted-foreground">Rate your sleep quality from 0-100</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Bed Time</Label>
              <DateTimePicker 
                date={bedTime} 
                setDate={(newDate) => {
                  setBedTime(newDate || undefined);
                }} 
              />
            </div>
            <div className="space-y-2">
              <Label>Wake Time</Label>
              <DateTimePicker 
                date={wakeTime} 
                setDate={(newDate) => {
                  setWakeTime(newDate || undefined);
                }} 
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : sleep ? "Update" : "Log"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

