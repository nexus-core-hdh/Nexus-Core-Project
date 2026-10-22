"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowRight, CircleCheck } from "lucide-react";
import { AddReminderDialog } from "@/app/[company]/(auth)/project-management/components/add-reminder-dialog";
import { reminderApi } from "@/lib/api";
import { format, formatDistanceToNow, isToday, isTomorrow } from "date-fns";

type Reminder = {
  id: number;
  note: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  category?: string;
  dueDate?: string;
  isCompleted: boolean;
};

export function Reminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReminders = async () => {
    try {
      setLoading(true);
      const data = await reminderApi.getReminders();
      // Get only incomplete reminders, limit to 3 for display
      const incompleteReminders = data
        .filter((r: any) => !r.isCompleted)
        .slice(0, 3)
        .map((r: any) => ({
          id: r.id,
          note: r.note,
          priority: r.priority,
          category: r.category,
          dueDate: r.dueDate,
          isCompleted: r.isCompleted
        }));
      setReminders(incompleteReminders);
    } catch (error) {
      console.error("Error fetching reminders:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReminders();
  }, []);

  const formatReminderDate = (dueDate?: string) => {
    if (!dueDate) return "";
    const date = new Date(dueDate);
    if (isToday(date)) {
      return `Today, ${format(date, "HH:mm")}`;
    } else if (isTomorrow(date)) {
      return `Tomorrow, ${format(date, "HH:mm")}`;
    } else {
      return format(date, "MMM dd, yyyy HH:mm");
    }
  };

  const getPriorityLevel = (priority: string) => {
    return priority.toLowerCase();
  };

  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle>Reminder</CardTitle>
        <CardAction>
          <AddReminderDialog onSuccess={fetchReminders} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            Loading reminders...
          </div>
        ) : reminders.length === 0 ? (
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            No reminders found
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {reminders.map((reminder) => (
              <Card key={reminder.id}>
                <CardHeader>
                  <CardTitle className="flex items-center text-base font-semibold capitalize">
                    <span
                      className={cn("d-inline me-2 size-2 rounded-full", {
                        "bg-gray-400": reminder.priority === "LOW",
                        "bg-orange-400": reminder.priority === "MEDIUM",
                        "bg-red-600": reminder.priority === "HIGH"
                      })}></span>{" "}
                    {getPriorityLevel(reminder.priority)}{" "}
                    {reminder.isCompleted ? (
                      <CircleCheck className="ms-auto me-2 size-4 text-green-600" />
                    ) : (
                      <CircleCheck className="ms-auto me-2 size-4 text-gray-400" />
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-muted-foreground text-sm">
                    {formatReminderDate(reminder.dueDate)}
                  </div>
                  <div className="text-sm">{reminder.note}</div>
                  {reminder.category && (
                    <Badge variant="outline">{reminder.category}</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {reminders.length > 0 && (
          <div className="mt-4 text-end">
            <Button variant="link" className="text-muted-foreground hover:text-primary" asChild>
              <a href="#">
                Show all reminders <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
