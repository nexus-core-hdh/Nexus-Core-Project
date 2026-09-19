"use client";

import { BellIcon, ClockIcon } from "lucide-react";
import Link from "next/link";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEffect, useState } from "react";
import { notificationsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { formatDistanceToNow } from "date-fns";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actor?: {
    id: number;
    name: string;
    image: string;
  };
  post?: {
    id: number;
    content: string;
    image?: string;
  };
}

const Notifications = () => {
  const isMobile = useIsMobile();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (user?.id) {
      setUserId(user.id);
      // Only load if user is available
      loadNotifications(user.id).catch(() => {
        // Silently handle errors on initial load
      });
      loadUnreadCount(user.id).catch(() => {
        // Silently handle errors on initial load
      });
      
      // Refresh notifications every 30 seconds
      const interval = setInterval(() => {
        // Silently handle errors in interval - don't log them
        loadNotifications(user.id).catch(() => {
          // Network errors are already handled inside the functions
        });
        loadUnreadCount(user.id).catch(() => {
          // Network errors are already handled inside the functions
        });
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, []);

  const loadNotifications = async (userId: number): Promise<void> => {
    try {
      const data = await notificationsApi.getNotifications(userId);
      setNotifications(data || []);
      setLoading(false);
    } catch (error: any) {
      // Handle network errors and HTTP errors gracefully
      if (error?.isNetworkError) {
        // Silently handle network errors (server not reachable, CORS, etc.)
        setNotifications([]);
      } else if (error?.status === 404 || error?.status === 401) {
        // 404: the route might not be set up yet. 401: this is a background poller (see the
        // setInterval above) — the session token can legitimately expire/become invalid while a
        // tab is left open between polls, which is an expected, recoverable condition here, not a
        // bug to alarm the console about. Either way, just show an empty list.
        setNotifications([]);
      } else {
        // Only log unexpected errors
        console.error("Failed to load notifications:", error);
        setNotifications([]);
      }
      setLoading(false);
    }
  };

  const loadUnreadCount = async (userId: number): Promise<void> => {
    try {
      const data = await notificationsApi.getUnreadCount(userId);
      setUnreadCount(data?.count || 0);
    } catch (error: any) {
      // Handle network errors and HTTP errors gracefully
      if (error?.isNetworkError || error?.status === 404 || error?.status === 500 || error?.status === 401) {
        // Silently handle network errors, 404 (endpoint not found), server errors, or 401 (an
        // expired/invalid session token during this background poll — see loadNotifications'
        // own comment on why that's expected here, not an error worth logging).
        // Just set count to 0 and don't log to avoid console spam
        setUnreadCount(0);
      } else {
        // Only log unexpected errors
        console.error("Failed to load unread count:", error);
        setUnreadCount(0);
      }
    }
  };

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await notificationsApi.markAsRead(notificationId);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
      if (unreadCount > 0) {
        setUnreadCount(prev => prev - 1);
      }
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!userId) return;
    try {
      await notificationsApi.markAllAsRead(userId);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="relative" suppressHydrationWarning>
          <BellIcon className="animate-tada" />
          {unreadCount > 0 && (
            <span className="bg-destructive absolute end-0 top-0 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={isMobile ? "center" : "end"} className="ms-4 w-80 p-0">
        <DropdownMenuLabel className="bg-background dark:bg-muted sticky top-0 z-10 p-0">
          <div className="flex justify-between border-b px-6 py-4">
            <div className="font-medium">Notifications</div>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <Button 
                  variant="link" 
                  className="h-auto p-0 text-xs" 
                  size="sm"
                  onClick={handleMarkAllAsRead}
                >
                  Mark all read
                </Button>
              )}
              <Button variant="link" className="h-auto p-0 text-xs" size="sm" asChild>
                <Link href="/dashboard/collaboration/feed">View all</Link>
              </Button>
            </div>
          </div>
        </DropdownMenuLabel>

        <ScrollArea className="h-[350px]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground text-sm">Loading notifications...</div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground text-sm">No notifications</div>
            </div>
          ) : (
            notifications.map((item) => (
              <DropdownMenuItem
                key={item.id}
                className={`group flex cursor-pointer items-start gap-3 rounded-none border-b px-4 py-3 ${
                  !item.isRead ? 'bg-muted/50' : ''
                }`}
                onClick={() => {
                  if (!item.isRead) {
                    handleMarkAsRead(item.id);
                  }
                  if (item.post) {
                    window.location.href = `/dashboard/collaboration/feed#post-${item.post.id}`;
                  } else if (item.type === 'CALENDAR_EVENT_STARTING') {
                    // Navigate to calendar when clicking on calendar event notification
                    window.location.href = `/dashboard/apps/calendar`;
                  }
                }}
              >
                <div className="flex flex-1 items-start gap-2">
                  <div className="flex-none">
                    <Avatar className="size-8">
                      <AvatarImage src={item.actor?.image || `/images/avatars/01.png`} />
                      <AvatarFallback>
                        {item.type === 'CALENDAR_EVENT_STARTING' ? '📅' : (item.actor?.name?.charAt(0) || item.title.charAt(0))}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="dark:group-hover:text-default-800 truncate text-sm font-medium">
                      {item.title}
                    </div>
                    <div className="dark:group-hover:text-default-700 text-muted-foreground line-clamp-2 text-xs">
                      {item.message}
                    </div>
                    <div className="dark:group-hover:text-default-500 text-muted-foreground flex items-center gap-1 text-xs">
                      <ClockIcon className="size-3" />
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>
                {!item.isRead && (
                  <div className="flex-0">
                    <span className="bg-destructive/80 block size-2 rounded-full border" />
                  </div>
                )}
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Notifications;
