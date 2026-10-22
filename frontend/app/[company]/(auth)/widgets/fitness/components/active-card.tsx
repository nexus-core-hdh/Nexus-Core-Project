"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { fitnessApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { isSameDay } from "date-fns";

export function ActiveCard() {
  const user = getCurrentUser();
  const [workouts, setWorkouts] = useState<any[]>([]);

  useEffect(() => {
    const fetchTodayWorkouts = async () => {
      if (!user?.id) return;
      
      try {
        const data = await fitnessApi.getTodayWorkouts(user.id);
        setWorkouts(data || []);
      } catch (error) {
        console.error("Failed to fetch workouts:", error);
      }
    };

    fetchTodayWorkouts();
  }, [user?.id]);

  const activeMinutes = useMemo(() => {
    const today = new Date();
    const todayWorkouts = workouts.filter((w) => 
      isSameDay(new Date(w.startTime), today) && 
      w.status === "COMPLETED" && 
      w.duration
    );
    
    return todayWorkouts.reduce((sum, w) => sum + (w.duration || 0), 0);
  }, [workouts]);

  const goalMinutes = 60;
  const percentage = Math.min(100, Math.round((activeMinutes / goalMinutes) * 100));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-muted-foreground text-sm font-medium">Active</CardTitle>
          <Zap className="h-4 w-4 text-yellow-500" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold">{activeMinutes}</span>
          <span className="text-muted-foreground text-sm">min</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Progress value={percentage} className="h-2 flex-1" indicatorColor="bg-yellow-500" />
            <span className="text-muted-foreground text-xs">{percentage}%</span>
          </div>
          <p className="text-muted-foreground text-xs">Goal: {goalMinutes} min</p>
        </div>
      </CardContent>
    </Card>
  );
}
