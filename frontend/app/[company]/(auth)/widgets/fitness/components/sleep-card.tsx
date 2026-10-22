"use client";

import { useState, useEffect } from "react";
import { Moon, Plus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { sleepApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { SleepDialog } from "./sleep-dialog";

export function SleepCard() {
  const user = getCurrentUser();
  const [sleep, setSleep] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const fetchTodaySleep = async () => {
    if (!user?.id) return;
    
    try {
      const data = await sleepApi.getTodaySleep(user.id);
      setSleep(data);
    } catch (error) {
      console.error("Failed to fetch sleep:", error);
    }
  };

  useEffect(() => {
    fetchTodaySleep();
  }, [user?.id]);

  const handleAddSleep = () => {
    setIsDialogOpen(true);
  };

  const handleSleepSaved = () => {
    setIsDialogOpen(false);
    fetchTodaySleep();
  };

  const sleepHours = sleep?.sleepHours || 0;
  const sleepMinutes = sleep?.sleepMinutes || 0;
  const quality = sleep?.quality || 0;

  // Format sleep time
  const formatSleepTime = () => {
    if (sleepHours === 0 && sleepMinutes === 0) {
      return "No data";
    }
    const totalMinutes = Math.round(sleepHours * 60) + sleepMinutes;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-muted-foreground text-sm font-medium">Sleep</CardTitle>
            <div className="flex items-center gap-2">
              <Moon className="h-4 w-4 text-purple-500" />
              <Button variant="ghost" size="icon-sm" onClick={handleAddSleep}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-3xl font-bold">{formatSleepTime()}</div>
        <div className="space-y-2">
          <Progress value={quality} className="h-2" indicatorColor="bg-purple-500" />
          <p className="text-muted-foreground text-xs">Quality: {quality}%</p>
        </div>
      </CardContent>
    </Card>

    <SleepDialog
      open={isDialogOpen}
      onOpenChange={setIsDialogOpen}
      sleep={sleep}
      onSaved={handleSleepSaved}
    />
    </>
  );
}
