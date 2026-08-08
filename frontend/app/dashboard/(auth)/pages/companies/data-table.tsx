"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table";
import { ArrowUpDown, Columns, MoreHorizontal, Copy, Check } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { settingsApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { useCallback, useEffect } from "react";

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
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [isLoadingPreferences, setIsLoadingPreferences] = React.useState(true);

  // Load column visibility preferences from database
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const user = getCurrentUser();
        if (!user?.id) return;

        const settings = await settingsApi.getUserSettings(user.id);
        if (settings?.tablePreferences?.companies) {
          setColumnVisibility(settings.tablePreferences.companies);
        }
      } catch (error) {
        console.error('Failed to load column preferences:', error);
      } finally {
        setIsLoadingPreferences(false);
      }
    };

    loadPreferences();
  }, []);

  // Save column visibility preferences to database when they change (debounced)
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleColumnVisibilityChange = useCallback((updater: any) => {
    setColumnVisibility((prev) => {
      const newVisibility = typeof updater === 'function' ? updater(prev) : updater;
      
      // Clear previous timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce save by 500ms
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const user = getCurrentUser();
          if (!user?.id) return;

          await settingsApi.updateTablePreferences(user.id, 'companies', newVisibility);
        } catch (error) {
          console.error('Failed to save column preferences:', error);
        }
      }, 500);
      
      return newVisibility;
    });
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection
    }
  });

  return (
    <div className="w-full">
      <div className="flex items-center gap-4 py-4">
        <Input
          placeholder="Search companies..."
          value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
          onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
          className="max-w-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              <Columns /> <span className="hidden md:inline">Columns</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(value)}>
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className="px-6 py-4 whitespace-nowrap">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-6 py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 pt-4">
        <div className="text-muted-foreground flex-1 text-sm">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}