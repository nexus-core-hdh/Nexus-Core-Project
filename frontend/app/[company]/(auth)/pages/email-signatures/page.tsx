"use client";

import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
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
import { ArrowUpDown, Columns, MoreHorizontal, Plus, Pencil, Trash2, Copy, Eye, Mail, User } from "lucide-react";
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
import { emailSignaturesApi } from "@/lib/api";
import { toast } from "sonner";
import { EmailSignatureDialog } from "./email-signature-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

export type EmailSignature = {
  id: number;
  name: string;
  content: string;
  plainText?: string | null;
  userId?: number | null;
  user?: {
    id: number;
    name: string;
    email: string;
  } | null;
  isDefault: boolean;
  isActive: boolean;
  companyId?: number | null;
  branchId?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

const createColumns = (
  onEdit: (signature: EmailSignature) => void,
  onDelete: (id: number) => void,
  onToggle: (id: number) => void,
  onDuplicate: (id: number) => void
): ColumnDef<EmailSignature>[] => [
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
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue("name")}</div>
    )
  },
  {
    accessorKey: "user",
    header: "Owner",
    cell: ({ row }) => {
      const user = row.original.user;
      return (
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{user.name}</span>
            </>
          ) : (
            <Badge variant="secondary">Company-wide</Badge>
          )}
        </div>
      );
    }
  },
  {
    accessorKey: "content",
    header: "Preview",
    cell: ({ row }) => {
      const content = row.original.content;
      const preview = content.replace(/<[^>]*>/g, "").substring(0, 50);
      return (
        <div className="max-w-[300px] truncate text-sm text-muted-foreground" title={preview}>
          {preview || "No content"}
        </div>
      );
    }
  },
  {
    accessorKey: "isDefault",
    header: "Default",
    cell: ({ row }) => {
      const isDefault = row.getValue("isDefault") as boolean;
      return isDefault ? (
        <Badge variant="default">Default</Badge>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    }
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) => {
      const isActive = row.getValue("isActive") as boolean;
      return (
        <Badge variant={isActive ? "default" : "secondary"}>
          {isActive ? "Active" : "Inactive"}
        </Badge>
      );
    }
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const signature = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(signature)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(signature.id)}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggle(signature.id)}>
              <Eye className="mr-2 h-4 w-4" />
              {signature.isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(signature.id)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
  }
];

export default function EmailSignaturesPage() {
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSignature, setSelectedSignature] = useState<EmailSignature | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [defaultFilter, setDefaultFilter] = useState<string>("all");

  const loadSignatures = useCallback(async () => {
    try {
      setLoading(true);
      const data = await emailSignaturesApi.getEmailSignatures(
        undefined,
        undefined,
        undefined,
        statusFilter === "all" ? undefined : statusFilter === "active"
      );
      setSignatures(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error("Error loading email signatures:", error);
      toast.error("Failed to load email signatures", {
        description: error.message || "An error occurred while fetching signatures"
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadSignatures();
  }, [loadSignatures]);

  const handleEdit = useCallback((signature: EmailSignature) => {
    setSelectedSignature(signature);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Are you sure you want to delete this email signature?")) {
      return;
    }

    try {
      await emailSignaturesApi.deleteEmailSignature(id);
      toast.success("Email signature deleted successfully");
      loadSignatures();
    } catch (error: any) {
      console.error("Error deleting email signature:", error);
      toast.error("Failed to delete email signature", {
        description: error.message || "An error occurred while deleting the signature"
      });
    }
  }, [loadSignatures]);

  const handleToggle = useCallback(async (id: number) => {
    try {
      await emailSignaturesApi.toggleEmailSignature(id);
      toast.success("Email signature status updated");
      loadSignatures();
    } catch (error: any) {
      console.error("Error toggling email signature:", error);
      toast.error("Failed to update email signature status", {
        description: error.message || "An error occurred while updating the signature"
      });
    }
  }, [loadSignatures]);

  const handleDuplicate = useCallback(async (id: number) => {
    try {
      await emailSignaturesApi.duplicateEmailSignature(id);
      toast.success("Email signature duplicated successfully");
      loadSignatures();
    } catch (error: any) {
      console.error("Error duplicating email signature:", error);
      toast.error("Failed to duplicate email signature", {
        description: error.message || "An error occurred while duplicating the signature"
      });
    }
  }, [loadSignatures]);

  const columns = useMemo(
    () => createColumns(handleEdit, handleDelete, handleToggle, handleDuplicate),
    [handleEdit, handleDelete, handleToggle, handleDuplicate]
  );

  const filteredData = useMemo(() => {
    let filtered = signatures;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (sig) =>
          sig.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (sig.user?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      );
    }

    // Apply default filter
    if (defaultFilter !== "all") {
      filtered = filtered.filter((sig) =>
        defaultFilter === "default" ? sig.isDefault : !sig.isDefault
      );
    }

    return filtered;
  }, [signatures, searchQuery, defaultFilter]);

  const table = useReactTable({
    data: filteredData,
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
    setSelectedSignature(null);
  };

  const handleSuccess = () => {
    handleDialogClose();
    loadSignatures();
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Email Signatures</h1>
          <p className="text-muted-foreground">
            Manage email signatures for your organization
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Signature
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search signatures..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
        <Select value={defaultFilter} onValueChange={setDefaultFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Signatures</SelectItem>
            <SelectItem value="default">Default Only</SelectItem>
            <SelectItem value="non-default">Non-Default</SelectItem>
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
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
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
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
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
                  No signatures found.
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>

      <EmailSignatureDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        signature={selectedSignature}
        onSuccess={handleSuccess}
      />
    </div>
  );
}








































































