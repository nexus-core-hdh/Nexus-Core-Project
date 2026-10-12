"use client";

import { useEffect, useState } from "react";
import { Link2Icon, Mail, MapPin, PhoneCall } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usersApi, settingsApi, feedApi } from "@/lib/api";
import { getCurrentUser, getFirstLetter } from "@/lib/auth";

interface ProfileData {
  name: string;
  email: string;
  phone: string;
  location: string;
  avatar: string;
  role: string;
  projects: number;
  teams: number;
  posts: number;
}

export function ProfileCard() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const currentUser = getCurrentUser();
        if (currentUser?.id) {
          // Fetch profile, settings, and feed posts in parallel
          const [profileData, settings, feedPosts] = await Promise.all([
            usersApi.getUserProfile(currentUser.id),
            settingsApi.getUserSettings(currentUser.id).catch(() => null),
            feedApi.getFeedPosts(undefined, undefined, currentUser.id).catch(() => [])
          ]);

          // Get avatar from settings first, then profile
          let avatarUrl = settings?.avatar || profileData.avatar || null;
          
          // Construct full URL if avatar path is relative
          if (avatarUrl && !avatarUrl.startsWith('http')) {
            if (avatarUrl.startsWith('files/')) {
              avatarUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/${avatarUrl}`;
            } else if (!avatarUrl.includes('/images/avatars/')) {
              avatarUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/files/${avatarUrl}`;
            } else {
              avatarUrl = avatarUrl; // Keep as is if it's already a relative path like /images/avatars/default.png
            }
          }

          setProfile({
            name: profileData.name || '',
            email: profileData.email || '',
            phone: profileData.phone || '',
            location: profileData.location || profileData.country || '',
            avatar: avatarUrl || '',
            role: profileData.role || '',
            projects: profileData.projects || 0,
            teams: profileData.teams || 0,
            posts: Array.isArray(feedPosts) ? feedPosts.length : 0,
          });
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading || !profile) {
    return null; // Return null to maintain UI structure, or show loading state
  }
  return (
    <Card className="relative">
      <CardContent>
        <div className="space-y-12">
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="size-20">
              {profile.avatar && <AvatarImage src={profile.avatar} alt={profile.name} />}
              <AvatarFallback>{getFirstLetter(profile.name)}</AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h5 className="flex items-center gap-2 text-xl font-semibold">
                {profile.name} <Badge variant="info">Pro</Badge>
              </h5>
              <div className="text-muted-foreground text-sm">{profile.role || 'User'}</div>
            </div>
          </div>
          <div className="bg-muted grid grid-cols-3 divide-x rounded-md border text-center *:py-3">
            <div>
              <h5 className="text-lg font-semibold">{profile.posts}</h5>
              <div className="text-muted-foreground text-sm">Post</div>
            </div>
            <div>
              <h5 className="text-lg font-semibold">{profile.projects}</h5>
              <div className="text-muted-foreground text-sm">Projects</div>
            </div>
            <div>
              <h5 className="text-lg font-semibold">{profile.teams}</h5>
              <div className="text-muted-foreground text-sm">Teams</div>
            </div>
          </div>
          <div className="flex flex-col gap-y-4">
            {profile.email && (
              <div className="flex items-center gap-3 text-sm">
                <Mail className="text-muted-foreground size-4" /> {profile.email}
              </div>
            )}
            {profile.phone && (
              <div className="flex items-center gap-3 text-sm">
                <PhoneCall className="text-muted-foreground size-4" /> {profile.phone}
              </div>
            )}
            {profile.location && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="text-muted-foreground size-4" />
                {profile.location}
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <Link2Icon className="text-muted-foreground size-4" />
              <a
                href="https://shadcnuikit.com"
                className="hover:text-primary hover:underline"
                target="_blank">
                https://shadcnuikit.com
              </a>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Link2Icon className="text-muted-foreground size-4" />
              <a
                href="https://bundui.io/"
                className="hover:text-primary hover:underline"
                target="_blank">
                https://bundui.io/
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
