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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
import {
  ArrowUpDown,
  ColumnsIcon,
  FilterIcon,
  MoreHorizontal,
  PlusCircle,
  Star,
  Eye,
  Pencil,
  Copy,
  Trash2
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "@/lib/app-navigation";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
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
import { productApi } from "@/lib/api";

export type Product = {
  id: number;
  name?: string;
  image?: string;
  description?: string;
  category?: string;
  sub_category?: string;
  sku?: string;
  barcode?: string;
  stock?: string;
  price?: number | string;
  purchasePrice?: number | string;
  discountedPrice?: number | string;
  chargeTax?: boolean;
  taxPercentage?: number | string;
  discountType?: string;
  discountValue?: number | string;
  brand?: string;
  productType?: string;
  rating?: string;
  status: "active" | "out-of-stock" | "closed-for-sale" | "inactive" | "draft" | "archived";
  customFields?: any; // JSON object or array
};

function getProductsTableColumnClass(columnId: string, kind: "head" | "cell") {
  const base = kind === "head" ? "px-4" : "px-4";
  // Keep "actions" and "select" tight; everything else gets comfortable spacing.
  const map: Record<string, string> = {
    select: "w-10 px-3",
    actions: "w-12 px-2",

    name: "min-w-[280px]",
    price: "w-[120px] text-right tabular-nums",
    purchasePrice: "w-[150px] text-right tabular-nums",
    discountedPrice: "w-[170px] text-right tabular-nums",
    stock: "w-[90px] text-right tabular-nums",
    tax: "w-[90px] text-right tabular-nums",
    discount: "w-[120px] text-right tabular-nums",
    rating: "w-[100px]",

    category: "min-w-[140px]",
    sub_category: "min-w-[160px]",
    brand: "min-w-[140px]",
    productType: "min-w-[140px]",
    status: "min-w-[140px]",

    sku: "min-w-[130px] font-mono text-xs",
    barcode: "min-w-[160px] font-mono text-xs",
    customFields: "min-w-[240px]",
  };

  return cn(base, map[columnId]);
}

// Create columns function that accepts handlers
const createColumns = (
  onViewDetail: (id: number) => void,
  onEdit: (id: number) => void,
  onCopyId: (id: number) => void,
  onDeleteClick: (id: number, name?: string) => void
): ColumnDef<Product>[] => [
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
          Product Name
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => {
      // Determine image source
      let imageSrc: string;
      if (row.original.image) {
        const img = row.original.image;
        // Handle blob URLs, data URLs, and full HTTP/HTTPS URLs
        if (img.startsWith('blob:') || img.startsWith('http://') || img.startsWith('https://') || img.startsWith('data:')) {
          imageSrc = img;
        } else if (img.startsWith('files/')) {
          // Server-stored file path - prepend API base URL
          imageSrc = `${API_BASE_URL}/${img}`;
        } else if (img.startsWith('/images') || img.startsWith('/')) {
          // Already a valid path starting with /
          imageSrc = img;
        } else {
          // Relative path, prepend /images
          imageSrc = `/images${img}`;
        }
      } else {
        // Use a placeholder or first available product image
        imageSrc = '/images/products/01.jpeg';
      }
      
      return (
        <div className="flex items-center gap-4">
          <figure className="rounded-lg border overflow-hidden">
            <Image
              src={imageSrc}
              width={48}
              height={48}
              unoptimized
              alt={row.original.name || "Product"}
              className="object-cover"
              onError={(e) => {
                // Fallback to first product image if available, otherwise use a data URL placeholder
                const target = e.target as HTMLImageElement;
                if (target.src !== '/images/products/01.jpeg') {
                  target.src = '/images/products/01.jpeg';
                } else {
                  // Create a simple placeholder
                  target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yNCAzMkMyOC40MTgzIDMyIDMyIDI4LjQxODMgMzIgMjRDMzIgMTkuNTgxNyAyOC40MTgzIDE2IDI0IDE2QzE5LjU4MTcgMTYgMTYgMTkuNTgxNyAxNiAyNEMxNiAyOC40MTgzIDE5LjU4MTcgMzIgMjQgMzJaIiBmaWxsPSIjOUI5Q0E0Ii8+Cjwvc3ZnPgo=';
                }
              }}
            />
          </figure>
          <div className="capitalize">{row.getValue("name")}</div>
        </div>
      );
    }
  },
  {
    accessorKey: "price",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Price
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const value = row.getValue("price");
      if (!value) return "-";
      if (typeof value === "string") return value;
      const numValue = typeof value === "number" ? value : parseFloat(value as string);
      return isNaN(numValue) ? "-" : `$${numValue.toFixed(2)}`;
    }
  },
  {
    accessorKey: "category",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Category
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => <div className="capitalize">{row.getValue("category")}</div>
  },
  {
    accessorKey: "stock",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Stock
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => row.getValue("stock")
  },
  {
    accessorKey: "sku",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          SKU
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => row.getValue("sku") || "-"
  },
  {
    accessorKey: "barcode",
    header: "Barcode",
    cell: ({ row }) => row.getValue("barcode") || "-"
  },
  {
    accessorKey: "purchasePrice",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Purchase Price
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const value = row.getValue("purchasePrice");
      if (!value) return "-";
      const numValue = typeof value === "number" ? value : parseFloat(value as string);
      return isNaN(numValue) ? "-" : `$${numValue.toFixed(2)}`;
    }
  },
  {
    accessorKey: "discountedPrice",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Discounted Price
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const value = row.getValue("discountedPrice");
      if (!value) return "-";
      const numValue = typeof value === "number" ? value : parseFloat(value as string);
      return isNaN(numValue) ? "-" : `$${numValue.toFixed(2)}`;
    }
  },
  {
    id: "tax",
    header: "Tax",
    cell: ({ row }) => {
      const chargeTax = row.original.chargeTax;
      const taxPercentage = row.original.taxPercentage;
      if (!chargeTax || !taxPercentage) return "-";
      return `${taxPercentage}%`;
    }
  },
  {
    id: "discount",
    header: "Discount",
    cell: ({ row }) => {
      const discountType = row.original.discountType;
      const discountValue = row.original.discountValue;
      if (!discountType || !discountValue) return "-";
      return discountType === "PERCENTAGE" ? `${discountValue}%` : `$${discountValue}`;
    }
  },
  {
    accessorKey: "sub_category",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Sub Category
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => <div className="capitalize">{row.getValue("sub_category") || "-"}</div>
  },
  {
    accessorKey: "brand",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Brand
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => row.getValue("brand") || "-"
  },
  {
    accessorKey: "productType",
    header: "Product Type",
    cell: ({ row }) => {
      const type = row.getValue("productType") as string;
      if (!type) return "-";
      return (
        <Badge variant="outline" className="capitalize">
          {type.replace("_", " ").toLowerCase()}
        </Badge>
      );
    }
  },
  {
    accessorKey: "rating",
    header: "Rating",
    cell: ({ row }) => {
      const rating = row.getValue("rating");
      if (rating == null || rating === "") return "-";
      return (
        <div className="flex items-center gap-1">
          <Star className="size-4 fill-orange-400 text-orange-400" />{" "}
          {typeof rating === "number" || typeof rating === "string" ? rating : String(rating)}
        </div>
      );
    }
  },
  {
    id: "customFields",
    header: "Custom Fields",
    cell: ({ row }) => {
      const customFields = row.original.customFields;
      if (!customFields) return "-";
      
      try {
        const parsed = typeof customFields === "string" ? JSON.parse(customFields) : customFields;
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Display first few custom fields
          const displayFields = parsed.slice(0, 2).map((field: any) => {
            const label = field.label || field.key || "Field";
            const value = field.value !== undefined && field.value !== null ? String(field.value) : "-";
            return `${label}: ${value}`;
          }).join(", ");
          const moreCount = parsed.length > 2 ? ` +${parsed.length - 2} more` : "";
          return (
            <div className="text-xs max-w-[200px] truncate" title={displayFields + moreCount}>
              {displayFields}{moreCount}
            </div>
          );
        } else if (typeof parsed === "object" && parsed !== null) {
          // Object format
          const entries = Object.entries(parsed).slice(0, 2);
          const displayFields = entries.map(([key, value]) => `${key}: ${value}`).join(", ");
          const moreCount = Object.keys(parsed).length > 2 ? ` +${Object.keys(parsed).length - 2} more` : "";
          return (
            <div className="text-xs max-w-[200px] truncate" title={displayFields + moreCount}>
              {displayFields}{moreCount}
            </div>
          );
        }
      } catch (e) {
        console.error("Error parsing custom fields:", e);
      }
      return "-";
    }
  },
  {
    accessorKey: "status",
    header: ({ column }) => {
      return (
        <Button
          className="-ml-3"
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Status
          <ArrowUpDown className="size-3" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const status = row.original.status;

      const statusMap = {
        active: "success",
        "out-of-stock": "warning",
        "closed-for-sale": "destructive",
        inactive: "destructive",
        draft: "outline",
        archived: "outline",
        completed: "success"
      } as const;

      const statusClass = statusMap[status] ?? "default";

      return (
        <div>
          <Badge variant={statusClass} className="capitalize">
            {status.replaceAll("-", " ").replaceAll("_", " ")}
          </Badge>
        </div>
      );
    }
  },
  {
    id: "actions",
    enableHiding: false,
    cell: ({ row }) => {
      const product = row.original;
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
            <DropdownMenuItem onClick={() => onViewDetail(product.id)}>
              <Eye className="mr-2 h-4 w-4" />
              View Detail
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(product.id)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCopyId(product.id)}>
              <Copy className="mr-2 h-4 w-4" />
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteClick(product.id, product.name)}
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

export default function ProductList({ data }: { data: Product[] }) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [isMounted, setIsMounted] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [productToDelete, setProductToDelete] = React.useState<{ id: number; name?: string } | null>(null);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Action handlers
  const handleViewDetail = (id: number) => {
    router.push(`/pages/products/${id}`);
  };

  const handleEdit = (id: number) => {
    router.push(`/pages/products/create?id=${id}`);
  };

  const handleCopyId = async (id: number) => {
    try {
      await navigator.clipboard.writeText(id.toString());
      toast.success("Product ID copied to clipboard", {
        description: `ID: ${id}`,
      });
    } catch (error) {
      toast.error("Failed to copy ID");
    }
  };

  const handleDeleteClick = (id: number, name?: string) => {
    setProductToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;

    try {
      await productApi.deleteProduct(productToDelete.id);
      toast.success("Product deleted successfully", {
        description: productToDelete.name ? `"${productToDelete.name}" has been deleted.` : "Product has been deleted.",
      });
      setDeleteDialogOpen(false);
      setProductToDelete(null);
      // Refresh the page to update the list
      router.refresh();
    } catch (error: any) {
      console.error("Error deleting product:", error);
      toast.error("Failed to delete product", {
        description: error.message || "An error occurred while deleting the product.",
      });
    }
  };

  const columns = React.useMemo(
    () => createColumns(handleViewDetail, handleEdit, handleCopyId, handleDeleteClick),
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

  const statuses = [
    {
      value: "active",
      label: "Active"
    },
    {
      value: "inactive",
      label: "Inactive"
    },
    {
      value: "out-of-stock",
      label: "Out of stock"
    },
    {
      value: "closed-for-sale",
      label: "Closed for sale"
    }
  ];

  const categories = [
    {
      value: "beauty",
      label: "Beauty"
    },
    {
      value: "technology",
      label: "Technology"
    },
    {
      value: "toys",
      label: "Toys"
    },
    {
      value: "food",
      label: "Food"
    },
    {
      value: "home-appliances",
      label: "Home Appliances"
    }
  ];

  const Filters = () => {
    return (
      <>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <PlusCircle />
              Status
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0">
            <Command>
              <CommandInput placeholder="Status" className="h-9" />
              <CommandList>
                <CommandEmpty>No status found.</CommandEmpty>
                <CommandGroup>
                  {statuses.map((status) => (
                    <CommandItem
                      key={status.value}
                      value={status.value}
                      onSelect={(currentValue) => {
                        // setValue(currentValue === value ? "" : currentValue);
                        // setOpen(false);
                      }}>
                      <div className="flex items-center space-x-3 py-1">
                        <Checkbox id={status.value} />
                        <label
                          htmlFor={status.value}
                          className="leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          {status.label}
                        </label>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <PlusCircle />
              Category
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0">
            <Command>
              <CommandInput placeholder="Category" className="h-9" />
              <CommandList>
                <CommandEmpty>No category found.</CommandEmpty>
                <CommandGroup>
                  {categories.map((category) => (
                    <CommandItem key={category.value} value={category.label}>
                      <div className="flex items-center space-x-3 py-1">
                        <Checkbox id={category.value} />
                        <label
                          htmlFor={category.value}
                          className="leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          {category.label}
                        </label>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {isMounted ? (
          <Select defaultValue="all">
            <SelectTrigger className="w-52 lg:w-auto">
              <span className="text-muted-foreground text-sm">Price:</span>
              <SelectValue placeholder="Select a product" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">$100-$200</SelectItem>
              <SelectItem value="in-stock">$200-$300</SelectItem>
              <SelectItem value="low-stock">$300-$400</SelectItem>
              <SelectItem value="archived">$400-$500</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="w-52 lg:w-auto h-10 border rounded-md flex items-center justify-center">
            <span className="text-muted-foreground text-sm">Price:</span>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search products..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
            className="max-w-sm"
          />
          <div className="hidden gap-2 md:flex">
            <Filters />
          </div>
          {/*filter for mobile*/}
          <div className="inline md:hidden">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon">
                  <FilterIcon />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-4">
                <div className="grid space-y-2">
                  <Filters />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="ms-auto flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <span className="hidden lg:inline">Columns</span> <ColumnsIcon />
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
      </div>

      <div className="rounded-lg border">
        <Table className="min-w-[1200px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className={getProductsTableColumnClass(header.column.id, "head")}
                    >
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
                    <TableCell
                      key={cell.id}
                      className={getProductsTableColumnClass(cell.column.id, "cell")}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the product{" "}
              <strong>{productToDelete?.name || `with ID ${productToDelete?.id}`}</strong>? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setProductToDelete(null)}>
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
    </div>
  );
}
