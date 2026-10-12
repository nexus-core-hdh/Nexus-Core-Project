"use client";

import { useState, useEffect, useMemo } from "react";
import { MoreHorizontal, Footprints, Flame, Droplet, Sparkles } from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from "date-fns";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { fitnessApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export function DailyActivityCard() {
  const user = getCurrentUser();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Memoize week calculations for display
  const weekStart = useMemo(() => startOfWeek(selectedDate), [selectedDate]);
  const weekEnd = useMemo(() => endOfWeek(selectedDate), [selectedDate]);
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  // Fetch workouts for the selected week
  useEffect(() => {
    const fetchWorkouts = async () => {
      if (!user?.id) return;
      
      try {
        setLoading(true);
        // Calculate dates inside useEffect to avoid dependency issues
        const weekStartDate = startOfWeek(selectedDate);
        const weekEndDate = endOfWeek(selectedDate);
        const startDate = weekStartDate.toISOString();
        const endDate = weekEndDate.toISOString();
        const data = await fitnessApi.getFitnessActivities({
          userId: user.id,
          startDate,
          endDate,
        });
        setWorkouts(data || []);
      } catch (error) {
        console.error("Failed to fetch workouts:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkouts();
  }, [user?.id, selectedDate.getTime()]);

  // Calculate activities for selected date
  const activities = useMemo(() => {
    const selectedWorkouts = workouts.filter((w) =>
      isSameDay(new Date(w.startTime), selectedDate)
    );

    // Calculate totals
    const totalSteps = selectedWorkouts
      .filter((w) => w.type === "WALKING" || w.type === "RUNNING")
      .reduce((sum, w) => sum + (w.distance || 0) * 1300, 0); // Approximate steps from distance

    const totalCalories = selectedWorkouts.reduce((sum, w) => sum + (w.calories || 0), 0);
    const totalDistance = selectedWorkouts.reduce((sum, w) => sum + (w.distance || 0), 0);
    const meditationMinutes = selectedWorkouts
      .filter((w) => w.type === "YOGA" || w.type === "PILATES")
      .reduce((sum, w) => sum + (w.duration || 0), 0);

    return [
      {
        icon: Footprints,
        label: "Steps",
        current: Math.round(totalSteps),
        target: 10000,
        status: totalSteps >= 10000 ? "Completed" : "In Progress",
        percentage: Math.min(100, Math.round((totalSteps / 10000) * 100)),
        color: "bg-orange-500",
        bgColor: "bg-orange-100 dark:bg-orange-950"
      },
      {
        icon: Flame,
        label: "Calories",
        current: totalCalories,
        target: 1680,
        status: totalCalories >= 1680 ? "Completed" : "In Progress",
        percentage: Math.min(100, Math.round((totalCalories / 1680) * 100)),
        color: "bg-pink-500",
        bgColor: "bg-pink-100  dark:bg-pink-950"
      },
      {
        icon: Droplet,
        label: "Distance",
        current: totalDistance.toFixed(1),
        target: 5,
        unit: "km",
        status: totalDistance >= 5 ? "Completed" : "In Progress",
        percentage: Math.min(100, Math.round((totalDistance / 5) * 100)),
        color: "bg-blue-500",
        bgColor: "bg-blue-100  dark:bg-blue-950"
      },
      {
        icon: Sparkles,
        label: "Meditation",
        current: meditationMinutes,
        target: 15,
        unit: "min",
        status: meditationMinutes >= 15 ? "Completed" : "In Progress",
        percentage: Math.min(100, Math.round((meditationMinutes / 15) * 100)),
        color: "bg-purple-500",
        bgColor: "bg-purple-100  dark:bg-purple-950"
      }
    ];
  }, [workouts, selectedDate]);

  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle className="text-xl">Daily Activity</CardTitle>
        <CardDescription>
          {format(weekStart, "MMM d")} — {format(weekEnd, "MMM d")}
        </CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-24">
              <DropdownMenuGroup>
                <DropdownMenuItem>Close</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          {weekDays.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const dayWorkouts = workouts.filter((w) => isSameDay(new Date(w.startTime), day));
            
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-3 transition-colors ${
                  isSelected ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-secondary/80"
                }`}>
                <span className="text-xs font-medium">{format(day, "EEE")}</span>
                <span className="text-sm font-semibold">{format(day, "d")}</span>
                {dayWorkouts.length > 0 && (
                  <span className="text-[10px] opacity-70">{dayWorkouts.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
      <div className="divide-y border-t">
        {activities.map((activity) => (
          <div key={activity.label} className={`p-4 px-6`}>
            <div className="mb-2 flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`${activity.bgColor} rounded-xl p-2`}>
                  <activity.icon className="text-muted-foreground size-4" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium">{activity.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {activity.current} / {activity.target} {activity.unit || ""}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground mb-2 text-xs">{activity.status}</p>
                <p className="text-muted-foreground text-sm">{activity.percentage}%</p>
              </div>
            </div>
            <Progress value={activity.percentage} indicatorColor={activity.color} />
          </div>
        ))}
      </div>
    </Card>
  );
}
