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
import { ChevronDownIcon, ChevronsUpDown, Ellipsis } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formTemplatesApi, entityDataApi } from "@/lib/api";
import { FormField } from "@/app/[company]/(auth)/pages/form-builder/form-builder";
import { toast } from "sonner";
import { TemplateViewerDialog } from "@/app/[company]/(auth)/pages/form-builder/template-viewer-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

export type Deal = {
  id: string;
  [key: string]: any; // Dynamic fields based on form template
};

interface DealsTableProps {
  deals?: Deal[];
  loading?: boolean;
  onRefresh?: () => void;
}

export function DealsTable({ deals: propDeals, loading: propLoading = false, onRefresh }: DealsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [formTemplate, setFormTemplate] = React.useState<any>(null);
  const [templateFields, setTemplateFields] = React.useState<FormField[]>([]);
  const [loadingTemplate, setLoadingTemplate] = React.useState(true);
  const [deals, setDeals] = React.useState<Deal[]>(propDeals || []);
  const [loading, setLoading] = React.useState(propLoading);
  const [selectedDeal, setSelectedDeal] = React.useState<Deal | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = React.useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [dealTemplateId, setDealTemplateId] = React.useState<number | undefined>();

  // Fetch Deal form template and entity data
  React.useEffect(() => {
    const loadTemplate = async () => {
      try {
        setLoadingTemplate(true);
        const templates = await formTemplatesApi.getFormTemplates(
          undefined,
          undefined,
          "DEAL",
          true
        );
        
        // Get the first active Deal template
        const dealTemplate = Array.isArray(templates) 
          ? templates.find((t: any) => t.entityType === "DEAL" && t.isActive)
          : null;
        
        if (dealTemplate) {
          setFormTemplate(dealTemplate);
          setDealTemplateId(dealTemplate.id);
          const fields = Array.isArray(dealTemplate.formFields) 
            ? dealTemplate.formFields 
            : [];
          setTemplateFields(fields);
        } else {
          // If no template, use default columns
          setTemplateFields([]);
        }
      } catch (error: any) {
        console.error("Error loading form template:", error);
        toast.error("Failed to load form template");
        setTemplateFields([]);
      } finally {
        setLoadingTemplate(false);
      }
    };

    loadTemplate();
  }, []);

  // Fetch Deal entity data from database
  React.useEffect(() => {
    const loadDeals = async () => {
      // Always fetch from database to get latest data
      // Only use propDeals if explicitly provided and not empty
      try {
        setLoading(true);
        const entityDataList = await entityDataApi.getEntityDataByType("DEAL");
        
        // Transform EntityData to Deal format
        // EntityData.data is a JSON object containing all the form field values
        const transformedDeals: Deal[] = (entityDataList as any[]).map((entityData: any) => {
          const dealData: Deal = {
            id: entityData.id?.toString() || String(entityData.id),
            // Spread the data object which contains all form field values
            ...(typeof entityData.data === "object" && entityData.data !== null 
              ? entityData.data 
              : {}),
            // Add metadata
            createdAt: entityData.createdAt,
            updatedAt: entityData.updatedAt,
            entityType: entityData.entityType,
            templateId: entityData.templateId
          };
          return dealData;
        });
        
        setDeals(transformedDeals);
      } catch (error: any) {
        console.error("Error loading deals:", error);
        toast.error(error?.error || "Failed to load deals");
        setDeals([]);
      } finally {
        setLoading(false);
      }
    };

    loadDeals();
  }, [onRefresh]); // Only reload when onRefresh changes

  // Helper function to get entity ID from deal
  const getDealEntityId = (deal: Deal): number | undefined => {
    const id = deal.id;
    if (typeof id === "number") return id;
    if (typeof id === "string" && !id.startsWith("deal-")) {
      const parsed = parseInt(id);
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  };

  // Handle view deal
  const handleViewDeal = (deal: Deal) => {
    setSelectedDeal(deal);
    setIsViewDialogOpen(true);
  };

  // Handle edit deal
  const handleEditDeal = (deal: Deal) => {
    setSelectedDeal(deal);
    setIsEditDialogOpen(true);
  };

  // Handle delete deal
  const handleDeleteDeal = (deal: Deal) => {
    setSelectedDeal(deal);
    setIsDeleteDialogOpen(true);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!selectedDeal) return;

    const entityId = getDealEntityId(selectedDeal);
    if (!entityId) {
      toast.error("Invalid deal ID");
      setIsDeleteDialogOpen(false);
      return;
    }

    try {
      await entityDataApi.deleteEntityData(entityId);
      toast.success("Deal deleted successfully");
      
      // Remove deal from local state
      setDeals((prev) => prev.filter((d) => getDealEntityId(d) !== entityId));
      
      setIsDeleteDialogOpen(false);
      setSelectedDeal(null);
      
      // Trigger refresh if callback provided
      if (onRefresh) {
        onRefresh();
      }
    } catch (error: any) {
      console.error("Error deleting deal:", error);
      toast.error(error?.error || "Failed to delete deal");
    }
  };

  // Handle update deal (from edit dialog)
  const handleUpdateDeal = async (data: Record<string, any>) => {
    if (!selectedDeal) return;

    const entityId = getDealEntityId(selectedDeal);
    if (!entityId) {
      toast.error("Invalid deal ID");
      return;
    }

    try {
      await entityDataApi.updateEntityData(entityId, data);
      toast.success("Deal updated successfully");
      
      // Update deal in local state
      setDeals((prev) =>
        prev.map((d) => {
          const dId = getDealEntityId(d);
          if (dId === entityId) {
            return {
              ...d,
              ...data,
              updatedAt: new Date().toISOString()
            };
          }
          return d;
        })
      );
      
      setIsEditDialogOpen(false);
      setSelectedDeal(null);
      
      // Trigger refresh if callback provided
      if (onRefresh) {
        onRefresh();
      }
    } catch (error: any) {
      console.error("Error updating deal:", error);
      toast.error(error?.error || "Failed to update deal");
      throw error; // Re-throw to let TemplateViewerDialog handle the error state
    }
  };

  // Build columns dynamically from form template fields
  const columns = React.useMemo<ColumnDef<Deal>[]>(() => {
    const cols: ColumnDef<Deal>[] = [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
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
      }
    ];

    // Add columns from form template fields
    if (templateFields.length > 0) {
      templateFields.forEach((field) => {
        cols.push({
          id: field.name,
          accessorKey: field.name,
          header: ({ column }) => {
            return (
              <Button
                variant="ghost"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              >
                {field.label}
                <ChevronsUpDown className="ml-2 h-4 w-4" />
              </Button>
            );
          },
          cell: ({ row }) => {
            const value = row.getValue(field.name);
            // Format value based on field type
            if (value === null || value === undefined || value === "") {
              return <span className="text-muted-foreground">-</span>;
            }
            
            if (field.type === "date") {
              try {
                const dateValue = new Date(value as string);
                if (!isNaN(dateValue.getTime())) {
                  return dateValue.toLocaleDateString();
                }
              } catch (e) {
                // Invalid date, return as string
              }
            }
            
            if (field.type === "datetime") {
              try {
                const dateValue = new Date(value as string);
                if (!isNaN(dateValue.getTime())) {
                  return dateValue.toLocaleString();
                }
              } catch (e) {
                // Invalid date, return as string
              }
            }
            
            if (field.type === "multiselect" && Array.isArray(value)) {
              return value.length > 0 ? value.join(", ") : <span className="text-muted-foreground">-</span>;
            }
            
            if (field.type === "checkbox" || field.type === "toggle") {
              return value ? "Yes" : "No";
            }
            
            if (typeof value === "object" && value !== null) {
              return JSON.stringify(value);
            }
            
            return String(value);
          }
        });
      });
    } else {
      // Default columns if no template
      cols.push(
        {
          id: "name",
          accessorKey: "name",
          header: "Name",
          cell: ({ row }) => <div>{row.getValue("name") || "-"}</div>
        },
        {
          id: "email",
          accessorKey: "email",
          header: "Email",
          cell: ({ row }) => <div>{row.getValue("email") || "-"}</div>
        },
        {
          id: "phone",
          accessorKey: "phone",
          header: "Phone",
          cell: ({ row }) => <div>{row.getValue("phone") || "-"}</div>
        },
        {
          id: "status",
          accessorKey: "status",
          header: "Status",
          cell: ({ row }) => <div>{row.getValue("status") || "-"}</div>
        }
      );
    }

    // Add actions column
    cols.push({
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const deal = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <Ellipsis className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(deal.id)}>
                Copy deal ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleViewDeal(deal)}>View deal</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleEditDeal(deal)}>Edit deal</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-destructive" 
                onClick={() => handleDeleteDeal(deal)}
              >
                Delete deal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      }
    });

    return cols;
  }, [templateFields]);

  // Helper function to get column label from column id
  const getColumnLabel = (columnId: string): string => {
    if (columnId === "select" || columnId === "actions") {
      return columnId === "select" ? "Select" : "Actions";
    }
    
    // Find the field in templateFields by name (which is the column id)
    const field = templateFields.find((f) => f.name === columnId);
    if (field) {
      return field.label;
    }
    
    // Default columns fallback
    const defaultLabels: Record<string, string> = {
      name: "Name",
      email: "Email",
      phone: "Phone",
      status: "Status"
    };
    
    return defaultLabels[columnId] || columnId;
  };

  const table = useReactTable({
    data: deals,
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

  if (loadingTemplate) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading table configuration...</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Filter deals..."
          value={(table.getColumn(templateFields[0]?.name || "email")?.getFilterValue() as string) ?? ""}
          onChange={(event) => {
            const firstField = templateFields[0]?.name || "email";
            table.getColumn(firstField)?.setFilterValue(event.target.value);
          }}
          className="max-w-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              Columns <ChevronDownIcon className="ml-2 h-4 w-4" />
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
                    {getColumnLabel(column.id)}
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
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
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
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No deals found.
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
      </div>

      {/* View Deal Dialog */}
      {selectedDeal && (
        <TemplateViewerDialog
          open={isViewDialogOpen}
          onOpenChange={setIsViewDialogOpen}
          templateId={dealTemplateId}
          entityType="DEAL"
          entityId={getDealEntityId(selectedDeal)}
          initialData={selectedDeal}
          onSubmit={async () => {
            // View mode - no submission, just close
            setIsViewDialogOpen(false);
          }}
          onCancel={() => {
            setIsViewDialogOpen(false);
            setSelectedDeal(null);
          }}
          submitLabel="Close"
        />
      )}

      {/* Edit Deal Dialog */}
      {selectedDeal && (
        <TemplateViewerDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          templateId={dealTemplateId}
          entityType="DEAL"
          entityId={getDealEntityId(selectedDeal)}
          initialData={selectedDeal}
          onSubmit={handleUpdateDeal}
          onCancel={() => {
            setIsEditDialogOpen(false);
            setSelectedDeal(null);
          }}
          submitLabel="Update Deal"
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this deal? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsDeleteDialogOpen(false);
              setSelectedDeal(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

