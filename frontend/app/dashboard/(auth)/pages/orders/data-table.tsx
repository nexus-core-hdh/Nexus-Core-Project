"use client";

import * as React from "react";
import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, FilterIcon, MoreHorizontal, PlusCircle, RotateCcw, ArrowRightLeft, Eye, Pencil, Trash2 } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/shared/data-table/data-table";

export type Order = {
  id: number;
  itemsCount: number;
  totalQuantity: number;
  customer: Customer;
  price?: string;
  status: "active" | "transportation" | "pending" | "completed" | "cancel";
  date?: string;
  type?: string;
  _dbStatus?: string;
};

export type Customer = {
  name?: string;
  email?: string;
};

export const columns: ColumnDef<Order>[] = [
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
    accessorKey: "id",
    header: "#",
    cell: ({ row }) => (
      <Link
        href={`/dashboard/pages/orders/${row.getValue("id")}`}
        className="text-muted-foreground hover:text-primary hover:underline">
        #{row.getValue("id")}
      </Link>
    )
  },
  {
    accessorKey: "itemsCount",
    header: "Items",
    cell: ({ row }) => {
      const itemsCount = row.getValue("itemsCount") as number;
      const totalQuantity = row.original.totalQuantity;
      return (
        <div className="flex flex-col">
          <span className="font-medium">{itemsCount} {itemsCount === 1 ? "item" : "items"}</span>
          {totalQuantity > 0 && (
            <span className="text-xs text-muted-foreground">
              {totalQuantity} {totalQuantity === 1 ? "unit" : "units"}
            </span>
          )}
        </div>
      );
    }
  },
  {
    accessorKey: "price",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Price
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => row.getValue("price")
  },
  {
    accessorKey: "customer",
    header: "Customer",
    cell: ({ row }) => {
      const customer = row.original.customer;

      return (
        <div className="space-y-1">
          <div className="font-semibold">{customer.name}</div>
          <div className="text-muted-foreground">{customer.email}</div>
        </div>
      );
    },
    filterFn: (row, id, value) => {
      const customer = row.original.customer;
      const searchValue = value.toLowerCase();
      return (
        (customer.name ?? "").toLowerCase().includes(searchValue) ||
        (customer.email ?? "").toLowerCase().includes(searchValue)
      );
    }
  },
  {
    accessorKey: "date",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Date
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => row.getValue("date")
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => <div className="capitalize">{row.getValue("type")}</div>
  },
  {
    accessorKey: "status",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Status
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const status = row.original.status;

      const statusMap = {
        active: "success",
        transportation: "info",
        pending: "warning",
        cancel: "destructive",
        completed: "success",
        delivered: "success"
      } as const;

      const statusClass = statusMap[status] ?? "secondary";

      return (
        <div>
          <Badge variant={statusClass} className="capitalize">
            {status.replaceAll("-", " ")}
          </Badge>
        </div>
      );
    }
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      return (
        <div className="text-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/pages/orders/${row.original.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  Order Details
                </Link>
              </DropdownMenuItem>
              {(() => {
                const dbStatus = row.original._dbStatus;
                const returnableStatuses = ["PAID", "SHIPPED", "DELIVERED", "COMPLETED"];
                const canReturn = dbStatus && returnableStatuses.includes(dbStatus);
                return canReturn ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/pages/orders/${row.original.id}#return`}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Return Order
                    </Link>
                  </DropdownMenuItem>
                ) : null;
              })()}
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/pages/orders/${row.original.id}#status`}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Change Status
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }
  }
];

export default function OrdersDataTable({ data }: { data: Order[] }) {
  const statuses = [
    {
      value: "pending",
      label: "Pending"
    },
    {
      value: "completed",
      label: "Completed"
    },
    {
      value: "shipped",
      label: "Shipped"
    },
    {
      value: "delivered",
      label: "Delivered"
    }
  ];

  const categories = [
    {
      value: "beauty",
      label: "Beauty"
    },
    {
      value: "technology",
      label: "Technology"
    },
    {
      value: "toys",
      label: "Toys"
    },
    {
      value: "food",
      label: "Food"
    },
    {
      value: "home-appliances",
      label: "Home Appliances"
    }
  ];

  const Filters = () => {
    return (
      <>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <PlusCircle />
              Status
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0">
            <Command>
              <CommandInput placeholder="Status" className="h-9" />
              <CommandList>
                <CommandEmpty>No status found.</CommandEmpty>
                <CommandGroup>
                  {statuses.map((status) => (
                    <CommandItem key={status.value} value={status.value}>
                      <div className="flex items-center space-x-3 py-1">
                        <Checkbox id={status.value} />
                        <label
                          htmlFor={status.value}
                          className="leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          {status.label}
                        </label>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <PlusCircle />
              Category
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0">
            <Command>
              <CommandInput placeholder="Category" className="h-9" />
              <CommandList>
                <CommandEmpty>No category found.</CommandEmpty>
                <CommandGroup>
                  {categories.map((category) => (
                    <CommandItem key={category.value} value={category.value}>
                      <div className="flex items-center space-x-3 py-1">
                        <Checkbox id={category.value} />
                        <label
                          htmlFor={category.value}
                          className="leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          {category.label}
                        </label>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </>
    );
  };

  return (
    <DataTable
      columns={columns}
      data={data}
      storageKey="orders"
      searchColumn="customer"
      searchPlaceholder="Search orders by customer, order number..."
      toolbarExtra={() => (
        <>
          <div className="hidden gap-2 md:flex">
            <Filters />
          </div>
          {/*filter for mobile*/}
          <div className="inline md:hidden">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon">
                  <FilterIcon />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-4">
                <div className="grid space-y-2">
                  <Filters />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </>
      )}
    />
  );
}
