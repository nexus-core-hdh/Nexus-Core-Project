"use client";

import { useState, useEffect, useMemo } from "react";
import { Navigation, ArrowRight } from "lucide-react";
import { isSameDay } from "date-fns";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { fitnessApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export function DistanceCard() {
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

  const todayDistance = useMemo(() => {
    const today = new Date();
    const todayWorkouts = workouts.filter((w) => 
      isSameDay(new Date(w.startTime), today) && w.distance
    );
    
    return todayWorkouts.reduce((sum, w) => sum + (w.distance || 0), 0);
  }, [workouts]);

  const mostCommonType = useMemo(() => {
    const today = new Date();
    const todayWorkouts = workouts.filter((w) => 
      isSameDay(new Date(w.startTime), today)
    );
    
    if (todayWorkouts.length === 0) return "Running";
    
    const typeCounts: Record<string, number> = {};
    todayWorkouts.forEach((w) => {
      typeCounts[w.type] = (typeCounts[w.type] || 0) + 1;
    });
    
    return Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Running";
  }, [workouts]);

  const getTypeLabel = (type: string) => {
    return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-medium">Distance</CardTitle>
        <CardAction>
          <Navigation className="size-4 text-blue-500" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold lg:text-4xl">{todayDistance.toFixed(2)}</span>
            <span className="text-muted-foreground text-sm">KM</span>
          </div>
        </div>
        {workouts.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex -space-x-2">
              <Avatar className="border-card h-7 w-7 border-2">
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
            </div>
            <Badge className="bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-medium">
              {getTypeLabel(mostCommonType)} <ArrowRight className="ml-1 inline h-3 w-3" />
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
