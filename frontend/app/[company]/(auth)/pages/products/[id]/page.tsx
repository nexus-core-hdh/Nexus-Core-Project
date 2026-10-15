import { generateMeta } from "@/lib/utils";
import ProductImageGallery from "./product-image-gallery";
import {
  CircleDollarSign,
  Edit3Icon,
  HandCoinsIcon,
  HeartIcon,
  Layers2Icon,
  ShoppingCart,
  StarIcon,
  Trash2Icon,
  TruckIcon
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProductReviewList from "./reviews";
import SubmitReviewForm from "./submit-review-form";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { notFound } from "next/navigation";
import Link from "@/components/app-link";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return generateMeta({
    title: "Product Detail Page",
    description:
      "Use this shadcn/ui and Tailwind CSS product page template to create great looking pages for each product, with detailed descriptions, images, pricing, and customer reviews.",
    canonical: `/pages/products/${id}`
  });
}

async function getProduct(id: number) {
  try {
    const url = `${API_BASE_URL}/products/${id}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // Ensure fresh data
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      // Try to get error message
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // If JSON parsing fails, use status text
      }
      console.error(`Failed to fetch product ${id}: ${response.status} ${errorMessage}`);
      return null;
    }

    const product = await response.json();
    
    // Validate product structure
    if (!product || typeof product !== 'object') {
      console.error('Invalid product data received:', product);
      return null;
    }
    
    return product;
  } catch (error: any) {
    console.error(`Error fetching product ${id}:`, error?.message || error);
    // Check if it's a network error
    if (error?.message?.includes('fetch')) {
      console.error('Network error - is the backend API running?');
    }
    // Return null so we can show not found
    return null;
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = parseInt(id);
  
  if (isNaN(productId) || productId <= 0) {
    console.error('Invalid product ID:', id);
    notFound();
  }

  const product = await getProduct(productId);

  if (!product) {
    console.log(`Product with ID ${productId} not found`);
    notFound();
  }

  // Validate that we got a product object
  if (!product.id || product.id !== productId) {
    console.error('Product ID mismatch:', product.id, 'expected:', productId);
    notFound();
  }

  // Format dates
  const createdAt = product.createdAt ? new Date(product.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }) : 'N/A';

  // Format image URL
  let imageUrl = '/images/products/01.jpeg';
  if (product.image) {
    if (product.image.startsWith('files/')) {
      imageUrl = `${API_BASE_URL}/${product.image}`;
    } else if (product.image.startsWith('http') || product.image.startsWith('data:') || product.image.startsWith('blob:')) {
      imageUrl = product.image;
    } else if (product.image.startsWith('/')) {
      imageUrl = product.image;
    } else {
      imageUrl = `/images${product.image}`;
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-row items-start justify-between">
        <div className="space-y-2">
          <h1 className="font-display text-lg tracking-tight">{product.name || 'Unnamed Product'}</h1>
          <div className="text-muted-foreground inline-flex flex-col gap-2 text-sm lg:flex-row lg:gap-4">
            {product.sku && (
              <div>
                <span className="text-foreground font-semibold">SKU :</span> {product.sku}
              </div>
            )}
            <div>
              <span className="text-foreground font-semibold">Published :</span> {createdAt}
            </div>
            {product.id && (
              <div>
                <span className="text-foreground font-semibold">ID :</span> {product.id}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Link href={`/pages/products/create?id=${product.id}`}>
            <Button>
              <Edit3Icon />
              <span className="hidden lg:inline">Edit</span>
            </Button>
          </Link>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-1">
          <ProductImageGallery imageUrl={imageUrl} />
        </div>
        <div className="space-y-4 xl:col-span-2">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="hover:border-primary/30 bg-muted grid auto-cols-max grid-flow-col gap-4 rounded-lg border p-4">
              <CircleDollarSign className="size-6 opacity-40" />
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-sm">Price</span>
                <span className="text-lg font-semibold">${product.price?.toFixed(2) || '0.00'}</span>
              </div>
            </div>
            {product.discountedPrice && (
              <div className="hover:border-primary/30 bg-muted grid auto-cols-max grid-flow-col gap-4 rounded-lg border p-4">
                <CircleDollarSign className="size-6 opacity-40" />
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-sm">Discounted Price</span>
                  <span className="text-lg font-semibold">${product.discountedPrice.toFixed(2)}</span>
                </div>
              </div>
            )}
            <div className="hover:border-primary/30 bg-muted grid auto-cols-max grid-flow-col gap-4 rounded-lg border p-4">
              <Layers2Icon className="size-6 opacity-40" />
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-sm">Available Stock</span>
                <span className="text-lg font-semibold">{product.quantity || 0}</span>
              </div>
            </div>
            {product.cost && (
              <div className="hover:border-primary/30 bg-muted grid auto-cols-max grid-flow-col gap-4 rounded-lg border p-4">
                <HandCoinsIcon className="size-6 opacity-40" />
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-sm">Cost</span>
                  <span className="text-lg font-semibold">${product.cost.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
          <Card>
            <CardContent className="space-y-4">
              <div className="grid items-start gap-8 xl:grid-cols-3">
                <div className="space-y-8 xl:col-span-2">
                  {product.description && (
                    <div>
                      <h3 className="mb-2 font-semibold">Description:</h3>
                      <p className="text-muted-foreground">
                        {product.description}
                      </p>
                    </div>
                  )}
                  {product.variants && typeof product.variants === 'object' && Object.keys(product.variants).length > 0 && (
                    <div>
                      <h3 className="mb-2 font-semibold">Variants:</h3>
                      <ul className="text-muted-foreground list-inside list-disc">
                        {Object.entries(product.variants).map(([key, value]: [string, any]) => (
                          <li key={key}>{key}: {value}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="rounded-md border xl:col-span-1">
                  <Table>
                    <TableBody>
                      {product.category && (
                        <TableRow>
                          <TableCell className="font-semibold">Category</TableCell>
                          <TableCell className="text-right">{product.category}</TableCell>
                        </TableRow>
                      )}
                      {product.sub_category && (
                        <TableRow>
                          <TableCell className="font-semibold">Sub Category</TableCell>
                          <TableCell className="text-right">{product.sub_category}</TableCell>
                        </TableRow>
                      )}
                      {product.brand && (
                        <TableRow>
                          <TableCell className="font-semibold">Brand</TableCell>
                          <TableCell className="text-right">{product.brand}</TableCell>
                        </TableRow>
                      )}
                      {product.barcode && (
                        <TableRow>
                          <TableCell className="font-semibold">Barcode</TableCell>
                          <TableCell className="text-right">{product.barcode}</TableCell>
                        </TableRow>
                      )}
                      <TableRow>
                        <TableCell className="font-semibold">Status</TableCell>
                        <TableCell className="text-right capitalize">{product.status || 'draft'}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div className="grid auto-cols-max grid-flow-row gap-8">
                <div>
                  <div className="mb-4 font-semibold">Colors:</div>
                  <RadioGroup defaultValue="card" className="flex gap-2">
                    <div>
                      <RadioGroupItem
                        value="card"
                        id="card"
                        className="peer sr-only"
                        aria-label="Card"
                      />
                      <Label
                        htmlFor="card"
                        className="border-muted hover:text-accent-foreground peer-data-[state=checked]:ring-primary [&:has([data-state=checked])]:border-primary flex size-8 cursor-pointer flex-col items-center justify-between rounded-full border bg-green-400 -indent-[9999px] peer-data-[state=checked]:ring">
                        Card
                      </Label>
                    </div>
                    <div>
                      <RadioGroupItem
                        value="paypal"
                        id="paypal"
                        className="peer sr-only"
                        aria-label="Paypal"
                      />
                      <Label
                        htmlFor="paypal"
                        className="border-muted hover:text-accent-foreground peer-data-[state=checked]:ring-primary [&:has([data-state=checked])]:border-primary flex size-8 cursor-pointer flex-col items-center justify-between rounded-full border bg-indigo-400 -indent-[9999px] peer-data-[state=checked]:ring">
                        Paypal
                      </Label>
                    </div>
                    <div>
                      <RadioGroupItem
                        value="apple"
                        id="apple"
                        className="peer sr-only"
                        aria-label="Apple"
                      />
                      <Label
                        htmlFor="apple"
                        className="border-muted hover:text-accent-foreground peer-data-[state=checked]:ring-primary [&:has([data-state=checked])]:border-primary flex size-8 cursor-pointer flex-col items-center justify-between rounded-full border bg-purple-400 -indent-[9999px] peer-data-[state=checked]:ring">
                        Apple
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                <div>
                  <div className="mb-4 font-semibold">Sizes:</div>
                  <RadioGroup defaultValue="md" className="flex gap-2">
                    {["sm", "md", "lg", "xl", "xxl"].map((item, key) => (
                      <div key={key}>
                        <RadioGroupItem
                          value={item}
                          id={item}
                          className="peer sr-only"
                          aria-label={item}
                        />
                        <Label
                          htmlFor={item}
                          className="hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 [&:has([data-state=checked])]:border-primary flex size-10 cursor-pointer flex-col items-center justify-center rounded-md border text-xs uppercase">
                          {item}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button>
                  <ShoppingCart /> Add to Card
                </Button>
                <Button variant="outline">
                  <HeartIcon /> Wishlist
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row justify-between">
              <CardTitle>Reviews</CardTitle>
              <CardAction>
                <SubmitReviewForm />
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 xl:grid-cols-3">
                <div className="order-last lg:order-first xl:col-span-2">
                  <ProductReviewList />
                </div>
                <div className="order-first lg:order-last xl:col-span-1">
                  <div className="overflow-hidden rounded-lg border">
                    <div className="bg-muted flex items-center gap-4 p-4">
                      <div className="flex items-center gap-1">
                        <StarIcon className="size-4 fill-orange-400 stroke-orange-400" />
                        <StarIcon className="size-4 fill-orange-400 stroke-orange-400" />
                        <StarIcon className="size-4 fill-orange-400 stroke-orange-400" />
                        <StarIcon className="size-4 stroke-orange-400" />
                        <StarIcon className="size-4 stroke-orange-400" />
                      </div>
                      <span className="text-muted-foreground text-sm">4.3 (12 reviews)</span>
                    </div>
                    <div className="space-y-4 p-4">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="w-20">5 stars</span>
                        <Progress value={70} color="bg-orange-400" />
                        <span>70%</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="w-20">4 stars</span>
                        <Progress value={17} color="bg-orange-600" />
                        <span>17%</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="w-20">3 stars</span>
                        <Progress value={7} color="bg-yellow-300" />
                        <span>7%</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="w-20">2 stars</span>
                        <Progress value={4} color="bg-yellow-600" />
                        <span>4%</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="w-20">1 star</span>
                        <Progress value={2} color="bg-red-600" />
                        <span>2%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
