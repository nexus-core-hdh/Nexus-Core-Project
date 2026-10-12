"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PlusCircle, Loader2 } from "lucide-react";
import { productCategoryApi, productSubCategoryApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

interface AddNewCategoryProps {
  type: "category" | "subcategory";
  categoryId?: number; // Required if type is "subcategory"
  onSuccess?: () => void; // Callback when category/subcategory is created
}

export default function AddNewCategory({ type, categoryId, onSuccess }: AddNewCategoryProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (type === "subcategory" && !categoryId) {
      toast.error("Category is required for subcategory");
      return;
    }

    try {
      setIsLoading(true);
      
      if (type === "category") {
        const user = getCurrentUser();
        await productCategoryApi.createProductCategory({
          name: name.trim(),
          description: description.trim() || undefined,
          isActive: true,
          companyId: user?.companyId || undefined,
          branchId: user?.branchId || undefined,
        });
        toast.success("Category created successfully");
      } else {
        await productSubCategoryApi.createProductSubCategory({
          name: name.trim(),
          description: description.trim() || undefined,
          categoryId: categoryId!,
          isActive: true,
        });
        toast.success("Subcategory created successfully");
      }

      // Reset form
      setName("");
      setDescription("");
      setOpen(false);
      
      // Call success callback to refresh data
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error("Error creating category:", error);
      toast.error(error.message || `Failed to create ${type}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="outline" type="button">
          <PlusCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              {type === "category" ? "Category" : "Subcategory"} Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Enter ${type} name`}
              disabled={isLoading}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description"
              disabled={isLoading}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false);
                setName("");
                setDescription("");
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
