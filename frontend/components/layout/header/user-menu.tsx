"use client";

import { BadgeCheck, Bell, ChevronRightIcon, CreditCard, LogOut, Sparkles } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import Link from "@/components/app-link";
import * as React from "react";
import { Progress } from "@/components/ui/progress";
import { getCurrentUser, getFirstLetter, logout, type User } from "@/lib/auth";
import { usersApi, settingsApi } from "@/lib/api";

export default function UserMenu() {
  const [user, setUser] = React.useState<User | null>(null);
  const [userImage, setUserImage] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);
  
  React.useEffect(() => {
    // Only get user data on client side to avoid hydration mismatch
    setMounted(true);
    const currentUser = getCurrentUser();
    setUser(currentUser);
    
    // Fetch profile image from settings/profile
    const fetchUserImage = async () => {
      if (currentUser?.id) {
        try {
          // Try to get image from user settings first
          const settings = await settingsApi.getUserSettings(currentUser.id);
          if (settings?.avatar) {
            // Construct full URL if path is relative
            const avatarUrl = settings.avatar.startsWith('http') 
              ? settings.avatar 
              : settings.avatar.startsWith('files/')
              ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/${settings.avatar}`
              : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/files/${settings.avatar}`;
            setUserImage(avatarUrl);
            return; // Successfully set image, no need to check profile
          }
        } catch (error) {
          console.error('Failed to fetch user settings:', error);
          // Continue to try user profile as fallback
        }

        // Fallback to user profile image if settings fetch failed or no avatar in settings
        try {
          const profile = await usersApi.getUserProfile(currentUser.id);
          if (profile?.image) {
            const avatarUrl = profile.image.startsWith('http')
              ? profile.image
              : profile.image.startsWith('files/')
              ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/${profile.image}`
              : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/files/${profile.image}`;
            setUserImage(avatarUrl);
          }
        } catch (error) {
          console.error('Failed to fetch user profile:', error);
          // If both fail, user.image from localStorage will be used as fallback
        }
      }
    };
    
    fetchUserImage();
  }, []);
  
  const displayImage = userImage || user?.image || null;
  const userName = user?.name || "User";
  const userEmail = user?.email || "";
  const avatarFallback = mounted ? getFirstLetter(userName) : "U";

  const handleLogout = () => {
    logout();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar suppressHydrationWarning>
          {displayImage && <AvatarImage src={displayImage} alt={userName} />}
          <AvatarFallback className="rounded-lg">{avatarFallback}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-60" align="end">
        <DropdownMenuLabel className="p-0">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar>
              {displayImage && <AvatarImage src={displayImage} alt={userName} />}
              <AvatarFallback className="rounded-lg">{avatarFallback}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{userName}</span>
              <span className="text-muted-foreground truncate text-xs">{userEmail}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/pages/pricing/column">
              <Sparkles /> Upgrade to Pro
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/pages/profile">
              <BadgeCheck />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/pages/settings/billing">
              <CreditCard />
              Billing
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Bell />
            Notifications
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
