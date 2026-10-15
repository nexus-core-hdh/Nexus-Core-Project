import { generateMeta } from "@/lib/utils";
import Link from "@/components/app-link";
import { PlusIcon } from "@radix-ui/react-icons";
import { Metadata } from "next";
import { Product } from "@/app/[company]/(auth)/pages/products/product-list";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ProductList from "@/app/[company]/(auth)/pages/products/product-list";

export async function generateMetadata(): Promise<Metadata> {
  return generateMeta({
    title: "Product List",
    description:
      "Product list page created using Tanstack Table. List or filter products. Built with shadcn/ui, Tailwind CSS and Next.js.",
    canonical: "/pages/products"
  });
}

async function getProducts(): Promise<Product[]> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
  
  try {
    const response = await fetch(`${API_BASE_URL}/products`, {
      cache: 'no-store', // Always fetch fresh data
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch products:', response.statusText);
      return [];
    }

    const dbProducts = await response.json();
    
    // Transform database products to match UI Product type
    return dbProducts.map((product: any): Product => {
      // Map status: database has "active", "inactive", "out_of_stock", "draft", "archived"
      // UI expects "active" | "out-of-stock" | "closed-for-sale"
      let status: "active" | "out-of-stock" | "closed-for-sale" = "active";
      if (product.status === "out_of_stock" || product.quantity === 0) {
        status = "out-of-stock";
      } else if (product.status === "inactive" || product.status === "archived") {
        status = "closed-for-sale";
      } else if (product.status === "active") {
        status = "active";
      }

      return {
        id: product.id,
        name: product.name || undefined,
        image: product.image || undefined,
        description: product.description || undefined,
        category: product.category || undefined,
        sub_category: product.sub_category || undefined,
        sku: product.sku || undefined,
        barcode: product.barcode || undefined,
        stock: product.quantity?.toString() || "0",
        price: product.price || undefined,
        purchasePrice: product.cost || undefined,
        discountedPrice: product.discountedPrice || undefined,
        chargeTax: product.chargeTax || false,
        taxPercentage: product.taxPercentage || undefined,
        discountType: product.discountType || undefined,
        discountValue: product.discountValue || undefined,
        brand: product.brand || undefined,
        productType: product.productType || undefined,
        customFields: product.customFields || undefined,
        rating: undefined, // Rating not stored in database
        status,
      };
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

export default async function Page() {
  const products = await getProducts();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="text-lg font-bold tracking-tight">Products</h1>
        <Button asChild>
          <Link href="/pages/products/create">
            <PlusIcon /> Add Product
          </Link>
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total Sales</CardDescription>
            <CardTitle className="font-display text-2xl lg:text-3xl">$30,230</CardTitle>
            <CardAction>
              <Badge variant="outline">
                <span className="text-green-600">+20.1%</span>
              </Badge>
            </CardAction>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Number of Sales</CardDescription>
            <CardTitle className="font-display text-2xl lg:text-3xl">982</CardTitle>
            <CardAction>
              <Badge variant="outline">
                <span className="text-green-600">+5.02</span>
              </Badge>
            </CardAction>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Affiliate</CardDescription>
            <CardTitle className="font-display text-2xl lg:text-3xl">$4,530</CardTitle>
            <CardAction>
              <Badge variant="outline">
                <span className="text-green-600">+3.1%</span>
              </Badge>
            </CardAction>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Discounts</CardDescription>
            <CardTitle className="font-display text-2xl lg:text-3xl">$2,230</CardTitle>
            <CardAction>
              <Badge variant="outline">
                <span className="text-red-600">-3.58%</span>
              </Badge>
            </CardAction>
          </CardHeader>
        </Card>
      </div>
      <div className="pt-4">
        <ProductList data={products} />
      </div>
    </div>
  );
}
