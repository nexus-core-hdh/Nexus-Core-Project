"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal, PlusCircle, Key } from "lucide-react";

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
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, generateAvatarFallback } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { DataTable } from "@/components/shared/data-table/data-table";

export type User = {
  id: number;
  name: string;
  email: string;
  country: string;
  role: string;
  image: string;
  // The backend's User model exposes this as `userStatus`, not `status` — kept
  // both here (rather than renaming) since existing code elsewhere in this
  // table already reads `status`.
  status?: "active" | "inactive" | "pending";
  userStatus?: "active" | "inactive" | "pending";
  plan_name: "Basic" | "Team" | "Enterprise";
  phone?: string | null;
  location?: string | null;
  department?: string | null;
  mustChangePassword: boolean;
  companyId?: number | null;
  branchId?: number | null;
  roleId?: number | null;
  company?: {
    id: number;
    name: string;
    plan: string;
  } | null;
  branch?: {
    id: number;
    name: string;
  } | null;
  customRole?: {
    id: number;
    name: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export const createColumns = (
  onResetPassword: (userId: number, userName: string) => void
): ColumnDef<User>[] => [
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
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-4">
        <Avatar>
          <AvatarImage src={row.original.image} alt="Nexus Core" />
          <AvatarFallback>{generateAvatarFallback(row.getValue("name"))}</AvatarFallback>
        </Avatar>
        <div className="capitalize">{row.getValue("name")}</div>
      </div>
    )
  },
  {
    accessorKey: "role",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Role
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => row.getValue("role")
  },
  {
    accessorKey: "plan_name",
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
    cell: ({ row }) => row.getValue("plan_name")
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
    cell: ({ row }) => row.getValue("email")
  },
  {
    accessorKey: "country",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Country
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => row.getValue("country")
  },
  {
    id: "status",
    accessorFn: (row) => row.status ?? row.userStatus ?? "unknown",
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
      const status = row.original.status ?? row.original.userStatus ?? "unknown";

      const statusMap = {
        active: "success",
        inactive: "destructive",
        pending: "warning"
      } as const;

      const statusClass = statusMap[status as keyof typeof statusMap] ?? "outline";

      return (
        <Badge variant={statusClass} className="capitalize">
          {status.replace("-", " ")}
        </Badge>
      );
    }
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
    cell: ({ row }) => row.original.phone || "-"
  },
  {
    accessorKey: "location",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Location
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => row.original.location || "-"
  },
  {
    accessorKey: "department",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Department
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => row.original.department || "-"
  },
  {
    accessorKey: "company",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Company
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => row.original.company?.name || "-"
  },
  {
    accessorKey: "branch",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Branch
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => row.original.branch?.name || "-"
  },
  {
    accessorKey: "customRole",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Custom Role
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => row.original.customRole?.name || "-"
  },
  {
    accessorKey: "mustChangePassword",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Must Change Password
          <ArrowUpDown />
        </Button>
      );
    },
    cell: ({ row }) => {
      return (
        <Badge variant={row.original.mustChangePassword ? "warning" : "outline"}>
          {row.original.mustChangePassword ? "Yes" : "No"}
        </Badge>
      );
    }
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
      return formatDateTime(row.original.createdAt);
    }
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
      return formatDateTime(row.original.updatedAt);
    }
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
            <DropdownMenuItem>View user</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onResetPassword(row.original.id, row.original.name)}
            >
              <Key className="mr-2 h-4 w-4" />
              Reset Password
            </DropdownMenuItem>
            <DropdownMenuItem>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
  }
];

export default function UsersDataTable({ data }: { data: User[] }) {
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<{ id: number; name: string } | null>(null);

  const handleResetPassword = (userId: number, userName: string) => {
    setSelectedUser({ id: userId, name: userName });
    setResetPasswordDialogOpen(true);
  };

  const columns = React.useMemo(() => createColumns(handleResetPassword), []);

  const statuses = [
    {
      value: "active",
      label: "Active"
    },
    {
      value: "inactive",
      label: "Inactive"
    },
    {
      value: "pending",
      label: "Pending"
    }
  ];

  const plans = [
    {
      value: "basic",
      label: "Basic"
    },
    {
      value: "team",
      label: "Team"
    },
    {
      value: "enterprise",
      label: "Enterprise"
    }
  ];

  const roles = [
    {
      value: "construction-foreman",
      label: "Construction Foreman"
    },
    {
      value: "project-manager",
      label: "Project Manager"
    },
    {
      value: "surveyor",
      label: "Surveyor"
    },
    {
      value: "architect",
      label: "Architect"
    },
    {
      value: "subcontractor",
      label: "Subcontractor"
    },
    {
      value: "electrician",
      label: "Electrician"
    },
    {
      value: "estimator",
      label: "Estimator"
    }
  ];

  return (
    <div className="w-full">
      <DataTable
        columns={columns}
        data={data}
        storageKey="users"
        searchColumn="name"
        searchPlaceholder="Search users..."
        toolbarExtra={() => (
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
                  Plan
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-0">
                <Command>
                  <CommandInput placeholder="Plan" className="h-9" />
                  <CommandList>
                    <CommandEmpty>No plan found.</CommandEmpty>
                    <CommandGroup>
                      {plans.map((plan) => (
                        <CommandItem key={plan.value} value={plan.value}>
                          <div className="flex items-center space-x-3 py-1">
                            <Checkbox id={plan.value} />
                            <label
                              htmlFor={plan.value}
                              className="leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                              {plan.label}
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
                  <PlusCircle className="h-4 w-4" />
                  Role
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-0">
                <Command>
                  <CommandInput placeholder="Role" className="h-9" />
                  <CommandList>
                    <CommandEmpty>No role found.</CommandEmpty>
                    <CommandGroup>
                      {roles.map((role) => (
                        <CommandItem
                          key={role.value}
                          value={role.value}
                          onSelect={(currentValue) => {
                            // setValue(currentValue === value ? "" : currentValue);
                            // setOpen(false);
                          }}>
                          <div className="flex items-center space-x-3 py-1">
                            <Checkbox id={role.value} />
                            <label
                              htmlFor={role.value}
                              className="leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                              {role.label}
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
        )}
      />

      {selectedUser && (
        <ResetPasswordDialog
          open={resetPasswordDialogOpen}
          onOpenChange={setResetPasswordDialogOpen}
          userId={selectedUser.id}
          userName={selectedUser.name}
          onSuccess={() => {
            // Optionally refresh the users list here
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
}
