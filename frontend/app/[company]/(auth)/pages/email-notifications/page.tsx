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
import { ArrowUpDown, Columns, MoreHorizontal, Plus, Pencil, Trash2, Copy, Bell, Clock } from "lucide-react";
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
import { emailNotificationsApi, emailTemplatesApi } from "@/lib/api";
import { toast } from "sonner";
import { EmailNotificationDialog } from "./email-notification-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

export type EmailNotification = {
  id: number;
  name: string;
  type: string;
  description?: string | null;
  trigger?: any;
  recipients?: any;
  templateId?: number | null;
  frequency: string;
  channels?: any;
  conditions?: any;
  isActive: boolean;
  isSystem: boolean;
  companyId?: number | null;
  branchId?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

const notificationTypeLabels: Record<string, string> = {
  LEAD_CREATED: "Lead Created",
  LEAD_UPDATED: "Lead Updated",
  LEAD_ASSIGNED: "Lead Assigned",
  LEAD_STAGE_CHANGED: "Lead Stage Changed",
  DEAL_CREATED: "Deal Created",
  DEAL_UPDATED: "Deal Updated",
  DEAL_CLOSED: "Deal Closed",
  DEAL_LOST: "Deal Lost",
  TASK_CREATED: "Task Created",
  TASK_ASSIGNED: "Task Assigned",
  TASK_COMPLETED: "Task Completed",
  TASK_OVERDUE: "Task Overdue",
  CONTACT_CREATED: "Contact Created",
  CONTACT_UPDATED: "Contact Updated",
  INVOICE_CREATED: "Invoice Created",
  INVOICE_SENT: "Invoice Sent",
  INVOICE_PAID: "Invoice Paid",
  INVOICE_OVERDUE: "Invoice Overdue",
  QUOTE_CREATED: "Quote Created",
  QUOTE_SENT: "Quote Sent",
  QUOTE_ACCEPTED: "Quote Accepted",
  QUOTE_REJECTED: "Quote Rejected",
  USER_MENTIONED: "User Mentioned",
  COMMENT_ADDED: "Comment Added",
  FILE_UPLOADED: "File Uploaded",
  CUSTOM: "Custom"
};

const frequencyLabels: Record<string, string> = {
  IMMEDIATE: "Immediate",
  HOURLY_DIGEST: "Hourly Digest",
  DAILY_DIGEST: "Daily Digest",
  WEEKLY_DIGEST: "Weekly Digest",
  NEVER: "Never"
};

export const createColumns = (
  onEdit: (notification: EmailNotification) => void,
  onDelete: (id: number) => void,
  onToggle: (id: number) => void,
  onDuplicate: (id: number) => void
): ColumnDef<EmailNotification>[] => [
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
        {row.original.isSystem && (
          <Badge variant="secondary" className="text-xs">System</Badge>
        )}
      </div>
    )
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => {
      const type = row.getValue("type") as string;
      return (
        <Badge variant="outline">
          {notificationTypeLabels[type] || type}
        </Badge>
      );
    }
  },
  {
    accessorKey: "frequency",
    header: "Frequency",
    cell: ({ row }) => {
      const frequency = row.getValue("frequency") as string;
      return (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{frequencyLabels[frequency] || frequency}</span>
        </div>
      );
    }
  },
  {
    accessorKey: "channels",
    header: "Channels",
    cell: ({ row }) => {
      const channels = row.getValue("channels") as string[] | null;
      if (!channels || channels.length === 0) {
        return <Badge variant="outline">Email</Badge>;
      }
      return (
        <div className="flex gap-1">
          {channels.map((channel, idx) => (
            <Badge key={idx} variant="outline" className="text-xs">
              {channel}
            </Badge>
          ))}
        </div>
      );
    }
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
      const notification = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(notification)} disabled={notification.isSystem}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(notification.id)}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggle(notification.id)}>
              {notification.isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(notification.id)}
              disabled={notification.isSystem}
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

export default function EmailNotificationsPage() {
  const [notifications, setNotifications] = useState<EmailNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<EmailNotification | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [frequencyFilter, setFrequencyFilter] = useState<string>("all");

  const loadNotifications = React.useCallback(async () => {
    try {
      setLoading(true);
      const type = typeFilter !== "all" ? typeFilter : undefined;
      const isActive = statusFilter !== "all" ? statusFilter === "active" : undefined;
      const frequency = frequencyFilter !== "all" ? frequencyFilter : undefined;
      const data = await emailNotificationsApi.getEmailNotifications(undefined, undefined, type, isActive, frequency);
      setNotifications(data);
    } catch (error: any) {
      console.error("Failed to load email notifications:", error);
      toast.error("Failed to load email notifications", {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, frequencyFilter]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleDelete = React.useCallback(async (id: number) => {
    if (!confirm("Are you sure you want to delete this email notification?")) {
      return;
    }

    try {
      await emailNotificationsApi.deleteEmailNotification(id);
      toast.success("Email notification deleted successfully");
      loadNotifications();
    } catch (error: any) {
      console.error("Failed to delete email notification:", error);
      toast.error("Failed to delete email notification", {
        description: error.message
      });
    }
  }, [loadNotifications]);

  const handleToggle = React.useCallback(async (id: number) => {
    try {
      await emailNotificationsApi.toggleEmailNotification(id);
      toast.success("Email notification status updated");
      loadNotifications();
    } catch (error: any) {
      console.error("Failed to toggle email notification:", error);
      toast.error("Failed to update email notification", {
        description: error.message
      });
    }
  }, [loadNotifications]);

  const handleDuplicate = React.useCallback(async (id: number) => {
    try {
      await emailNotificationsApi.duplicateEmailNotification(id);
      toast.success("Email notification duplicated successfully");
      loadNotifications();
    } catch (error: any) {
      console.error("Failed to duplicate email notification:", error);
      toast.error("Failed to duplicate email notification", {
        description: error.message
      });
    }
  }, [loadNotifications]);

  const columns = React.useMemo(
    () =>
      createColumns(
        (notification) => {
          setSelectedNotification(notification);
          setDialogOpen(true);
        },
        handleDelete,
        handleToggle,
        handleDuplicate
      ),
    [handleDelete, handleToggle, handleDuplicate]
  );

  const table = useReactTable({
    data: notifications,
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
    setSelectedNotification(null);
  };

  const handleDialogSuccess = () => {
    loadNotifications();
    handleDialogClose();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading email notifications...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Email Notifications</h2>
          <p className="text-muted-foreground">
            Configure automated email notifications for various events and triggers
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Notification
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search notifications..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
            className="max-w-sm"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(notificationTypeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={frequencyFilter} onValueChange={setFrequencyFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by frequency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Frequencies</SelectItem>
            {Object.entries(frequencyLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                  No notifications found.
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

      <EmailNotificationDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        notification={selectedNotification}
        onSuccess={handleDialogSuccess}
      />
    </div>
  );
}








































































