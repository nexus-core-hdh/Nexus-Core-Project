"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fitnessApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { formatDistanceToNow } from "date-fns";

const getActivityDescription = (workout: any) => {
  if (workout.type === "RUNNING" && workout.distance) {
    return `Completed ${workout.distance.toFixed(1)}km run`;
  }
  if (workout.type === "STRENGTH_TRAINING") {
    return `Completed strength training`;
  }
  if (workout.type === "YOGA") {
    return `Completed yoga session`;
  }
  if (workout.type === "CYCLING" && workout.distance) {
    return `Completed ${workout.distance.toFixed(1)}km cycling`;
  }
  return `Completed ${workout.type?.toLowerCase().replace(/_/g, " ")}`;
};

export function FriendsCard() {
  const user = getCurrentUser();
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    const fetchCompanyActivities = async () => {
      if (!user?.companyId && !user?.branchId) return;
      
      try {
        // Get activities from users in the same company/branch (excluding current user)
        const params: any = {
          companyId: user.companyId,
          branchId: user.branchId,
          status: "COMPLETED"
        };

        // Get last 7 days of activities
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        params.startDate = startDate.toISOString();
        params.endDate = new Date().toISOString();

        const data = await fitnessApi.getFitnessActivities(params);
        
        // Filter out current user's activities and get unique users
        const otherUserActivities = (data || []).filter((a: any) => a.userId !== user.id);
        
        // Group by user and get most recent activity per user, limit to 3
        const userMap = new Map();
        otherUserActivities.forEach((activity: any) => {
          if (!userMap.has(activity.userId)) {
            userMap.set(activity.userId, activity);
          } else {
            const existing = userMap.get(activity.userId);
            if (new Date(activity.startTime) > new Date(existing.startTime)) {
              userMap.set(activity.userId, activity);
            }
          }
        });

        const recentActivities = Array.from(userMap.values())
          .sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
          .slice(0, 3);

        setActivities(recentActivities);
      } catch (error) {
        console.error("Failed to fetch company activities:", error);
      }
    };

    fetchCompanyActivities();
  }, [user?.id, user?.companyId, user?.branchId]);

  const friends = useMemo(() => {
    return activities.map((activity) => {
      const activityTime = new Date(activity.startTime);
      const timeAgo = formatDistanceToNow(activityTime, { addSuffix: true });
      
      return {
        name: activity.user?.name || "Unknown User",
        activity: getActivityDescription(activity),
        time: timeAgo.replace("about ", "").replace(" ago", ""),
        avatar: activity.user?.image || `/images/avatars/01.png`
      };
    });
  }, [activities]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Friends</CardTitle>
        <CardDescription>Recent activity</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {friends.length > 0 ? (
          friends.map((friend, index) => (
            <div key={index} className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={friend.avatar || "/placeholder.svg"} />
                <AvatarFallback>
                  {friend.name
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{friend.name}</p>
                <p className="text-muted-foreground truncate text-xs">{friend.activity}</p>
              </div>
              <span className="text-muted-foreground text-xs">{friend.time}</span>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No recent activities from team members
          </div>
        )}
      </CardContent>
    </Card>
  );
}
