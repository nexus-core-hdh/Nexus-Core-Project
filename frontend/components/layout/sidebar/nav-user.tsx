"use client";

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
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from "@/components/ui/sidebar";
import { BellIcon, CreditCardIcon, LogOutIcon, UserCircle2Icon } from "lucide-react";
import { DotsVerticalIcon } from "@radix-ui/react-icons";
import * as React from "react";
import { getCurrentUser, getFirstLetter, logout, type User } from "@/lib/auth";
import { usersApi, settingsApi } from "@/lib/api";

export function NavUser() {
  const { isMobile } = useSidebar();
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
          } else {
            // Fallback to user profile image
            const profile = await usersApi.getUserProfile(currentUser.id);
            if (profile?.avatar) {
              const avatarUrl = profile.avatar.startsWith('http')
                ? profile.avatar
                : profile.avatar.startsWith('files/')
                ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/${profile.avatar}`
                : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/files/${profile.avatar}`;
              setUserImage(avatarUrl);
            }
          }
        } catch (error) {
          console.error('Failed to fetch user image:', error);
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
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              suppressHydrationWarning
              className="hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar className="rounded-full ring-1 ring-sidebar-border">
                {displayImage && <AvatarImage src={displayImage} alt={userName} />}
                <AvatarFallback className="rounded-lg">{avatarFallback}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium text-sidebar-foreground">{userName}</span>
                <span className="truncate text-xs text-sidebar-foreground/50">{userEmail}</span>
              </div>
              <DotsVerticalIcon className="text-sidebar-foreground/40 ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  {displayImage && <AvatarImage src={displayImage} alt={userName} />}
                  <AvatarFallback className="rounded-lg">{avatarFallback}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{userName}</span>
                  <span className="text-muted-foreground truncate text-xs">{userEmail}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <UserCircle2Icon />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CreditCardIcon />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem>
                <BellIcon />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
