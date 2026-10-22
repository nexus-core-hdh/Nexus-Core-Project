"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal, Copy, Check } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateTime } from "@/lib/utils";
import { DataTable } from "@/components/shared/data-table/data-table";

export type Company = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  industry?: string | null;
  slug?: string | null;
  plan?: string;
  subscriptionStatus?: string;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  billingCycle?: string;
  insertedBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export const columns: ColumnDef<Company>[] = [
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
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => <div className="capitalize">{row.getValue("name")}</div>,
    minSize: 150,
    size: 180
  },
  {
    accessorKey: "email",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Email
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => row.getValue("email"),
    minSize: 200,
    size: 220
  },
  {
    accessorKey: "phone",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Phone
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => row.getValue("phone") || "N/A",
    minSize: 140,
    size: 160
  },
  {
    accessorKey: "address",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Address
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => row.getValue("address") || "N/A",
    minSize: 200,
    size: 240
  },
  {
    accessorKey: "industry",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Industry
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => row.getValue("industry") || "N/A",
    minSize: 140,
    size: 160
  },
  {
    accessorKey: "website",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Website
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => {
      const website = row.getValue("website") as string;
      return website ? (
        <a href={website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          {website}
        </a>
      ) : (
        "N/A"
      );
    },
    minSize: 180,
    size: 200
  },
  {
    accessorKey: "plan",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Plan
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => {
      const plan = row.getValue("plan") as string;
      return plan ? <span className="capitalize">{plan}</span> : "Free";
    },
    minSize: 100,
    size: 120
  },
  {
    accessorKey: "subscriptionStatus",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Status
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => {
      const status = row.getValue("subscriptionStatus") as string;
      return status ? <span className="capitalize">{status}</span> : "Active";
    },
    minSize: 120,
    size: 140
  },
  {
    accessorKey: "billingCycle",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Billing Cycle
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => row.getValue("billingCycle") || "N/A",
    minSize: 130,
    size: 150
  },
  {
    accessorKey: "subscriptionStartDate",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Start Date
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => {
      const date = row.getValue("subscriptionStartDate") as string;
      return date ? formatDateTime(date) : "N/A";
    },
    minSize: 130,
    size: 150
  },
  {
    accessorKey: "subscriptionEndDate",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          End Date
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => {
      const date = row.getValue("subscriptionEndDate") as string;
      return date ? formatDateTime(date) : "N/A";
    },
    minSize: 130,
    size: 150
  },
  {
    accessorKey: "slug",
    header: "Company URL",
    cell: ({ row }) => {
      const slug = row.getValue("slug") as string;
      const [copied, setCopied] = React.useState(false);
      const url = typeof window !== 'undefined' ? `${window.location.origin}/${slug}` : `/${slug}`;
      
      const handleCopy = async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      };
      
      return (
        <div className="flex items-center gap-2">
          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{slug}</code>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCopy}
            title="Copy URL">
            {copied ? (
              <Check className="h-3 w-3 text-green-600" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            <span className="sr-only">Copy URL</span>
          </Button>
        </div>
      );
    },
    minSize: 180,
    size: 200
  },
  {
    accessorKey: "insertedBy",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Inserted By
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => {
      const insertedBy = row.getValue("insertedBy") as string;
      return insertedBy || "N/A";
    },
    minSize: 130,
    size: 150
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Created At
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => {
      const date = row.getValue("createdAt") as string;
      return date ? formatDateTime(date) : "N/A";
    },
    minSize: 130,
    size: 150
  },
  {
    accessorKey: "updatedBy",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Updated By
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => {
      const updatedBy = row.getValue("updatedBy") as string;
      return updatedBy || "N/A";
    },
    minSize: 130,
    size: 150
  },
  {
    accessorKey: "updatedAt",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Updated At
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => {
      const date = row.getValue("updatedAt") as string;
      return date ? formatDateTime(date) : "N/A";
    },
    minSize: 130,
    size: 150
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>View company</DropdownMenuItem>
            <DropdownMenuItem>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
  }
];

export default function CompaniesDataTable({ data }: { data: Company[] }) {
  // Column order/visibility/width/resize now come from the shared DataTable component (the
  // same useGridColumns-backed mechanism every legacy-erp grid uses) via storageKey "companies".
  // The previous inline column-visibility persistence here called settingsApi.updateTablePreferences,
  // which hits a backend route that was never actually implemented (PUT /settings/:userId/table-
  // preferences 404s) — every save silently failed, so there was no real saved layout to migrate.
  return (
    <DataTable
      columns={columns}
      data={data}
      storageKey="companies"
      searchColumn="name"
      searchPlaceholder="Search companies..."
    />
  );
}