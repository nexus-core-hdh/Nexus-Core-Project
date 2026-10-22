"use client";

import React from "react";

import { PlusCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/date-time-picker";
import { reminderApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Priority = "LOW" | "MEDIUM" | "HIGH";

type AddReminderDialogProps = {
  onSuccess?: () => void;
};

export function AddReminderDialog({ onSuccess }: AddReminderDialogProps) {
  const [date, setDate] = React.useState<Date>();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [newReminder, setNewReminder] = React.useState({
    priority: "MEDIUM" as Priority,
    text: "",
    category: ""
  });
  const { toast } = useToast();

  const handleAddReminder = async () => {
    if (!newReminder.text.trim()) {
      toast({
        title: "Error",
        description: "Please enter a reminder note",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      await reminderApi.createReminder({
        note: newReminder.text,
        priority: newReminder.priority,
        category: newReminder.category || undefined,
        dueDate: date ? date.toISOString() : undefined,
        isCompleted: false
      });

      toast({
        title: "Success",
        description: "Reminder created successfully"
      });

      setNewReminder({
        priority: "MEDIUM",
        text: "",
        category: ""
      });
      setDate(undefined);
      setOpen(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error creating reminder:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create reminder",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case "LOW":
        return "text-gray-400";
      case "MEDIUM":
        return "text-orange-400";
      case "HIGH":
        return "text-red-500";
      default:
        return "text-gray-400";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlusCircleIcon />
          Set Reminder
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Reminder</DialogTitle>
        </DialogHeader>
        <div className="mt-4 grid space-y-6">
          <div className="grid gap-2">
            <Label htmlFor="text">Note</Label>
            <Input
              id="text"
              placeholder="Enter your reminder"
              value={newReminder.text}
              onChange={(e) => setNewReminder({ ...newReminder, text: e.target.value })}
              disabled={loading}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="text">Date</Label>
            <DateTimePicker date={date} setDate={setDate} />
          </div>

          <div className="grid gap-3">
            <Label>Priority</Label>
            <RadioGroup
              value={newReminder.priority}
              onValueChange={(value) =>
                setNewReminder({ ...newReminder, priority: value as Priority })
              }
              className="flex space-x-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="LOW" id="low" />
                <Label htmlFor="low" className="cursor-pointer">
                  Low
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="MEDIUM" id="medium" />
                <Label htmlFor="medium" className="cursor-pointer">
                  Medium
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="HIGH" id="high" />
                <Label htmlFor="high" className="cursor-pointer">
                  High
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={newReminder.category}
              onValueChange={(value) => setNewReminder({ ...newReminder, category: value })}>
              <SelectTrigger id="category" className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Meeting">Meeting</SelectItem>
                <SelectItem value="Design Education">Design Education</SelectItem>
                <SelectItem value="Customer Support">Customer Support</SelectItem>
                <SelectItem value="Personal">Personal</SelectItem>
                <SelectItem value="Work">Work</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleAddReminder} disabled={loading}>
            {loading ? "Adding..." : "Add Reminder"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
