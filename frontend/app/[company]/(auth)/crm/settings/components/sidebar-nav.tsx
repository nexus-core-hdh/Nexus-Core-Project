"use client";

import Link from "@/components/app-link";
import { cn } from "@/lib/utils";
import { usePathname } from "@/lib/app-navigation";
import {
  Play,
  FileText,
  CreditCard,
  Shield,
  Zap,
  Mail,
  Plug,
  Store,
  Hash,
  MoreHorizontal
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const sidebarNavItems = [
  {
    title: "Start Point",
    href: "/crm/settings",
    icon: Play
  },
  {
    title: "Form and Report Settings",
    href: "/crm/settings/form-report",
    icon: FileText
  },
  {
    title: "Payment Options",
    href: "/crm/settings/payment",
    icon: CreditCard
  },
  {
    title: "Permissions",
    href: "/crm/settings/permissions",
    icon: Shield
  },
  {
    title: "Automation",
    href: "/crm/settings/automation",
    icon: Zap
  },
  {
    title: "Email",
    href: "/crm/settings/email",
    icon: Mail
  },
  {
    title: "Integration",
    href: "/crm/settings/integration",
    icon: Plug
  },
  {
    title: "Market",
    href: "/crm/settings/market",
    icon: Store
  },
  {
    title: "Auto Numbering Template",
    href: "/crm/settings/auto-numbering",
    icon: Hash
  },
  {
    title: "Other",
    href: "/crm/settings/other",
    icon: MoreHorizontal
  }
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <Card className="py-0">
      <CardContent className="p-2">
        <nav className="flex flex-col space-y-0.5 space-x-2 lg:space-x-0">
          {sidebarNavItems.map((item) => (
            <Button
              key={item.href}
              variant="ghost"
              className={cn(
                "hover:bg-muted justify-start",
                pathname === item.href ? "bg-muted hover:bg-muted" : ""
              )}
              asChild>
              <Link href={item.href}>
                {item.icon && <item.icon className="mr-2 h-4 w-4" />}
                {item.title}
              </Link>
            </Button>
          ))}
        </nav>
      </CardContent>
    </Card>
  );
}

