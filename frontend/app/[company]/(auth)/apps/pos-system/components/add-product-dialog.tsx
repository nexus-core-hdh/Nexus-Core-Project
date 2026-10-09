import React, { useState, useEffect } from "react";
import { AlertCircleIcon, ImageIcon, Plus, UploadIcon, XIcon } from "lucide-react";

import { ProductCategory } from "@/app/[company]/(auth)/apps/pos-system/store";
import { useFileUpload, type FileMetadata } from "@/hooks/use-file-upload";
import { productApi } from "@/lib/api";
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
import { Checkbox } from "@/components/ui/checkbox";

type AddProductDialog = {
  categories: ProductCategory[];
  onSuccess?: () => void;
};

export default function AddProductDialog({ categories, onSuccess }: AddProductDialog) {
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [chargeTax, setChargeTax] = useState(false);
  const [taxPercentage, setTaxPercentage] = useState("");
  const [discountType, setDiscountType] = useState<"AMOUNT" | "PERCENTAGE" | "">("");
  const [discountValue, setDiscountValue] = useState("");
  const [discountedPrice, setDiscountedPrice] = useState("");

  const maxSizeMB = 2;
  const maxSize = maxSizeMB * 1024 * 1024;

  const [
    { files, isDragging, errors },
    {
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      openFileDialog,
      removeFile,
      getInputProps
    }
  ] = useFileUpload({
    accept: "image/png,image/jpeg,image/jpg",
    maxSize
  });
  const previewUrl = files[0]?.preview || null;

  // Calculate discounted price when price, discount type, or discount value changes
  useEffect(() => {
    const basePrice = parseFloat(price) || 0;
    if (basePrice > 0 && discountType && discountValue) {
      const discount = parseFloat(discountValue) || 0;
      let calculatedDiscountedPrice = basePrice;
      
      if (discountType === "AMOUNT") {
        calculatedDiscountedPrice = basePrice - discount;
      } else if (discountType === "PERCENTAGE") {
        calculatedDiscountedPrice = basePrice - (basePrice * discount / 100);
      }
      
      // Ensure discounted price is not negative
      calculatedDiscountedPrice = Math.max(0, calculatedDiscountedPrice);
      setDiscountedPrice(calculatedDiscountedPrice.toFixed(2));
    } else {
      setDiscountedPrice("");
    }
  }, [price, discountType, discountValue]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setProductName("");
      setPrice("");
      setPurchasePrice("");
      setCategoryId("");
      setChargeTax(false);
      setTaxPercentage("");
      setDiscountType("");
      setDiscountValue("");
      setDiscountedPrice("");
      if (files.length > 0 && files[0]?.id) {
        removeFile(files[0].id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    if (!productName.trim()) {
      toast.error("Product name is required");
      return;
    }
    if (!price || parseFloat(price) <= 0) {
      toast.error("Valid price is required");
      return;
    }
    if (!categoryId) {
      toast.error("Category is required");
      return;
    }
    if (chargeTax && (!taxPercentage || parseFloat(taxPercentage) < 0)) {
      toast.error("Tax percentage is required when charge tax is enabled");
      return;
    }
    if (discountType && (!discountValue || parseFloat(discountValue) < 0)) {
      toast.error("Discount value is required when discount type is selected");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = getCurrentUser();
      if (!user) {
        throw new Error("User not found");
      }

      // Upload image if provided
      let imageUrl = "";
      const selectedFile = files[0]?.file;

      // `useFileUpload` can store either a browser `File` or existing metadata (already uploaded).
      if (selectedFile && !(selectedFile instanceof File)) {
        imageUrl = (selectedFile as FileMetadata).url || "";
      } else if (selectedFile instanceof File) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        
        const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001"}/upload`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: formData,
        });

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          imageUrl = uploadData.url || uploadData.path || "";
        }
      }

      // Prepare product data
      const productData: any = {
        name: productName,
        price: parseFloat(price),
        cost: purchasePrice ? parseFloat(purchasePrice) : undefined,
        chargeTax: chargeTax,
        taxPercentage: chargeTax && taxPercentage ? parseFloat(taxPercentage) : undefined,
        discountType: discountType || undefined,
        discountValue: discountType && discountValue ? parseFloat(discountValue) : undefined,
        discountedPrice: discountedPrice ? parseFloat(discountedPrice) : undefined,
        image: imageUrl,
        category: categoryId,
        status: "active",
      };

      // Add company and branch IDs
      if (user.companyId) {
        productData.companyId = user.companyId;
      }
      if (user.branchId) {
        productData.branchId = user.branchId;
      }

      await productApi.createProduct(productData);

      toast.success("Product created successfully!");
      setOpen(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error("Error creating product:", error);
      toast.error("Failed to create product", {
        description: error.message || "Please try again."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus />
          <span className="hidden sm:inline">Add Product</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="product-name">Product Name</Label>
            <Input 
              id="product-name" 
              placeholder="Americano, Pepperoni Pizza etc."
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-price">Price *</Label>
              <Input 
                id="product-price" 
                type="number" 
                step="0.01"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-price">Purchase Price</Label>
              <Input 
                id="purchase-price" 
                type="number" 
                step="0.01"
                placeholder="0.00"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-category">Category *</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category: ProductCategory) => (
                  <SelectItem key={category.id} value={category.id.toString()}>
                    {category.icon} {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Tax Section */}
          <div className="space-y-3 border rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="charge-tax" 
                checked={chargeTax}
                onCheckedChange={(checked) => setChargeTax(checked as boolean)}
              />
              <Label htmlFor="charge-tax" className="font-medium cursor-pointer">
                Charge tax on this product
              </Label>
            </div>
            {chargeTax && (
              <div className="space-y-2 pl-6">
                <Label htmlFor="tax-percentage">Tax Percentage (%)</Label>
                <Input 
                  id="tax-percentage" 
                  type="number" 
                  step="0.01"
                  placeholder="0.00"
                  value={taxPercentage}
                  onChange={(e) => setTaxPercentage(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Discount Section */}
          <div className="space-y-3 border rounded-lg p-4">
            <div className="space-y-2">
              <Label htmlFor="discount-type">Discount Type</Label>
              <Select value={discountType} onValueChange={(value) => setDiscountType(value as "AMOUNT" | "PERCENTAGE" | "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select discount type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AMOUNT">Amount</SelectItem>
                  <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {discountType && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="discount-value">
                    Discount Value {discountType === "PERCENTAGE" ? "(%)" : "($)"}
                  </Label>
                  <Input 
                    id="discount-value" 
                    type="number" 
                    step="0.01"
                    placeholder="0.00"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discounted-price">Discounted Price</Label>
                  <Input 
                    id="discounted-price" 
                    type="number" 
                    step="0.01"
                    placeholder="0.00"
                    value={discountedPrice}
                    readOnly
                    className="bg-muted"
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Image</Label>
            <div className="flex flex-col gap-2">
              <div className="relative">
                <div
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  data-dragging={isDragging || undefined}
                  className="border-input data-[dragging=true]:bg-accent/50 has-[input:focus]:border-ring has-[input:focus]:ring-ring/50 relative flex min-h-52 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed p-4 transition-colors has-[input:focus]:ring-[3px]">
                  <input {...getInputProps()} className="sr-only" aria-label="Upload image file" />
                  {previewUrl ? (
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                      <img
                        src={previewUrl}
                        className="mx-auto max-h-full rounded object-contain"
                        alt={files[0]?.file?.name || "Uploaded image"}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
                      <div
                        className="bg-background mb-2 flex size-11 shrink-0 items-center justify-center rounded-full border"
                        aria-hidden="true">
                        <ImageIcon className="size-4 opacity-60" />
                      </div>
                      <p className="mb-1.5 text-sm font-medium">Drop your image here</p>
                      <p className="text-muted-foreground text-xs">
                        PNG or JPG (max. {maxSizeMB}MB)
                      </p>
                      <Button variant="outline" className="mt-4" onClick={openFileDialog}>
                        <UploadIcon className="-ms-1 size-4 opacity-60" aria-hidden="true" />
                        Select image
                      </Button>
                    </div>
                  )}
                </div>

                {previewUrl && (
                  <div className="absolute top-4 right-4">
                    <button
                      type="button"
                      className="focus-visible:border-ring focus-visible:ring-ring/50 z-50 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white transition-[color,box-shadow] outline-none hover:bg-black/80 focus-visible:ring-[3px]"
                      onClick={() => removeFile(files[0]?.id)}
                      aria-label="Remove image">
                      <XIcon className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              {errors.length > 0 && (
                <div className="text-destructive flex items-center gap-1 text-xs" role="alert">
                  <AlertCircleIcon className="size-3 shrink-0" />
                  <span>{errors[0]}</span>
                </div>
              )}
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
