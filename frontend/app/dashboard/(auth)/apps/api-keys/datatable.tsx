"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  ChevronDown,
  Copy,
  Download,
  Mail,
  MoreHorizontal,
  Tag,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import CreateApiKeyDialog from "./create-api-key-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";
import { DataTable } from "@/components/shared/data-table/data-table";

interface ApiKey {
  id: number;
  name: string;
  api_key: string;
  created_at: string;
  expired_at: string;
  status: "active" | "inactive" | "expired";
}

export const columns: ColumnDef<ApiKey>[] = [
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
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => row.getValue("name")
  },
  {
    accessorKey: "api_key",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Api Key
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const apiKey = row.original.api_key;
      return (
        <div className="flex items-center space-x-2">
          <span className="font-mono">
            {apiKey.slice(0, 8)}...{apiKey.slice(-4)}
          </span>
          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(apiKey)}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      );
    }
  },
  {
    accessorKey: "created_at",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Created At
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => formatDateTime(row.getValue("created_at") as string)
  },
  {
    accessorKey: "expired_at",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Updated At
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => formatDateTime(row.getValue("expired_at") as string)
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status;

      const statusMap = {
        active: "success",
        inactive: "destructive",
        expired: "warning"
      } as const;

      const statusClass = statusMap[status] ?? "default";

      return (
        <Badge variant={statusClass} className="capitalize">
          {status.replace("-", " ")}
        </Badge>
      );
    }
  },
  {
    id: "actions",
    enableHiding: false,
    cell: () => {
      return (
        <div className="text-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem>Rename</DropdownMenuItem>
                <DropdownMenuItem>Regenerate Key</DropdownMenuItem>
                <DropdownMenuItem>Enable</DropdownMenuItem>
                <DropdownMenuItem>Revoke</DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }
  }
];

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.success("Copied to clipboard");
};

export default function ApiKeysDataTable({ data }: { data: ApiKey[] }) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        data={data}
        storageKey="apiKeys"
        searchColumn="name"
        searchPlaceholder="Filter api keys..."
        toolbarExtra={(table) => {
          const selectedRowsCount = Object.keys(table.getState().rowSelection).length;
          return (
            <>
              {selectedRowsCount > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      Actions{" "}
                      <Badge variant="outline">
                        {selectedRowsCount} <span className="hidden lg:inline">selected</span>
                      </Badge>
                      <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>
                      <Download />
                      Export
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Mail />
                      Email customers
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Tag />
                      Tag payments
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600!">
                      <Trash2 className="text-red-600!" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <CreateApiKeyDialog />
            </>
          );
        }}
      />
    </div>
  );
}
