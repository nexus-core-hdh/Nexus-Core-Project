"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { pricingPlansApi } from "@/lib/api";
import { toast } from "sonner";
import CreatePricingPlanDialog from "./create-pricing-plan-dialog";
import { DataTable } from "@/components/shared/data-table/data-table";

export type PricingPlan = {
  id: number;
  name: string;
  description?: string;
  price: number;
  yearlyPrice?: number;
  industry?: string;
  features: any[];
  enabledMenuItems?: any[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export const columns = (
  onEdit: (plan: PricingPlan) => void,
  onDelete: (id: number) => void
): ColumnDef<PricingPlan>[] => [
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
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => <div className="font-medium">{row.getValue("name")}</div>,
    minSize: 150,
    size: 180
  },
  {
    accessorKey: "price",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Monthly Price
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const price = row.getValue("price") as number;
      return <div>${price.toFixed(2)}</div>;
    },
    minSize: 120,
    size: 140
  },
  {
    accessorKey: "yearlyPrice",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Yearly Price
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const price = row.getValue("yearlyPrice") as number | undefined;
      return price ? <div>${price.toFixed(2)}</div> : "N/A";
    },
    minSize: 120,
    size: 140
  },
  {
    accessorKey: "industry",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Industry
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const industry = row.getValue("industry") as string | undefined;
      return industry ? <Badge variant="outline">{industry}</Badge> : <Badge variant="secondary">All Industries</Badge>;
    },
    minSize: 140,
    size: 160
  },
  {
    accessorKey: "features",
    header: "Features",
    cell: ({ row }) => {
      const features = row.getValue("features") as any[];
      return <div className="text-sm text-muted-foreground">{features?.length || 0} features</div>;
    },
    minSize: 100,
    size: 120
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
    },
    minSize: 100,
    size: 120
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const plan = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(plan)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(plan.id)}
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

export default function PricingPlansDataTable({ 
  data, 
  onRefresh 
}: { 
  data: PricingPlan[];
  onRefresh: () => void;
}) {
  const [editingPlan, setEditingPlan] = React.useState<PricingPlan | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  const handleEdit = (plan: PricingPlan) => {
    setEditingPlan(plan);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this pricing plan?")) {
      return;
    }

    try {
      await pricingPlansApi.deletePricingPlan(id);
      toast.success("Pricing plan deleted successfully");
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete pricing plan");
    }
  };

  const tableColumns = React.useMemo(() => columns(handleEdit, handleDelete), []);

  return (
    <div className="w-full space-y-4">
      <DataTable
        columns={tableColumns}
        data={data}
        storageKey="pricingPlans"
        searchColumn="name"
        searchPlaceholder="Filter plans..."
        onAddClick={() => setIsDialogOpen(true)}
        addLabel="Create Plan"
      />
      <CreatePricingPlanDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setEditingPlan(null);
        }}
        plan={editingPlan}
        onSuccess={onRefresh}
      />
    </div>
  );
}

