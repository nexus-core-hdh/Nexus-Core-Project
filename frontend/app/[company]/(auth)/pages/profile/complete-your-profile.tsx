"use client";

import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usersApi, settingsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

export function CompleteYourProfileCard() {
  const [progressValue, setProgressValue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfileCompletion = async () => {
      try {
        const currentUser = getCurrentUser();
        if (currentUser?.id) {
          // Fetch both profile and settings data
          const [profile, settings] = await Promise.all([
            usersApi.getUserProfile(currentUser.id),
            settingsApi.getUserSettings(currentUser.id).catch(() => null)
          ]);
          
          // Calculate profile completion percentage
          let completion = 0;
          
          // Basic profile fields (50%)
          if (profile.name && profile.name.trim()) completion += 10;
          if (profile.email && profile.email.trim()) completion += 10;
          if (profile.phone && profile.phone.trim()) completion += 8;
          if ((profile.location && profile.location.trim()) || (profile.country && profile.country.trim())) completion += 7;
          if (profile.department && profile.department.trim() && profile.department !== 'No department') completion += 7;
          if (profile.role && profile.role.trim()) completion += 8;
          
          // Profile image/avatar (15%)
          // Check settings avatar first, then profile avatar
          const avatar = settings?.avatar || profile.avatar;
          if (avatar && avatar.trim() && !avatar.includes('/images/avatars/default.png')) {
            completion += 15;
          }
          
          // Profile settings (20%)
          if (settings?.username && settings.username.trim()) completion += 7;
          if (settings?.bio && settings.bio.trim()) completion += 8;
          if (settings?.profileUrls && settings.profileUrls.length > 0) completion += 5;
          
          // Activity/Engagement (15%)
          if (profile.teams > 0) completion += 5;
          if (profile.projects > 0) completion += 5;
          // Additional engagement can be calculated from activities or other metrics
          if ((profile.teams > 0 || profile.projects > 0)) completion += 5;
          
          setProgressValue(Math.min(completion, 100)); // Cap at 100%
        }
      } catch (error) {
        console.error('Failed to fetch profile completion:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfileCompletion();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Complete Your Profile</CardTitle>
          <CardDescription>Calculating your profile completion...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Progress value={0} />
          <div className="text-muted-foreground text-sm">%0</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete Your Profile</CardTitle>
        <CardDescription>
          {progressValue < 100 
            ? `You've completed ${progressValue}% of your profile. Add more information to reach 100%.`
            : "Congratulations! Your profile is complete."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <Progress value={progressValue} className="flex-1" />
        <div className="text-muted-foreground text-sm font-medium">{progressValue}%</div>
      </CardContent>
    </Card>
  );
}
