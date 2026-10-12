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
import { dealPipelinesApi } from "@/lib/api";
import { toast } from "sonner";
import { DealPipelineDialog } from "./deal-pipeline-dialog";

export type DealPipeline = {
  id: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
  isActive: boolean;
  companyId?: number | null;
  branchId?: number | null;
  stages?: any[];
  _count?: {
    stages: number;
  };
  createdAt?: string;
  updatedAt?: string;
};

export const createColumns = (
  onEdit: (pipeline: DealPipeline) => void,
  onDelete: (id: number) => void
): ColumnDef<DealPipeline>[] => [
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
      <div className="font-medium">{row.getValue("name")}</div>
    )
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => {
      const description = row.getValue("description") as string | null;
      return <div className="max-w-[200px] truncate">{description || "-"}</div>;
    }
  },
  {
    accessorKey: "_count",
    header: "Stages",
    cell: ({ row }) => {
      const count = row.getValue("_count") as { stages?: number } | undefined;
      return <div>{count?.stages || 0}</div>;
    }
  },
  {
    accessorKey: "isDefault",
    header: "Default",
    cell: ({ row }) => {
      const isDefault = row.getValue("isDefault") as boolean;
      return (
        <Badge variant={isDefault ? "default" : "outline"}>
          {isDefault ? "Yes" : "No"}
        </Badge>
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
      const pipeline = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(pipeline)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(pipeline.id)}
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

export default function DealPipelinesPage() {
  const [pipelines, setPipelines] = useState<DealPipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<DealPipeline | null>(null);

  const loadPipelines = async () => {
    try {
      setLoading(true);
      const data = await dealPipelinesApi.getDealPipelines();
      setPipelines(data || []);
    } catch (error: any) {
      console.error("Failed to load deal pipelines:", error);
      toast.error("Failed to load deal pipelines");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPipelines();
  }, []);

  const handleEdit = (pipeline: DealPipeline) => {
    setEditingPipeline(pipeline);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this deal pipeline? All stages and connections will be deleted.")) {
      return;
    }

    try {
      await dealPipelinesApi.deleteDealPipeline(id);
      toast.success("Deal pipeline deleted successfully");
      loadPipelines();
    } catch (error: any) {
      console.error("Failed to delete deal pipeline:", error);
      toast.error("Failed to delete deal pipeline");
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingPipeline(null);
  };

  const handleDialogSuccess = () => {
    loadPipelines();
    handleDialogClose();
  };

  const columns = React.useMemo(
    () => createColumns(handleEdit, handleDelete),
    []
  );

  const table = useReactTable({
    data: pipelines,
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
        <p className="text-muted-foreground">Loading deal pipelines...</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-lg font-bold tracking-tight">Deal Pipelines</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden lg:inline">Add Pipeline</span>
        </Button>
      </div>

      <div className="w-full">
        <div className="flex items-center gap-4 py-4">
          <Input
            placeholder="Search pipelines..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
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
                    No deal pipelines found.
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

      <DealPipelineDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        pipeline={editingPipeline}
        onSuccess={handleDialogSuccess}
      />
    </>
  );
}








































































