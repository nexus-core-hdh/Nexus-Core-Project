"use client";

import * as React from "react";
import { useWorkspaceRecordLabel } from "@/hooks/use-workspace-tab-title";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "@/lib/app-navigation";
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
import { ArrowUpDown, Columns, MoreHorizontal, Plus, Pencil, Trash2 } from "lucide-react";
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
import { autoNumberingApi } from "@/lib/api";
import { toast } from "sonner";
import { AutoNumberingDialog, AutoNumbering } from "../auto-numbering-dialog";

export type AutoNumberingTable = {
  id: number;
  entity: string;
  prefix?: string | null;
  suffix?: string | null;
  format: string;
  startingNumber: number;
  currentNumber: number;
  numberLength?: number | null;
  resetPeriod?: string | null;
  isActive: boolean;
  companyId?: number | null;
  branchId?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

const entityLabels: Record<string, string> = {
  leads: "Leads",
  deals: "Deals",
  contacts: "Contacts",
  companies: "Companies"
};

export const createColumns = (
  onEdit: (setting: AutoNumberingTable) => void,
  onDelete: (id: number) => void
): ColumnDef<AutoNumberingTable>[] => [
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
    accessorKey: "format",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3">
          Format
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const format = row.getValue("format") as string;
      const prefix = row.original.prefix || "";
      const suffix = row.original.suffix || "";
      const numberLength = row.original.numberLength || 3;
      const startingNumber = row.original.startingNumber;
      const numberPart = startingNumber.toString().padStart(numberLength, '0');
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const day = now.getDate().toString().padStart(2, '0');

      let preview = format
        .replace(/{prefix}/g, prefix)
        .replace(/{suffix}/g, suffix)
        .replace(/{number}/g, numberPart)
        .replace(/{YYYY}/g, year)
        .replace(/{MM}/g, month)
        .replace(/{DD}/g, day);

      return <div className="font-mono text-sm">{preview}</div>;
    }
  },
  {
    accessorKey: "prefix",
    header: "Prefix",
    cell: ({ row }) => {
      const prefix = row.getValue("prefix") as string | null;
      return <div>{prefix || "-"}</div>;
    }
  },
  {
    accessorKey: "suffix",
    header: "Suffix",
    cell: ({ row }) => {
      const suffix = row.getValue("suffix") as string | null;
      return <div>{suffix || "-"}</div>;
    }
  },
  {
    accessorKey: "startingNumber",
    header: "Starting #",
    cell: ({ row }) => {
      const number = row.getValue("startingNumber") as number;
      return <div>{number}</div>;
    }
  },
  {
    accessorKey: "currentNumber",
    header: "Current #",
    cell: ({ row }) => {
      const number = row.getValue("currentNumber") as number;
      return <div className="font-medium">{number}</div>;
    }
  },
  {
    accessorKey: "resetPeriod",
    header: "Reset Period",
    cell: ({ row }) => {
      const period = row.getValue("resetPeriod") as string | null;
      return <Badge variant="outline">{period || "Never"}</Badge>;
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
      const setting = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(setting)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
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

export default function AutoNumberingEntityPage() {
  const params = useParams();
  const router = useRouter();
  const entity = params.entity as string;
  const entityLabel = entityLabels[entity] || entity;
  useWorkspaceRecordLabel(entityLabel || undefined);

  const [autoNumberings, setAutoNumberings] = useState<AutoNumberingTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<AutoNumberingTable | null>(null);

  const loadAutoNumberings = async () => {
    try {
      setLoading(true);
      const data = await autoNumberingApi.getAutoNumberings(undefined, undefined, entity);
      setAutoNumberings(data || []);
    } catch (error: any) {
      console.error("Failed to load auto-numbering settings:", error);
      toast.error("Failed to load auto-numbering settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entity) {
      loadAutoNumberings();
    }
  }, [entity]);

  const handleEdit = (setting: AutoNumberingTable) => {
    setEditingSetting(setting);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this auto-numbering setting?")) {
      return;
    }

    try {
      await autoNumberingApi.deleteAutoNumbering(id);
      toast.success("Auto-numbering setting deleted successfully");
      loadAutoNumberings();
    } catch (error: any) {
      console.error("Failed to delete auto-numbering setting:", error);
      toast.error("Failed to delete auto-numbering setting");
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingSetting(null);
  };

  const handleDialogSuccess = () => {
    loadAutoNumberings();
    handleDialogClose();
  };

  const columns = React.useMemo(
    () => createColumns(handleEdit, handleDelete),
    []
  );

  const table = useReactTable({
    data: autoNumberings,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading auto-numbering settings...</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Auto-Numbering: {entityLabel}</h1>
            <p className="text-muted-foreground">
              Configure automatic numbering for {entityLabel.toLowerCase()}
            </p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden lg:inline">Add Auto-Numbering</span>
        </Button>
      </div>

      <div className="w-full">
        <div className="flex items-center gap-4 py-4">
          <Input
            placeholder="Search settings..."
            value={(table.getColumn("format")?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn("format")?.setFilterValue(event.target.value)}
            className="max-w-sm"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="ml-auto">
                <Columns className="mr-2 h-4 w-4" />
                <span className="hidden md:inline">Columns</span>
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
                    No auto-numbering settings found.
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

      <AutoNumberingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entity={entity}
        setting={editingSetting ? {
          id: editingSetting.id,
          entity: editingSetting.entity,
          prefix: editingSetting.prefix,
          suffix: editingSetting.suffix,
          format: editingSetting.format,
          startingNumber: editingSetting.startingNumber,
          currentNumber: editingSetting.currentNumber,
          numberLength: editingSetting.numberLength,
          resetPeriod: editingSetting.resetPeriod,
          isActive: editingSetting.isActive
        } : null}
        onSuccess={handleDialogSuccess}
      />
    </>
  );
}

























