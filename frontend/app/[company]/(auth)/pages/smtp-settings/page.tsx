"use client";

import * as React from "react";
import { useState, useEffect } from "react";
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
import { ArrowUpDown, Columns, MoreHorizontal, Plus, Pencil, Trash2, Play, Mail, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { smtpSettingsApi } from "@/lib/api";
import { toast } from "sonner";
import { SmtpSettingDialog } from "./smtp-setting-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

export type SmtpSetting = {
  id: number;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName?: string | null;
  isActive: boolean;
  isDefault: boolean;
  companyId?: number | null;
  branchId?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export const createColumns = (
  onEdit: (setting: SmtpSetting) => void,
  onDelete: (id: number) => void,
  onToggle: (id: number) => void,
  onTest: (id: number) => void
): ColumnDef<SmtpSetting>[] => [
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
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3">
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="font-medium">{row.getValue("name")}</div>
        {row.original.isDefault && (
          <Badge variant="secondary" className="text-xs">Default</Badge>
        )}
      </div>
    )
  },
  {
    accessorKey: "host",
    header: "Host",
    cell: ({ row }) => (
      <div className="font-mono text-sm">{row.getValue("host")}</div>
    )
  },
  {
    accessorKey: "port",
    header: "Port",
    cell: ({ row }) => (
      <div className="font-mono text-sm">{row.getValue("port")}</div>
    )
  },
  {
    accessorKey: "secure",
    header: "Security",
    cell: ({ row }) => (
      <Badge variant={row.getValue("secure") ? "default" : "outline"}>
        {row.getValue("secure") ? "SSL/TLS" : "None"}
      </Badge>
    )
  },
  {
    accessorKey: "fromEmail",
    header: "From Email",
    cell: ({ row }) => (
      <div className="max-w-[200px] truncate">{row.getValue("fromEmail")}</div>
    )
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.getValue("isActive") ? "default" : "secondary"}>
        {row.getValue("isActive") ? "Active" : "Inactive"}
      </Badge>
    )
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const setting = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(setting)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onTest(setting.id)}>
              <Play className="mr-2 h-4 w-4" />
              Test Connection
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggle(setting.id)}>
              {setting.isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(setting.id)}
              className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
  }
];

export default function SmtpSettingsPage() {
  const [settings, setSettings] = useState<SmtpSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSetting, setSelectedSetting] = useState<SmtpSetting | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadSettings = React.useCallback(async () => {
    try {
      setLoading(true);
      const isActive = statusFilter !== "all" ? statusFilter === "active" : undefined;
      const data = await smtpSettingsApi.getSmtpSettings(undefined, undefined, isActive);
      setSettings(data);
    } catch (error: any) {
      console.error("Failed to load SMTP settings:", error);
      toast.error("Failed to load SMTP settings", {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleDelete = React.useCallback(async (id: number) => {
    if (!confirm("Are you sure you want to delete this SMTP setting?")) {
      return;
    }

    try {
      await smtpSettingsApi.deleteSmtpSetting(id);
      toast.success("SMTP setting deleted successfully");
      loadSettings();
    } catch (error: any) {
      console.error("Failed to delete SMTP setting:", error);
      toast.error("Failed to delete SMTP setting", {
        description: error.message
      });
    }
  }, [loadSettings]);

  const handleToggle = React.useCallback(async (id: number) => {
    try {
      await smtpSettingsApi.toggleSmtpSetting(id);
      toast.success("SMTP setting status updated");
      loadSettings();
    } catch (error: any) {
      console.error("Failed to toggle SMTP setting:", error);
      toast.error("Failed to update SMTP setting", {
        description: error.message
      });
    }
  }, [loadSettings]);

  const handleTest = React.useCallback(async (id: number) => {
    try {
      const result = await smtpSettingsApi.testSmtpConnection(id);
      if (result.success) {
        toast.success("SMTP connection test successful", {
          description: result.message
        });
      } else {
        toast.error("SMTP connection test failed", {
          description: result.error || "Unable to connect to SMTP server"
        });
      }
    } catch (error: any) {
      console.error("Failed to test SMTP connection:", error);
      toast.error("Failed to test SMTP connection", {
        description: error.message
      });
    }
  }, []);

  const columns = React.useMemo(
    () =>
      createColumns(
        (setting) => {
          setSelectedSetting(setting);
          setDialogOpen(true);
        },
        handleDelete,
        handleToggle,
        handleTest
      ),
    [handleDelete, handleToggle, handleTest]
  );

  const table = useReactTable({
    data: settings,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection
    }
  });

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedSetting(null);
  };

  const handleDialogSuccess = () => {
    loadSettings();
    handleDialogClose();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading SMTP settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">SMTP Settings</h2>
          <p className="text-muted-foreground">
            Configure SMTP servers for sending emails from your application
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add SMTP Setting
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search settings..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
            className="max-w-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Columns className="mr-2 h-4 w-4" />
              Columns
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
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}>
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
                    <TableHead key={header.id}>
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
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No SMTP settings found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end space-x-2">
        <div className="flex-1 text-sm text-muted-foreground">
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

      <SmtpSettingDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        setting={selectedSetting}
        onSuccess={handleDialogSuccess}
      />
    </div>
  );
}








































































