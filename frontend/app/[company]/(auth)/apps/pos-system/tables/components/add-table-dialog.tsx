"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "@/lib/app-navigation";
import { tableApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TableCategory } from "@/app/[company]/(auth)/apps/pos-system/store";
import AddTableCategory from "./add-table-category";

type AddTableDialog = {
  tableCategories: TableCategory[];
  onCategoryAdded?: () => void;
};

export default function AddTableDialog({ tableCategories, onCategoryAdded }: AddTableDialog) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tableName, setTableName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!tableName.trim()) {
      toast.error("Table name is required");
      return;
    }
    if (!selectedCategory) {
      toast.error("Section is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = getCurrentUser();
      if (!user) {
        throw new Error("User not found");
      }

      await tableApi.createTable({
        name: tableName.trim(),
        categoryId: parseInt(selectedCategory),
        companyId: user.companyId || undefined,
        branchId: user.branchId || undefined,
      });

      toast.success("Table created successfully!");
      setOpen(false);
      setTableName("");
      setSelectedCategory("");
      router.refresh();
    } catch (error: any) {
      console.error("Error creating table:", error);
      toast.error("Failed to create table", {
        description: error.message || "Please try again."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCategoryAdded = () => {
    if (onCategoryAdded) {
      onCategoryAdded();
    } else {
      router.refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus />
          <span className="hidden sm:inline">Add Table</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Table</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="table-name">Table Name</Label>
            <Input 
              id="table-name" 
              placeholder="e.g. Table 7"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="table-section">Section</Label>
            </div>
            <div className="flex gap-2">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a section" />
                </SelectTrigger>
                <SelectContent>
                  {tableCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <AddTableCategory onSuccess={handleCategoryAdded} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
