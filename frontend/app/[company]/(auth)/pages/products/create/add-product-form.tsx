"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import Link from "@/components/app-link";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  AlertCircleIcon,
  ChevronLeft,
  CirclePlusIcon,
  ImageIcon,
  UploadIcon,
  XIcon,
  Package,
  Layers,
  Gift,
  Settings,
  Trash2,
  Plus,
  Pencil,
  Check
} from "lucide-react";
import { useFileUpload } from "@/hooks/use-file-upload";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { AddMediaFromUrl } from "@/app/[company]/(auth)/pages/products/create/add-media-from-url";
import AddNewCategory from "@/app/[company]/(auth)/pages/products/create/add-category";
import { API_BASE_URL, productApi, productCategoryApi, productSubCategoryApi, getAuthHeaders } from "@/lib/api";
import { useRouter, useSearchParams } from "@/lib/app-navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

const FormSchema = z.object({
  name: z.string().min(2, {
    message: "Product name must be at least 2 characters."
  }),
  sku: z.string(),
  barcode: z.string(),
  description: z.string(),
  file: z.string(),
  variants: z.string(),
  basePrice: z.string(),
  discountedPrice: z.string(),
  purchasePrice: z.string().optional(),
  chargeTax: z.boolean().default(false),
  taxPercentage: z.string().optional(),
  discountType: z.string().optional(),
  discountValue: z.string().optional(),
  status: z.string(),
  category: z.string(),
  sub_category: z.string(),
  inStock: z.boolean().default(false),
  quantity: z.string().optional(),
  productType: z.enum(["SINGLE", "VARIANT", "COMPOSITE"]).default("SINGLE"),
  variantGroups: z.string().optional(),
  compositeItems: z.string().optional(),
  customFields: z.string().optional()
});

type Variant = {
  id: string;
  option: string;
  value: string;
  price: string;
};

type ProductCategory = {
  id: number;
  name: string;
  description?: string;
  subCategories?: ProductSubCategory[];
};

type ProductSubCategory = {
  id: number;
  name: string;
  description?: string;
  categoryId: number;
};

type VariantGroup = {
  id: string;
  name: string;
  options: string[];
};

type VariantCombination = {
  id: string;
  combination: string; // e.g., "Size: S, Color: Red"
  attributes: Record<string, string>; // e.g., { "Size": "S", "Color": "Red" }
  price?: number; // Price adjustment or absolute price
  image?: string; // Variant-specific image
  sku?: string; // Variant-specific SKU
  stock?: number; // Variant-specific stock
};

type CompositeItem = {
  id: string;
  productId: number;
  productName: string;
  quantity: number;
  price?: number;
};

type CustomField = {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "select";
  value: any;
  options?: string[]; // For select type
  required?: boolean;
};

