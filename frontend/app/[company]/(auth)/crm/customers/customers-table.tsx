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
import { ChevronDownIcon, ChevronsUpDown, Ellipsis, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
import { customerApi, formTemplatesApi, entityDataApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { TemplateViewerDialog } from "@/app/[company]/(auth)/pages/form-builder/template-viewer-dialog";
import { FormField } from "@/app/[company]/(auth)/pages/form-builder/form-builder";
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
import { format } from "date-fns";

export type Customer = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  createdAt: string;
  updatedAt: string;
  orders?: any[];
  [key: string]: any; // Dynamic fields based on form template
};

interface CustomersTableProps {
  customers?: Customer[];
  loading?: boolean;
  onRefresh?: () => void;
  onCreateClickRef?: React.MutableRefObject<(() => void) | null>;
}

export function CustomersTable({ 
  customers: propCustomers, 
  loading: propLoading = false, 
  onRefresh,
  onCreateClickRef 
}: CustomersTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [customers, setCustomers] = React.useState<Customer[]>(propCustomers || []);
  const [loading, setLoading] = React.useState(propLoading);
  const [selectedCustomer, setSelectedCustomer] = React.useState<Customer | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [customerTemplateId, setCustomerTemplateId] = React.useState<number | undefined>();
  const [customerTemplate, setCustomerTemplate] = React.useState<any>(null);
  const [customerEntityType, setCustomerEntityType] = React.useState<string | undefined>();
  const [templateFields, setTemplateFields] = React.useState<FormField[]>([]);
  const [loadingTemplate, setLoadingTemplate] = React.useState(true);

  // Load customer template ID (similar to how leads loads template)
  // Check for both CUSTOMER entity type and CUSTOM entity with customEntityName "Customer"
  React.useEffect(() => {
    const loadTemplate = async () => {
      try {
        setLoadingTemplate(true);
        // First try to get CUSTOMER entity type templates
        let templates = await formTemplatesApi.getFormTemplates(
          undefined,
          undefined,
          "CUSTOMER",
          true
        );
        let activeTemplate = Array.isArray(templates)
          ? templates.find((t: any) => t.entityType === "CUSTOMER" && t.isActive)
          : null;

        // If not found, try CUSTOM entity type with customEntityName "Customer"
        if (!activeTemplate) {
          templates = await formTemplatesApi.getFormTemplates(
            undefined,
            undefined,
            "CUSTOM",
            true
          );
          activeTemplate = Array.isArray(templates)
            ? templates.find((t: any) => 
                t.entityType === "CUSTOM" && 
                t.isActive && 
                t.customEntityName && 
                t.customEntityName.toLowerCase() === "customer"
              )
            : null;
        }

        if (activeTemplate) {
          setCustomerTemplateId(activeTemplate.id);
          setCustomerTemplate(activeTemplate);
          setCustomerEntityType(activeTemplate.entityType === "CUSTOM" ? "CUSTOM" : "CUSTOMER");
          const fields = Array.isArray(activeTemplate.formFields) 
            ? activeTemplate.formFields 
            : [];
          setTemplateFields(fields);
        } else {
          // If no template, use default columns
          setCustomerEntityType(undefined);
          setTemplateFields([]);
        }
      } catch (error) {
        console.error("Error loading customer template:", error);
        setTemplateFields([]);
      } finally {
        setLoadingTemplate(false);
      }
    };
    loadTemplate();
  }, []);

  // Expose create dialog trigger to parent
  React.useEffect(() => {
    if (onCreateClickRef) {
      onCreateClickRef.current = () => setIsCreateDialogOpen(true);
    }
  }, [onCreateClickRef]);

  // Fetch customers - use entityData if template exists, otherwise use customerApi
  React.useEffect(() => {
    const fetchCustomers = async () => {
      try {
        setLoading(true);
        const user = getCurrentUser();
        if (!user) return;

        // If template exists, fetch from entityData (similar to leads)
        if (customerTemplateId && customerEntityType) {
          const entityDataList = await entityDataApi.getEntityDataByType(customerEntityType);
          
          // Transform EntityData to Customer format
          const transformedCustomers: Customer[] = (entityDataList as any[]).map((entityData: any) => {
            const customerData: Customer = {
              id: entityData.id || 0,
              // Spread the data object which contains all form field values
              ...(typeof entityData.data === "object" && entityData.data !== null 
                ? entityData.data 
                : {}),
              // Add metadata
              createdAt: entityData.createdAt || new Date().toISOString(),
              updatedAt: entityData.updatedAt || new Date().toISOString(),
            };
            return customerData;
          });
          
          // Filter by search query if provided
          const filtered = searchQuery
            ? transformedCustomers.filter((c: Customer) =>
                Object.values(c).some((val) =>
                  String(val || "").toLowerCase().includes(searchQuery.toLowerCase())
                )
              )
            : transformedCustomers;
          
          setCustomers(filtered);
        } else {
          // Fallback to customerApi if no template
          const data = await customerApi.getCustomers({
            companyId: user.companyId || undefined,
            branchId: user.branchId || undefined,
            search: searchQuery || undefined
          });

          setCustomers(Array.isArray(data) ? data : []);
        }
      } catch (error: any) {
        console.error("Error fetching customers:", error);
        toast.error(error?.error || "Failed to fetch customers");
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    };

    if (!loadingTemplate) {
      fetchCustomers();
    }
  }, [onRefresh, searchQuery, customerTemplateId, customerEntityType, loadingTemplate]);

  const handleDelete = async () => {
    if (!selectedCustomer) return;

    try {
      await customerApi.deleteCustomer(selectedCustomer.id);
      toast.success("Customer deleted successfully");
      setIsDeleteDialogOpen(false);
      setSelectedCustomer(null);
      onRefresh?.();
    } catch (error: any) {
      console.error("Error deleting customer:", error);
      toast.error(error?.error || "Failed to delete customer");
    }
  };

  // Build columns dynamically from form template fields
  const columns = React.useMemo<ColumnDef<Customer>[]>(() => {
    const cols: ColumnDef<Customer>[] = [
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
          header: ({ column }) => {
            return (
              <Button
                variant="ghost"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                Name
                <ChevronsUpDown className="ml-2 h-4 w-4" />
              </Button>
            );
          },
          cell: ({ row }) => <div className="font-medium">{row.getValue("name")}</div>
        },
        {
          id: "email",
          accessorKey: "email",
          header: "Email",
          cell: ({ row }) => <div className="text-muted-foreground">{row.getValue("email") || "-"}</div>
        },
        {
          id: "phone",
          accessorKey: "phone",
          header: "Phone",
          cell: ({ row }) => <div className="text-muted-foreground">{row.getValue("phone") || "-"}</div>
        },
        {
          id: "city",
          accessorKey: "city",
          header: "City",
          cell: ({ row }) => <div className="text-muted-foreground">{row.getValue("city") || "-"}</div>
        },
        {
          id: "country",
          accessorKey: "country",
          header: "Country",
          cell: ({ row }) => <div className="text-muted-foreground">{row.getValue("country") || "-"}</div>
        },
        {
          id: "createdAt",
          accessorKey: "createdAt",
          header: "Created",
          cell: ({ row }) => {
            const date = row.getValue("createdAt") as string;
            return <div className="text-muted-foreground">{date ? format(new Date(date), "MMM dd, yyyy") : "-"}</div>;
          }
        }
      );
    }

    // Add actions column
    cols.push({
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const customer = row.original;

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
              <DropdownMenuItem onClick={() => {
                setSelectedCustomer(customer);
                setIsEditDialogOpen(true);
              }}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setSelectedCustomer(customer);
                  setIsDeleteDialogOpen(true);
                }}
                className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      }
    });

    return cols;
  }, [templateFields]);

  const table = useReactTable({
    data: customers,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Search customers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Loading customers...
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
                  No customers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2">
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

      <TemplateViewerDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        templateId={customerTemplateId}
        entityType={customerTemplate?.entityType === "CUSTOM" ? "CUSTOM" : "CUSTOMER"}
        onSubmit={async (data) => {
          try {
            const user = getCurrentUser();
            const customerData = {
              name: data.name || "",
              email: data.email || undefined,
              phone: data.phone || undefined,
              address: data.address || undefined,
              city: data.city || undefined,
              state: data.state || undefined,
              country: data.country || undefined,
              postalCode: data.postalCode || undefined,
              companyId: user?.companyId || undefined,
              branchId: user?.branchId || undefined,
            };

            // Create entity data from template
            if (customerTemplateId) {
              await entityDataApi.createEntityData({
                entityType: customerTemplate?.entityType === "CUSTOM" ? "CUSTOM" : "CUSTOMER",
                templateId: customerTemplateId,
                customEntityName: customerTemplate?.entityType === "CUSTOM" ? customerTemplate.customEntityName : undefined,
                data: {
                  ...data,
                  companyId: user?.companyId || undefined,
                  branchId: user?.branchId || undefined,
                }
              });
            }

            // Also create customer record for compatibility
            await customerApi.createCustomer(customerData);

            setIsCreateDialogOpen(false);
            toast.success("Customer created successfully");
            onRefresh?.();
          } catch (error: any) {
            console.error("Error creating customer:", error);
            toast.error(error?.error || "Failed to create customer");
            throw error;
          }
        }}
        onCancel={() => setIsCreateDialogOpen(false)}
        submitLabel="Create Customer"
      />

      {selectedCustomer && (
        <TemplateViewerDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          templateId={customerTemplateId}
          entityType={customerTemplate?.entityType === "CUSTOM" ? "CUSTOM" : "CUSTOMER"}
          entityId={selectedCustomer.id}
          initialData={{
            name: selectedCustomer.name || "",
            email: selectedCustomer.email || "",
            phone: selectedCustomer.phone || "",
            address: selectedCustomer.address || "",
            city: selectedCustomer.city || "",
            state: selectedCustomer.state || "",
            country: selectedCustomer.country || "",
            postalCode: selectedCustomer.postalCode || "",
          }}
          onSubmit={async (data) => {
            try {
              const user = getCurrentUser();
              const customerData = {
                name: data.name || "",
                email: data.email || undefined,
                phone: data.phone || undefined,
                address: data.address || undefined,
                city: data.city || undefined,
                state: data.state || undefined,
                country: data.country || undefined,
                postalCode: data.postalCode || undefined,
                companyId: user?.companyId || undefined,
                branchId: user?.branchId || undefined,
              };

              // Update customer
              await customerApi.updateCustomer(selectedCustomer.id, customerData);

              // Update entity data if it exists
              if (customerTemplateId) {
                try {
                  const entityType = customerTemplate?.entityType === "CUSTOM" ? "CUSTOM" : "CUSTOMER";
                  const entityDataList = await entityDataApi.getEntityDataByType(entityType);
                  const existingEntityData = Array.isArray(entityDataList)
                    ? entityDataList.find((ed: any) => ed.id === selectedCustomer.id || (ed.data && ed.data.id === selectedCustomer.id))
                    : null;

                  if (existingEntityData) {
                    await entityDataApi.updateEntityData(existingEntityData.id, data);
                  } else {
                    // Create new entity data if it doesn't exist
                    await entityDataApi.createEntityData({
                      entityType: entityType,
                      templateId: customerTemplateId,
                      customEntityName: customerTemplate?.entityType === "CUSTOM" ? customerTemplate.customEntityName : undefined,
                      data: {
                        ...data,
                        companyId: user?.companyId || undefined,
                        branchId: user?.branchId || undefined,
                      }
                    });
                  }
                } catch (entityError) {
                  console.error("Error updating entity data:", entityError);
                  // Continue even if entity data update fails
                }
              }

              setIsEditDialogOpen(false);
              setSelectedCustomer(null);
              toast.success("Customer updated successfully");
              onRefresh?.();
            } catch (error: any) {
              console.error("Error updating customer:", error);
              toast.error(error?.error || "Failed to update customer");
              throw error;
            }
          }}
          onCancel={() => {
            setIsEditDialogOpen(false);
            setSelectedCustomer(null);
          }}
          submitLabel="Update Customer"
        />
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the customer
              {selectedCustomer && ` "${selectedCustomer.name}"`} and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedCustomer(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}




