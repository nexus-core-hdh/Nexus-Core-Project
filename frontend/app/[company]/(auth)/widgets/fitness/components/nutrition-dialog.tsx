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
import { CalendarIcon } from "@radix-ui/react-icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { nutritionApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

interface NutritionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nutrition?: any;
  onSaved: () => void;
}

export function NutritionDialog({ open, onOpenChange, nutrition, onSaved }: NutritionDialogProps) {
  const user = getCurrentUser();
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [formData, setFormData] = useState({
    calories: "",
    carbs: "",
    protein: "",
    fats: "",
  });

  useEffect(() => {
    if (nutrition) {
      setFormData({
        calories: nutrition.calories?.toString() || "",
        carbs: nutrition.carbs?.toString() || "",
        protein: nutrition.protein?.toString() || "",
        fats: nutrition.fats?.toString() || "",
      });
      setDate(nutrition.date ? new Date(nutrition.date) : new Date());
    } else {
      setFormData({
        calories: "",
        carbs: "",
        protein: "",
        fats: "",
      });
      setDate(new Date());
    }
  }, [nutrition, open]);

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

    if (!formData.calories || !formData.carbs || !formData.protein || !formData.fats) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      setLoading(true);
      const data = {
        userId: user.id,
        date: date.toISOString().split('T')[0], // YYYY-MM-DD format
        calories: parseInt(formData.calories),
        carbs: parseFloat(formData.carbs),
        protein: parseFloat(formData.protein),
        fats: parseFloat(formData.fats),
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
      };

      await nutritionApi.upsertNutritionEntry(data);
      toast.success(nutrition ? "Nutrition updated successfully" : "Nutrition logged successfully");
      onSaved();
    } catch (error: any) {
      console.error("Failed to save nutrition:", error);
      toast.error(error?.error || "Failed to save nutrition");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{nutrition ? "Edit Nutrition" : "Log Nutrition"}</DialogTitle>
          <DialogDescription>
            {nutrition ? "Update your nutrition entry" : "Log your daily nutrition intake"}
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

          <div className="space-y-2">
            <Label htmlFor="calories">Calories *</Label>
            <Input
              id="calories"
              type="number"
              value={formData.calories}
              onChange={(e) => setFormData({ ...formData, calories: e.target.value })}
              placeholder="2000"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="carbs">Carbs (g) *</Label>
              <Input
                id="carbs"
                type="number"
                step="0.1"
                value={formData.carbs}
                onChange={(e) => setFormData({ ...formData, carbs: e.target.value })}
                placeholder="178"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="protein">Protein (g) *</Label>
              <Input
                id="protein"
                type="number"
                step="0.1"
                value={formData.protein}
                onChange={(e) => setFormData({ ...formData, protein: e.target.value })}
                placeholder="92"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fats">Fats (g) *</Label>
              <Input
                id="fats"
                type="number"
                step="0.1"
                value={formData.fats}
                onChange={(e) => setFormData({ ...formData, fats: e.target.value })}
                placeholder="38"
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : nutrition ? "Update" : "Log"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

