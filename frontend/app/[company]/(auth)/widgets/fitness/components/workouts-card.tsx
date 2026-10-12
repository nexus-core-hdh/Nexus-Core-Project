"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Plus, Check, Dumbbell, Flower2, Footprints, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fitnessApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { format } from "date-fns";
import { WorkoutDialog } from "./workout-dialog";

const getActivityIcon = (type: string) => {
  switch (type) {
    case "RUNNING":
      return Footprints;
    case "STRENGTH_TRAINING":
      return Dumbbell;
    case "YOGA":
      return Flower2;
    case "CYCLING":
      return Activity;
    default:
      return Check;
  }
};

const getStatusConfig = (status: string) => {
  switch (status) {
    case "COMPLETED":
      return {
        label: "Completed",
        statusColor: "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-200",
        iconBg: "bg-green-200 dark:text-green-200 dark:bg-green-950"
      };
    case "PLANNED":
      return {
        label: "Planned",
        statusColor: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200",
        iconBg: "bg-orange-100 dark:bg-orange-900 dark:text-orange-200"
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        statusColor: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200",
        iconBg: "bg-gray-100 dark:bg-gray-900"
      };
    case "SKIPPED":
      return {
        label: "Skipped",
        statusColor: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200",
        iconBg: "bg-red-100 dark:bg-red-900"
      };
    default:
      return {
        label: status,
        statusColor: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200",
        iconBg: "bg-purple-100 dark:bg-purple-900"
      };
  }
};

export function WorkoutsCard() {
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const user = getCurrentUser();

  const fetchWorkouts = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      const data = await fitnessApi.getTodayWorkouts(user.id);
      setWorkouts(data || []);
    } catch (error) {
      console.error("Failed to fetch workouts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkouts();
  }, [user?.id]);

  const handleAddWorkout = () => {
    setSelectedWorkout(null);
    setIsDialogOpen(true);
  };

  const handleEditWorkout = (workout: any) => {
    setSelectedWorkout(workout);
    setIsDialogOpen(true);
  };

  const handleWorkoutSaved = () => {
    setIsDialogOpen(false);
    setSelectedWorkout(null);
    fetchWorkouts();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Today&#39;s Workouts</CardTitle>
          <CardDescription>
            {loading ? "Loading..." : `${workouts.length} session${workouts.length !== 1 ? "s" : ""} planned`}
          </CardDescription>
          <CardAction>
            <Button variant="ghost" size="icon-sm" onClick={handleAddWorkout}>
              <Plus />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-center py-4 text-muted-foreground text-sm">Loading workouts...</div>
          ) : workouts.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">No workouts planned for today</div>
          ) : (
            workouts.map((workout) => {
              const Icon = getActivityIcon(workout.type);
              const statusConfig = getStatusConfig(workout.status);
              const workoutTime = new Date(workout.startTime);
              
              return (
                <div
                  key={workout.id}
                  onClick={() => handleEditWorkout(workout)}
                  className="bg-muted/50 flex items-center justify-between rounded-xl p-4 cursor-pointer hover:bg-muted transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`${statusConfig.iconBg} rounded-xl p-3`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">{workout.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {format(workoutTime, "h:mm a")} • {workout.duration ? `${workout.duration} min` : "N/A"}
                      </p>
                    </div>
                  </div>
                  <Badge className={`${statusConfig.statusColor} rounded-full px-3 py-1 text-xs font-medium`}>
                    {statusConfig.label}
                  </Badge>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <WorkoutDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        workout={selectedWorkout}
        onSaved={handleWorkoutSaved}
      />
    </>
  );
}
