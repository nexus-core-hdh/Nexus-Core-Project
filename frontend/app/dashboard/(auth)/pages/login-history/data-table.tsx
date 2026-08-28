"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MapPin, Monitor, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDateTime } from "@/lib/utils";
import { DataTable } from "@/components/shared/data-table/data-table";

export type LoginHistory = {
  id: number;
  userId: number;
  companyId?: number | null;
  branchId?: number | null;
  ipAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  timezone?: string | null;
  userAgent?: string | null;
  device?: string | null;
  browser?: string | null;
  os?: string | null;
  loginAt: string;
  user: {
    id: number;
    name: string;
    email: string;
    image: string;
  };
};

function generateAvatarFallback(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatLocation(history: LoginHistory): string {
  const parts: string[] = [];
  if (history.city) parts.push(history.city);
  if (history.region) parts.push(history.region);
  if (history.country) parts.push(history.country);
  return parts.length > 0 ? parts.join(", ") : "Unknown";
}

export const columns: ColumnDef<LoginHistory>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false
  },
  {
    accessorKey: "user",
    header: "User",
    cell: ({ row }) => {
      const user = row.original.user;
      return (
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={user.image} alt={user.name} />
            <AvatarFallback>{generateAvatarFallback(user.name)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{user.name}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "loginAt",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Login Time
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return <div className="font-medium">{formatDateTime(row.getValue("loginAt") as string)}</div>;
    },
  },
  {
    accessorKey: "location",
    header: "Location",
    cell: ({ row }) => {
      const location = formatLocation(row.original);
      return (
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span>{location}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "ipAddress",
    header: "IP Address",
    cell: ({ row }) => row.original.ipAddress || "N/A",
  },
  {
    accessorKey: "device",
    header: "Device",
    cell: ({ row }) => {
      const device = row.original.device || "Unknown";
      const os = row.original.os || "";
      return (
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="font-medium">{device}</div>
            {os && <div className="text-sm text-muted-foreground">{os}</div>}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "browser",
    header: "Browser",
    cell: ({ row }) => {
      const browser = row.original.browser || "Unknown";
      return (
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span>{browser}</span>
        </div>
      );
    },
  },
];

export default function LoginHistoryDataTable({ data }: { data: LoginHistory[] }) {
  // Column order/visibility/width/resize now come from the shared DataTable component (the
  // same useGridColumns-backed mechanism every legacy-erp grid uses) via storageKey "loginHistory".
  // No search box or "Columns" dropdown existed here before, so none is configured now either.
  return <DataTable columns={columns} data={data} storageKey="loginHistory" />;
}



















