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
import { analyticalReportsApi, customFieldsApi } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type AnalyticalReport = {
  id: number;
  name: string;
  description?: string | null;
  customFieldIds: number[];
  companyId?: number | null;
  branchId?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export const createColumns = (
  onEdit: (report: AnalyticalReport) => void,
  onDelete: (id: number) => void
): ColumnDef<AnalyticalReport>[] => [
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
    accessorKey: "customFieldIds",
    header: "Fields Count",
    cell: ({ row }) => {
      const fieldIds = row.getValue("customFieldIds") as number[];
      return <Badge variant="outline">{fieldIds?.length || 0} fields</Badge>;
    }
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const report = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(report)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(report.id)}
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

export default function AnalyticalReportsPage() {
  const [reports, setReports] = useState<AnalyticalReport[]>([]);
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<AnalyticalReport | null>(null);
  const [reportName, setReportName] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<number>>(new Set());

  const loadData = async () => {
    try {
      setLoading(true);
      const [reportsData, fieldsData] = await Promise.all([
        analyticalReportsApi.getAnalyticalReports(),
        customFieldsApi.getCustomFields()
      ]);
      setReports(reportsData || []);
      setCustomFields(fieldsData || []);
    } catch (error: any) {
      console.error("Failed to load data:", error);
      toast.error("Failed to load analytical reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleEdit = (report: AnalyticalReport) => {
    setEditingReport(report);
    setReportName(report.name);
    setReportDescription(report.description || "");
    setSelectedFieldIds(new Set(report.customFieldIds || []));
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this analytical report?")) {
      return;
    }

    try {
      await analyticalReportsApi.deleteAnalyticalReport(id);
      toast.success("Analytical report deleted successfully");
      loadData();
    } catch (error: any) {
      console.error("Failed to delete analytical report:", error);
      toast.error("Failed to delete analytical report");
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingReport(null);
    setReportName("");
    setReportDescription("");
    setSelectedFieldIds(new Set());
  };

  const handleSave = async () => {
    if (!reportName.trim()) {
      toast.error("Report name is required");
      return;
    }

    if (selectedFieldIds.size === 0) {
      toast.error("Please select at least one custom field");
      return;
    }

    try {
      const reportData = {
        name: reportName,
        description: reportDescription || null,
        customFieldIds: Array.from(selectedFieldIds)
      };

      if (editingReport) {
        await analyticalReportsApi.updateAnalyticalReport(editingReport.id, reportData);
        toast.success("Analytical report updated successfully");
      } else {
        await analyticalReportsApi.createAnalyticalReport(reportData);
        toast.success("Analytical report created successfully");
      }

      loadData();
      handleDialogClose();
    } catch (error: any) {
      console.error("Failed to save analytical report:", error);
      toast.error("Failed to save analytical report");
    }
  };

  const handleToggleField = (fieldId: number) => {
    const newSet = new Set(selectedFieldIds);
    if (newSet.has(fieldId)) {
      newSet.delete(fieldId);
    } else {
      newSet.add(fieldId);
    }
    setSelectedFieldIds(newSet);
  };

  const columns = React.useMemo(
    () => createColumns(handleEdit, handleDelete),
    []
  );

  const table = useReactTable({
    data: reports,
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
        <p className="text-muted-foreground">Loading analytical reports...</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-lg font-bold tracking-tight">Analytical Reports</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden lg:inline">Add Analytical Report</span>
        </Button>
      </div>

      <div className="w-full">
        <div className="flex items-center gap-4 py-4">
          <Input
            placeholder="Search reports..."
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
                    No analytical reports found.
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

      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editingReport ? "Edit Analytical Report" : "Add Analytical Report"}</DialogTitle>
            <DialogDescription>
              {editingReport
                ? "Update the analytical report details below."
                : "Create a new analytical report by selecting custom fields to include."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="report-name">Report Name *</Label>
              <Input
                id="report-name"
                placeholder="Enter report name"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-description">Description</Label>
              <Textarea
                id="report-description"
                placeholder="Enter report description"
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Select Custom Fields *</Label>
              <div className="border rounded-lg p-4 max-h-[300px] overflow-y-auto">
                {customFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No custom fields available. Create custom fields first.</p>
                ) : (
                  <div className="space-y-2">
                    {customFields.map((field) => (
                      <div key={field.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`field-${field.id}`}
                          checked={selectedFieldIds.has(field.id)}
                          onCheckedChange={() => handleToggleField(field.id)}
                        />
                        <Label htmlFor={`field-${field.id}`} className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <span>{field.name}</span>
                            <Badge variant="outline" className="text-xs">{field.type}</Badge>
                            <Badge variant="secondary" className="text-xs">{field.entity}</Badge>
                          </div>
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedFieldIds.size} field(s) selected
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleDialogClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingReport ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