export default function AddProductForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get('id');
  const isEditMode = !!productId;
  const [variants, setVariants] = useState<Variant[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [subCategories, setSubCategories] = useState<ProductSubCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingProduct, setIsLoadingProduct] = useState(isEditMode);
  const [inStock, setInStock] = useState(false);
  const [productType, setProductType] = useState<"SINGLE" | "VARIANT" | "COMPOSITE">("SINGLE");
  const [variantGroups, setVariantGroups] = useState<VariantGroup[]>([]);
  const [variantCombinations, setVariantCombinations] = useState<VariantCombination[]>([]);
  const [compositeItems, setCompositeItems] = useState<CompositeItem[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [availableProducts, setAvailableProducts] = useState<Array<{id: number, name: string, price: number}>>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showCustomFieldDialog, setShowCustomFieldDialog] = useState(false);
  const [editingCustomField, setEditingCustomField] = useState<CustomField | null>(null);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<CustomField[]>([]);
  const [customFieldsSectionTitle, setCustomFieldsSectionTitle] = useState("Custom Fields");
  const [isEditingSectionTitle, setIsEditingSectionTitle] = useState(false);
  const [chargeTax, setChargeTax] = useState(false);
  const [taxPercentage, setTaxPercentage] = useState("");
  const [discountType, setDiscountType] = useState<"AMOUNT" | "PERCENTAGE" | "">("");
  const [discountValue, setDiscountValue] = useState("");
  
  const form = useForm<z.input<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: "",
      sku: "",
      barcode: "",
      description: "",
      file: "",
      variants: "",
      basePrice: "",
      discountedPrice: "",
      purchasePrice: "",
      chargeTax: false,
      taxPercentage: "",
      discountType: "",
      discountValue: "",
      status: "",
      category: "",
      sub_category: "",
      inStock: false,
      quantity: "",
      productType: "SINGLE",
      variantGroups: "",
      compositeItems: "",
      customFields: ""
    }
  });

  const selectedCategoryId = form.watch("category");

  // Fetch categories and subcategories
  const fetchCategories = async () => {
    try {
      setIsLoadingCategories(true);
      const [categoriesData, subCategoriesData] = await Promise.all([
        productCategoryApi.getProductCategories({ isActive: true }),
        productSubCategoryApi.getProductSubCategories({ isActive: true }),
      ]);
      setCategories(categoriesData);
      setSubCategories(subCategoriesData);
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast.error("Failed to load categories");
    } finally {
      setIsLoadingCategories(false);
    }
  };

  // Fetch available products for composite products
  const fetchAvailableProducts = async () => {
    try {
      setIsLoadingProducts(true);
      const products = await productApi.getProducts();
      setAvailableProducts(products.map((p: any) => ({
        id: p.id,
        name: p.name,
        price: p.price || 0
      })));
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to load products");
    } finally {
      setIsLoadingProducts(false);
    }
  };

  // Fetch custom section title from company/branch
  const fetchCustomSectionTitle = async () => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) return;

      // Prefer branch title, fallback to company title
      if (currentUser.branchId) {
        const response = await fetch(`${API_BASE_URL}/branches/${currentUser.branchId}`, {
          headers: getAuthHeaders(),
        });
        if (response.ok) {
          const branch = await response.json();
          if (branch.customFieldsSectionTitle) {
            setCustomFieldsSectionTitle(branch.customFieldsSectionTitle);
            return;
          }
        }
      }

      if (currentUser.companyId) {
        const response = await fetch(`${API_BASE_URL}/companies/${currentUser.companyId}`, {
          headers: getAuthHeaders(),
        });
        if (response.ok) {
          const company = await response.json();
          if (company.customFieldsSectionTitle) {
            setCustomFieldsSectionTitle(company.customFieldsSectionTitle);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching custom section title:", error);
    }
  };

  // Save custom section title to company/branch
  const saveCustomSectionTitle = async (title: string) => {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) return;

      // Prefer saving to branch, fallback to company
      if (currentUser.branchId) {
        const response = await fetch(`${API_BASE_URL}/branches/${currentUser.branchId}`, {
          method: 'PUT',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ customFieldsSectionTitle: title }),
        });
        if (response.ok) {
          toast.success("Section title updated");
          return;
        }
      }

      if (currentUser.companyId) {
        const response = await fetch(`${API_BASE_URL}/companies/${currentUser.companyId}`, {
          method: 'PUT',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ customFieldsSectionTitle: title }),
        });
        if (response.ok) {
          toast.success("Section title updated");
        }
      }
    } catch (error) {
      console.error("Error saving custom section title:", error);
      toast.error("Failed to save section title");
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchCustomSectionTitle();
  }, []);

  // Fetch available products when composite type is selected
  useEffect(() => {
    if (productType === "COMPOSITE") {
      fetchAvailableProducts();
    }
  }, [productType]);

  // Fetch product data when in edit mode
  useEffect(() => {
    const loadProduct = async () => {
      if (!isEditMode || !productId) return;
      
      try {
        setIsLoadingProduct(true);
        const product = await productApi.getProductById(parseInt(productId));
        
        // Populate form with product data
        const hasQuantity = product.quantity !== null && product.quantity !== undefined && product.quantity > 0;
        setInStock(hasQuantity);
        
        form.reset({
          name: product.name || "",
          sku: product.sku || "",
          barcode: product.barcode || "",
          description: product.description || "",
          file: product.image || "",
          variants: product.variants ? (typeof product.variants === 'string' ? product.variants : JSON.stringify(product.variants)) : "",
          basePrice: product.price?.toString() || "",
          discountedPrice: product.discountedPrice?.toString() || "",
          purchasePrice: product.cost?.toString() || "",
          chargeTax: product.chargeTax || false,
          taxPercentage: product.taxPercentage?.toString() || "",
          discountType: product.discountType || "",
          discountValue: product.discountValue?.toString() || "",
          status: product.status || "draft",
          category: product.categoryId?.toString() || "",
          sub_category: product.subCategoryId?.toString() || "",
          inStock: hasQuantity,
          quantity: product.quantity?.toString() || ""
        });
        
        // Set state for new fields
        setChargeTax(product.chargeTax || false);
        setTaxPercentage(product.taxPercentage?.toString() || "");
        setDiscountType((product.discountType as "AMOUNT" | "PERCENTAGE") || "");
        setDiscountValue(product.discountValue?.toString() || "");

        // Set variants if they exist
        if (product.variants) {
          try {
            const parsedVariants = typeof product.variants === 'string' 
              ? JSON.parse(product.variants) 
              : product.variants;
            if (Array.isArray(parsedVariants)) {
              setVariants(parsedVariants);
            } else if (typeof parsedVariants === 'object') {
              // Convert object to array format if needed
              setVariants(Object.entries(parsedVariants).map(([option, value]) => ({
                id: Math.random().toString(),
                option,
                value: String(value),
                price: ""
              })));
            }
          } catch (e) {
            console.error("Error parsing variants:", e);
          }
        }

        // Load custom fields
        if (product.customFields) {
          try {
            const parsed = typeof product.customFields === 'string' 
              ? JSON.parse(product.customFields) 
              : product.customFields;
            if (Array.isArray(parsed)) {
              // Separate field definitions from values
              setCustomFieldDefinitions(parsed.map((f: any) => ({
                id: f.id,
                key: f.key,
                label: f.label,
                type: f.type,
                options: f.options,
                required: f.required,
                value: "" // Don't load value into definition
              })));
              // Set values separately
              setCustomFields(parsed);
            }
          } catch (e) {
            console.error("Error parsing custom fields:", e);
          }
        }

        // Set image if exists
        if (product.image) {
          // If it's a server path, we'll keep it as is
          // If it's a blob or data URL, we might need to handle it differently
          // For now, we'll just keep the path
        }
      } catch (error: any) {
        console.error("Error loading product:", error);
        toast.error("Failed to load product", {
          description: error.message || "Could not load product data."
        });
        router.push("/pages/products/create");
      } finally {
        setIsLoadingProduct(false);
      }
    };

    loadProduct();
  }, [isEditMode, productId, form, router]);

  // Update subcategories when category changes
  useEffect(() => {
    if (selectedCategoryId) {
      const categoryId = parseInt(selectedCategoryId);
      const filtered = subCategories.filter((sub) => sub.categoryId === categoryId);
      // If no subcategories for selected category, clear the subcategory field
      if (filtered.length === 0) {
        form.setValue("sub_category", "");
      }
    } else {
      form.setValue("sub_category", "");
    }
  }, [selectedCategoryId, subCategories, form]);

  // Calculate discounted price when basePrice, discountType, or discountValue changes
  useEffect(() => {
    const basePrice = parseFloat(form.watch("basePrice")) || 0;
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
      form.setValue("discountedPrice", calculatedDiscountedPrice.toFixed(2));
    } else if (!discountType || !discountValue) {
      // Clear discounted price if discount is removed
      form.setValue("discountedPrice", "");
    }
  }, [form.watch("basePrice"), discountType, discountValue, form]);

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
    maxSize: 5 * 1024 * 1024, // 5MB
    multiple: true,
    maxFiles: 5
  });

  async function onSubmit(data: z.input<typeof FormSchema>) {
    try {
      const parsed = FormSchema.parse(data);
      // Handle image uploads - upload to server first (only if new file is selected)
      let imagePath: string | undefined = undefined;
      
      // In edit mode, check if we have an existing image path
      if (isEditMode && parsed.file && parsed.file.startsWith('files/')) {
        // Keep existing image path
        imagePath = parsed.file;
      }
      
      // If new file is uploaded, upload it
      if (files.length > 0 && files[0].file) {
        try {
          // Upload image to server
          const formData = new FormData();
          const imageFile = files[0].file;
          if (!(imageFile instanceof File)) {
            throw new Error("Invalid file type");
          }
          formData.append("image", imageFile);
          
          const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
          const headers: HeadersInit = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          const uploadResponse = await fetch(`${API_BASE_URL}/product-images`, {
            method: 'POST',
            headers,
            body: formData,
          });

          if (!uploadResponse.ok) {
            throw new Error('Failed to upload image');
          }

          const uploadData = await uploadResponse.json();
          imagePath = uploadData.path; // This will be like "files/IMAGE/products/filename.jpg"
        } catch (uploadError) {
          console.error('Error uploading image:', uploadError);
          toast.error(`Failed to upload image. Product will be ${isEditMode ? 'updated' : 'created'} without image.`);
          // Continue without image if upload fails
        }
      }

      // Get current user to get companyId and branchId
      const currentUser = getCurrentUser();
      
      // Prepare product data - only include fields that have values
      const productData: any = {
        name: parsed.name,
        basePrice: parsed.basePrice || "0",
        status: parsed.status || "draft",
        quantity: inStock && parsed.quantity ? parseInt(parsed.quantity) || 0 : 0,
        productType: productType,
      };

      // Add optional fields only if they have values
      if (parsed.description?.trim()) {
        productData.description = parsed.description.trim();
      }
      if (parsed.sku?.trim()) {
        productData.sku = parsed.sku.trim();
      }
      if (parsed.barcode?.trim()) {
        productData.barcode = parsed.barcode.trim();
      }
      if (parsed.discountedPrice) {
        productData.discountedPrice = parsed.discountedPrice;
      }
      if (parsed.purchasePrice) {
        productData.cost = parsed.purchasePrice;
      }
      if (parsed.chargeTax !== undefined) {
        productData.chargeTax = parsed.chargeTax;
      }
      if (parsed.taxPercentage) {
        productData.taxPercentage = parsed.taxPercentage;
      }
      if (parsed.discountType) {
        productData.discountType = parsed.discountType;
      }
      if (parsed.discountValue) {
        productData.discountValue = parsed.discountValue;
      }
      if (parsed.category?.trim()) {
        productData.category = parsed.category.trim();
      }
      if (parsed.sub_category?.trim()) {
        productData.sub_category = parsed.sub_category.trim();
      }
      if (imagePath) {
        productData.image = imagePath;
      }

      // Only include variants if they exist and product type is SINGLE (for backward compatibility)
      if (productType === "SINGLE" && variants.length > 0) {
        productData.variants = variants;
      }

      // Only include variantGroups if product type is VARIANT
      if (productType === "VARIANT" && variantGroups.length > 0) {
        productData.variantGroups = variantGroups;
      }

      // Only include compositeItems if product type is COMPOSITE
      if (productType === "COMPOSITE" && compositeItems.length > 0) {
        productData.compositeItems = compositeItems;
      }

      // Only include customFields if they exist
      if (customFieldDefinitions.length > 0) {
        const filteredCustomFields = customFields.filter(f => customFieldDefinitions.some(def => def.id === f.id));
        if (filteredCustomFields.length > 0) {
          productData.customFields = filteredCustomFields;
        }
      }

      console.log('Submitting product data:', {
        isEditMode,
        productId: isEditMode ? productId : null,
        productData
      });

      // Create product via API with companyId, branchId, and userId as query params
      const queryParams = new URLSearchParams();
      if (currentUser?.companyId) {
        queryParams.append('companyId', currentUser.companyId.toString());
      }
      if (currentUser?.branchId) {
        queryParams.append('branchId', currentUser.branchId.toString());
      }
      if (currentUser?.id) {
        queryParams.append('userId', currentUser.id.toString());
      }
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      let response;
      if (isEditMode && productId) {
        // Update existing product
        const productIdNum = parseInt(productId);
        if (isNaN(productIdNum)) {
          throw new Error('Invalid product ID');
        }

        const queryParams = new URLSearchParams();
        if (currentUser?.companyId) {
          queryParams.append('companyId', currentUser.companyId.toString());
        }
        if (currentUser?.branchId) {
          queryParams.append('branchId', currentUser.branchId.toString());
        }
        if (currentUser?.id) {
          queryParams.append('userId', currentUser.id.toString());
        }
        const queryString = queryParams.toString();
        const endpoint = `/products/${productIdNum}${queryString ? `?${queryString}` : ''}`;
        
        console.log('Updating product:', {
          endpoint: `${API_BASE_URL}${endpoint}`,
          method: 'PUT',
          productId: productIdNum,
          productData
        });
        
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(productData),
        });
      } else {
        // Create new product
        const queryParams = new URLSearchParams();
        if (currentUser?.companyId) {
          queryParams.append('companyId', currentUser.companyId.toString());
        }
        if (currentUser?.branchId) {
          queryParams.append('branchId', currentUser.branchId.toString());
        }
        const queryString = queryParams.toString();
        const endpoint = `/products${queryString ? `?${queryString}` : ''}`;
        
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(productData),
        });
      }

      if (!response.ok) {
        let errorMessage = isEditMode ? 'Failed to update product' : 'Failed to create product';
        const status = response.status;
        const statusText = response.statusText;
        
        // Clone the response to read it without consuming the stream
        const clonedResponse = response.clone();
        
        try {
          // Try to get response as text first to see what we're dealing with
          const responseText = await clonedResponse.text();
          
          console.error('Product update error - Raw response:', {
            status,
            statusText,
            responseText: responseText || '(empty)',
            contentType: response.headers.get('content-type'),
            url: response.url || 'unknown'
          });
          
          // Try to parse as JSON if we have content
          let errorData: any = {};
          if (responseText && responseText.trim()) {
            try {
              errorData = JSON.parse(responseText);
            } catch (e) {
              errorData = { raw: responseText, parseError: (e as Error).message };
            }
          }
          
          // Extract error message from various possible fields
          errorMessage = errorData.error || 
                        errorData.message || 
                        errorData.details || 
                        errorData.raw || 
                        (status === 404 ? 'Product not found' : '') ||
                        (status === 400 ? 'Invalid product data' : '') ||
                        (status === 500 ? 'Server error occurred' : '') ||
                        errorMessage;
          
          console.error('Product update error - Details:', {
            status,
            statusText,
            errorData,
            errorMessage,
            endpoint: isEditMode ? `PUT /products/${productId}` : 'POST /products'
          });
        } catch (parseError: any) {
          console.error('Product update error - Could not read response:', {
            status,
            statusText,
            parseError: parseError?.message || String(parseError),
            endpoint: isEditMode ? `PUT /products/${productId}` : 'POST /products'
          });
          errorMessage = `HTTP ${status}: ${statusText || 'Unknown error'}`;
        }
        
        throw new Error(errorMessage);
      }
      
      const responseData = await response.json();
      
      toast.success(isEditMode ? "Product updated successfully!" : "Product created successfully!", {
        description: `Product "${data.name}" has been ${isEditMode ? 'updated' : 'saved'}.`
      });

      // Redirect to products list after a short delay
      setTimeout(() => {
        router.push("/pages/products");
      }, 1500);
    } catch (error: any) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} product:`, error);
      toast.error(isEditMode ? "Failed to update product" : "Failed to create product", {
        description: error.message || `An error occurred while ${isEditMode ? 'updating' : 'saving'} the product.`
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="mb-4 flex flex-col justify-between space-y-4 lg:flex-row lg:items-center lg:space-y-2">
          <div className="flex items-center gap-4">
            <Button variant="outline" asChild>
              <Link href="/pages/products">
                <ChevronLeft />
              </Link>
            </Button>
            <h1 className="text-lg font-bold tracking-tight">Add Products</h1>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary">
              Discard
            </Button>
            <Button type="button" variant="outline">
              Save Draft
            </Button>
            <Button type="submit">Publish</Button>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-6">
          <div className="space-y-4 lg:col-span-4">
            {/* Product Type Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Product Type</CardTitle>
                <CardAction>
                  <FormDescription>
                    Select the type of product you want to create
                  </FormDescription>
                </CardAction>
              </CardHeader>
              <CardContent>
                <FormField
                  name="productType"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="grid grid-cols-3 gap-4">
                          <div
                            onClick={() => {
                              field.onChange("SINGLE");
                              setProductType("SINGLE");
                            }}
                            className={`cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                              productType === "SINGLE"
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Package className={`size-5 ${productType === "SINGLE" ? "text-primary" : "text-muted-foreground"}`} />
                              <div>
                                <div className="font-semibold">Single Product</div>
                                <div className="text-muted-foreground text-xs">Simple product with no variations</div>
                              </div>
                            </div>
                          </div>
                          <div
                            onClick={() => {
                              field.onChange("VARIANT");
                              setProductType("VARIANT");
                            }}
                            className={`cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                              productType === "VARIANT"
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Layers className={`size-5 ${productType === "VARIANT" ? "text-primary" : "text-muted-foreground"}`} />
                              <div>
                                <div className="font-semibold">With Variants</div>
                                <div className="text-muted-foreground text-xs">Size, color, etc.</div>
                              </div>
                            </div>
                          </div>
                          <div
                            onClick={() => {
                              field.onChange("COMPOSITE");
                              setProductType("COMPOSITE");
                              fetchAvailableProducts();
                            }}
                            className={`cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                              productType === "COMPOSITE"
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Gift className={`size-5 ${productType === "COMPOSITE" ? "text-primary" : "text-muted-foreground"}`} />
                              <div>
                                <div className="font-semibold">Composite</div>
                                <div className="text-muted-foreground text-xs">Gift packs, bundles</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Product Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid gap-4 lg:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="sku"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SKU</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="barcode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Barcode</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea {...field} value={field.value || ""} />
                        </FormControl>
                        <FormDescription>
                          Set a description to the product for better visibility.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
            {/* -- Product images -- */}
            <Card>
              <CardHeader>
                <CardTitle>Product Images</CardTitle>
                <CardAction>
                  <AddMediaFromUrl>
                    <Button variant="link" size="sm" className="mt-0! h-auto p-0">
                      <span className="hidden lg:block">Add media from URL</span>
                      <span className="block lg:hidden">Add URL</span>
                    </Button>
                  </AddMediaFromUrl>
                </CardAction>
              </CardHeader>
              <CardContent>
                <FormField
                  name="file"
                  control={form.control}
                  render={({ field }) => (
                    <div className="flex flex-col gap-2">
                      <div
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        data-dragging={isDragging || undefined}
                        data-files={files.length > 0 || undefined}
                        className="border-input data-[dragging=true]:bg-accent/50 has-[input:focus]:border-ring has-[input:focus]:ring-ring/50 relative flex min-h-52 flex-col items-center overflow-hidden rounded-xl border border-dashed p-4 transition-colors not-data-[files]:justify-center has-[input:focus]:ring-[3px]">
                        <input
                          {...getInputProps()}
                          className="sr-only"
                          aria-label="Upload image file"
                        />
                        {files.length > 0 ? (
                          <div className="flex w-full flex-col gap-3">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="truncate text-sm font-medium">
                                Uploaded Files ({files.length})
                              </h3>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={openFileDialog}
                                disabled={files.length >= 5}>
                                <UploadIcon
                                  className="-ms-0.5 size-3.5 opacity-60"
                                  aria-hidden="true"
                                />
                                Add more
                              </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                              {files.map((file) => (
                                <div
                                  key={file.id}
                                  className="bg-accent relative aspect-square rounded-md border">
                                  <img
                                    src={file.preview}
                                    alt={file.file.name}
                                    className="size-full rounded-[inherit] object-cover"
                                  />
                                  <Button
                                    type="button"
                                    onClick={() => removeFile(file.id)}
                                    size="icon"
                                    className="border-background focus-visible:border-background absolute -top-2 -right-2 size-6 rounded-full border-2 shadow-none">
                                    <XIcon className="size-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
                            <div
                              className="bg-background mb-2 flex size-11 shrink-0 items-center justify-center rounded-full border"
                              aria-hidden="true">
                              <ImageIcon className="size-4 opacity-60" />
                            </div>
                            <p className="mb-1.5 text-sm font-medium">Drop your images here</p>
                            <p className="text-muted-foreground text-xs">PNG or JPG (max. 5MB)</p>
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-4"
                              onClick={openFileDialog}>
                              <UploadIcon className="-ms-1 opacity-60" aria-hidden="true" />
                              Select images
                            </Button>
                          </div>
                        )}
                      </div>

                      {errors.length > 0 && (
                        <div
                          className="text-destructive flex items-center gap-1 text-xs"
                          role="alert">
                          <AlertCircleIcon className="size-3 shrink-0" />
                          <span>{errors[0]}</span>
                        </div>
                      )}
                    </div>
                  )}
                />
              </CardContent>
            </Card>

            {/* Variant Groups Management - Only for VARIANT type */}
            {productType === "VARIANT" && (
              <Card>
                <CardHeader>
                  <CardTitle>Variant Groups</CardTitle>
                  <CardAction>
                    <FormDescription>
                      Define variant groups (e.g., Size: S, M, L | Color: Red, Blue)
                    </FormDescription>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {variantGroups.map((group, groupIndex) => (
                      <div key={group.id} className="rounded-lg border p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex-1">
                            <Input
                              value={group.name}
                              onChange={(e) => {
                                const updated = [...variantGroups];
                                updated[groupIndex].name = e.target.value;
                                setVariantGroups(updated);
                              }}
                              placeholder="Group name (e.g., Size, Color)"
                              className="font-semibold"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setVariantGroups(variantGroups.filter((_, i) => i !== groupIndex));
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm">Options</Label>
                          <div className="flex flex-wrap gap-2">
                            {group.options.map((option, optionIndex) => (
                              <Badge key={optionIndex} variant="secondary" className="gap-1 pr-1">
                                {option}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...variantGroups];
                                    updated[groupIndex].options = updated[groupIndex].options.filter((_, i) => i !== optionIndex);
                                    setVariantGroups(updated);
                                  }}
                                  className="ml-1 rounded-full hover:bg-destructive/20"
                                >
                                  <XIcon className="size-3" />
                                </button>
                              </Badge>
                            ))}
                            <Input
                              placeholder="Add option"
                              className="w-32"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const input = e.currentTarget;
                                  const value = input.value.trim();
                                  if (value) {
                                    const updated = [...variantGroups];
                                    updated[groupIndex].options.push(value);
                                    setVariantGroups(updated);
                                    input.value = "";
                                  }
                                }
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setVariantGroups([
                          ...variantGroups,
                          {
                            id: `group-${Date.now()}-${Math.random()}`,
                            name: "",
                            options: []
                          }
                        ]);
                      }}
                    >
                      <Plus className="mr-2 size-4" />
                      Add Variant Group
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Composite Products Management - Only for COMPOSITE type */}
            {productType === "COMPOSITE" && (
              <Card>
                <CardHeader>
                  <CardTitle>Composite Products</CardTitle>
                  <CardAction>
                    <FormDescription>
                      Select products to include in this bundle or gift pack
                    </FormDescription>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {compositeItems.map((item, index) => (
                      <div key={item.id} className="flex items-center gap-4 rounded-lg border p-4">
                        <div className="flex-1">
                          <div className="font-semibold">{item.productName}</div>
                          <div className="text-muted-foreground text-sm">Price: ${item.price?.toFixed(2) || "0.00"}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label>Qty:</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const updated = [...compositeItems];
                              updated[index].quantity = parseInt(e.target.value) || 1;
                              setCompositeItems(updated);
                            }}
                            className="w-20"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setCompositeItems(compositeItems.filter((_, i) => i !== index));
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <Dialog open={showProductPicker} onOpenChange={setShowProductPicker}>
                      <DialogTrigger asChild>
                        <Button type="button" variant="outline" className="w-full">
                          <Plus className="mr-2 size-4" />
                          Add Product to Bundle
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Select Products</DialogTitle>
                          <DialogDescription>
                            Choose products to include in this composite product
                          </DialogDescription>
                        </DialogHeader>
                        <div className="max-h-96 overflow-y-auto">
                          {isLoadingProducts ? (
                            <div className="text-center py-8">Loading products...</div>
                          ) : (
                            <div className="space-y-2">
                              {availableProducts
                                .filter(p => !compositeItems.some(ci => ci.productId === p.id))
                                .map((product) => (
                                <div
                                  key={product.id}
                                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent cursor-pointer"
                                  onClick={() => {
                                    setCompositeItems([
                                      ...compositeItems,
                                      {
                                        id: `composite-${Date.now()}-${Math.random()}`,
                                        productId: product.id,
                                        productName: product.name,
                                        quantity: 1,
                                        price: product.price
                                      }
                                    ]);
                                    setShowProductPicker(false);
                                  }}
                                >
                                  <div>
                                    <div className="font-medium">{product.name}</div>
                                    <div className="text-muted-foreground text-sm">${product.price.toFixed(2)}</div>
                                  </div>
                                  <Plus className="size-4" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Custom Fields - Show configured fields for value entry */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isEditingSectionTitle ? (
                      <>
                        <Input
                          value={customFieldsSectionTitle}
                          onChange={(e) => setCustomFieldsSectionTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              setIsEditingSectionTitle(false);
                              if (customFieldsSectionTitle.trim()) {
                                saveCustomSectionTitle(customFieldsSectionTitle.trim());
                              } else {
                                setCustomFieldsSectionTitle("Custom Fields");
                              }
                            }
                            if (e.key === "Escape") {
                              setCustomFieldsSectionTitle("Custom Fields");
                              setIsEditingSectionTitle(false);
                            }
                          }}
                          className="h-auto w-auto min-w-[120px] border-b border-primary/50 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          style={{ width: `${Math.max(120, (customFieldsSectionTitle.length || 1) * 9)}px` }}
                          autoFocus
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            setIsEditingSectionTitle(false);
                            if (customFieldsSectionTitle.trim()) {
                              saveCustomSectionTitle(customFieldsSectionTitle.trim());
                            } else {
                              setCustomFieldsSectionTitle("Custom Fields");
                            }
                          }}
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            setCustomFieldsSectionTitle("Custom Fields");
                            setIsEditingSectionTitle(false);
                          }}
                        >
                          <XIcon className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span 
                          className="cursor-pointer hover:text-primary transition-colors"
                          onClick={() => setIsEditingSectionTitle(true)}
                          title="Click to edit section title"
                        >
                          {customFieldsSectionTitle}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setIsEditingSectionTitle(true)}
                          title="Edit section title"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setEditingCustomField(null);
                      setShowCustomFieldDialog(true);
                    }}
                  >
                    <Plus className="size-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {customFieldDefinitions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="mb-2">No custom fields defined yet.</p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditingCustomField(null);
                          setShowCustomFieldDialog(true);
                        }}
                      >
                        <Plus className="mr-2 size-4" />
                        Add Custom Field
                      </Button>
                    </div>
                  ) : (
                    customFieldDefinitions.map((fieldDef) => {
                      // Find the value for this field definition
                      const fieldValue = customFields.find(f => f.id === fieldDef.id);
                      const currentValue = fieldValue?.value ?? "";

                      return (
                        <div key={fieldDef.id} className="space-y-2">
                          <Label className="text-sm font-medium">
                            {fieldDef.label}
                            {fieldDef.required && <span className="text-destructive ml-1">*</span>}
                          </Label>
                          {fieldDef.type === "text" && (
                            <Input
                              value={currentValue}
                              onChange={(e) => {
                                const updated = customFields.filter(f => f.id !== fieldDef.id);
                                updated.push({
                                  ...fieldDef,
                                  value: e.target.value
                                });
                                setCustomFields(updated);
                              }}
                              placeholder={`Enter ${fieldDef.label.toLowerCase()}`}
                            />
                          )}
                          {fieldDef.type === "number" && (
                            <Input
                              type="number"
                              value={currentValue}
                              onChange={(e) => {
                                const updated = customFields.filter(f => f.id !== fieldDef.id);
                                updated.push({
                                  ...fieldDef,
                                  value: parseFloat(e.target.value) || 0
                                });
                                setCustomFields(updated);
                              }}
                              placeholder={`Enter ${fieldDef.label.toLowerCase()}`}
                            />
                          )}
                          {fieldDef.type === "date" && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={`w-full justify-start text-left font-normal ${!currentValue && "text-muted-foreground"}`}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {currentValue ? format(new Date(currentValue), "PPP") : <span>Pick a date</span>}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={currentValue ? new Date(currentValue) : undefined}
                                  onSelect={(date) => {
                                    const updated = customFields.filter(f => f.id !== fieldDef.id);
                                    updated.push({
                                      ...fieldDef,
                                      value: date ? format(date, "yyyy-MM-dd") : ""
                                    });
                                    setCustomFields(updated);
                                  }}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                          )}
                          {fieldDef.type === "boolean" && (
                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={currentValue || false}
                                onCheckedChange={(checked) => {
                                  const updated = customFields.filter(f => f.id !== fieldDef.id);
                                  updated.push({
                                    ...fieldDef,
                                    value: checked
                                  });
                                  setCustomFields(updated);
                                }}
                              />
                              <Label>{currentValue ? "Yes" : "No"}</Label>
                            </div>
                          )}
                          {fieldDef.type === "select" && fieldDef.options && fieldDef.options.length > 0 && (
                            <Select
                              value={currentValue}
                              onValueChange={(value) => {
                                const updated = customFields.filter(f => f.id !== fieldDef.id);
                                updated.push({
                                  ...fieldDef,
                                  value: value
                                });
                                setCustomFields(updated);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={`Select ${fieldDef.label.toLowerCase()}`} />
                              </SelectTrigger>
                              <SelectContent>
                                {fieldDef.options.map((option, optIndex) => (
                                  <SelectItem key={optIndex} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Dialog for Managing Custom Field Definitions */}
            <Dialog open={showCustomFieldDialog} onOpenChange={setShowCustomFieldDialog}>
              <DialogContent className="max-w-2xl flex flex-col max-h-[85vh]">
                <DialogHeader>
                  <DialogTitle>Manage Custom Fields</DialogTitle>
                  <DialogDescription>
                    Define custom fields for this product. These fields will be available for value entry in the Custom Fields section.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto pr-2 space-y-4 min-h-0">
                  {customFieldDefinitions.map((field, index) => (
                    <div key={field.id} className="rounded-lg border p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Input
                          value={field.label}
                          onChange={(e) => {
                            const updated = [...customFieldDefinitions];
                            updated[index].label = e.target.value;
                            updated[index].key = e.target.value.toLowerCase().replace(/\s+/g, '_');
                            setCustomFieldDefinitions(updated);
                          }}
                          placeholder="Field Label"
                          className="flex-1"
                        />
                        <Select
                          value={field.type}
                          onValueChange={(value: any) => {
                            const updated = [...customFieldDefinitions];
                            updated[index].type = value;
                            setCustomFieldDefinitions(updated);
                          }}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="boolean">Boolean</SelectItem>
                            <SelectItem value="select">Select</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => {
                            setCustomFieldDefinitions(customFieldDefinitions.filter((_, i) => i !== index));
                            setCustomFields(customFields.filter(f => f.id !== field.id));
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      {field.type === "select" && (
                        <div className="mb-3">
                          <Label className="text-sm">Options (comma-separated)</Label>
                          <Input
                            placeholder="Option 1, Option 2, Option 3"
                            defaultValue={field.options?.join(', ')}
                            onBlur={(e) => {
                              const options = e.target.value.split(',').map(o => o.trim()).filter(o => o);
                              const updated = [...customFieldDefinitions];
                              updated[index].options = options;
                              setCustomFieldDefinitions(updated);
                            }}
                          />
                        </div>
                      )}
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`required-${field.id}`}
                          checked={field.required || false}
                          onCheckedChange={(checked) => {
                            const updated = [...customFieldDefinitions];
                            updated[index].required = checked as boolean;
                            setCustomFieldDefinitions(updated);
                          }}
                        />
                        <Label htmlFor={`required-${field.id}`} className="text-sm">
                          Required field
                        </Label>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      const newField: CustomField = {
                        id: `field-${Date.now()}-${Math.random()}`,
                        key: "",
                        label: "",
                        type: "text",
                        value: "",
                        required: false
                      };
                      setCustomFieldDefinitions([...customFieldDefinitions, newField]);
                    }}
                  >
                    <Plus className="mr-2 size-4" />
                    Add Custom Field
                  </Button>
                </div>
                <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCustomFieldDialog(false);
                      setEditingCustomField(null);
                    }}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setShowCustomFieldDialog(false);
                      setEditingCustomField(null);
                    }}
                  >
                    Save Fields
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

          </div>
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {productType === "COMPOSITE" && compositeItems.length > 0 && (
                    <>
                      {/* Calculated Total for Composite Products */}
                      <div className="rounded-lg border bg-muted/50 p-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Calculated Total (Items):</span>
                            <span className="font-semibold">
                              ${compositeItems.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0).toFixed(2)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Sum of all included products × quantities
                          </div>
                        </div>
                      </div>
                      <FormDescription className="text-xs">
                        Set a bundle price below to offer a discount, or leave it empty to use the calculated total.
                      </FormDescription>
                    </>
                  )}
                  <FormField
                    name="basePrice"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {productType === "COMPOSITE" ? "Bundle Price" : "Base Price"}
                        </FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            value={field.value || ""} 
                            placeholder={productType === "COMPOSITE" ? "Enter bundle price (optional)" : "Enter base price"}
                            type="number"
                            step="0.01"
                            min="0"
                          />
                        </FormControl>
                        {productType === "COMPOSITE" && compositeItems.length > 0 && field.value && (
                          <FormDescription className="text-xs">
                            {(() => {
                              const calculatedTotal = compositeItems.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
                              const bundlePrice = parseFloat(field.value) || 0;
                              const savings = calculatedTotal - bundlePrice;
                              if (savings > 0) {
                                return `Customer saves $${savings.toFixed(2)} (${((savings / calculatedTotal) * 100).toFixed(1)}% off)`;
                              }
                              return null;
                            })()}
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="purchasePrice"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Purchase Price</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            value={field.value || ""} 
                            type="number" 
                            step="0.01" 
                            min="0"
                            placeholder="Enter purchase price"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Tax Section */}
                  <div className="space-y-3 border rounded-lg p-4">
                    <FormField
                      name="chargeTax"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                field.onChange(checked);
                                setChargeTax(checked as boolean);
                                if (!checked) {
                                  setTaxPercentage("");
                                  form.setValue("taxPercentage", "");
                                }
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-medium cursor-pointer">
                            Charge tax on this product
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                    {chargeTax && (
                      <FormField
                        name="taxPercentage"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem className="pl-6">
                            <FormLabel>Tax Percentage (%)</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                value={field.value || ""} 
                                type="number" 
                                step="0.01" 
                                min="0"
                                placeholder="0.00"
                                onChange={(e) => {
                                  field.onChange(e);
                                  setTaxPercentage(e.target.value);
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  {/* Discount Section */}
                  {productType !== "COMPOSITE" && (
                    <div className="space-y-3 border rounded-lg p-4">
                      <FormField
                        name="discountType"
                        control={form.control}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Discount Type</FormLabel>
                            <Select 
                              value={field.value || ""} 
                              onValueChange={(value) => {
                                field.onChange(value);
                                setDiscountType(value as "AMOUNT" | "PERCENTAGE" | "");
                                if (!value) {
                                  setDiscountValue("");
                                  form.setValue("discountValue", "");
                                  form.setValue("discountedPrice", "");
                                }
                              }}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select discount type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="AMOUNT">Amount</SelectItem>
                                <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {discountType && (
                        <>
                          <FormField
                            name="discountValue"
                            control={form.control}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Discount Value {discountType === "PERCENTAGE" ? "(%)" : "($)"}
                                </FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    value={field.value || ""} 
                                    type="number" 
                                    step="0.01" 
                                    min="0"
                                    placeholder="0.00"
                                    onChange={(e) => {
                                      field.onChange(e);
                                      setDiscountValue(e.target.value);
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            name="discountedPrice"
                            control={form.control}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Discounted Price</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    value={field.value || ""} 
                                    type="number" 
                                    step="0.01" 
                                    min="0"
                                    readOnly
                                    className="bg-muted"
                                  />
                                </FormControl>
                                <FormDescription className="text-xs">
                                  Automatically calculated based on discount
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      )}
                    </div>
                  )}
                  
                  {productType === "COMPOSITE" && (
                    <FormField
                      name="discountedPrice"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Discounted Price</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} type="number" step="0.01" min="0" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <hr />
                  <FormField
                    name="inStock"
                    control={form.control}
                    render={({ field }) => (
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="in-stock"
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            setInStock(checked);
                            if (!checked) {
                              form.setValue("quantity", "");
                            }
                          }}
                        />
                        <Label htmlFor="in-stock">In stock</Label>
                      </div>
                    )}
                  />
                  {inStock && (
                    <FormField
                      name="quantity"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>In Stock Quantity</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              {...field}
                              value={field.value || ""}
                              placeholder="Enter quantity"
                            />
                          </FormControl>
                          <FormDescription>
                            {productType === "COMPOSITE" 
                              ? "Stock quantity for this bundle. Note: Stock availability also depends on included products."
                              : "Current stock quantity available"
                            }
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  name="status"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Select 
                          {...field} 
                          value={field.value || "draft"} 
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="draft">
                                <span className="size-2 rounded-full bg-orange-400"></span> Draft
                              </SelectItem>
                              <SelectItem value="active">
                                {" "}
                                <span className="size-2 rounded-full bg-green-400"></span> Active
                              </SelectItem>
                              <SelectItem value="archived">
                                <span className="size-2 rounded-full bg-indigo-400"></span> Archived
                              </SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormDescription>Set the product status.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <FormField
                    name="category"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="flex gap-2">
                            <div className="grow">
                              <Select 
                                value={field.value || ""} 
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  // Clear subcategory when category changes
                                  form.setValue("sub_category", "");
                                }}
                                disabled={isLoadingCategories}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder={isLoadingCategories ? "Loading..." : "Select a category"} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {categories.length === 0 && !isLoadingCategories ? (
                                      <div className="px-2 py-1.5 text-sm text-muted-foreground text-center">
                                        No categories available
                                      </div>
                                    ) : (
                                      categories.map((category) => (
                                        <SelectItem key={category.id} value={category.name}>
                                          {category.name}
                                        </SelectItem>
                                      ))
                                    )}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </div>
                            <AddNewCategory 
                              type="category" 
                              onSuccess={() => {
                                fetchCategories();
                              }}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="sub_category"
                    control={form.control}
                    render={({ field }) => {
                      const categoryId = selectedCategoryId 
                        ? categories.find(c => c.name === selectedCategoryId)?.id 
                        : undefined;
                      const filteredSubCategories = categoryId
                        ? subCategories.filter(sub => sub.categoryId === categoryId)
                        : [];

                      return (
                        <FormItem>
                          <FormControl>
                            <div className="flex gap-2">
                              <div className="grow">
                                <Select 
                                  value={field.value || ""} 
                                  onValueChange={field.onChange}
                                  disabled={!selectedCategoryId || isLoadingCategories}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue 
                                      placeholder={
                                        !selectedCategoryId 
                                          ? "Select a category first" 
                                          : isLoadingCategories 
                                            ? "Loading..." 
                                            : filteredSubCategories.length === 0
                                              ? "No subcategories available"
                                              : "Select a sub category"
                                      } 
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {filteredSubCategories.length === 0 ? (
                                        <div className="px-2 py-1.5 text-sm text-muted-foreground text-center">
                                          {selectedCategoryId ? "No subcategories available" : "Select a category first"}
                                        </div>
                                      ) : (
                                        filteredSubCategories.map((subCategory) => (
                                          <SelectItem key={subCategory.id} value={subCategory.name}>
                                            {subCategory.name}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </div>
                              <AddNewCategory 
                                type="subcategory" 
                                categoryId={categoryId}
                                onSuccess={() => {
                                  fetchCategories();
                                }}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </Form>
  );
}
