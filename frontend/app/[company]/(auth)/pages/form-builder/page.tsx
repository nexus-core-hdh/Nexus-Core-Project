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
import { ArrowUpDown, Columns, MoreHorizontal, Plus, Pencil, Trash2, Copy, Eye, FileText, ExternalLink } from "lucide-react";
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
import { formTemplatesApi } from "@/lib/api";
import { toast } from "sonner";
import { FormTemplateDialog } from "./form-template-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

export type FormTemplate = {
  id: number;
  name: string;
  description?: string | null;
  entityType: "LEAD" | "DEAL" | "CONTACT" | "COMPANY" | "USER" | "TASK" | "INVOICE" | "QUOTE" | "PRODUCT" | "CUSTOM";
  formFields: any; // JSON array of field definitions
  workflowId?: number | null;
  workflow?: {
    id: number;
    name: string;
    status: string;
    isActive: boolean;
  } | null;
  path?: string | null;
  isActive: boolean;
  settings?: any;
  companyId?: number | null;
  branchId?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

const entityTypeLabels: Record<FormTemplate["entityType"], string> = {
  LEAD: "Lead",
  DEAL: "Deal",
  CONTACT: "Contact",
  COMPANY: "Company",
  USER: "User",
  TASK: "Task",
  INVOICE: "Invoice",
  QUOTE: "Quote",
  PRODUCT: "Product",
  CUSTOM: "Custom"
};

const createColumns = (
  onEdit: (template: FormTemplate) => void,
  onDelete: (id: number) => void,
  onToggle: (id: number) => void,
  onDuplicate: (id: number) => void
): ColumnDef<FormTemplate>[] => [
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
    accessorKey: "entityType",
    header: "Entity Type",
    cell: ({ row }) => {
      const type = row.getValue("entityType") as FormTemplate["entityType"];
      return <Badge variant="outline">{entityTypeLabels[type]}</Badge>;
    }
  },
  {
    accessorKey: "formFields",
    header: "Fields",
    cell: ({ row }) => {
      const fields = row.original.formFields;
      const count = Array.isArray(fields) ? fields.length : 0;
      return <span className="text-sm text-muted-foreground">{count} fields</span>;
    }
  },
  {
    accessorKey: "workflow",
    header: "Workflow",
    cell: ({ row }) => {
      const workflow = row.original.workflow;
      return workflow ? (
        <Badge variant="secondary">{workflow.name}</Badge>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    }
  },
  {
    accessorKey: "path",
    header: "Path",
    cell: ({ row }) => {
      const path = row.getValue("path") as string | null;
      return path ? (
        <div className="flex items-center gap-2">
          <code className="text-xs bg-muted px-2 py-1 rounded">{path}</code>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(path, "_blank")}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
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
            <DropdownMenuItem onClick={() => onEdit(template)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(template.id)}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggle(template.id)}>
              <Eye className="mr-2 h-4 w-4" />
              {template.isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(template.id)}
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

export default function FormBuilderPage() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<FormTemplate | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const data = await formTemplatesApi.getFormTemplates(
        undefined,
        undefined,
        entityTypeFilter === "all" ? undefined : entityTypeFilter,
        statusFilter === "all" ? undefined : statusFilter === "active"
      );
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error("Error loading form templates:", error);
      toast.error("Failed to load form templates", {
        description: error.message || "An error occurred while fetching templates"
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, entityTypeFilter]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleEdit = useCallback((template: FormTemplate) => {
    setSelectedTemplate(template);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm("Are you sure you want to delete this form template?")) {
      return;
    }

    try {
      await formTemplatesApi.deleteFormTemplate(id);
      toast.success("Form template deleted successfully");
      loadTemplates();
    } catch (error: any) {
      console.error("Error deleting form template:", error);
      toast.error("Failed to delete form template", {
        description: error.message || "An error occurred while deleting the template"
      });
    }
  }, [loadTemplates]);

  const handleToggle = useCallback(async (id: number) => {
    try {
      await formTemplatesApi.toggleFormTemplate(id);
      toast.success("Form template status updated");
      loadTemplates();
    } catch (error: any) {
      console.error("Error toggling form template:", error);
      toast.error("Failed to update form template status", {
        description: error.message || "An error occurred while updating the template"
      });
    }
  }, [loadTemplates]);

  const handleDuplicate = useCallback(async (id: number) => {
    try {
      await formTemplatesApi.duplicateFormTemplate(id);
      toast.success("Form template duplicated successfully");
      loadTemplates();
    } catch (error: any) {
      console.error("Error duplicating form template:", error);
      toast.error("Failed to duplicate form template", {
        description: error.message || "An error occurred while duplicating the template"
      });
    }
  }, [loadTemplates]);

  const columns = useMemo(
    () => createColumns(handleEdit, handleDelete, handleToggle, handleDuplicate),
    [handleEdit, handleDelete, handleToggle, handleDuplicate]
  );

  const filteredData = useMemo(() => {
    let filtered = templates;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (template) =>
          template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      );
    }

    return filtered;
  }, [templates, searchQuery]);

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
    setSelectedTemplate(null);
  };

  const handleSuccess = async () => {
    handleDialogClose();
    await loadTemplates();
    // Reload the selected template if it exists to get updated dbIds
    if (selectedTemplate) {
      try {
        const refreshed = await formTemplatesApi.getFormTemplate(selectedTemplate.id);
        setSelectedTemplate(refreshed);
        console.log('Template reloaded with dbIds:', {
          sections: (refreshed?.settings as any)?.sections?.map((s: any) => ({ id: s.id, dbId: s.dbId, title: s.title })),
          fields: refreshed?.formFields?.map((f: any) => ({ id: f.id, dbId: f.dbId, label: f.label }))
        });
      } catch (error) {
        console.error('Failed to reload template:', error);
      }
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Form Builder</h1>
          <p className="text-muted-foreground">
            Create and manage dynamic forms for Leads, Deals, Contacts, and more
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by entity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {Object.entries(entityTypeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
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
                  No templates found.
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

      <FormTemplateDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        template={selectedTemplate}
        onSuccess={handleSuccess}
      />
    </div>
  );
}































