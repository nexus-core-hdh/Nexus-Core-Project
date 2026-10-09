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
import { ArrowUpDown, Columns, MoreHorizontal, Plus, Eye, Pencil, Trash2, Download, FileText } from "lucide-react";
import { useRouter } from "@/lib/app-navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { reportTemplateApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import AddReportTemplateDialog from "./components/add-report-template-dialog";

export type ReportTemplate = {
  id: number;
  name: string;
  description?: string;
  entityType: string;
  columns: any;
  filters?: any;
  sorting?: any;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: number;
    name: string;
    email: string;
  };
};

const createColumns = (
  onView: (id: number) => void,
  onEdit: (id: number) => void,
  onDelete: (id: number, name: string) => void,
  onExportCSV: (id: number) => void,
  onExportPDF: (id: number) => void
): ColumnDef<ReportTemplate>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
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
          Template Name
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => <div className="font-medium">{row.getValue("name")}</div>
  },
  {
    accessorKey: "description",
    header: "Description",
    cell: ({ row }) => <div className="text-muted-foreground">{row.getValue("description") || "-"}</div>
  },
  {
    accessorKey: "entityType",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Entity Type
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const entityType = row.getValue("entityType") as string;
      return (
        <Badge variant="outline" className="capitalize">
          {entityType.replace("_", " ")}
        </Badge>
      );
    }
  },
  {
    id: "columns",
    header: "Columns",
    cell: ({ row }) => {
      const columns = row.original.columns;
      if (!columns || !Array.isArray(columns)) return "-";
      const visibleColumns = columns.filter((col: any) => col.visible !== false);
      return <div className="text-sm text-muted-foreground">{visibleColumns.length} columns</div>;
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
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const date = new Date(row.getValue("createdAt"));
      return <div className="text-sm">{date.toLocaleDateString()}</div>;
    }
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const template = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onView(template.id)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(template.id)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExportCSV(template.id)}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExportPDF(template.id)}>
              <FileText className="mr-2 h-4 w-4" />
              Export PDF
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(template.id, template.name)}
              className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
  }
];

export default function ReportTemplatesPage() {
  const router = useRouter();
  const [data, setData] = React.useState<ReportTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [templateToDelete, setTemplateToDelete] = React.useState<{ id: number; name: string } | null>(null);
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);

  React.useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const user = getCurrentUser();
      const templates = await reportTemplateApi.getReportTemplates({
        companyId: user?.companyId ?? undefined,
        branchId: user?.branchId ?? undefined
      });
      setData(templates);
    } catch (error: any) {
      console.error("Error fetching report templates:", error);
      toast.error("Failed to fetch report templates");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleView = (id: number) => {
    router.push(`/crm/settings/report-templates/${id}`);
  };

  const handleEdit = (id: number) => {
    router.push(`/crm/settings/report-templates/${id}?edit=true`);
  };

  const handleDeleteClick = (id: number, name: string) => {
    setTemplateToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!templateToDelete) return;

    try {
      await reportTemplateApi.deleteReportTemplate(templateToDelete.id);
      toast.success("Report template deleted successfully");
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      fetchTemplates();
    } catch (error: any) {
      console.error("Error deleting report template:", error);
      toast.error("Failed to delete report template", {
        description: error.message || "An error occurred."
      });
    }
  };

  const handleExportCSV = async (id: number) => {
    try {
      const template = await reportTemplateApi.getReportTemplateById(id);
      
      // Fetch data based on entity type
      const data = await fetchEntityData(template.entityType);
      
      // Import and use export utility
      const { exportToCSV } = await import('./utils/export-utils');
      exportToCSV(data, template.columns, template.name);
      
      toast.success("CSV exported successfully");
    } catch (error: any) {
      console.error("Error exporting CSV:", error);
      toast.error("Failed to export CSV", {
        description: error.message || "An error occurred."
      });
    }
  };

  const handleExportPDF = async (id: number) => {
    try {
      const template = await reportTemplateApi.getReportTemplateById(id);
      
      // Fetch data based on entity type
      const data = await fetchEntityData(template.entityType);
      
      // Import and use export utility
      const { exportToPDF } = await import('./utils/export-utils');
      await exportToPDF(data, template.columns, template.name, template.entityType);
      
      toast.success("PDF exported successfully");
    } catch (error: any) {
      console.error("Error exporting PDF:", error);
      toast.error("Failed to export PDF", {
        description: error.message || "An error occurred."
      });
    }
  };

  const fetchEntityData = async (entityType: string) => {
    const user = getCurrentUser();
    const params = {
      companyId: user?.companyId ?? undefined,
      branchId: user?.branchId ?? undefined
    };

    // Import APIs dynamically
    const { customerApi, orderApi, productApi, entityDataApi } = await import('@/lib/api');

    switch (entityType) {
      case 'CUSTOMER':
        return await customerApi.getCustomers(params);
      case 'ORDER':
        // Orders API doesn't support company/branch params here (auth token scopes it).
        return await orderApi.getOrders({ limit: 100 });
      case 'PRODUCT':
        // Products API uses status/category/search filters (auth token scopes it).
        return await productApi.getProducts();
      case 'LEAD':
        return await entityDataApi.getEntityDataByType('LEAD', params);
      case 'DEAL':
        return await entityDataApi.getEntityDataByType('DEAL', params);
      default:
        return [];
    }
  };

  const columns = React.useMemo(
    () => createColumns(handleView, handleEdit, handleDeleteClick, handleExportCSV, handleExportPDF),
    []
  );

  const table = useReactTable({
    data,
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
        <p className="text-muted-foreground">Loading report templates...</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-lg font-bold tracking-tight">Report Templates</h1>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden lg:inline">Add Template</span>
        </Button>
      </div>

      <div className="w-full">
        <div className="flex items-center gap-4 py-4">
          <Input
            placeholder="Search templates..."
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
                  No templates found.
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

      <AddReportTemplateDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={fetchTemplates}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the template{" "}
              <strong>{templateToDelete?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTemplateToDelete(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90">
              Yes, Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

