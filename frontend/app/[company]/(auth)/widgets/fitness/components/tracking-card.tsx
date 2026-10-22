"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fitnessApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { format, formatDistanceToNow } from "date-fns";

export function TrackingCard() {
  const user = getCurrentUser();
  const [workouts, setWorkouts] = useState<any[]>([]);

  useEffect(() => {
    const fetchRecentWorkouts = async () => {
      if (!user?.id) return;
      
      try {
        // Get workouts from last 30 days
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const endDate = new Date();
        
        const data = await fitnessApi.getFitnessActivities({
          userId: user.id,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          status: "COMPLETED"
        });
        
        // Filter only workouts with distance
        const workoutsWithDistance = (data || []).filter((w: any) => w.distance && w.distance > 0);
        // Sort by date, most recent first, and take top 3
        workoutsWithDistance.sort((a: any, b: any) => 
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        );
        setWorkouts(workoutsWithDistance.slice(0, 3));
      } catch (error) {
        console.error("Failed to fetch workouts:", error);
      }
    };

    fetchRecentWorkouts();
  }, [user?.id]);

  const history = useMemo(() => {
    return workouts.map((workout) => {
      const workoutDate = new Date(workout.startTime);
      const daysAgo = Math.floor((Date.now() - workoutDate.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        label: daysAgo === 0 ? "Today" : daysAgo === 1 ? "1d ago" : `${daysAgo}d ago`,
        distance: `${workout.distance?.toFixed(2) || "0.00"}km`
      };
    });
  }, [workouts]);

  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle className="text-muted-foreground font-medium">Tracking Now</CardTitle>
        <CardAction>
          <div className="flex gap-2">
            <Button variant="outline" size="icon-sm" disabled>
              <Pause />
            </Button>
            <Button variant="outline" size="icon-sm" disabled>
              <Play />
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-bold tabular-nums">00:00:00</div>
        <p className="text-muted-foreground text-xs mt-2">No active session</p>
      </CardContent>
      <CardContent className="space-y-6 border-t">
        {history.length > 0 ? (
          <div className="grid grid-cols-3 gap-4 divide-x">
            {history.map((item, index) => (
              <div key={index} className="space-y-1 py-4">
                <p className="text-muted-foreground text-xs">{item.label}</p>
                <p className="font-semibold">{item.distance}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-4 text-center text-muted-foreground text-sm">
            No recent tracked workouts
          </div>
        )}
      </CardContent>
    </Card>
  );
}
