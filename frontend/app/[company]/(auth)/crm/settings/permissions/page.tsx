"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";
import { useRouter } from "@/lib/app-navigation";
import {
  Users,
  Shield,
  Lock,
  Eye,
  UserCheck,
  Settings,
  MessageSquare
} from "lucide-react";

const permissionItems = [
  {
    id: "user-roles",
    title: "User Roles",
    icon: Users,
    href: "/pages/user-roles"
  },
  {
    id: "access-control",
    title: "Access Control",
    icon: Shield,
    href: "/pages/access-control"
  },
  {
    id: "security",
    title: "Security",
    icon: Lock,
    href: "/pages/security"
  },
  {
    id: "visibility",
    title: "Visibility",
    icon: Eye,
    href: "#"
  },
  {
    id: "user-management",
    title: "User Management",
    icon: UserCheck,
    href: "#"
  },
  {
    id: "permission-settings",
    title: "Permission Settings",
    icon: Settings,
    href: "/pages/permission-settings"
  },
  {
    id: "chat-access",
    title: "Chat Access",
    icon: MessageSquare,
    href: "/crm/settings/permissions/chat-access"
  }
];

export default function PermissionsPage() {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const router = useRouter();

  const handleItemClick = (item: typeof permissionItems[0]) => {
    if (item.href && item.href !== "#") {
      router.push(item.href);
    } else {
      setSelectedItem(item.id);
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 w-full">
      {permissionItems.map((item) => {
        const Icon = item.icon;
        const isSelected = selectedItem === item.id;
        
        return (
          <button
            key={item.id}
            type="button"
            className={cn(
              "group relative flex flex-col items-center justify-center p-6 aspect-square w-full",
              "border-2 rounded-lg transition-all cursor-pointer",
              "bg-background hover:bg-muted/50",
              isSelected 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-primary/50"
            )}
            onClick={() => handleItemClick(item)}
          >
            <div className={cn(
              "mb-4 flex items-center justify-center",
              "h-16 w-16 rounded-lg",
              isSelected ? "bg-primary/10" : "bg-muted"
            )}>
              <Icon className={cn(
                "h-8 w-8",
                isSelected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )} />
            </div>
            <p className={cn(
              "text-xs sm:text-sm text-center font-medium leading-tight px-2",
              isSelected ? "text-primary" : "text-foreground"
            )}>
              {item.title}
            </p>
          </button>
        );
      })}
    </div>
  );
}

