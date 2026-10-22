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
import { ChevronDownIcon, ChevronsUpDown, Ellipsis, Plus } from "lucide-react";
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

export type Contact = {
  id: string;
  [key: string]: any; // Dynamic fields based on form template
};

interface ContactsTableProps {
  contacts?: Contact[];
  loading?: boolean;
  onRefresh?: () => void;
  onCreateClickRef?: React.MutableRefObject<(() => void) | null>;
}

export function ContactsTable({ contacts: propContacts, loading: propLoading = false, onRefresh, onCreateClickRef }: ContactsTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [formTemplate, setFormTemplate] = React.useState<any>(null);
  const [templateFields, setTemplateFields] = React.useState<FormField[]>([]);
  const [loadingTemplate, setLoadingTemplate] = React.useState(true);
  const [contacts, setContacts] = React.useState<Contact[]>(propContacts || []);
  const [loading, setLoading] = React.useState(propLoading);
  const [selectedContact, setSelectedContact] = React.useState<Contact | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = React.useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [contactTemplateId, setContactTemplateId] = React.useState<number | undefined>();

  // Fetch Contact form template
  React.useEffect(() => {
    const loadTemplate = async () => {
      try {
        setLoadingTemplate(true);
        const templates = await formTemplatesApi.getFormTemplates(
          undefined,
          undefined,
          "CONTACT",
          true
        );
        
        // Get the first active Contact template
        const contactTemplate = Array.isArray(templates) 
          ? templates.find((t: any) => t.entityType === "CONTACT" && t.isActive)
          : null;
        
        if (contactTemplate) {
          setFormTemplate(contactTemplate);
          setContactTemplateId(contactTemplate.id);
          const fields = Array.isArray(contactTemplate.formFields) 
            ? contactTemplate.formFields 
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

  // Set up the create dialog trigger ref
  React.useEffect(() => {
    if (onCreateClickRef) {
      onCreateClickRef.current = () => {
        // Check if template is still loading
        if (loadingTemplate) {
          toast.info("Please wait, template is loading...");
          return;
        }
        // Check if template exists
        if (!contactTemplateId) {
          toast.error("No contact template found. Please create a contact template first in Form Builder.");
          return;
        }
        setIsCreateDialogOpen(true);
      };
    }
    return () => {
      if (onCreateClickRef) {
        onCreateClickRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactTemplateId, loadingTemplate]);

  // Fetch Contact entity data from database
  React.useEffect(() => {
    const loadContacts = async () => {
      try {
        setLoading(true);
        const entityDataList = await entityDataApi.getEntityDataByType("CONTACT");
        
        // Transform EntityData to Contact format
        const transformedContacts: Contact[] = (entityDataList as any[]).map((entityData: any) => {
          const contactData: Contact = {
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
          return contactData;
        });
        
        setContacts(transformedContacts);
      } catch (error: any) {
        console.error("Error loading contacts:", error);
        toast.error(error?.error || "Failed to load contacts");
        setContacts([]);
      } finally {
        setLoading(false);
      }
    };

    loadContacts();
  }, [onRefresh]);

  // Helper function to get entity ID from contact
  const getContactEntityId = (contact: Contact): number | undefined => {
    const id = contact.id;
    if (typeof id === "number") return id;
    if (typeof id === "string" && !id.startsWith("contact-")) {
      const parsed = parseInt(id);
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  };

  // Handle view contact
  const handleViewContact = (contact: Contact) => {
    setSelectedContact(contact);
    setIsViewDialogOpen(true);
  };

  // Handle edit contact
  const handleEditContact = (contact: Contact) => {
    setSelectedContact(contact);
    setIsEditDialogOpen(true);
  };

  // Handle delete contact
  const handleDeleteContact = (contact: Contact) => {
    setSelectedContact(contact);
    setIsDeleteDialogOpen(true);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!selectedContact) return;

    const entityId = getContactEntityId(selectedContact);
    if (!entityId) {
      toast.error("Invalid contact ID");
      setIsDeleteDialogOpen(false);
      return;
    }

    try {
      await entityDataApi.deleteEntityData(entityId);
      toast.success("Contact deleted successfully");
      
      // Remove contact from local state
      setContacts((prev) => prev.filter((c) => getContactEntityId(c) !== entityId));
      
      setIsDeleteDialogOpen(false);
      setSelectedContact(null);
      
      // Trigger refresh if callback provided
      if (onRefresh) {
        onRefresh();
      }
    } catch (error: any) {
      console.error("Error deleting contact:", error);
      toast.error(error?.error || "Failed to delete contact");
    }
  };

  // Handle update contact (from edit dialog)
  const handleUpdateContact = async (data: Record<string, any>) => {
    if (!selectedContact) return;

    const entityId = getContactEntityId(selectedContact);
    if (!entityId) {
      toast.error("Invalid contact ID");
      return;
    }

    try {
      await entityDataApi.updateEntityData(entityId, data);
      toast.success("Contact updated successfully");
      
      // Update contact in local state
      setContacts((prev) =>
        prev.map((c) => {
          const cId = getContactEntityId(c);
          if (cId === entityId) {
            return {
              ...c,
              ...data,
              updatedAt: new Date().toISOString()
            };
          }
          return c;
        })
      );
      
      setIsEditDialogOpen(false);
      setSelectedContact(null);
      
      // Trigger refresh if callback provided
      if (onRefresh) {
        onRefresh();
      }
    } catch (error: any) {
      console.error("Error updating contact:", error);
      toast.error(error?.error || "Failed to update contact");
      throw error;
    }
  };

  // Handle create contact (from create dialog)
  const handleCreateContact = async (data: Record<string, any>) => {
    try {
      await entityDataApi.createEntityData({
        entityType: "CONTACT",
        templateId: contactTemplateId,
        data
      });
      toast.success("Contact created successfully");
      
      setIsCreateDialogOpen(false);
      
      // Reload contacts
      if (onRefresh) {
        onRefresh();
      } else {
        // Manually reload if no callback
        const entityDataList = await entityDataApi.getEntityDataByType("CONTACT");
        const transformedContacts: Contact[] = (entityDataList as any[]).map((entityData: any) => {
          const contactData: Contact = {
            id: entityData.id?.toString() || String(entityData.id),
            ...(typeof entityData.data === "object" && entityData.data !== null 
              ? entityData.data 
              : {}),
            createdAt: entityData.createdAt,
            updatedAt: entityData.updatedAt,
            entityType: entityData.entityType,
            templateId: entityData.templateId
          };
          return contactData;
        });
        setContacts(transformedContacts);
      }
    } catch (error: any) {
      console.error("Error creating contact:", error);
      toast.error(error?.error || "Failed to create contact");
      throw error;
    }
  };

  // Build columns dynamically from form template fields
  const columns = React.useMemo<ColumnDef<Contact>[]>(() => {
    const cols: ColumnDef<Contact>[] = [
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
      templateFields
        .filter((field) => field.name && field.name !== "select" && field.name !== "actions")
        .forEach((field) => {
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
        }
      );
    }

    // Add actions column
    cols.push({
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const contact = row.original;
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
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(contact.id)}>
                Copy contact ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleViewContact(contact)}>View contact</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleEditContact(contact)}>Edit contact</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="text-destructive" 
                onClick={() => handleDeleteContact(contact)}
              >
                Delete contact
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
      phone: "Phone"
    };
    
    return defaultLabels[columnId] || columnId;
  };

  const table = useReactTable({
    data: contacts,
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
          placeholder="Filter contacts..."
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
                  No contacts found.
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

      {/* View Contact Dialog */}
      {selectedContact && (
        <TemplateViewerDialog
          open={isViewDialogOpen}
          onOpenChange={setIsViewDialogOpen}
          templateId={contactTemplateId}
          entityType="CONTACT"
          entityId={getContactEntityId(selectedContact)}
          initialData={selectedContact}
          onSubmit={async () => {
            setIsViewDialogOpen(false);
          }}
          onCancel={() => {
            setIsViewDialogOpen(false);
            setSelectedContact(null);
          }}
          submitLabel="Close"
        />
      )}

      {/* Edit Contact Dialog */}
      {selectedContact && (
        <TemplateViewerDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          templateId={contactTemplateId}
          entityType="CONTACT"
          entityId={getContactEntityId(selectedContact)}
          initialData={selectedContact}
          onSubmit={handleUpdateContact}
          onCancel={() => {
            setIsEditDialogOpen(false);
            setSelectedContact(null);
          }}
          submitLabel="Update Contact"
        />
      )}

      {/* Create Contact Dialog */}
      <TemplateViewerDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        templateId={contactTemplateId}
        entityType="CONTACT"
        initialData={{}}
        onSubmit={handleCreateContact}
        onCancel={() => {
          setIsCreateDialogOpen(false);
        }}
        submitLabel="Create Contact"
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this contact? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsDeleteDialogOpen(false);
              setSelectedContact(null);
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

