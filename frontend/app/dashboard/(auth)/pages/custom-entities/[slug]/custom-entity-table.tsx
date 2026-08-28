"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ChevronsUpDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { formTemplatesApi, entityDataApi } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/shared/data-table/data-table";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";
import { TemplateViewerDialog } from "@/app/dashboard/(auth)/pages/form-builder/template-viewer-dialog";
import { FormField } from "@/app/dashboard/(auth)/pages/form-builder/form-builder";
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

export type CustomEntityRecord = {
  id: number;
  [key: string]: any; // Dynamic fields based on form template
};

interface CustomEntityTableProps {
  pageData: any;
  onRefresh?: () => void;
  onCreateClickRef?: React.MutableRefObject<(() => void) | null>;
}

export function CustomEntityTable({ 
  pageData,
  onRefresh,
  onCreateClickRef 
}: CustomEntityTableProps) {
  const [records, setRecords] = React.useState<CustomEntityRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState<CustomEntityRecord | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [templateId, setTemplateId] = React.useState<number | undefined>();
  const [templateFields, setTemplateFields] = React.useState<FormField[]>([]);
  const [loadingTemplate, setLoadingTemplate] = React.useState(true);

  // Load template fields from page data
  React.useEffect(() => {
    if (pageData?.template) {
      setTemplateId(pageData.template.id);
      const fields = Array.isArray(pageData.template.formFields) 
        ? pageData.template.formFields 
        : [];
      setTemplateFields(fields);
      setLoadingTemplate(false);
    }
  }, [pageData]);

  // Expose create dialog trigger to parent
  React.useEffect(() => {
    if (onCreateClickRef) {
      onCreateClickRef.current = () => setIsCreateDialogOpen(true);
    }
  }, [onCreateClickRef]);

  // Fetch records from entityData
  React.useEffect(() => {
    const fetchRecords = async () => {
      if (!templateId || !pageData?.customEntityName) return;

      try {
        setLoading(true);
        const entityDataList = await entityDataApi.getEntityDataByType("CUSTOM");
        
        // Filter by customEntityName
        const filteredData = Array.isArray(entityDataList)
          ? entityDataList.filter((ed: any) => 
              ed.customEntityName === pageData.customEntityName
            )
          : [];
        
        // Transform EntityData to records
        const transformedRecords: CustomEntityRecord[] = filteredData.map((entityData: any) => {
          const record: CustomEntityRecord = {
            id: entityData.id || 0,
            ...(typeof entityData.data === "object" && entityData.data !== null 
              ? entityData.data 
              : {}),
            createdAt: entityData.createdAt || new Date().toISOString(),
            updatedAt: entityData.updatedAt || new Date().toISOString(),
          };
          return record;
        });
        
        // Filter by search query if provided
        const filtered = searchQuery
          ? transformedRecords.filter((r: CustomEntityRecord) =>
              Object.values(r).some((val) =>
                String(val || "").toLowerCase().includes(searchQuery.toLowerCase())
              )
            )
          : transformedRecords;
        
        setRecords(filtered);
      } catch (error: any) {
        console.error("Error fetching records:", error);
        toast.error(error?.error || "Failed to fetch records");
        setRecords([]);
      } finally {
        setLoading(false);
      }
    };

    if (!loadingTemplate && templateId) {
      fetchRecords();
    }
  }, [onRefresh, searchQuery, templateId, pageData, loadingTemplate]);

  const handleDelete = async () => {
    if (!selectedRecord) return;

    try {
      await entityDataApi.deleteEntityData(selectedRecord.id);
      toast.success(`${pageData.name} deleted successfully`);
      setIsDeleteDialogOpen(false);
      setSelectedRecord(null);
      onRefresh?.();
    } catch (error: any) {
      console.error("Error deleting record:", error);
      toast.error(error?.error || "Failed to delete record");
    }
  };

  // Build columns dynamically from form template fields
  const columns = React.useMemo<ColumnDef<CustomEntityRecord>[]>(() => {
    const cols: ColumnDef<CustomEntityRecord>[] = [
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
    }

    // Add actions column
    cols.push({
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const record = row.original;

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
                setSelectedRecord(record);
                setIsEditDialogOpen(true);
              }}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setSelectedRecord(record);
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

  const user = getCurrentUser();

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : (
        <DataTable
          columns={columns}
          data={records}
          storageKey={`customEntity_${pageData?.customEntityName || "default"}`}
          toolbarExtra={() => (
            <Input
              placeholder={`Filter ${pageData?.name?.toLowerCase()}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          )}
        />
      )}

      <TemplateViewerDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        templateId={templateId}
        entityType="CUSTOM"
        onSubmit={async (data) => {
          try {
            const user = getCurrentUser();
            
            // Create entity data from template
            if (templateId) {
              await entityDataApi.createEntityData({
                entityType: "CUSTOM",
                templateId: templateId,
                customEntityName: pageData.customEntityName,
                data: {
                  ...data,
                  companyId: user?.companyId || undefined,
                  branchId: user?.branchId || undefined,
                }
              });
            }

            setIsCreateDialogOpen(false);
            toast.success(`${pageData.name} created successfully`);
            onRefresh?.();
          } catch (error: any) {
            console.error("Error creating record:", error);
            toast.error(error?.error || "Failed to create record");
            throw error;
          }
        }}
        onCancel={() => setIsCreateDialogOpen(false)}
        submitLabel={`Create ${pageData?.name}`}
      />

      {selectedRecord && (
        <TemplateViewerDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          templateId={templateId}
          entityType="CUSTOM"
          entityId={selectedRecord.id}
          initialData={selectedRecord}
          onSubmit={async (data) => {
            try {
              // Update entity data
              await entityDataApi.updateEntityData(selectedRecord.id, data);

              setIsEditDialogOpen(false);
              setSelectedRecord(null);
              toast.success(`${pageData.name} updated successfully`);
              onRefresh?.();
            } catch (error: any) {
              console.error("Error updating record:", error);
              toast.error(error?.error || "Failed to update record");
              throw error;
            }
          }}
          onCancel={() => {
            setIsEditDialogOpen(false);
            setSelectedRecord(null);
          }}
          submitLabel={`Update ${pageData?.name}`}
        />
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this {pageData?.name?.toLowerCase()}
              {selectedRecord && ` "${JSON.stringify(selectedRecord).substring(0, 50)}"`} and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedRecord(null)}>
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

