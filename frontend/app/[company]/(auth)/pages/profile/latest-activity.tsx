"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "@/components/app-link";
import { formatDistanceToNow } from "date-fns";
import { 
  BadgeCheckIcon, 
  BriefcaseBusinessIcon, 
  ClockIcon,
  UserIcon,
  FileIcon,
  MessageSquareIcon,
  ActivityIcon
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { activitiesApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

interface Activity {
  id: number;
  type: string;
  message: string;
  entityType?: string;
  entityId?: number;
  userId?: number;
  companyId?: number;
  company?: {
    id: number;
    name: string;
  };
  createdAt: string;
}

const getActivityIcon = (type: string): LucideIcon => {
  const typeLower = type.toLowerCase();
  if (typeLower.includes('created') || typeLower.includes('uploaded')) {
    return BriefcaseBusinessIcon;
  }
  if (typeLower.includes('assigned') || typeLower.includes('user')) {
    return UserIcon;
  }
  if (typeLower.includes('commented') || typeLower.includes('message') || typeLower.includes('sent')) {
    return MessageSquareIcon;
  }
  if (typeLower.includes('updated') || typeLower.includes('status') || typeLower.includes('completed')) {
    return BadgeCheckIcon;
  }
  if (typeLower.includes('file') || typeLower.includes('document')) {
    return FileIcon;
  }
  if (typeLower.includes('deleted') || typeLower.includes('removed')) {
    return ActivityIcon;
  }
  return BriefcaseBusinessIcon;
};

export function LatestActivity() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const user = getCurrentUser();
        if (!user?.id) {
          setLoading(false);
          return;
        }

        const data = await activitiesApi.getActivities({ userId: user.id });
        // Get latest 3 activities
        const latestActivities = (data || []).slice(0, 3);
        setActivities(latestActivities);
      } catch (error) {
        console.error("Failed to fetch activities:", error);
        setActivities([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Latest Activity</CardTitle>
          <CardAction>
            <Link
              href="/pages/profile?tab=activities"
              className="text-muted-foreground hover:text-primary text-sm hover:underline">
              View All
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="ps-6">
          <div className="text-muted-foreground text-center py-6 text-sm">Loading activities...</div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Latest Activity</CardTitle>
          <CardAction>
            <Link
              href="/pages/profile?tab=activities"
              className="text-muted-foreground hover:text-primary text-sm hover:underline">
              View All
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="ps-6">
          <div className="text-muted-foreground text-center py-6 text-sm">No recent activities</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest Activity</CardTitle>
        <CardAction>
          <Link
            href="/pages/profile?tab=activities"
            className="text-muted-foreground hover:text-primary text-sm hover:underline">
            View All
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="ps-6">
        <ol className="relative border-s">
          {activities.map((activity, index) => {
            const Icon = getActivityIcon(activity.type);
            const isLatest = index === 0;
            const isLast = index === activities.length - 1;

            return (
              <li key={activity.id} className={`ms-5 ${isLast ? '' : 'mb-6'} space-y-1`}>
                <span className="bg-muted absolute -start-2.5 flex h-5 w-5 items-center justify-center rounded-full border">
                  <Icon className="text-primary size-2.5" />
                </span>
                <h3 className={`flex items-center gap-2 text-sm font-semibold leading-tight ${isLatest ? '' : ''}`}>
                  <span className="line-clamp-2">{activity.message}</span>
                  {isLatest && (
                    <Badge variant="outline" className="ms-auto shrink-0 text-xs">
                      Latest
                    </Badge>
                  )}
                </h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ClockIcon className="size-3 shrink-0" />
                  <time className="leading-none">
                    {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                  </time>
                  {activity.company && (
                    <>
                      <span>•</span>
                      <span className="truncate">{activity.company.name}</span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
