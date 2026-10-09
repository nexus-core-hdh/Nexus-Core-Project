"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { generateMeta } from "@/lib/utils";
import PosSystemMenu from "@/app/[company]/(auth)/apps/pos-system/pos-system-menu";
import { productApi, productCategoryApi, orderApi, API_BASE_URL, companiesApi } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { useStore } from "./store";

export default function Page() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const { loadOrderIntoCart } = useStore();
  const [productCategories, setProductCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [tableCategories, setTableCategories] = useState<any[]>([]);
  const [showTableSelection, setShowTableSelection] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
      try {
        setLoading(true);
        const user = getCurrentUser();
        if (!user) return;

        // Fetch company information to check industry
        let companyIndustry: string | null = null;
        if (user.companyId) {
          try {
            const company = await companiesApi.getCompany(user.companyId);
            companyIndustry = company.industry || null;
          } catch (error) {
            console.error("Error fetching company:", error);
          }
        }

        // Check if industry is Food or Restaurant (case-insensitive)
        const isFoodOrRestaurant = companyIndustry && 
          (companyIndustry.toLowerCase() === "food" || 
           companyIndustry.toLowerCase() === "restaurant");
        setShowTableSelection(!!isFoodOrRestaurant);

        // Fetch product categories
        // Backend now returns categories matching company/branch OR global categories (null companyId/branchId)
        const categories = await productCategoryApi.getProductCategories({
          companyId: user.companyId || undefined,
          branchId: user.branchId || undefined
        });
        
        const transformedCategories = categories.map((cat: any) => ({
          id: String(cat.id),
          name: cat.name,
          icon: "🍱" // Default icon, can be customized
        }));
        setProductCategories(transformedCategories);

        // Fetch products
        const productsData = await productApi.getProducts();
        const transformedProducts = productsData.map((product: any) => {
          // Fix image path - ensure it's a valid URL for Next.js Image component
          let imagePath = product.image || "/products/01.jpeg";
          
          // Handle different image path formats
          if (imagePath && imagePath !== "/products/01.jpeg") {
            // If it starts with "files/", use the backend URL
            if (imagePath.startsWith("files/")) {
              imagePath = `${API_BASE_URL}/${imagePath}`;
            }
            // If it starts with "/files/", use the backend URL
            else if (imagePath.startsWith("/files/")) {
              imagePath = `${API_BASE_URL}${imagePath}`;
            }
            // If it doesn't start with "/" or "http", it's invalid for Next.js Image
            else if (!imagePath.startsWith("/") && !imagePath.startsWith("http")) {
              // Try to construct a valid path
              if (imagePath.includes("/")) {
                imagePath = `/${imagePath}`;
              } else {
                // Invalid path, use fallback
                imagePath = "/products/01.jpeg";
              }
            }
          } else {
            imagePath = "/products/01.jpeg";
          }
          
          return {
            id: String(product.id),
            name: product.name,
            image: imagePath,
            price: product.price || 0,
            category: String(product.categoryId || "")
          };
        });
        setProducts(transformedProducts);

        // For now, use empty arrays for tables (can be implemented later with a Table model)
        setTables([]);
        setTableCategories([]);

        // Load order into cart if orderId is provided
        if (orderId && transformedProducts.length > 0) {
          try {
            const orderData = await orderApi.getOrderById(parseInt(orderId));
            if (orderData && orderData.items) {
              // Map order items to cart items
              const cartItems = orderData.items.map((item: any) => {
                const product = transformedProducts.find((p: { id: string }) => p.id === String(item.productId));
                if (product) {
                  return {
                    product: {
                      ...product,
                      price: item.price, // Use order price, not current product price
                    },
                    quantity: item.quantity,
                  };
                }
                return null;
              }).filter(Boolean);

              // Load items into cart
              if (cartItems.length > 0) {
                loadOrderIntoCart(cartItems, orderData.id);
              }
            }
          } catch (error) {
            console.error("Error loading order for editing:", error);
          }
        }
      } catch (error) {
        console.error("Error fetching POS data:", error);
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    fetchData();
  }, [orderId]);

  // Expose refresh function to child components via context or prop drilling
  // For now, we'll add a refresh mechanism that can be triggered
  const handleRefresh = () => {
    fetchData();
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PosSystemMenu
      productCategories={productCategories}
      products={products}
      tables={tables}
      tableCategories={tableCategories}
      showTableSelection={showTableSelection}
      onRefresh={handleRefresh}
    />
  );
}
